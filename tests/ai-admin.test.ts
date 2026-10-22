/**
 * The AI in the admin panel (api/admin/[action].ts: ai-status, ai-settings, ai-conversations,
 * ai-conversation), against an in-memory database: no network, no real model, nothing spent.
 *   npx tsx --test tests/ai-admin.test.ts
 */
import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'

Object.assign(process.env, {
  AI_DB_MEMORY: '1',
  ADMIN_PASSWORD: 'test-admin-password',
  ADMIN_SESSION_SECRET: 'test-secret-test-secret-test-secret',
  AI_DISABLED: '',
  AI_DAILY_LIMIT_USD: '',
  AI_MONTHLY_LIMIT_USD: '',
  AI_FALLBACK_MODEL: '',
  AI_API_URL: '',
  OPENAI_API_KEY: '',
  OPENAI_CHAT_MODEL: '',
  VOICE_MAX_SECONDS: '',
})
for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'VERCEL']) delete process.env[name]

const { closeAiDb, getAiDb } = await import('../api/_lib/ai/db.js')
const { issueToken } = await import('../api/_lib/auth.js')
const { hashIp, reserve, settle } = await import('../api/_lib/ai/spend.js')
const { default: adminRoute } = await import('../api/admin/[action].js')
const { newConversationId, newCardId } = await import('../src/lib/ai/protocol.js')

type Json = Record<string, any>

const run = (name: string, fn: () => void | Promise<void>) => test(name, { timeout: 30_000 }, fn)

class FakeRes {
  code = 200
  headers: Record<string, string> = {}
  body: unknown = undefined
  status(code: number) {
    this.code = code
    return this
  }
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v
  }
  json(b: unknown) {
    this.body = b
  }
  end() {}
}

const TOKEN = issueToken()!.token

/** Everything the admin API ever answered, to prove no address or hash leaves it. */
const answered: string[] = []

async function call(action: string, o: { method?: string; query?: Record<string, string>; body?: unknown; token?: string | null } = {}) {
  const res = new FakeRes()
  const headers: Record<string, string> = {}
  const token = o.token === undefined ? TOKEN : o.token
  if (token) headers.authorization = `Bearer ${token}`
  await adminRoute({ method: o.method ?? 'GET', query: { action, ...(o.query ?? {}) }, body: o.body, headers }, res as never)
  answered.push(JSON.stringify(res.body))
  return { status: res.code, json: (res.body ?? {}) as Json, headers: res.headers }
}

const sql = async (text: string, params: unknown[] = []) => (await getAiDb()).query<Json>(text, params)

const IP_HASH = hashIp('203.0.113.77')

/** A chat with the given messages, made `minutesAgo` minutes ago. */
async function chat(o: { id?: string; minutesAgo?: number; orderRef?: string; messages: { role: 'user' | 'assistant' | 'note'; content: string; meta?: Record<string, unknown> }[] }) {
  const id = o.id ?? newConversationId()
  const at = new Date(Date.now() - (o.minutesAgo ?? 1) * 60_000).toISOString()
  await sql(`INSERT INTO ai_conversations (id, ip_hash, started_at, last_at, turns, order_ref) VALUES ($1::text, $2::text, $3::timestamptz, $3::timestamptz, 1, $4)`, [
    id,
    IP_HASH,
    at,
    o.orderRef ?? null,
  ])
  for (const m of o.messages) {
    await sql(`INSERT INTO ai_messages (conversation_id, role, content, meta, created_at) VALUES ($1::text, $2::text, $3::text, $4::jsonb, $5::timestamptz)`, [
      id,
      m.role,
      m.content,
      JSON.stringify(m.meta ?? {}),
      at,
    ])
  }
  return id
}

const cartCard = (id = newCardId()) => ({
  id,
  kind: 'cart',
  productId: 'p1',
  name: 'Lionshead LA301E',
  size: '11R22.5',
  positionLabel: 'Drive',
  quantity: 4,
  unitPrice: 500,
  lineTotal: 2000,
  volumeDiscount: 0,
  volumeLabel: null,
  fitting: false,
  fittingTotal: 0,
  total: 2000,
  preOrder: false,
  stock: 10,
  checkout: false,
  notes: [],
})

const handoverCard = (id = newCardId()) => ({
  id,
  kind: 'handover',
  reason: 'Wants to speak to someone about fleet pricing',
  message: 'Please call me back',
  name: 'Private Name',
  email: 'private.person@example.com',
  phone: '0400 000 000',
})

beforeEach(async () => {
  await closeAiDb()
  answered.length = 0
  delete process.env.AI_DISABLED
  process.env.AI_DAILY_LIMIT_USD = ''
  process.env.AI_MONTHLY_LIMIT_USD = ''
  process.env.AI_API_URL = ''
  process.env.OPENAI_API_KEY = ''
  process.env.OPENAI_CHAT_MODEL = ''
  process.env.OPENAI_API_KEY = ''
})

after(async () => {
  await closeAiDb()
})

const ACTIONS: [string, string][] = [
  ['ai-status', 'GET'],
  ['ai-settings', 'GET'],
  ['ai-settings', 'PATCH'],
  ['ai-conversations', 'GET'],
  ['ai-conversation', 'GET'],
]

/* ----------------------------------------------------------------- auth */

run('every AI admin route needs the admin token', async () => {
  for (const [action, method] of ACTIONS) {
    const none = await call(action, { method, token: null })
    assert.equal(none.status, 401, `${action} ${method} without a token`)
    const bad = await call(action, { method, token: 'not.a-token' })
    assert.equal(bad.status, 401, `${action} ${method} with a bad token`)
  }
  assert.equal((await call('ai-status')).status, 200)
})

run('without ADMIN_PASSWORD the AI admin routes answer 503, never open', async () => {
  const saved = process.env.ADMIN_PASSWORD
  process.env.ADMIN_PASSWORD = ''
  try {
    for (const [action, method] of ACTIONS) assert.equal((await call(action, { method })).status, 503, action)
  } finally {
    process.env.ADMIN_PASSWORD = saved
  }
})

run('wrong methods are refused', async () => {
  assert.equal((await call('ai-status', { method: 'POST' })).status, 405)
  assert.equal((await call('ai-conversations', { method: 'DELETE' })).status, 405)
  assert.equal((await call('ai-conversation', { method: 'PATCH' })).status, 405)
})

/* ---------------------------------------------------------------- status */

run('status says the chat is not set up when there is no gateway, and the database is connected', async () => {
  const { status, json } = await call('ai-status')
  assert.equal(status, 200)
  assert.equal(json.chat.mode, 'not_configured')
  assert.equal(json.voice.mode, 'not_configured')
  assert.equal(json.database.connected, true)
  assert.equal(json.settings.enabled, true)
  assert.equal(json.limits.dailyUsd, 5)
  assert.equal(json.limits.monthlyUsd, 60)
  assert.equal(json.spend.todayUsd, 0)
  assert.equal(json.voice.callSeconds, 600)
  assert.deepEqual(json.warnings, [])
})

run('status knows the practice AI from a real model, and never returns the key or the gateway address', async () => {
  Object.assign(process.env, { AI_API_URL: 'http://localhost:3410', OPENAI_API_KEY: 'practice', OPENAI_CHAT_MODEL: 'practice/assistant' })
  const practice = (await call('ai-status')).json
  assert.equal(practice.chat.mode, 'practice')
  assert.equal(practice.chat.model, null)
  assert.equal(practice.voice.mode, 'practice')

  Object.assign(process.env, { AI_API_URL: 'https://gateway.example.test', OPENAI_CHAT_MODEL: 'gpt-4.1-mini', OPENAI_API_KEY: 'sk-secret-openai-key' })
  const real = await call('ai-status')
  assert.equal(real.json.chat.mode, 'real')
  assert.equal(real.json.chat.model, 'gpt-4.1-mini')
  assert.equal(real.json.voice.mode, 'real')
  assert.equal(real.json.voice.model, 'gpt-realtime-2.1-mini')
  const text = JSON.stringify(real.json)
  for (const secret of ['sk-secret-openai-key', 'gateway.example.test']) assert.ok(!text.includes(secret), `leaked ${secret}`)
})

run('status shows what was spent (Sydney day) against the limits in force, and warns when the environment caps them lower', async () => {
  Object.assign(process.env, { AI_API_URL: 'http://localhost:3410', OPENAI_API_KEY: 'practice', OPENAI_CHAT_MODEL: 'practice/assistant' })
  const booked = await reserve('chat', 'm', 1_500_000, '')
  assert.equal(booked.ok, true)
  if (booked.ok) await settle(booked.id, null, 'billed')

  process.env.AI_DAILY_LIMIT_USD = '2'
  const { json } = await call('ai-status')
  assert.equal(json.spend.todayUsd, 1.5)
  assert.equal(json.spend.monthUsd, 1.5)
  assert.equal(json.limits.dailyUsd, 2)
  assert.equal(json.limits.savedDailyUsd, 5)
  assert.equal(json.limits.dailyCapUsd, 2)
  assert.equal(json.limits.monthlyCapUsd, null)
  assert.equal(json.warnings.length, 1)
  assert.match(json.warnings[0], /AI_DAILY_LIMIT_USD/)
})

run('status warns when voice is on but the daily limit is below what a call needs, and says what it needs', async () => {
  Object.assign(process.env, { OPENAI_API_KEY: 'sk-secret-openai-key' })
  const { saveAiSettings } = await import('../api/_lib/ai/settings.js')
  const enough = (await call('ai-status')).json
  assert.equal(enough.voice.mode, 'real')
  // A real call sets US$0.39 aside and one visitor may use a fifth of the day: the least that works is US$1.94.
  assert.equal(enough.voice.minDailyUsd, 1.94)
  assert.deepEqual(enough.warnings, [])

  await saveAiSettings({ dailyLimitUsd: 1 })
  const low = (await call('ai-status')).json
  assert.equal(low.voice.mode, 'real')
  assert.equal(low.warnings.length, 1)
  assert.match(low.warnings[0], /Voice calls are switched on but cannot start/)
  assert.match(low.warnings[0], /US\$1\.00/)
  assert.match(low.warnings[0], /US\$1\.94/)
  assert.equal(low.warnings[0].includes('AI_DAILY_LIMIT_USD'), false, 'no cap involved')

  // A cap on the server below the need is named too, and the lower figure in force is the one compared.
  await saveAiSettings({ dailyLimitUsd: 50 })
  process.env.AI_DAILY_LIMIT_USD = '1.5'
  const capped = (await call('ai-status')).json
  assert.equal(capped.warnings.filter((w: string) => /cannot start/.test(w)).length, 1)
  assert.ok(capped.warnings.some((w: string) => /AI_DAILY_LIMIT_USD\) and the AI_DAILY_LIMIT_USD|and the AI_DAILY_LIMIT_USD cap/.test(w)))
  process.env.AI_DAILY_LIMIT_USD = ''

  // Voice switched off: nothing to warn about (it says it is off). Practice calls cost nothing: no warning either.
  await saveAiSettings({ dailyLimitUsd: 1, voiceEnabled: false })
  assert.deepEqual((await call('ai-status')).json.warnings, [])
  await saveAiSettings({ voiceEnabled: true })
  process.env.OPENAI_API_KEY = 'practice'
  const practice = (await call('ai-status')).json
  assert.equal(practice.voice.mode, 'practice')
  assert.equal(practice.voice.minDailyUsd, null)
  assert.deepEqual(practice.warnings, [])
})

run('status reports the call length calls really get, next to the one that is set', async () => {
  Object.assign(process.env, { OPENAI_API_KEY: 'sk-secret-openai-key', VOICE_MAX_SECONDS: '300' })
  try {
    const { json } = await call('ai-status')
    // On a computer there is no function time limit: as set.
    assert.equal(json.voice.callSeconds, 300)
    assert.equal(json.voice.configuredSeconds, 300)
  } finally {
    process.env.VOICE_MAX_SECONDS = ''
  }
})

run('status says why the AI is off: AI_DISABLED, or the switch', async () => {
  Object.assign(process.env, { AI_API_URL: 'http://localhost:3410', OPENAI_API_KEY: 'practice', OPENAI_CHAT_MODEL: 'practice/assistant' })
  await call('ai-settings', { method: 'PATCH', body: { enabled: false } })
  let json = (await call('ai-status')).json
  assert.equal(json.chat.mode, 'off')
  assert.match(json.chat.reason, /switched off here/)
  assert.equal(json.voice.mode, 'off')

  await call('ai-settings', { method: 'PATCH', body: { enabled: true, voiceEnabled: false } })
  json = (await call('ai-status')).json
  assert.equal(json.chat.mode, 'practice')
  assert.equal(json.voice.mode, 'off')
  assert.match(json.voice.reason, /Voice calls are switched off/)

  process.env.AI_DISABLED = '1'
  json = (await call('ai-status')).json
  assert.equal(json.chat.mode, 'off')
  assert.match(json.chat.reason, /AI_DISABLED/)
  assert.equal(json.disabledByEnv, true)
  assert.ok(json.warnings.some((w: string) => /AI_DISABLED/.test(w)))
  // What was saved is still shown as saved.
  assert.equal(json.settings.enabled, true)
})

/* -------------------------------------------------------------- settings */

run('settings read and change, validated as the AI itself validates them', async () => {
  const first = await call('ai-settings')
  assert.deepEqual(first.json.settings, { enabled: true, voiceEnabled: true, dailyLimitUsd: 5, monthlyLimitUsd: 60 })
  assert.equal(first.json.disabledByEnv, false)

  const saved = await call('ai-settings', { method: 'PATCH', body: { voiceEnabled: false, dailyLimitUsd: 7.456 } })
  assert.equal(saved.status, 200)
  assert.deepEqual(saved.json.settings, { enabled: true, voiceEnabled: false, dailyLimitUsd: 7.46, monthlyLimitUsd: 60 })
  assert.deepEqual((await call('ai-settings')).json.settings, saved.json.settings)

  for (const body of [{}, { nothing: 1 }, null, [], 'text']) {
    assert.equal((await call('ai-settings', { method: 'PATCH', body })).status, 400, JSON.stringify(body))
  }
  for (const body of [{ enabled: 'yes' }, { voiceEnabled: 1 }, { dailyLimitUsd: -1 }, { monthlyLimitUsd: 1001 }, { dailyLimitUsd: '5' }, { dailyLimitUsd: null }]) {
    const res = await call('ai-settings', { method: 'PATCH', body })
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal(typeof res.json.error, 'string')
  }
  // Nothing from the refused requests was kept (one bad field refuses the whole request).
  assert.equal((await call('ai-settings', { method: 'PATCH', body: { enabled: false, dailyLimitUsd: -1 } })).status, 400)
  assert.deepEqual((await call('ai-settings')).json.settings, saved.json.settings)
})

/* --------------------------------------------------------- conversations */

run('conversations: newest first with counts, cards, order and a preview', async () => {
  const cart = cartCard()
  const person = handoverCard()
  const older = await chat({
    minutesAgo: 30,
    messages: [
      { role: 'user', content: 'Do you have 11R22.5 drive tyres?' },
      { role: 'assistant', content: 'Yes, here is one.', meta: { notes: ['Searched tyres for 11R22.5'], cards: [cart] } },
      { role: 'note', content: 'The customer tapped Add to cart', meta: { cardId: cart.id, outcome: 'added', kind: 'cart' } },
    ],
    orderRef: 'ST-TEST-0001',
  })
  const newer = await chat({
    minutesAgo: 2,
    messages: [
      { role: 'user', content: 'Can someone call me?' },
      { role: 'assistant', content: 'I have prepared a message for the team.', meta: { cards: [person] } },
    ],
  })

  const { status, json } = await call('ai-conversations')
  assert.equal(status, 200)
  assert.equal(json.total, 2)
  assert.equal(json.next, null)
  assert.deepEqual(json.conversations.map((c: Json) => c.id), [newer, older])

  const [a, b] = json.conversations
  assert.equal(a.messages, 2)
  assert.equal(a.askedForPerson, true)
  assert.equal(a.cardsShown, 1)
  assert.equal(a.cardsAdded, 0)
  assert.equal(a.hasCall, false)
  assert.equal(a.hasChat, true)
  assert.equal(a.orderRef, null)
  assert.equal(a.preview, 'I have prepared a message for the team.')
  assert.equal(b.askedForPerson, false)
  assert.equal(b.cardsShown, 1)
  assert.equal(b.cardsAdded, 1)
  assert.equal(b.orderRef, 'ST-TEST-0001')
  assert.equal(b.messages, 2)
})

run('conversations: the chat, call and person filters', async () => {
  const typed = await chat({ minutesAgo: 5, messages: [{ role: 'user', content: 'hello there' }, { role: 'assistant', content: 'hi' }] })
  const asked = await chat({ minutesAgo: 4, messages: [{ role: 'user', content: 'a person please' }, { role: 'assistant', content: 'sure', meta: { cards: [handoverCard()] } }] })
  const called = await chat({ minutesAgo: 3, messages: [{ role: 'user', content: 'on the phone', meta: { voice: true } }, { role: 'assistant', content: 'yes', meta: { voice: true } }] })
  await sql(`INSERT INTO ai_calls (id, conversation_id, practice, status, ends_at, ended_at, end_reason, seconds, lines) VALUES ($1::text, $2::text, true, 'ended', now(), now(), 'user', 31, 2)`, [`v${'a'.repeat(32)}`, called])
  const both = await chat({ minutesAgo: 1, messages: [{ role: 'user', content: 'typed first' }, { role: 'assistant', content: 'spoken', meta: { voice: true } }] })
  await sql(`INSERT INTO ai_calls (id, conversation_id, practice, status, ends_at, ended_at, end_reason, seconds, lines) VALUES ($1::text, $2::text, true, 'ended', now(), now(), 'time', 600, 1)`, [`v${'b'.repeat(32)}`, both])

  const ids = async (filter: string) => (await call('ai-conversations', { query: { filter } })).json.conversations.map((c: Json) => c.id)
  assert.deepEqual(await ids('all'), [both, called, asked, typed])
  assert.deepEqual(await ids('chat'), [both, asked, typed])
  assert.deepEqual(await ids('call'), [both, called])
  assert.deepEqual(await ids('person'), [asked])

  const rows = (await call('ai-conversations', { query: { filter: 'call' } })).json.conversations as Json[]
  assert.equal(rows.find((r) => r.id === called)?.hasChat, false)

  const bad = await call('ai-conversations', { query: { filter: 'everything' } })
  assert.equal(bad.status, 400)
})

run('conversations: search finds what was said, and treats % and _ as plain characters', async () => {
  const a = await chat({ messages: [{ role: 'user', content: 'Is there a 50% deal on steer tyres?' }, { role: 'assistant', content: 'Our sales team can help.' }] })
  await chat({ messages: [{ role: 'user', content: 'What about 500 tyres?' }] })
  const c = await chat({ messages: [{ role: 'user', content: 'under_score here' }] })
  // A note is not "what was said".
  await chat({ messages: [{ role: 'note', content: 'secret-note-text', meta: {} }] })

  const find = async (q: string) => (await call('ai-conversations', { query: { q } })).json
  assert.deepEqual((await find('50%')).conversations.map((x: Json) => x.id), [a])
  assert.deepEqual((await find('STEER')).conversations.map((x: Json) => x.id), [a])
  assert.deepEqual((await find('under_score')).conversations.map((x: Json) => x.id), [c])
  assert.equal((await find('under_sc_re')).total, 0)
  assert.equal((await find('secret-note-text')).total, 0)
  assert.equal((await find("'; DROP TABLE ai_messages; --")).total, 0)
  assert.equal((await call('ai-conversations')).json.total, 4)
})

run('conversations: 25 to a page, the cursor walks every one once, a bad cursor is ignored', async () => {
  const made: string[] = []
  for (let i = 0; i < 30; i += 1) made.push(await chat({ minutesAgo: 100 - i, messages: [{ role: 'user', content: `message ${i}` }] }))
  made.reverse() // newest first

  const first = (await call('ai-conversations')).json
  assert.equal(first.conversations.length, 25)
  assert.equal(first.total, 30)
  assert.equal(typeof first.next, 'string')
  const second = (await call('ai-conversations', { query: { cursor: first.next } })).json
  assert.equal(second.conversations.length, 5)
  assert.equal(second.next, null)
  assert.deepEqual([...first.conversations, ...second.conversations].map((c: Json) => c.id), made)

  // Same-second chats are still walked without a gap or a repeat.
  const bad = (await call('ai-conversations', { query: { cursor: "1'; DROP TABLE x;--" } })).json
  assert.equal(bad.conversations.length, 25)
  assert.deepEqual(bad.conversations.map((c: Json) => c.id), first.conversations.map((c: Json) => c.id))
})

run('conversations: paging with a filter and a search stays inside them', async () => {
  for (let i = 0; i < 27; i += 1) await chat({ minutesAgo: 200 - i, messages: [{ role: 'user', content: `tyre question ${i}` }, { role: 'assistant', content: 'ok', meta: i % 2 ? { cards: [handoverCard()] } : {} }] })
  for (let i = 0; i < 3; i += 1) await chat({ minutesAgo: 10 - i, messages: [{ role: 'user', content: 'unrelated' }] })

  const seen: string[] = []
  let cursor: string | undefined
  do {
    const page: Json = (await call('ai-conversations', { query: { filter: 'person', q: 'tyre question', ...(cursor ? { cursor } : {}) } })).json
    assert.ok(page.conversations.length <= 25)
    for (const c of page.conversations) {
      assert.equal(c.askedForPerson, true)
      seen.push(c.id)
    }
    cursor = page.next ?? undefined
  } while (cursor)
  assert.equal(seen.length, 13)
  assert.equal(new Set(seen).size, 13)
})

/* ---------------------------------------------------------------- detail */

run('a conversation in full: words, what it did, card outcomes, calls and the order', async () => {
  const added = cartCard()
  const sent = handoverCard()
  const never = cartCard()
  const id = await chat({
    orderRef: 'ST-TEST-0002',
    messages: [
      { role: 'user', content: 'I need four drive tyres' },
      { role: 'assistant', content: 'Here is the card.', meta: { notes: ['Searched tyres for 11R22.5', 'Showed an Add to cart card'], cards: [added, sent, never], go: [{ to: '/shop', note: 'Opened the shop' }], buttons: true } },
      { role: 'note', content: 'The customer tapped Add to cart', meta: { cardId: added.id, outcome: 'added', kind: 'cart' } },
      { role: 'note', content: 'The customer sent the message for the sales team', meta: { cardId: sent.id, outcome: 'sent', kind: 'handover' } },
      { role: 'user', content: 'and on the call I said hello', meta: { voice: true } },
      { role: 'assistant', content: 'Hello!', meta: { voice: true, emergency: true } },
      { role: 'assistant', content: '', meta: { fallback: 'daily' } },
    ],
  })
  await sql(`INSERT INTO ai_calls (id, conversation_id, practice, status, started_at, ends_at, ended_at, end_reason, seconds, lines)
             VALUES ($1::text, $2::text, true, 'ended', now() - interval '1 minute', now(), now(), 'user', 48, 2)`, [`v${'c'.repeat(32)}`, id])

  const { status, json } = await call('ai-conversation', { query: { id } })
  assert.equal(status, 200)
  const c = json.conversation
  assert.equal(c.id, id)
  assert.equal(c.orderRef, 'ST-TEST-0002')
  assert.equal(c.askedForPerson, true)
  assert.equal(c.truncated, false)

  const calls = c.entries.filter((e: Json) => e.kind === 'call')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].seconds, 48)
  assert.equal(calls[0].endReason, 'user')
  assert.equal(calls[0].practice, true)
  assert.equal(calls[0].lines, 2)
  assert.notEqual(calls[0].endedAt, null)
  assert.equal(c.entries.filter((e: Json) => e.kind === 'event').length, 0, 'card outcomes show on their cards')

  const messages = c.entries.filter((e: Json) => e.kind === 'message')
  assert.deepEqual(messages.map((m: Json) => [m.role, m.onCall]), [
    ['customer', false],
    ['assistant', false],
    ['customer', true],
    ['assistant', true],
    ['assistant', false],
  ])
  const answer = messages[1]
  assert.deepEqual(answer.did, ['Searched tyres for 11R22.5', 'Showed an Add to cart card'])
  assert.deepEqual(answer.pages, [{ to: '/shop', note: 'Opened the shop' }])
  assert.equal(answer.buttons, true)
  assert.deepEqual(answer.cards.map((k: Json) => [k.kind, k.outcome]), [['cart', 'added'], ['handover', 'sent'], ['cart', 'none']])
  assert.match(answer.cards[0].summary, /Lionshead LA301E 11R22\.5, 4 tyres, \$2000\.00 inc\. GST/)
  assert.equal(messages[3].emergency, true)
  assert.equal(messages[4].fallback, 'daily')

  // Customer contact details on cards stay in the sales inbox.
  const text = JSON.stringify(json)
  for (const secret of ['private.person@example.com', '0400 000 000', 'Private Name']) assert.ok(!text.includes(secret), `leaked ${secret}`)
})

run('a call is placed in time among the messages, and a call with no lines still shows', async () => {
  const id = newConversationId()
  await sql(`INSERT INTO ai_conversations (id, ip_hash, started_at, last_at, turns) VALUES ($1::text, $2::text, now() - interval '10 minutes', now(), 1)`, [id, IP_HASH])
  await sql(`INSERT INTO ai_messages (conversation_id, role, content, created_at) VALUES ($1::text, 'user', 'before', now() - interval '9 minutes'), ($1::text, 'assistant', 'after', now() - interval '1 minute')`, [id])
  await sql(`INSERT INTO ai_calls (id, conversation_id, practice, status, started_at, ends_at, ended_at, end_reason, seconds) VALUES ($1::text, $2::text, false, 'ended', now() - interval '5 minutes', now(), now() - interval '4 minutes', 'lost', 0)`, [`v${'d'.repeat(32)}`, id])
  const entries = (await call('ai-conversation', { query: { id } })).json.conversation.entries as Json[]
  assert.deepEqual(entries.map((e) => (e.kind === 'message' ? e.text : e.kind)), ['before', 'call', 'after'])
  assert.equal(entries[1].endReason, 'lost')
  assert.equal(entries[1].practice, false)
})

run('a conversation that is not there is a 404; a bad id is a 400', async () => {
  assert.equal((await call('ai-conversation', { query: { id: newConversationId() } })).status, 404)
  for (const id of ['', 'x', 'c123', `c${'a'.repeat(60)}`, "c'; DROP TABLE ai_messages; --"]) {
    assert.equal((await call('ai-conversation', { query: { id } })).status, 400, id)
  }
  assert.equal((await call('ai-conversation')).status, 400)
})

/* --------------------------------------------------------------- privacy */

run('no address and no hash of one is ever in an answer', async () => {
  const id = await chat({ messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi', meta: { cards: [cartCard()] } }] })
  await sql(`INSERT INTO ai_calls (id, conversation_id, ip_hash, practice, status, ends_at, ended_at, end_reason) VALUES ($1::text, $2::text, $3::text, true, 'ended', now(), now(), 'user')`, [`v${'e'.repeat(32)}`, id, IP_HASH])
  await call('ai-status')
  await call('ai-settings')
  await call('ai-conversations')
  await call('ai-conversations', { query: { filter: 'call', q: 'hello' } })
  await call('ai-conversation', { query: { id } })

  assert.ok(IP_HASH.length > 10)
  const everything = answered.join('\n')
  assert.ok(!everything.includes(IP_HASH), 'the hash of the address was returned')
  assert.ok(!everything.includes('203.0.113.77'), 'the address was returned')
  assert.ok(!/ip_?hash/i.test(everything), 'an ip_hash field was returned')
  for (const header of ['no-store']) assert.match((await call('ai-conversations')).headers['cache-control'] ?? '', new RegExp(header))
})
