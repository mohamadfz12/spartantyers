/**
 * Customer accounts: the security rules. Customer and staff sessions never mix (in either direction),
 * tokens and links are single use / expiring / tamper-proof, nothing reveals whether an email exists,
 * rate limits hold, cookies carry the right flags, and with no secret on Vercel the feature is off.
 *   npx tsx --test tests/accounts-security.test.ts
 */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, beforeEach, describe, test } from 'node:test'
import {
  PASSWORD,
  account,
  adminCall,
  answered,
  auth,
  cookieFrom,
  dbm,
  lastMailTo,
  mailer,
  newEmail,
  newIp,
  repo,
  reset,
  session,
  shutdown,
  signUp,
  staffToken,
  tokenFrom,
  type Json,
} from './accounts-kit.js'

beforeEach(reset)
after(shutdown)

const tokenOf = (cookie: string) => cookie.replace('spt_session=', '')
const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url')
const SECRET = process.env.ADMIN_SESSION_SECRET!

/** A token signed with the STAFF key (the raw secret), the way auth.ts does. */
function staffSigned(payload: Json): string {
  const encoded = b64(JSON.stringify(payload))
  return `${encoded}.${b64(createHmac('sha256', SECRET).update(encoded).digest())}`
}

/** A token signed with the CUSTOMER key. */
function customerSigned(payload: Json): string {
  const key = createHmac('sha256', SECRET).update('spartan-customer-session-v1').digest()
  const encoded = b64(JSON.stringify(payload))
  return `${encoded}.${b64(createHmac('sha256', key).update(encoded).digest())}`
}

const withEnv = async <T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> => {
  const before: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('customer and staff sessions never mix', () => {
  test('a customer token is refused by staff authorize() on every kind of endpoint, and by readToken()', async () => {
    const { cookie } = await signUp()
    const token = tokenOf(cookie)
    assert.equal(auth.readToken(token), null)
    assert.equal(auth.readToken(`Bearer ${token}`), null)
    assert.equal(auth.verifyToken(`Bearer ${token}`), false)
    for (const action of ['stats', 'staff', 'accounts', 'me', 'pos', 'ledger', 'activity']) {
      const r = await adminCall(action, { method: 'GET', token })
      assert.equal(r.status, 401, `admin ${action} must refuse a customer token`)
    }
    // The control: the owner's token opens the same door.
    assert.equal((await adminCall('me', { method: 'GET' })).status, 200)
  })

  test('a customer-shaped payload WITHOUT sub, even signed with the staff key, is not the owner', async () => {
    // Without the `typ` guard in readToken this would read as the env-password owner.
    const forged = staffSigned({ typ: 'customer', exp: Date.now() + 60_000 })
    assert.equal(auth.readToken(forged), null)
    assert.equal((await adminCall('stats', { method: 'GET', token: forged })).status, 401)
    assert.equal((await adminCall('accounts', { method: 'GET', token: forged })).status, 401)
    // And the same payload with a customer's sub and version.
    const { id } = await signUp()
    const withSub = staffSigned({ typ: 'customer', sub: id, v: 0, exp: Date.now() + 60_000 })
    assert.equal(auth.readToken(withSub), null)
    // A real staff token still works (the guard only refuses payloads that carry `typ`).
    assert.ok(auth.readToken(staffSigned({ exp: Date.now() + 60_000 })))
  })

  test('staff tokens (owner without sub, staff with sub) are refused by customer auth, as cookie and as bearer', async () => {
    const owner = auth.issueToken()!.token
    const staff = await staffToken('manager')
    for (const token of [owner, staff]) {
      assert.equal((await account('me', { cookie: `spt_session=${token}` })).status, 401)
      assert.equal((await account('me', { headers: { authorization: `Bearer ${token}` } })).status, 401)
      assert.equal(session.readCustomerToken(token), null)
    }
  })

  test('session: the account when signed in, a plain null (200) when not, and never a staff token', async () => {
    const guest = await account('session', { method: 'GET' })
    assert.equal(guest.status, 200)
    assert.deepEqual(guest.json, { account: null })
    assert.equal(guest.headers['cache-control'], 'private, no-store')
    const { cookie, email } = await signUp()
    const mine = await account('session', { method: 'GET', cookie })
    assert.equal(mine.status, 200)
    assert.equal(mine.json.account.email, email)
    assert.equal('passwordHash' in mine.json.account, false)
    for (const token of [auth.issueToken()!.token, await staffToken('manager')]) {
      const r = await account('session', { method: 'GET', cookie: `spt_session=${token}` })
      assert.deepEqual(r.json, { account: null }, 'a staff token is nobody here')
      assert.match(r.headers['set-cookie'] ?? '', /^spt_session=; .*Max-Age=0/, 'and the bad cookie is cleared')
    }
  })

  test('a customer cookie in the Authorization header is ignored, and a staff token in the cookie too', async () => {
    const { cookie } = await signUp()
    const r = await account('me', { headers: { authorization: `Bearer ${tokenOf(cookie)}` } })
    assert.equal(r.status, 401, 'only the cookie counts')
    assert.equal((await account('me', { cookie })).status, 200)
  })

  test('payloads signed with the wrong key or missing the right typ are refused', async () => {
    const { id } = await signUp()
    const exp = Date.now() + 60_000
    // Customer-shaped, but signed with the staff key.
    assert.equal(session.readCustomerToken(staffSigned({ typ: 'customer', sub: id, v: 0, exp })), null)
    // Right key, no typ / wrong typ.
    assert.equal(session.readCustomerToken(customerSigned({ sub: id, v: 0, exp })), null)
    assert.equal(session.readCustomerToken(customerSigned({ typ: 'staff', sub: id, v: 0, exp })), null)
    assert.equal(session.readCustomerToken(customerSigned({ typ: 'customer', v: 0, exp })), null)
    assert.equal(session.readCustomerToken(customerSigned({ typ: 'customer', sub: id, exp })), null)
    // The control: right key, typ, sub, version, expiry.
    assert.equal(session.readCustomerToken(customerSigned({ typ: 'customer', sub: id, v: 0, exp }))?.sub, id)
  })

  test('tampered, truncated, expired and wrong-version tokens are refused', async () => {
    const { cookie, id } = await signUp()
    const token = tokenOf(cookie)
    const [payload, sig] = token.split('.') as [string, string]
    const bumped = b64(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), v: 9 }))
    for (const bad of [`${bumped}.${sig}`, `${payload}.${sig.slice(0, -2)}AA`, payload, `${payload}.`, '.', '', 'a.b.c', `${payload}.${sig}x.y`]) {
      assert.equal((await account('me', { cookie: `spt_session=${bad}` })).status, 401, `refuses ${bad.slice(0, 20)}`)
    }
    const acct = (await repo.getAccount(id))!
    const old = session.issueCustomerToken(acct, Date.now() - 31 * 86_400_000)!
    assert.equal((await account('me', { cookie: `spt_session=${old.token}` })).status, 401, 'expired')
    // A token for an older version of the account.
    await repo.updateAccount(id, { bumpTokenVersion: true })
    assert.equal((await account('me', { cookie })).status, 401, 'version moved on')
  })

  test('the token carries only typ, sub, v and exp (no email, no level, no secrets)', async () => {
    const { cookie } = await signUp()
    const payload = JSON.parse(Buffer.from(tokenOf(cookie).split('.')[0]!, 'base64url').toString())
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'sub', 'typ', 'v'])
    assert.equal(payload.typ, 'customer')
  })
})

describe('sessions end when they should', () => {
  test('suspending ends a signed-in session on its next request, blocks login, and the answer is the usual one', async () => {
    const { cookie, email, id } = await signUp()
    assert.equal((await account('me', { cookie })).status, 200)
    const r = await adminCall('account-status', { body: { id, status: 'suspended' } })
    assert.equal(r.status, 200)
    assert.equal((await account('me', { cookie })).status, 401)
    const login = await account('login', { body: { email, password: PASSWORD } })
    const wrong = await account('login', { body: { email, password: 'wrong-password-123' } })
    const unknown = await account('login', { body: { email: newEmail('ghost'), password: PASSWORD } })
    assert.equal(login.status, 401)
    assert.deepEqual([login.status, login.json], [wrong.status, wrong.json])
    assert.deepEqual([login.status, login.json], [unknown.status, unknown.json])
    assert.equal(cookieFrom(login), '')
  })

  test('reactivating does not bring an old session back (the version moved on); logging in again works', async () => {
    const { cookie, email, id } = await signUp()
    await adminCall('account-status', { body: { id, status: 'suspended' } })
    await adminCall('account-status', { body: { id, status: 'active' } })
    assert.equal((await account('me', { cookie })).status, 401)
    assert.equal((await account('login', { body: { email, password: PASSWORD } })).status, 200)
  })

  test('an account with no password (invited, not yet set up) cannot sign in', async () => {
    const email = newEmail('invited')
    const made = await adminCall('account-create', { body: { email, name: 'Invited Person', level: 'bulk' } })
    assert.equal(made.status, 200)
    const r = await account('login', { body: { email, password: PASSWORD } })
    assert.equal(r.status, 401)
    // And a hand-made token for it is refused too (no password set).
    const acct = (await repo.findAccountByEmail(email))!
    const t = session.issueCustomerToken(acct)!
    assert.equal((await account('me', { cookie: `spt_session=${t.token}` })).status, 401)
  })

  test('logout clears the cookie', async () => {
    const { cookie } = await signUp()
    const r = await account('logout', { cookie })
    assert.equal(r.status, 200)
    assert.match(r.headers['set-cookie']!, /^spt_session=; .*Max-Age=0/)
    assert.equal(cookieFrom(r), '')
  })

  test('a dead cookie is cleared by me', async () => {
    const r = await account('me', { cookie: 'spt_session=garbage' })
    assert.equal(r.status, 401)
    assert.match(r.headers['set-cookie']!, /Max-Age=0/)
  })
})

describe('the cookie', () => {
  test('HttpOnly, SameSite=Lax, Path=/, 30 days, and no Secure on localhost', async () => {
    const { res } = await signUp()
    const set = res.headers['set-cookie']!
    assert.match(set, /^spt_session=[^;]+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000$/)
    assert.equal(/Secure/i.test(set), false)
  })

  test('Secure on any other host, and always on Vercel', async () => {
    const email = newEmail()
    const first = await account('signup', {
      host: 'spartantrucktyres.com.au',
      origin: 'https://spartantrucktyres.com.au',
      body: { name: 'Sec Ure', email, requestedLevel: 'customer', password: PASSWORD },
    })
    assert.equal(first.status, 200)
    assert.match(first.headers['set-cookie']!, /; Secure$/)
    // Vercel: Secure even when the Host header says localhost.
    await withEnv({ VERCEL: '1', DATABASE_URL: undefined }, async () => {
      // No database on "Vercel" here, so build the cookie directly.
      const acct = (await withEnv({ VERCEL: undefined }, () => repo.findAccountByEmail(email)))!
      const issued = session.issueCustomerToken(acct)!
      assert.match(session.sessionCookie({ headers: { host: 'localhost:5173' } }, issued), /; Secure$/)
      assert.match(session.clearedCookie({ headers: { host: 'localhost:5173' } }), /; Secure$/)
    })
  })

  test('the cookie parser handles several cookies, quotes and escapes, and keeps the first of a repeated name', () => {
    assert.deepEqual(session.parseCookies('a=1; spt_session="x.y"; b=%20z; spt_session=second'), { a: '1', spt_session: 'x.y', b: ' z' })
    assert.deepEqual(session.parseCookies(undefined), {})
    assert.deepEqual(session.parseCookies('novalue; =x; ok=1'), { ok: '1' })
  })
})

describe('requests', () => {
  test('every POST needs this site as its Origin, and JSON', async () => {
    const body = { email: newEmail(), password: PASSWORD }
    assert.equal((await account('login', { origin: null, body })).status, 403, 'no Origin')
    assert.equal((await account('login', { origin: 'https://evil.example.test', body })).status, 403, 'someone else')
    assert.equal((await account('login', { origin: 'http://localhost:5173.evil.test', body })).status, 403, 'look-alike')
    assert.equal((await account('login', { contentType: 'text/plain', body: JSON.stringify(body) })).status, 415)
    assert.equal((await account('login', { contentType: null, body })).status, 415)
    assert.equal((await account('login', { body: 'not json' })).status, 400)
    assert.equal((await account('login', { body: ['a'] })).status, 400)
    assert.equal((await account('login', { body: { email: 'x@example.test', password: 'p'.repeat(30_000) } })).status, 413)
    assert.equal((await account('login', { body })).status, 401, 'the control: the same request from the right origin is read')
  })

  test('a mutating route does nothing on a refused origin (nothing is created, no cookie)', async () => {
    const email = newEmail()
    const r = await account('signup', { origin: 'https://evil.example.test', body: { name: 'X Y', email, requestedLevel: 'customer', password: PASSWORD } })
    assert.equal(r.status, 403)
    assert.equal(await repo.findAccountByEmail(email), null)
    assert.equal(cookieFrom(r), '')
  })

  test('methods: GET routes refuse POST and the other way round; unknown actions are 404', async () => {
    assert.equal((await account('me', { method: 'POST', body: {} })).status, 405)
    assert.equal((await account('login', { method: 'GET' })).status, 405)
    assert.equal((await account('nope', { method: 'GET' })).status, 404)
    assert.equal((await account('constructor', { method: 'GET' })).status, 404)
    assert.equal((await account('__proto__', { method: 'GET' })).status, 404)
  })

  test('every answer, errors included, is private and uncacheable', async () => {
    const { cookie, email } = await signUp()
    const answers = [
      await account('me', { cookie }),
      await account('me'),
      await account('login', { body: { email, password: PASSWORD } }),
      await account('login', { body: { email, password: 'wrong-wrong-123' } }),
      await account('login', { origin: null, body: {} }),
      await account('login', { method: 'GET' }),
      await account('nope', { method: 'GET' }),
      await account('forgot', { body: { email } }),
      await account('logout'),
      await account('signup', { body: { name: '' } }),
    ]
    for (const r of answers) assert.equal(r.headers['cache-control'], 'private, no-store', `status ${r.status}`)
    const admin = await adminCall('accounts', { method: 'GET' })
    assert.equal(admin.headers['cache-control'], 'private, no-store')
  })
})

describe('nothing reveals whether an email has an account', () => {
  test('forgot: the same answer for a real address, an unknown one and a malformed one; mail only for the real one', async () => {
    const { email } = await signUp()
    mailer.clearDevOutbox()
    const real = await account('forgot', { body: { email } })
    const unknown = await account('forgot', { body: { email: newEmail('ghost') } })
    const malformed = await account('forgot', { body: { email: 'not an email' } })
    const missing = await account('forgot', { body: {} })
    for (const r of [real, unknown, malformed, missing]) assert.deepEqual([r.status, r.json], [200, { ok: true }])
    assert.equal(mailer.devOutbox().length, 1)
    assert.equal(mailer.devOutbox()[0]!.to, email)
  })

  test('forgot for a suspended account sends nothing', async () => {
    const { email, id } = await signUp()
    await adminCall('account-status', { body: { id, status: 'suspended' } })
    mailer.clearDevOutbox()
    const r = await account('forgot', { body: { email } })
    assert.deepEqual([r.status, r.json], [200, { ok: true }])
    assert.equal(mailer.devOutbox().length, 0)
  })

  test('login: unknown email, wrong password and suspended are one answer, and unknown emails still pay for a password check', async () => {
    const { email } = await signUp()
    const wrong = await account('login', { body: { email, password: 'wrong-password-123' } })
    const started = performance.now()
    const unknown = await account('login', { body: { email: newEmail('ghost'), password: 'wrong-password-123' } })
    const took = performance.now() - started
    assert.deepEqual([wrong.status, wrong.json], [unknown.status, unknown.json])
    assert.equal(wrong.status, 401)
    // scrypt (N=16384) costs tens of milliseconds; a bare lookup is far under 5.
    assert.ok(took > 8, `an unknown email must not return early (took ${took.toFixed(1)}ms)`)
  })

  test('signup with a taken email: a generic refusal that does not echo the address; the owner is warned by email', async () => {
    const { email } = await signUp()
    mailer.clearDevOutbox()
    const r = await account('signup', { body: { name: 'Someone Else', email: email.toUpperCase(), requestedLevel: 'customer', password: PASSWORD } })
    assert.equal(r.status, 409)
    assert.equal(JSON.stringify(r.json).includes(email), false)
    assert.equal(cookieFrom(r), '')
    assert.equal(lastMailTo(email)?.subject, 'You already have a Spartan Tyres account')
    assert.equal((await repo.listAccounts()).length, 1)
  })
})

describe('rate limits', () => {
  test('login: 5 attempts per email in 15 minutes (even from different addresses), then 429 even for the right password', async () => {
    const { email } = await signUp()
    for (let i = 0; i < 5; i++) assert.equal((await account('login', { body: { email, password: 'wrong-password-123' } })).status, 401)
    const blocked = await account('login', { body: { email, password: PASSWORD } })
    assert.equal(blocked.status, 429)
    assert.equal(cookieFrom(blocked), '')
    assert.ok(blocked.json.error)
  })

  test('login: 30 attempts per address per hour, whatever the email', async () => {
    const ip = newIp()
    for (let i = 0; i < 30; i++) assert.equal((await account('login', { ip, body: { email: newEmail('x'), password: 'wrong-password-123' } })).status, 401)
    assert.equal((await account('login', { ip, body: { email: newEmail('x'), password: 'wrong-password-123' } })).status, 429)
    // Another address is unaffected.
    assert.equal((await account('login', { ip: newIp(), body: { email: newEmail('x'), password: 'wrong-password-123' } })).status, 401)
  })

  test('the limit is by network, not by exact address (same /24)', async () => {
    for (let i = 0; i < 30; i++) await account('login', { ip: `203.0.113.${i + 1}`, body: { email: newEmail('x'), password: 'wrong-password-123' } })
    assert.equal((await account('login', { ip: '203.0.113.200', body: { email: newEmail('x'), password: 'wrong-password-123' } })).status, 429)
  })

  test('signup: 5 per address per hour', async () => {
    const ip = newIp()
    for (let i = 0; i < 5; i++) {
      const r = await account('signup', { ip, body: { name: 'Rate Test', email: newEmail(), requestedLevel: 'customer', password: PASSWORD } })
      assert.equal(r.status, 200)
    }
    const r = await account('signup', { ip, body: { name: 'Rate Test', email: newEmail(), requestedLevel: 'customer', password: PASSWORD } })
    assert.equal(r.status, 429)
  })

  test('signup: 3 per email per hour (so the "already registered" mail cannot be used to spam someone)', async () => {
    const { email } = await signUp()
    mailer.clearDevOutbox()
    const results = []
    for (let i = 0; i < 4; i++) results.push((await account('signup', { body: { name: 'Spam', email, requestedLevel: 'customer', password: PASSWORD } })).status)
    // The first sign-up above counted as one of the three.
    assert.deepEqual(results, [409, 409, 429, 429])
    assert.equal(mailer.devOutbox().filter((m) => m.to === email).length, 2)
  })

  test('forgot: 3 per email and 10 per address per hour', async () => {
    const { email } = await signUp()
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await account('forgot', { body: { email } })).status)
    assert.deepEqual(statuses, [200, 200, 200, 429])
    const ip = newIp()
    const more = []
    for (let i = 0; i < 11; i++) more.push((await account('forgot', { ip, body: { email: newEmail('f') } })).status)
    assert.deepEqual(more.slice(0, 10), Array(10).fill(200))
    assert.equal(more[10], 429)
  })

  test('set-password: 10 per address per hour, valid or not', async () => {
    const ip = newIp()
    for (let i = 0; i < 10; i++) assert.equal((await account('set-password', { ip, body: { token: 'nope', password: PASSWORD } })).status, 400)
    assert.equal((await account('set-password', { ip, body: { token: 'nope', password: PASSWORD } })).status, 429)
  })

  test('changing the password: 5 tries per account per 15 minutes', async () => {
    const { cookie } = await signUp()
    for (let i = 0; i < 5; i++) assert.equal((await account('password', { cookie, body: { current: 'not-the-password', next: 'brand-new-password' } })).status, 400)
    assert.equal((await account('password', { cookie, body: { current: PASSWORD, next: 'brand-new-password' } })).status, 429)
  })

  test('counters hold hashes, never an address or an email', async () => {
    const { email } = await signUp({ email: 'private.person@buyer.example.test' })
    await account('login', { ip: '198.51.100.23', body: { email, password: 'wrong-wrong-123' } })
    const db = await dbm.getDb(
      (await import('../api/_lib/accounts/schema.js')).ACCOUNTS_SCHEMA,
    )
    const keys = (await db.query<{ key: string }>(`SELECT key FROM ai_rate`)).map((r) => r.key).join(' ')
    assert.equal(keys.includes('private.person'), false)
    assert.equal(keys.includes('198.51.100'), false)
    assert.match(keys, /acct:login-email:/)
  })
})

describe('invite and reset links', () => {
  async function resetLink(email: string): Promise<string> {
    mailer.clearDevOutbox()
    assert.equal((await account('forgot', { body: { email } })).status, 200)
    return tokenFrom(lastMailTo(email)!.text)
  }

  test('only the SHA-256 of a token is stored; the token is 32 random bytes', async () => {
    const { email } = await signUp()
    const token = await resetLink(email)
    assert.equal(Buffer.from(token, 'base64url').length, 32)
    const db = await dbm.getDb((await import('../api/_lib/accounts/schema.js')).ACCOUNTS_SCHEMA)
    const rows = await db.query<{ token_hash: string; purpose: string }>(`SELECT token_hash, purpose FROM customer_tokens`)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.token_hash, repo.sha256Hex(token))
    assert.equal(rows[0]!.token_hash.includes(token), false)
    assert.equal(rows[0]!.purpose, 'reset')
  })

  test('a link works once', async () => {
    const { email } = await signUp()
    const token = await resetLink(email)
    const first = await account('set-password', { body: { token, password: 'another-good-password' } })
    assert.equal(first.status, 200)
    const again = await account('set-password', { body: { token, password: 'yet-another-password' } })
    assert.equal(again.status, 400)
    assert.equal(cookieFrom(again), '')
    // The first password is the one in force.
    assert.equal((await account('login', { body: { email, password: 'another-good-password' } })).status, 200)
    assert.equal((await account('login', { body: { email, password: 'yet-another-password' } })).status, 401)
  })

  test('two requests with the same link at once: only one wins', async () => {
    const { email } = await signUp()
    const token = await resetLink(email)
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => account('set-password', { body: { token, password: `parallel-password-${i}` } })),
    )
    assert.equal(results.filter((r) => r.status === 200).length, 1)
  })

  test('an expired link is refused (reset: 1 hour, invite: 7 days)', async () => {
    const { email, id } = await signUp()
    const token = await resetLink(email)
    const db = await dbm.getDb((await import('../api/_lib/accounts/schema.js')).ACCOUNTS_SCHEMA)
    const row = (await db.query<{ ttl: number | string }>(`SELECT extract(epoch FROM (expires_at - created_at)) AS ttl FROM customer_tokens`))[0]!
    assert.equal(Math.round(Number(row.ttl)), 3600)
    await db.query(`UPDATE customer_tokens SET expires_at = now() - interval '1 second'`)
    const r = await account('set-password', { body: { token, password: 'another-good-password' } })
    assert.equal(r.status, 400)
    // Invite: 7 days.
    const invited = await repo.createToken(id, 'invite', 'test')
    const ttl = (await db.query<{ ttl: number | string }>(`SELECT extract(epoch FROM (expires_at - created_at)) AS ttl FROM customer_tokens WHERE token_hash = $1::text`, [repo.sha256Hex(invited)]))[0]!
    assert.equal(Math.round(Number(ttl.ttl)), 7 * 86400)
  })

  test('a newer link retires the older one', async () => {
    const { email } = await signUp()
    const older = await resetLink(email)
    const newer = await resetLink(email)
    assert.equal((await account('set-password', { body: { token: older, password: 'another-good-password' } })).status, 400)
    assert.equal((await account('set-password', { body: { token: newer, password: 'another-good-password' } })).status, 200)
  })

  test('using a link signs out other sessions (token version moves) and signs this browser in', async () => {
    const { email, cookie } = await signUp()
    const token = await resetLink(email)
    const r = await account('set-password', { body: { token, password: 'another-good-password' } })
    assert.equal(r.status, 200)
    assert.equal((await account('me', { cookie })).status, 401, 'the old session is gone')
    assert.equal((await account('me', { cookie: cookieFrom(r) })).status, 200, 'the new one works')
  })

  test('a link for a suspended account is refused and stays unspent', async () => {
    const { email, id } = await signUp()
    const token = await resetLink(email)
    await adminCall('account-status', { body: { id, status: 'suspended' } })
    assert.equal((await account('set-password', { body: { token, password: 'another-good-password' } })).status, 400)
  })

  test('unknown, empty and oversized tokens are refused alike', async () => {
    for (const token of ['', 'abc', 'x'.repeat(300), null, 5]) {
      const r = await account('set-password', { body: { token, password: PASSWORD } })
      assert.equal(r.status, 400)
    }
  })
})

describe('passwords', () => {
  test('at least 10 characters, at most 200, and not the email address', async () => {
    const email = newEmail()
    const tries: Array<[string, number]> = [
      ['short', 400],
      ['123456789', 400],
      ['x'.repeat(201), 400],
      [email, 400],
      [email.toUpperCase(), 400],
      ['1234567890', 200],
    ]
    for (const [password, status] of tries) {
      const r = await account('signup', { body: { name: 'Pass Word', email, requestedLevel: 'customer', password } })
      assert.equal(r.status, status, password.slice(0, 12))
      if (status === 400) assert.equal(r.json.field, 'password')
    }
  })

  test('a password refused because it is the email does not spend the link', async () => {
    const { email } = await signUp()
    mailer.clearDevOutbox()
    await account('forgot', { body: { email } })
    const token = tokenFrom(lastMailTo(email)!.text)
    const refused = await account('set-password', { body: { token, password: email.toUpperCase() } })
    assert.equal(refused.status, 400)
    assert.equal(refused.json.field, 'password')
    assert.match(refused.json.error, /cannot be your email/)
    assert.equal(cookieFrom(refused), '', 'no session from a refused password')
    assert.equal((await account('set-password', { body: { token, password: 'a-different-good-one' } })).status, 200, 'the link still works')
  })

  test('changing the email cancels a link sent to the old address', async () => {
    const made = await adminCall('account-create', { body: { email: newEmail('typo'), name: 'Typo Person', level: 'bulk' } })
    const token = tokenFrom(made.json.inviteLink)
    const fixed = await adminCall('account-update', { body: { id: made.json.account.id, email: newEmail('fixed') } })
    assert.equal(fixed.status, 200)
    assert.equal((await account('set-password', { body: { token, password: PASSWORD } })).status, 400, 'the old link is dead')
    const fresh = await adminCall('account-invite', { body: { id: made.json.account.id } })
    assert.equal((await account('set-password', { body: { token: tokenFrom(fresh.json.inviteLink), password: PASSWORD } })).status, 200)
  })

  test('the same rules apply to set-password and to changing a password', async () => {
    const { email, cookie } = await signUp()
    mailer.clearDevOutbox()
    await account('forgot', { body: { email } })
    const token = tokenFrom(lastMailTo(email)!.text)
    assert.equal((await account('set-password', { body: { token, password: 'short' } })).status, 400)
    // A refused password does not spend the link.
    assert.equal((await account('set-password', { body: { token, password: 'a-long-enough-one' } })).status, 200)
    const fresh = (await account('login', { body: { email, password: 'a-long-enough-one' } }))
    const c2 = cookieFrom(fresh)
    assert.equal((await account('password', { cookie: c2, body: { current: 'a-long-enough-one', next: 'short' } })).status, 400)
    assert.equal((await account('password', { cookie: c2, body: { current: 'a-long-enough-one', next: 'a-long-enough-one' } })).status, 400)
    assert.equal((await account('password', { cookie: c2, body: { current: 'wrong-one-entirely', next: 'a-different-password' } })).json.field, 'current')
    void cookie
  })

  test('passwords are stored as scrypt hashes, and no response, mail or log ever holds a hash or token version', async () => {
    const { email, id } = await signUp()
    const stored = (await repo.getAccount(id))!.passwordHash!
    assert.match(stored, /^scrypt\$\d+\$\d+\$\d+\$/)
    assert.equal(stored.includes(PASSWORD), false)
    await account('login', { body: { email, password: PASSWORD } })
    await account('forgot', { body: { email } })
    await adminCall('accounts', { method: 'GET' })
    await adminCall('account', { method: 'GET', query: { id } })
    const everything = answered.join('\n') + JSON.stringify(mailer.devOutbox())
    for (const needle of ['scrypt$', 'passwordHash', 'password_hash', 'tokenVersion', 'token_version', PASSWORD]) {
      assert.equal(everything.includes(needle), false, `leaked ${needle}`)
    }
  })

  test('a very long password is cut before hashing at login (no scrypt cost attack)', async () => {
    const { email } = await signUp()
    const started = performance.now()
    const r = await account('login', { body: { email, password: 'p'.repeat(5000) } })
    assert.equal(r.status, 401)
    assert.ok(performance.now() - started < 3000)
  })
})

describe('with no secret on Vercel, accounts are off', () => {
  test('no ADMIN_SESSION_SECRET on Vercel: every account route answers 503, and no token can be made', async () => {
    await withEnv({ VERCEL: '1', ADMIN_SESSION_SECRET: undefined, DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }, async () => {
      assert.equal(session.accountsConfigured(), false)
      assert.equal(session.issueCustomerToken({ id: 'ca_x', tokenVersion: 0 }), null)
      assert.equal(session.readCustomerToken(customerSigned({ typ: 'customer', sub: 'ca_x', v: 0, exp: Date.now() + 60_000 })), null)
      for (const [action, method] of [['me', 'GET'], ['login', 'POST'], ['signup', 'POST'], ['forgot', 'POST'], ['set-password', 'POST']] as const) {
        const r = await account(action, { method, origin: 'http://localhost:5173', body: { email: 'a@b.test', password: PASSWORD } })
        assert.equal(r.status, 503, action)
        assert.equal(cookieFrom(r), '')
      }
      // Staff sign-in is untouched by this (it derives its key from the password).
      assert.ok(auth.issueToken())
    })
  })

  test('the local fallback key exists only off Vercel and outside production, and is a different key from the staff one', async () => {
    await withEnv({ ADMIN_SESSION_SECRET: undefined }, async () => {
      assert.equal(session.accountsConfigured(), true)
      const t = session.issueCustomerToken({ id: 'ca_local', tokenVersion: 1 })!
      assert.ok(session.readCustomerToken(t.token))
      assert.equal(auth.readToken(t.token), null)
    })
    await withEnv({ ADMIN_SESSION_SECRET: undefined, NODE_ENV: 'production' }, async () => {
      assert.equal(session.accountsConfigured(), false)
    })
  })

  test('on Vercel without a database the routes answer 503 as well', async () => {
    await withEnv({ VERCEL: '1', DATABASE_URL: undefined, POSTGRES_URL: undefined }, async () => {
      const r = await account('me', { origin: 'http://localhost:5173' })
      assert.equal(r.status, 503)
    })
  })

  test('the dev outbox does not exist on Vercel or for a non-local host', async () => {
    await signUp()
    assert.equal((await account('dev-outbox', { method: 'GET' })).status, 200)
    assert.equal((await account('dev-outbox', { method: 'GET', host: 'spartantrucktyres.com.au' })).status, 404)
    await withEnv({ VERCEL: '1' }, async () => {
      assert.equal(mailer.outboxEnabled(), false)
      assert.deepEqual(mailer.devOutbox(), [])
    })
  })
})
