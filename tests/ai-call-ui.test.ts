/**
 * The call screen's logic that needs no browser: the status line, why a call ended, the screens for a
 * call that could not start, the hidden notes the assistant gets about cards, and the captions. The
 * screen itself is checked in a real browser (tyres-e2e/voice-practice.e2e.mjs, voice-real.e2e.mjs).
 *   npx tsx --test tests/ai-call-ui.test.ts
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { site } from '../src/config/site.js'
import { captionLines, cardSummary, endedReason, errorFor, hasSpoken, outcomeNote, statusText, type CallLine } from '../src/lib/ai/callView.js'
import { fetchStatus } from '../src/lib/ai/client.js'
import type { CartCard, HandoverCard, QuoteCard } from '../src/lib/ai/protocol.js'
import { plainDashes, refusalText } from '../src/lib/ai/voice.js'

const EM_DASH = String.fromCharCode(0x2014)

const cart: CartCard = {
  id: 'kabcdef12345678',
  kind: 'cart',
  productId: 'p1',
  name: 'Lionshead LA301E',
  size: '11R22.5',
  positionLabel: 'All Position',
  quantity: 4,
  unitPrice: 220,
  lineTotal: 880,
  volumeDiscount: 26.4,
  volumeLabel: '4+ tyres',
  fitting: false,
  fittingTotal: 0,
  total: 853.6,
  preOrder: false,
  stock: 10,
  checkout: false,
  notes: [],
}
const quote: QuoteCard = { id: 'kquote1234567', kind: 'quote', enquiryType: 'quote', message: 'A quote please' }
const person: HandoverCard = { id: 'kperson1234567', kind: 'handover', reason: 'asked', message: 'Call me' }

const live = { phase: 'live' as const, practice: false, muted: false, tool: false, talk: 'listening' as const }

describe('statusText', () => {
  test('follows what the call is doing, in the order the screen needs', () => {
    assert.equal(statusText({ ...live, phase: 'connecting' }), 'Connecting...')
    assert.equal(statusText(live), 'Listening, just talk')
    assert.equal(statusText(live, true), 'Hearing you...')
    assert.equal(statusText({ ...live, talk: 'thinking' }), 'Thinking...')
    assert.equal(statusText({ ...live, talk: 'speaking' }), 'Speaking')
    assert.equal(statusText({ ...live, tool: true, talk: 'speaking' }), 'Checking...')
    assert.equal(statusText({ ...live, muted: true, tool: true }), 'You are muted')
    assert.equal(statusText({ ...live, practice: true }), 'Your turn: type what you would say')
    assert.equal(statusText({ ...live, phase: 'ended' }), 'Call ended')
  })
  test('no em dash in any status', () => {
    for (const phase of ['starting', 'connecting', 'live', 'ended', 'error'] as const) {
      for (const talk of ['listening', 'speaking', 'thinking'] as const) {
        assert.ok(!statusText({ ...live, phase, talk }).includes(EM_DASH))
      }
    }
  })
})

describe('errors and end reasons', () => {
  test('the three error screens', () => {
    assert.deepEqual(errorFor('mic'), { kind: 'mic', title: 'Microphone blocked' })
    for (const r of ['busy', 'visitor', 'daily', 'monthly', 'off', 'not_configured']) {
      assert.equal(errorFor('refused', r).kind, 'busy')
    }
    assert.equal(errorFor('refused', 'error').kind, 'failed')
    assert.equal(errorFor('error').title, 'Call could not start')
  })
  test('refusal wording offers the phone number and has no em dash', () => {
    for (const r of ['busy', 'daily', 'unavailable', 'error']) {
      const text = refusalText(r, site.phone.display)
      assert.ok(text.includes(site.phone.display) && !text.includes(EM_DASH))
    }
  })
  test('why a call ended', () => {
    assert.match(endedReason('time'), /time limit/)
    assert.match(endedReason('lost'), /dropped/)
    assert.equal(endedReason('page'), '')
    assert.equal(endedReason(null), '')
  })
})

describe('outcomeNote: the hidden "(Call: ...)" text the assistant gets', () => {
  test('a cart card that was added, and added with checkout', () => {
    assert.match(outcomeNote(cart, 'added'), /^the customer tapped Add to cart on the card for 4 x Lionshead LA301E, 11R22\.5\. It is in their cart\.$/)
    assert.match(outcomeNote({ ...cart, checkout: true }, 'added'), /tapped Add and check out.*checkout page/)
  })
  test('sent, dismissed and failed', () => {
    assert.match(outcomeNote(quote, 'sent'), /^the customer tapped Send quote request on the quote request\. It was sent/)
    assert.match(outcomeNote(person, 'dismissed'), /tapped Not now on the message for the sales team card/)
    assert.match(outcomeNote(cart, 'failed', 'boom\nline'), /could not be completed \(boom line\)/)
  })
  test('every note starts the way the practice call and the server rules expect, with no dash', () => {
    for (const card of [cart, quote, person]) {
      for (const o of ['added', 'sent', 'dismissed', 'failed'] as const) {
        const text = outcomeNote(card, o)
        assert.ok(text.startsWith('the customer tapped'))
        assert.ok(!text.includes(EM_DASH))
      }
    }
  })
  test('card summaries for the end screen', () => {
    assert.equal(cardSummary(cart), 'Add to cart card: 4 x Lionshead LA301E, 11R22.5')
    assert.equal(cardSummary(quote), 'Quote request')
  })
})

describe('captions', () => {
  const lines: CallLine[] = [
    { id: 'a', who: 'ai', text: 'Hello' },
    { id: 'b', who: 'you', text: '', live: true },
    { id: 'c', who: 'did', text: 'Opened the shop', to: '/shop' },
    { id: 'd', who: 'ai', text: 'Here you go' },
    { id: 'e', who: 'you', text: '' },
  ]
  test('the last lines that have something to show', () => {
    assert.deepEqual(captionLines(lines, 3).map((l) => l.id), ['b', 'c', 'd'])
    assert.deepEqual(captionLines(lines, 1).map((l) => l.id), ['d'])
  })
  test('hasSpoken needs words from the customer', () => {
    assert.equal(hasSpoken(lines), false)
    assert.equal(hasSpoken([...lines, { id: 'f', who: 'you', text: 'hi' }]), true)
  })
  test('transcript dashes are plain', () => {
    assert.equal(plainDashes(`two ${EM_DASH} three`), 'two, three')
  })
})

describe('fetchStatus keeps the call length and practice flag', () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  test('voiceInfo only when calls are on and the server said how long', async () => {
    const on = await fetchStatus(async () => json({ chat: { available: true }, voice: { available: true, practice: true, seconds: 600 } }))
    assert.deepEqual(on, { chat: true, voice: true, voiceInfo: { seconds: 600, practice: true } })
    const off = await fetchStatus(async () => json({ chat: { available: true }, voice: { available: false, practice: false, seconds: 600 } }))
    assert.deepEqual(off, { chat: true, voice: false })
  })
})
