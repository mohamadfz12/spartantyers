/**
 * The email module (Resend over a fake fetch, the dev outbox, escaping) and the shared database the AI
 * and customer accounts now both use. No network, no real email.
 *   npx tsx --test tests/accounts-email.test.ts
 */
import assert from 'node:assert/strict'
import { after, beforeEach, describe, test } from 'node:test'
import { dbm, mailer, reset, shutdown, useFakeMail } from './accounts-kit.js'
import { inviteEmail, levelDecisionEmail, newApplicationEmail, setPasswordLink } from '../api/_lib/accounts/emails.js'
import { rateLimited, hashIp } from '../api/_lib/rate.js'
import { ACCOUNTS_SCHEMA } from '../api/_lib/accounts/schema.js'

beforeEach(reset)
after(shutdown)

const MAIL = { to: 'buyer@example.test', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' }

/** Captures console.error for the length of `fn`. */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ value: T; logged: string }> {
  const original = console.error
  const lines: string[] = []
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  try {
    return { value: await fn(), logged: lines.join('\n') }
  } finally {
    console.error = original
  }
}

describe('sendEmail', () => {
  test('sends through Resend with the key, the sender, the recipient and both bodies', async () => {
    const mail = useFakeMail()
    try {
      const r = await mailer.sendEmail({ ...MAIL, replyTo: 'sales@example.test' })
      assert.deepEqual(r, { sent: true })
      assert.equal(mail.sent.length, 1)
      const m = mail.sent[0]!
      assert.equal(m.url, 'https://api.resend.com/emails')
      assert.equal(m.headers.Authorization, 'Bearer re_test_key_not_real')
      assert.equal(m.headers['Content-Type'], 'application/json')
      assert.deepEqual(m.body, { from: 'Spartan Tyres <accounts@mail.example.test>', to: ['buyer@example.test'], subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', reply_to: 'sales@example.test' })
      assert.deepEqual(mailer.devOutbox(), [], 'a configured send does not touch the dev outbox')
    } finally {
      mail.restore()
    }
  })

  test('without a key or sender it sends nothing and says not_configured (and either one alone is not enough)', async () => {
    const mail = useFakeMail()
    try {
      delete process.env.RESEND_API_KEY
      assert.deepEqual(await mailer.sendEmail(MAIL), { sent: false, reason: 'not_configured' })
      process.env.RESEND_API_KEY = 're_test_key_not_real'
      delete process.env.MAIL_FROM
      assert.deepEqual(await mailer.sendEmail(MAIL), { sent: false, reason: 'not_configured' })
      assert.equal(mail.sent.length, 0)
      assert.equal(mailer.emailConfigured(), false)
    } finally {
      mail.restore()
    }
  })

  test('Resend refusing, or the network failing, is "failed" and never throws or logs the key or address', async () => {
    const refused = useFakeMail(422)
    try {
      const { value, logged } = await captureErrors(() => mailer.sendEmail(MAIL))
      assert.deepEqual(value, { sent: false, reason: 'failed' })
      assert.match(logged, /422/)
      assert.equal(logged.includes('re_test_key'), false)
      assert.equal(logged.includes('buyer@example.test'), false)
    } finally {
      refused.restore()
    }
    const down = useFakeMail()
    const keep = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED 203.0.113.9:443')
    }) as typeof fetch
    try {
      const { value, logged } = await captureErrors(() => mailer.sendEmail(MAIL))
      assert.deepEqual(value, { sent: false, reason: 'failed' })
      assert.equal(logged.includes('re_test_key'), false)
      assert.equal(logged.includes('buyer@example.test'), false)
    } finally {
      globalThis.fetch = keep
      down.restore()
    }
  })

  test('a hung request is given up after a few seconds (the abort signal is passed)', async () => {
    const mail = useFakeMail()
    const keep = globalThis.fetch
    let signal: AbortSignal | undefined
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    try {
      await mailer.sendEmail(MAIL)
      assert.ok(signal, 'a timeout is attached')
    } finally {
      globalThis.fetch = keep
      mail.restore()
    }
  })

  test('a subject cannot carry a line break (no header injection)', async () => {
    const mail = useFakeMail()
    try {
      await mailer.sendEmail({ ...MAIL, subject: 'Hello\r\nBcc: attacker@example.test' })
      assert.equal(mail.sent[0]!.body.subject, 'Hello Bcc: attacker@example.test')
      assert.equal(/[\r\n]/.test(mail.sent[0]!.body.subject), false)
    } finally {
      mail.restore()
    }
  })

  test('locally with no key the email is kept in the dev outbox, the last 50 only', async () => {
    assert.equal(mailer.outboxEnabled(), true)
    for (let i = 0; i < 55; i++) await mailer.sendEmail({ ...MAIL, subject: `Mail ${i}` })
    const box = mailer.devOutbox()
    assert.equal(box.length, 50)
    assert.equal(box[0]!.subject, 'Mail 5')
    assert.equal(box.at(-1)!.subject, 'Mail 54')
    assert.ok(box[0]!.at)
    assert.deepEqual(await mailer.sendEmail(MAIL), { sent: false, reason: 'not_configured' })
  })

  test('on Vercel there is no outbox: nothing is kept anywhere', async () => {
    process.env.VERCEL = '1'
    try {
      assert.deepEqual(await mailer.sendEmail(MAIL), { sent: false, reason: 'not_configured' })
      assert.deepEqual(mailer.devOutbox(), [])
    } finally {
      delete process.env.VERCEL
    }
    assert.deepEqual(mailer.devOutbox(), [], 'and nothing was kept behind either')
  })
})

describe('the template', () => {
  test('every value is escaped in the HTML and appears untouched in the text', () => {
    const nasty = `<script>alert("x")</script> & 'q'`
    const { html, text } = mailer.renderEmail({
      heading: nasty,
      paragraphs: [nasty],
      details: [[nasty, nasty]],
      button: { label: nasty, url: `https://shop.example.test/a?x="><script>` },
      note: nasty,
    })
    assert.equal(/<script/i.test(html), false)
    assert.equal(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;q&#39;'), true)
    assert.equal(html.includes('href="https://shop.example.test/a?x=&quot;&gt;&lt;script&gt;"'), true)
    assert.ok(text.includes(nasty))
    assert.ok(html.includes('Spartan Tyres'))
    assert.ok(text.includes('Spartan Tyres Pty Ltd'))
    assert.match(html, /^<!doctype html>/)
  })

  test('escapeHtml handles every special character and odd values', () => {
    assert.equal(mailer.escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;')
    assert.equal(mailer.escapeHtml(null), '')
    assert.equal(mailer.escapeHtml(undefined), '')
    assert.equal(mailer.escapeHtml(5), '5')
  })

  test('the account emails: invite, application and decision escape what a customer typed', () => {
    const name = `Bob <img src=x onerror=alert(1)>`
    const link = setPasswordLink('https://shop.example.test', 'abc-DEF_123')
    assert.equal(link, 'https://shop.example.test/account/set-password?token=abc-DEF_123')
    const invite = inviteEmail({ email: 'b@example.test', name, level: 'bulk' }, link)
    assert.equal(/<img/i.test(invite.html), false)
    assert.equal(invite.to, 'b@example.test')
    assert.equal(invite.subject.includes('<'), false)
    assert.ok(invite.text.includes(link))
    const application = newApplicationEmail(
      { id: 'ca_x', email: 'b@example.test', name, company: '<b>Co</b>', phone: '', abn: '', address: '', requestedLevel: 'bulk' } as never,
      'https://shop.example.test/admin/accounts',
    )
    assert.equal(/<b>Co/.test(application.html), false)
    assert.equal(application.subject.includes('<'), false, 'names never go into a subject')
    const declined = levelDecisionEmail({ email: 'b@example.test', name, level: 'customer' }, false, 'wholesaler', 'https://shop.example.test/account')
    assert.equal(/<img/i.test(declined.html), false)
  })
})

describe('the shared database', () => {
  test('the AI and accounts share one connection; each schema is created once and the tables exist side by side', async () => {
    const { getAiDb } = await import('../api/_lib/ai/db.js')
    const ai = await getAiDb()
    const acc = await dbm.getDb(ACCOUNTS_SCHEMA)
    const tables = (await acc.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`)).map((r) => r.table_name)
    for (const t of ['ai_calls', 'ai_conversations', 'ai_messages', 'ai_rate', 'ai_settings', 'ai_usage', 'customer_accounts', 'customer_prices', 'customer_tokens']) {
      assert.ok(tables.includes(t), t)
    }
    await ai.query(`INSERT INTO ai_rate (key, count, reset_at) VALUES ('shared', 1, now() + interval '1 minute')`)
    assert.equal((await acc.query(`SELECT 1 FROM ai_rate WHERE key = 'shared'`)).length, 1, 'one database')
  })

  test('schemas can be requested many times at once without trouble', async () => {
    await dbm.closeDb()
    await Promise.all(Array.from({ length: 8 }, () => dbm.getDb(ACCOUNTS_SCHEMA)))
    const { getAiDb } = await import('../api/_lib/ai/db.js')
    await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? getAiDb() : dbm.getDb(ACCOUNTS_SCHEMA))))
    assert.equal(await rateLimited('shared:burst', 100, 60), false)
  })

  test('the account tables refuse bad data themselves (levels, ranges, one email once)', async () => {
    const db = await dbm.getDb(ACCOUNTS_SCHEMA)
    const insert = (over: Record<string, string>) => {
      const cols = { id: `'ca_${Math.random().toString(36).slice(2, 22).padEnd(20, 'a')}'`, email: `'${Math.random()}@x.test'`, ...over }
      return db.query(`INSERT INTO customer_accounts (${Object.keys(cols).join(',')}) VALUES (${Object.values(cols).join(',')})`)
    }
    await insert({})
    await assert.rejects(insert({ level: `'platinum'` }))
    await assert.rejects(insert({ status: `'deleted'` }))
    await assert.rejects(insert({ requested_level: `'customer'` }))
    await assert.rejects(insert({ discount_pct: '60.01' }))
    await assert.rejects(insert({ discount_pct: '-1' }))
    await assert.rejects(insert({ terms_days: '121' }))
    await assert.rejects(insert({ credit_limit: '-5' }))
    await insert({ email: `'Same@X.test'` })
    await assert.rejects(insert({ email: `'same@x.TEST'` }), Error, 'one account per email, whatever the letter case')
  })

  test('rate limiting and visitor hashing live in one shared module, and spend.ts re-exports them for the AI', async () => {
    const spend = await import('../api/_lib/ai/spend.js')
    assert.equal(spend.hashIp, hashIp)
    assert.equal(spend.hashIp('203.0.113.7'), hashIp('203.0.113.7'))
    assert.equal(await spend.rateLimited('shared:one', 1, 60), false)
    assert.equal(await rateLimited('shared:one', 1, 60), true, 'the same counter from either door')
  })
})
