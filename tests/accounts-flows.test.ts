/**
 * Customer accounts: the flows a customer and staff go through, end to end against the real handlers
 * (in-memory Postgres and store, dev outbox or a fake Resend, nothing on a network).
 *   npx tsx --test tests/accounts-flows.test.ts
 */
import assert from 'node:assert/strict'
import { after, beforeEach, describe, test } from 'node:test'
import { site } from '../src/config/site.js'
import {
  PASSWORD,
  account,
  adminCall,
  cookieFrom,
  lastMailTo,
  mailer,
  newEmail,
  outboxTo,
  repo,
  reset,
  shutdown,
  signUp,
  store,
  tokenFrom,
  useFakeMail,
} from './accounts-kit.js'

beforeEach(reset)
after(shutdown)

describe('self sign-up', () => {
  test('opens an active Customer account at once, signed in, with the level asked for kept as a request', async () => {
    const email = newEmail()
    const r = await account('signup', {
      body: { name: 'Pat Buyer', company: 'Buyer Haulage', email: email.toUpperCase(), phone: '0400 123 456', abn: '12345678901', address: '1 Test St, Yennora', requestedLevel: 'bulk', message: 'We run 40 trucks', password: PASSWORD },
    })
    assert.equal(r.status, 200)
    const a = r.json.account
    assert.equal(a.email, email, 'the email is stored lower-case')
    assert.equal(a.level, 'customer')
    assert.equal(a.requestedLevel, 'bulk')
    assert.equal(a.status, 'active')
    assert.equal(a.discountPct, 0)
    assert.equal(a.payLater, false)
    assert.equal(a.outstanding, 0)
    assert.equal(a.emailVerified, false)
    assert.equal(a.abn, '12 345 678 901')
    assert.match(a.id, /^ca_[a-z2-7]{20}$/)
    assert.deepEqual(Object.keys(a).sort(), ['abn', 'address', 'company', 'creditLimit', 'discountPct', 'email', 'emailVerified', 'id', 'level', 'name', 'outstanding', 'payLater', 'payLaterReady', 'phone', 'requestedLevel', 'status', 'termsDays'])
    const me = await account('me', { cookie: cookieFrom(r) })
    assert.equal(me.status, 200)
    assert.deepEqual(me.json.account, a)
    const stored = (await repo.getAccount(a.id))!
    assert.equal(stored.notes, 'Sign-up message: We run 40 trucks')
    assert.equal(stored.createdBy, 'self')
  })

  test('asking for Customer (or nothing) leaves no request', async () => {
    const a = (await signUp({ requestedLevel: 'customer' })).res.json.account
    assert.equal(a.requestedLevel, null)
    const b = await account('signup', { body: { name: 'No Level', email: newEmail(), password: PASSWORD } })
    assert.equal(b.json.account.requestedLevel, null)
    const w = await account('signup', { body: { name: 'Wholesale Co', email: newEmail(), requestedLevel: 'wholesaler', password: PASSWORD } })
    assert.equal(w.json.account.requestedLevel, 'wholesaler')
    assert.equal(w.json.account.level, 'customer', 'never starts above Customer')
  })

  test('a level cannot be self-assigned by any field', async () => {
    const r = await account('signup', {
      body: { name: 'Sneaky', email: newEmail(), requestedLevel: 'customer', password: PASSWORD, level: 'wholesaler', discountPct: 50, payLater: true, creditLimit: 99999, status: 'active', emailVerified: true, id: 'ca_aaaaaaaaaaaaaaaaaaaa' },
    })
    const a = r.json.account
    assert.equal(a.level, 'customer')
    assert.equal(a.discountPct, 0)
    assert.equal(a.payLater, false)
    assert.equal(a.creditLimit, 0)
    assert.equal(a.emailVerified, false)
    assert.notEqual(a.id, 'ca_aaaaaaaaaaaaaaaaaaaa')
  })

  test('emails the customer, and sales with the application', async () => {
    const { email } = await signUp({ name: 'Pat <b>Buyer</b>', requestedLevel: 'wholesaler', company: 'A & B "Haulage"' })
    const welcome = lastMailTo(email)!
    assert.equal(welcome.subject, 'Welcome to Spartan Tyres')
    assert.match(welcome.text, /Wholesaler/)
    const sales = lastMailTo(site.email.sales)!
    assert.equal(sales.subject, 'New Wholesaler account request')
    assert.equal(sales.replyTo, email)
    assert.match(sales.text, /Company: A & B "Haulage"/)
    assert.equal(sales.html.includes('<b>Buyer</b>'), false, 'names are escaped')
    assert.match(sales.html, /Pat &lt;b&gt;Buyer&lt;\/b&gt;/)
    assert.match(sales.html, /A &amp; B &quot;Haulage&quot;/)
    assert.match(sales.text, /\/admin\/accounts/)
  })

  test('a plain Customer sign-up still tells sales, without a level request', async () => {
    await signUp()
    assert.equal(lastMailTo(site.email.sales)!.subject, 'New customer account')
  })

  test('creates the counter customer and links both ways', async () => {
    const { id, email } = await signUp({ name: 'Pat Buyer', company: 'Buyer Haulage', phone: '0400 123 456', address: '1 Test St' })
    const a = (await repo.getAccount(id))!
    assert.ok(a.posCustomerId)
    const pos = (await store.getPosCustomer(a.posCustomerId!))!
    assert.equal(pos.accountId, id)
    assert.equal(pos.email, email)
    assert.equal(pos.company, 'Buyer Haulage')
    assert.equal(pos.name, 'Pat Buyer')
    assert.equal(pos.termsDays, 14)
  })

  test('validation names the field', async () => {
    const good = { name: 'Valid Name', email: newEmail(), requestedLevel: 'customer', password: PASSWORD }
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: '' }, 'name'],
      [{ name: 'x'.repeat(121) }, 'name'],
      [{ email: 'nope' }, 'email'],
      [{ email: undefined }, 'email'],
      [{ phone: '123' }, 'phone'],
      [{ abn: '123' }, 'abn'],
      [{ abn: 'abcdefghijk' }, 'abn'],
      [{ company: 'c'.repeat(161) }, 'company'],
      [{ address: 'a'.repeat(301) }, 'address'],
      [{ requestedLevel: 'platinum' }, 'requestedLevel'],
      [{ requestedLevel: 5 }, 'requestedLevel'],
      [{ message: 'm'.repeat(1001) }, 'message'],
      [{ password: 'short' }, 'password'],
    ]
    for (const [override, field] of cases) {
      const r = await account('signup', { body: { ...good, ...override } })
      assert.equal(r.status, 400, field)
      assert.equal(r.json.field, field)
      assert.ok(r.json.error)
    }
    assert.equal((await repo.listAccounts()).length, 0, 'nothing was created by a refused sign-up')
  })
})

describe('staff open an account, the customer sets a password', () => {
  test('create -> invite -> set-password -> sign in (link shown to staff when email is not set up)', async () => {
    const email = newEmail('trade')
    const made = await adminCall('account-create', {
      body: { email, name: 'Tina Trade', company: 'Trade Tyres', phone: '0400 555 555', level: 'wholesaler', discountPct: 12.5, notes: 'Met at the expo' },
    })
    assert.equal(made.status, 200)
    assert.equal(made.json.emailSent, false)
    assert.match(made.json.inviteLink, /^https:\/\/shop\.example\.test\/account\/set-password\?token=[A-Za-z0-9_-]{43}$/)
    assert.equal(made.json.account.level, 'wholesaler')
    assert.equal(made.json.account.discountPct, 12.5)
    assert.equal(made.json.account.hasPassword, false)
    assert.equal(made.json.account.status, 'active')
    assert.equal(made.json.account.emailVerified, false)
    assert.equal(made.json.account.approvedBy, 'owner')

    // Not usable until the password is set.
    assert.equal((await account('login', { body: { email, password: PASSWORD } })).status, 401)

    const token = tokenFrom(made.json.inviteLink)
    const set = await account('set-password', { body: { token, password: PASSWORD } })
    assert.equal(set.status, 200)
    assert.equal(set.json.account.emailVerified, true)
    assert.equal(set.json.account.level, 'wholesaler')
    const me = await account('me', { cookie: cookieFrom(set) })
    assert.equal(me.json.account.discountPct, 12.5)
    const login = await account('login', { body: { email, password: PASSWORD } })
    assert.equal(login.status, 200)
    assert.equal((await repo.findAccountByEmail(email))!.lastLoginAt !== null, true)
  })

  test('with email set up, the customer gets the link and staff do not see it', async () => {
    const mail = useFakeMail()
    try {
      const email = newEmail('trade')
      const made = await adminCall('account-create', { body: { email, name: 'Tina <Trade>', level: 'bulk' } })
      assert.equal(made.status, 200)
      assert.equal(made.json.emailSent, true)
      assert.equal('inviteLink' in made.json, false)
      assert.equal(mail.sent.length, 1)
      const sent = mail.sent[0]!
      assert.equal(sent.url, 'https://api.resend.com/emails')
      assert.equal(sent.headers.Authorization, 'Bearer re_test_key_not_real')
      assert.deepEqual(sent.body.to, [email])
      assert.equal(sent.body.from, 'Spartan Tyres <accounts@mail.example.test>')
      assert.equal(sent.body.subject, 'Your Spartan Tyres account is ready')
      assert.equal(sent.body.html.includes('Tina <Trade>'), false)
      assert.match(sent.body.html, /Tina &lt;Trade&gt;|Hi Tina,/)
      const token = tokenFrom(sent.body.text)
      assert.equal((await account('set-password', { body: { token, password: PASSWORD } })).status, 200)
    } finally {
      mail.restore()
    }
  })

  test('when Resend fails, staff get the link to copy instead', async () => {
    const mail = useFakeMail(500)
    try {
      const made = await adminCall('account-create', { body: { email: newEmail(), name: 'Fail Mail', level: 'customer' } })
      assert.equal(made.status, 200)
      assert.equal(made.json.emailSent, false)
      assert.match(made.json.inviteLink, /set-password\?token=/)
    } finally {
      mail.restore()
    }
  })

  test('the invite link uses PUBLIC_SITE_URL and never the request, even with a forged host', async () => {
    const made = await adminCall('account-create', { body: { email: newEmail(), name: 'Host Check', level: 'customer' } })
    assert.ok(made.json.inviteLink.startsWith('https://shop.example.test/'))
    // On Vercel a forged Host / Origin cannot aim the link elsewhere.
    const prev = process.env.VERCEL
    process.env.VERCEL = '1'
    try {
      const { siteBase } = await import('../api/_lib/accounts/emails.js')
      assert.equal(siteBase({ headers: { host: 'evil.example.test', origin: 'https://evil.example.test' } }), 'https://shop.example.test')
    } finally {
      if (prev === undefined) delete process.env.VERCEL
      else process.env.VERCEL = prev
    }
    // Locally the request's own (local) origin is used, so a link opens the local site; a foreign one is not.
    const { siteBase } = await import('../api/_lib/accounts/emails.js')
    assert.equal(siteBase({ headers: { origin: 'http://localhost:5173' } }), 'http://localhost:5173')
    assert.equal(siteBase({ headers: { origin: 'https://evil.example.test', host: 'evil.example.test' } }), 'https://shop.example.test')
  })

  test('re-sending an invite gives a new link and retires the old one; an account with a password gets a reset link', async () => {
    const made = await adminCall('account-create', { body: { email: newEmail(), name: 'Resend Me', level: 'bulk' } })
    const id = made.json.account.id
    const first = tokenFrom(made.json.inviteLink)
    const again = await adminCall('account-invite', { body: { id } })
    assert.equal(again.status, 200)
    const second = tokenFrom(again.json.inviteLink)
    assert.notEqual(first, second)
    assert.equal((await account('set-password', { body: { token: first, password: PASSWORD } })).status, 400)
    assert.equal((await account('set-password', { body: { token: second, password: PASSWORD } })).status, 200)
    const reset = await adminCall('account-invite', { body: { id } })
    const purposes = await (await import('../api/_lib/accounts/schema.js')).getAccountsDb().then((db) => db.query<{ purpose: string }>(`SELECT purpose FROM customer_tokens WHERE used_at IS NULL`))
    assert.deepEqual(purposes.map((p) => p.purpose), ['reset'])
    assert.ok(reset.json.inviteLink)
  })

  test('the same email cannot be opened twice, in any letter case', async () => {
    const email = newEmail()
    assert.equal((await adminCall('account-create', { body: { email, name: 'First', level: 'customer' } })).status, 200)
    const dup = await adminCall('account-create', { body: { email: email.toUpperCase(), name: 'Second', level: 'bulk' } })
    assert.equal(dup.status, 409)
    assert.equal((await repo.listAccounts()).length, 1)
    assert.equal((await store.listPosCustomers()).length, 1, 'no second counter customer for a refused account')
  })

  test('two creates of one email at the same moment: exactly one account', async () => {
    const email = newEmail()
    const results = await Promise.all(
      [1, 2, 3].map(() => adminCall('account-create', { body: { email, name: 'Racer', level: 'customer' } })),
    )
    assert.equal(results.filter((r) => r.status === 200).length, 1)
    assert.equal((await repo.listAccounts()).length, 1)
  })
})

describe('forgot and reset', () => {
  test('forgot -> reset link -> new password -> signed in, old password and old sessions dead, "changed" mail sent', async () => {
    const { email, cookie } = await signUp()
    mailer.clearDevOutbox()
    await account('forgot', { body: { email } })
    const mail = lastMailTo(email)!
    assert.equal(mail.subject, 'Reset your Spartan Tyres password')
    assert.match(mail.text, /expires in 1 hour/)
    const token = tokenFrom(mail.text)
    assert.match(mail.html, new RegExp(`/account/set-password\\?token=${token}`))

    const r = await account('set-password', { body: { token, password: 'a-brand-new-password' } })
    assert.equal(r.status, 200)
    assert.equal(r.json.account.emailVerified, true)
    assert.equal((await account('me', { cookie })).status, 401)
    assert.equal((await account('me', { cookie: cookieFrom(r) })).status, 200)
    assert.equal((await account('login', { body: { email, password: PASSWORD } })).status, 401)
    assert.equal((await account('login', { body: { email, password: 'a-brand-new-password' } })).status, 200)
    assert.equal(lastMailTo(email)!.subject, 'Your Spartan Tyres password was changed')
  })

  test('the reset link of an invited customer sets their first password too', async () => {
    const email = newEmail('trade')
    await adminCall('account-create', { body: { email, name: 'Never Set', level: 'bulk' } })
    mailer.clearDevOutbox()
    await account('forgot', { body: { email } })
    const token = tokenFrom(lastMailTo(email)!.text)
    assert.equal((await account('set-password', { body: { token, password: PASSWORD } })).status, 200)
  })
})

describe('the customer looks after their own account', () => {
  test('details: name, company, phone, ABN and address change; level, price and credit cannot; the counter customer follows', async () => {
    const { cookie, id } = await signUp()
    const r = await account('details', {
      cookie,
      body: { name: 'Pat Renamed', company: 'New Co', phone: '0400 999 999', abn: '98 765 432 109', address: '9 New Rd', level: 'wholesaler', discountPct: 40, payLater: true, creditLimit: 5000, email: 'other@example.test' },
    })
    assert.equal(r.status, 200)
    assert.equal(r.json.account.name, 'Pat Renamed')
    assert.equal(r.json.account.company, 'New Co')
    assert.equal(r.json.account.abn, '98 765 432 109')
    assert.equal(r.json.account.level, 'customer')
    assert.equal(r.json.account.discountPct, 0)
    assert.equal(r.json.account.payLater, false)
    assert.equal(r.json.account.creditLimit, 0)
    assert.notEqual(r.json.account.email, 'other@example.test', 'email changes go through staff')
    const a = (await repo.getAccount(id))!
    const pos = (await store.getPosCustomer(a.posCustomerId!))!
    assert.equal(pos.name, 'Pat Renamed')
    assert.equal(pos.company, 'New Co')
    assert.equal(pos.phone, '0400 999 999')
    assert.equal(pos.address, '9 New Rd')
    assert.equal((await account('details', { cookie, body: { name: '' } })).status, 400)
    assert.equal((await account('details', { body: { name: 'No Cookie' } })).status, 401)
  })

  test('password change: needs the current one, signs out other devices, keeps this one, sends the "changed" mail', async () => {
    const { cookie, email } = await signUp()
    const other = cookieFrom(await account('login', { body: { email, password: PASSWORD } }))
    mailer.clearDevOutbox()
    const bad = await account('password', { cookie, body: { current: 'not-it-at-all', next: 'a-brand-new-password' } })
    assert.equal(bad.status, 400)
    assert.equal(bad.json.field, 'current')
    const r = await account('password', { cookie, body: { current: PASSWORD, next: 'a-brand-new-password' } })
    assert.equal(r.status, 200)
    assert.equal((await account('me', { cookie: other })).status, 401, 'the other device is signed out')
    assert.equal((await account('me', { cookie })).status, 401, 'the old cookie too')
    assert.equal((await account('me', { cookie: cookieFrom(r) })).status, 200, 'this browser got a fresh cookie')
    assert.equal((await account('login', { body: { email, password: PASSWORD } })).status, 401)
    assert.equal((await account('login', { body: { email, password: 'a-brand-new-password' } })).status, 200)
    assert.equal(outboxTo(email).at(-1)!.subject, 'Your Spartan Tyres password was changed')
    assert.equal((await account('password', { body: { current: PASSWORD, next: 'a-brand-new-password' } })).status, 401)
  })

  test('what me shows follows what staff set', async () => {
    const { cookie, id } = await signUp({ requestedLevel: 'bulk' })
    await adminCall('account-request', { body: { id, decision: 'approve' } })
    await adminCall('account-level', { body: { id, level: 'bulk', discountPct: 7.5 } })
    await adminCall('account-credit', { body: { id, payLater: true, termsDays: 30, creditLimit: 2500 } })
    const me = (await account('me', { cookie })).json.account
    assert.equal(me.level, 'bulk')
    assert.equal(me.requestedLevel, null)
    assert.equal(me.discountPct, 7.5)
    assert.equal(me.payLater, true)
    assert.equal(me.termsDays, 30)
    assert.equal(me.creditLimit, 2500)
    assert.equal(me.outstanding, 0)
    assert.equal(me.payLaterReady, true, 'on, active and linked')
  })

  test('payLaterReady is false while pay later is off, and for an account not linked to its till customer', async () => {
    const { cookie } = await signUp()
    assert.equal((await account('me', { cookie })).json.account.payLaterReady, false, 'pay later off')
    const now = new Date().toISOString()
    const email = newEmail('unlinked')
    await store.savePosCustomer({ id: `till-${email}`, name: 'Till Person', company: '', email, phone: '', address: '', notes: '', termsDays: 14, createdAt: now, updatedAt: now, createdBy: 'Sam' })
    const unlinked = await signUp({ email })
    assert.equal((await repo.getAccount(unlinked.id))!.posCustomerId, null)
    // Even if pay later were on in the database, an unlinked account is not ready.
    await repo.updateAccount(unlinked.id, { payLater: true, creditLimit: 1000 })
    const me = (await account('me', { cookie: unlinked.cookie })).json.account
    assert.equal(me.payLater, true)
    assert.equal(me.payLaterReady, false)
  })
})
