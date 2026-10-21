/**
 * The chat's browser-side logic that does not need a browser: reading the answer stream, the link
 * and bold renderer (only links to this site), the quick answers (no promo code, no claim the
 * business cannot keep, no em dash), the card forms' checks, and the link between a cart and its
 * chat. The panel itself is checked in a real browser (tyres-e2e/chat.e2e.mjs).
 *   npx tsx --test tests/ai-ui.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { FORBIDDEN_CLAIMS } from '../api/_lib/ai/rules.js'
import { promoTable } from '../api/_lib/promos.js'
import { site } from '../src/config/site.js'
import { allSizes } from '../src/data/products.js'
import { collectAnswer, fetchStatus, postOutcomes, streamChat } from '../src/lib/ai/client.js'
import { enquiryBody, fieldsFromCard, FIELD_MAX, validateEnquiry } from '../src/lib/ai/cardForm.js'
import { EMERGENCY } from '../src/lib/ai/emergency.js'
import { FALLBACK_NOTE, OFFLINE_NOTE, quickAnswer } from '../src/lib/ai/fallback.js'
import { ASSISTANT_STORAGE_KEY, assistantConversationForOrder } from '../src/lib/ai/link.js'
import { isInternalPath, parseMarkup } from '../src/lib/ai/markup.js'
import {
  newCardId,
  newConversationId,
  newTurnId,
  type ChatEvent,
  type HandoverCard,
  type QuoteCard,
} from '../src/lib/ai/protocol.js'

const EM_DASH = String.fromCharCode(0x2014)

/** A response whose body arrives in the given pieces. */
function streamOf(pieces: string[], init: ResponseInit = { status: 200 }, failAfter = false): Response {
  const encoder = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < pieces.length) controller.enqueue(encoder.encode(pieces[i++]))
      else if (failAfter) controller.error(new Error('connection reset'))
      else controller.close()
    },
  })
  return new Response(body, init)
}

const line = (e: ChatEvent) => `${JSON.stringify(e)}\n`

describe('streamChat', () => {
  const base = { conversationId: newConversationId(), message: 'hello', turn: newTurnId() }

  test('reads events that arrive split across pieces, in order', async () => {
    const text = line({ type: 'text', text: 'Hi there' })
    const events: ChatEvent[] = []
    const outcome = await streamChat(
      {
        ...base,
        fetcher: async () =>
          streamOf([text.slice(0, 9), text.slice(9) + line({ type: 'go', to: '/finder', note: 'Opened the Tyre Finder' }), line({ type: 'done' })]),
      },
      (e) => events.push(e),
    )
    assert.equal(outcome, 'answered')
    assert.deepEqual(
      events.map((e) => e.type),
      ['text', 'go', 'done'],
    )
  })

  test('sends the id, the page, the turn and the card outcomes', async () => {
    let seen: { url: string; body: Record<string, unknown>; method?: string } | undefined
    const outcomes = [{ cardId: newCardId(), outcome: 'added' as const }]
    await streamChat(
      {
        ...base,
        page: '/shop',
        outcomes,
        fetcher: async (url, init) => {
          seen = { url, body: JSON.parse(String(init.body)), method: init.method }
          return streamOf([line({ type: 'text', text: 'x' }), line({ type: 'done' })])
        },
      },
      () => undefined,
    )
    assert.equal(seen?.url, '/api/ai/chat')
    assert.equal(seen?.method, 'POST')
    assert.equal(seen?.body.conversationId, base.conversationId)
    assert.equal(seen?.body.turn, base.turn)
    assert.equal(seen?.body.page, '/shop')
    assert.deepEqual(seen?.body.outcomes, outcomes)
  })

  test('a fallback event with no answer means the quick answers', async () => {
    const events: ChatEvent[] = []
    const outcome = await streamChat(
      { ...base, fetcher: async () => streamOf([line({ type: 'fallback', reason: 'daily' })]) },
      (e) => events.push(e),
    )
    assert.equal(outcome, 'fallback')
    assert.equal(events[0]?.type, 'fallback')
  })

  test('202 (already taken) is collected, an error status falls back, an unreachable server is unreached', async () => {
    assert.equal(await streamChat({ ...base, fetcher: async () => new Response('{}', { status: 202 }) }, () => undefined), 'lost')
    assert.equal(await streamChat({ ...base, fetcher: async () => new Response('{}', { status: 500 }) }, () => undefined), 'fallback')
    assert.equal(
      await streamChat({ ...base, fetcher: async () => Promise.reject(new TypeError('Failed to fetch')) }, () => undefined),
      'unreached',
    )
  })

  test('a connection that breaks mid-answer is lost; a page that is not the API is a fallback', async () => {
    const events: ChatEvent[] = []
    const lost = await streamChat(
      { ...base, fetcher: async () => streamOf([line({ type: 'text', text: 'Half an ans' })], { status: 200 }, true) },
      (e) => events.push(e),
    )
    assert.equal(lost, 'lost')
    assert.equal(events.length, 1)
    const html = await streamChat(
      { ...base, fetcher: async () => streamOf(['<!doctype html><html></html>'], { status: 200 }) },
      () => undefined,
    )
    assert.equal(html, 'fallback')
  })

  test('lines that are not events are ignored', async () => {
    const events: ChatEvent[] = []
    await streamChat(
      { ...base, fetcher: async () => streamOf(['not json\n', '{"type":"nope"}\n', line({ type: 'text', text: 'ok' }), line({ type: 'done' })]) },
      (e) => events.push(e),
    )
    assert.deepEqual(
      events.map((e) => e.type),
      ['text', 'done'],
    )
  })
})

describe('collectAnswer, postOutcomes and fetchStatus', () => {
  const ids = { conversationId: newConversationId(), turn: newTurnId() }
  const json = (body: unknown, init: ResponseInit = { status: 200 }) =>
    new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } })

  test('collects a saved answer, and asks for it by chat and message id', async () => {
    let url = ''
    const answer = { text: 'Saved', notes: [], cards: [], buttons: false, go: [] }
    const got = await collectAnswer({
      ...ids,
      waitMs: 0,
      fetcher: async (u) => {
        url = u
        return json({ state: 'done', answer })
      },
    })
    assert.equal(got.state, 'done')
    assert.ok(url.includes(encodeURIComponent(ids.conversationId)) && url.includes(encodeURIComponent(ids.turn)))
  })

  test('unknown only after the server says so twice; offline when it cannot be reached', async () => {
    let calls = 0
    const unknown = await collectAnswer({
      ...ids,
      waitMs: 1000,
      everyMs: 1,
      fetcher: async () => {
        calls++
        return json({ state: 'unknown' })
      },
    })
    assert.equal(unknown.state, 'unknown')
    assert.equal(calls, 2)
    const offline = await collectAnswer({ ...ids, waitMs: 0, fetcher: async () => Promise.reject(new TypeError('offline')) })
    assert.equal(offline.state, 'offline')
  })

  test('postOutcomes reports success and failure plainly', async () => {
    const outcomes = [{ cardId: newCardId(), outcome: 'sent' as const }]
    assert.equal(await postOutcomes(ids.conversationId, outcomes, async () => json({ ok: true })), true)
    assert.equal(await postOutcomes(ids.conversationId, outcomes, async () => json({ error: 'no' }, { status: 429 })), false)
    assert.equal(await postOutcomes(ids.conversationId, outcomes, async () => Promise.reject(new Error('offline'))), false)
    assert.equal(await postOutcomes(ids.conversationId, [], async () => Promise.reject(new Error('never called'))), true)
  })

  test('status: the API says yes, a web page in its place says no, no network is unknown', async () => {
    assert.deepEqual(await fetchStatus(async () => json({ chat: { available: true }, voice: { available: false } })), { chat: true, voice: false })
    assert.deepEqual(await fetchStatus(async () => json({ chat: { available: false }, voice: { available: true } })), { chat: false, voice: true })
    const page = new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
    assert.deepEqual(await fetchStatus(async () => page), { chat: false, voice: false })
    assert.deepEqual(await fetchStatus(async () => Promise.reject(new TypeError('offline'))), { chat: null, voice: false })
  })
})

describe('markup: only bold and links to this site', () => {
  test('bold and a relative link', () => {
    assert.deepEqual(parseMarkup('Try the **Greforce HD02** in the [Tyre Finder](/finder) today.'), [
      { kind: 'text', text: 'Try the ' },
      { kind: 'bold', text: 'Greforce HD02' },
      { kind: 'text', text: ' in the ' },
      { kind: 'link', text: 'Tyre Finder', to: '/finder' },
      { kind: 'text', text: ' today.' },
    ])
  })

  test('a link with a query keeps it', () => {
    const [piece] = parseMarkup('[Drive tyres](/shop?position=drive&size=11R22.5)')
    assert.deepEqual(piece, { kind: 'link', text: 'Drive tyres', to: '/shop?position=drive&size=11R22.5' })
  })

  test('links to other websites are never links', () => {
    for (const bad of [
      'https://evil.example/x',
      'http://evil.example',
      '//evil.example/x',
      'javascript:alert(1)',
      'data:text/html,hi',
      '\\\\evil.example',
      'mailto:a@b.com',
      'evil.example',
    ]) {
      const pieces = parseMarkup(`[Click here](${bad})`)
      assert.ok(!pieces.some((p) => p.kind === 'link'), bad)
      assert.equal(pieces.map((p) => p.text).join(''), 'Click here', bad)
      assert.equal(isInternalPath(bad), false, bad)
    }
    assert.equal(isInternalPath('/shop'), true)
    assert.equal(isInternalPath('/'), true)
  })

  test('a half-written marker in a streaming answer shows no stars; plain text is untouched', () => {
    assert.equal(parseMarkup('The **Gre').map((p) => p.text).join(''), 'The Gre')
    assert.deepEqual(parseMarkup('Just words, no markup.'), [{ kind: 'text', text: 'Just words, no markup.' }])
    assert.deepEqual(parseMarkup(''), [])
  })

  test('html in an answer stays text (the renderer only ever makes bold and links)', () => {
    const pieces = parseMarkup('<img src=x onerror=alert(1)> **ok**')
    assert.deepEqual(
      pieces.map((p) => p.kind),
      ['text', 'bold'],
    )
  })
})

describe('quick answers', () => {
  const QUESTIONS = [
    'Do you have 11R22.5 drive tyres in stock?',
    'Which tyre suits my trailer?',
    'How long is delivery to Brisbane?',
    'Can you fit the tyres when I pick up?',
    'hello',
    'what sizes do you have',
    'tell me about the brands',
    'can I pay with Afterpay or bank transfer',
    'do you have a promo code or a discount',
    'give me the fleet discount code',
    'how much is a tyre',
    'what are your opening hours',
    'warranty and returns',
    'where is my order SPT-1234-5678',
    'do you sell car tyres for my 4wd',
    'can I download an invoice from my account',
    'do you have a best price guarantee',
    'how do I track my delivery',
    'something completely different',
    '',
  ]

  test('every answer is short, has a way to reach the team, and says nothing it should not', () => {
    const codes = [...promoTable().map((p) => p.code), 'FLEET10', 'WELCOME5', 'BULK15', 'STEER5']
    for (const q of QUESTIONS) {
      const a = quickAnswer(q)
      assert.ok(a.text.length > 20 && a.text.length < 700, `${q}: ${a.text.length} characters`)
      assert.ok(a.actions.length > 0, q)
      assert.ok(!a.text.includes(EM_DASH), q)
      assert.ok(!FORBIDDEN_CLAIMS.test(a.text), `${q}: ${a.text}`)
      for (const code of codes) assert.ok(!a.text.toUpperCase().includes(code), `${q} mentions ${code}`)
      assert.ok(!/\bundefined\b|\bNaN\b|\bnull\b|\$NaN/.test(a.text), q)
    }
  })

  test('the price and promo questions send the customer to the sales team, not to a code', () => {
    for (const q of ['do you have a promo code', 'any discount codes?', 'how much is a tyre']) {
      const a = quickAnswer(q).text
      assert.ok(a.includes(site.phone.display), q)
    }
  })

  test('a size the shop ranges is recognised however it is typed; one it does not is not claimed', () => {
    const size = allSizes[0]
    assert.ok(quickAnswer(`do you carry ${size.toLowerCase()}`).text.includes(size))
    assert.ok(quickAnswer('have you got 999/99R99.9 tyres').text.includes('We range these commercial sizes'))
  })

  test('danger gets the fixed safety answer, with no note about why', () => {
    assert.equal(quickAnswer('my tyre just blew out on the highway'), EMERGENCY)
  })

  test('the notes are plain and contain no dash', () => {
    for (const note of [FALLBACK_NOTE, OFFLINE_NOTE]) assert.ok(!note.includes(EM_DASH) && note.length < 80)
  })
})

describe('card forms', () => {
  const quote: QuoteCard = {
    id: newCardId(),
    kind: 'quote',
    enquiryType: 'fleet',
    productId: 'greforce-grd57-11r22-5',
    size: '11R22.5',
    quantity: 24,
    message: 'I need 24 drive tyres for my fleet, please quote.',
    name: 'Sam Fleet',
    email: 'sam@fleet.example',
  }
  const handover: HandoverCard = {
    id: newCardId(),
    kind: 'handover',
    reason: 'asked for a person',
    message: 'Please call me back about an order.',
    name: 'Ana',
    email: 'ana@example.com',
    phone: '0412 345 678',
  }

  test('a complete form has no problems', () => {
    assert.deepEqual(validateEnquiry(fieldsFromCard(quote), { company: true }), {})
    assert.deepEqual(validateEnquiry(fieldsFromCard(handover), { company: false }), {})
  })

  test('each problem is named in plain words', () => {
    const empty = validateEnquiry({ name: ' ', email: 'nope', phone: '12', company: '', message: 'short' }, { company: true })
    assert.deepEqual(Object.keys(empty).sort(), ['email', 'message', 'name', 'phone'])
    assert.equal(empty.name, 'Please tell us your name.')
    assert.match(empty.message ?? '', /10 characters/)
    const long = validateEnquiry(
      {
        name: 'x'.repeat(FIELD_MAX.name + 1),
        email: 'a@b.co',
        phone: '',
        company: 'y'.repeat(FIELD_MAX.company + 1),
        message: 'z'.repeat(4601),
      },
      { company: true },
    )
    assert.deepEqual(Object.keys(long).sort(), ['company', 'message', 'name'])
    // The company is only checked on a quote card.
    assert.equal(validateEnquiry({ ...fieldsFromCard(handover), company: 'y'.repeat(500) }, { company: false }).company, undefined)
  })

  test('the body for /api/contact: a quote keeps its type, a handover is a general enquiry', () => {
    const q = enquiryBody(quote, fieldsFromCard(quote), { product: 'Greforce GRD57 11R22.5' })
    assert.equal(q.enquiryType, 'fleet')
    assert.equal(q.name, 'Sam Fleet')
    assert.ok(q.message.startsWith(quote.message))
    assert.ok(q.message.includes('Tyre: Greforce GRD57 11R22.5') && q.message.includes('Quantity: 24'))
    assert.ok(!('phone' in q) && !('company' in q))
    const h = enquiryBody(handover, { ...fieldsFromCard(handover), phone: ' 0412 345 678 ' })
    assert.equal(h.enquiryType, 'general')
    assert.equal(h.phone, '0412 345 678')
    assert.ok(!('company' in h))
    assert.ok(!h.message.includes(EM_DASH) && h.message.length <= 5000)
    // What the form allows always fits what the server accepts.
    const max = enquiryBody(quote, { ...fieldsFromCard(quote), message: 'm'.repeat(4600) }, { product: 'p'.repeat(100) })
    assert.ok(max.message.length <= FIELD_MAX.message)
  })

  test('the contact types a quote card can carry are all ones /api/contact files by type', () => {
    for (const enquiryType of ['quote', 'fleet', 'wholesale', 'sourcing'] as const) {
      assert.equal(enquiryBody({ ...quote, enquiryType }, fieldsFromCard(quote)).enquiryType, enquiryType)
    }
  })
})

describe('the order link', () => {
  const store = new Map<string, string>()
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

  test('only a chat that filled the cart is linked to the order', () => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: fake, configurable: true })
    try {
      const id = newConversationId()
      assert.equal(assistantConversationForOrder(), undefined)
      fake.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify({ conversationId: id, cartFromChat: false }))
      assert.equal(assistantConversationForOrder(), undefined)
      fake.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify({ conversationId: id, cartFromChat: true }))
      assert.equal(assistantConversationForOrder(), id)
      fake.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify({ conversationId: 'not-an-id', cartFromChat: true }))
      assert.equal(assistantConversationForOrder(), undefined)
      fake.setItem(ASSISTANT_STORAGE_KEY, '{broken')
      assert.equal(assistantConversationForOrder(), undefined)
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original)
      else delete (globalThis as { sessionStorage?: unknown }).sessionStorage
    }
  })
})

describe('the chat files', () => {
  test('no em dash in any file the chat is made of', () => {
    const root = join(import.meta.dirname, '..')
    const files = [
      ...readdirSync(join(root, 'src/components/assistant')).map((f) => join(root, 'src/components/assistant', f)),
      ...readdirSync(join(root, 'src/lib/ai')).map((f) => join(root, 'src/lib/ai', f)),
      join(root, 'src/store/assistant.ts'),
    ]
    assert.ok(files.length >= 10)
    for (const file of files) assert.ok(!readFileSync(file, 'utf8').includes(EM_DASH), file)
  })
})

describe('the quick answer about payment does not promise Afterpay', () => {
  test('card through Square, and the options are shown at checkout', () => {
    for (const q of ['can I pay with afterpay', 'what payment options do you have', 'do you take cards', 'can I pay in instalments']) {
      const a = quickAnswer(q).text
      assert.ok(a.includes('Square'), q)
      assert.ok(/payment options are shown/i.test(a), q)
      assert.equal(/afterpay|\$2,?000|instalment/i.test(a), false, `${q}: ${a}`)
    }
  })
})

describe('one email rule for the card forms and the server', () => {
  const fields = (email: string) => ({ name: 'Ana', email, phone: '', company: '', message: 'A message long enough.' })

  test('a@b..cc and the other shapes the server refuses are refused by the form too', async () => {
    const { asEmail } = await import('../api/_lib/http.js')
    const refused = ['a@b..cc', 'a@.b.co', 'a@b.', 'a@b', 'a b@c.co', '@b.co', 'a@@b.co', 'a@b.c.', `${'x'.repeat(250)}@b.co`]
    for (const email of refused) {
      assert.equal(asEmail(email), null, `server: ${email}`)
      assert.ok(validateEnquiry(fields(email), { company: false }).email, `form: ${email}`)
    }
  })

  test('addresses the server accepts are accepted by the form, and the other way round', async () => {
    const { asEmail } = await import('../api/_lib/http.js')
    for (const email of ['ana@example.com', 'a.b+c@sub.example.com.au', 'x@y.co', 'a@b.c']) {
      assert.equal(asEmail(email), email, `server: ${email}`)
      assert.equal(validateEnquiry(fields(email), { company: false }).email, undefined, `form: ${email}`)
    }
  })
})
