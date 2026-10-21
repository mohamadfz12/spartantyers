/**
 * The chat's store (src/store/assistant.ts) without a browser: a collected answer never puts a card
 * the customer already used back to waiting, the typed fields of the quote and message cards are
 * kept by card id, and "Add and check out" closes the panel on every screen. The panel itself is
 * checked in a real browser (tyres-e2e/chat.e2e.mjs).
 *   npx tsx --test tests/ai-store.test.ts
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { addCardToCart, clearDraft, keepDraft, resumeWaiting, savedCard, useAssistant, type CardView } from '../src/store/assistant.js'
import { useCart } from '../src/store/cart.js'
import { newCardId, newTurnId, type CartCard } from '../src/lib/ai/protocol.js'

const cartCard = (over: Partial<CartCard> = {}): CartCard => ({
  id: newCardId(),
  kind: 'cart',
  productId: 'lionshead-la301e-11r22-5',
  name: 'Lionshead LA301E',
  size: '11R22.5',
  positionLabel: 'All Position',
  quantity: 2,
  unitPrice: 220,
  lineTotal: 440,
  volumeDiscount: 0,
  volumeLabel: '',
  fitting: false,
  fittingTotal: 0,
  total: 440,
  preOrder: false,
  stock: 10,
  checkout: false,
  notes: [],
  ...over,
})

const fields = (message: string) => ({ name: 'Sam', email: 'sam@example.com', phone: '', company: '', message })

beforeEach(() => {
  useAssistant.getState().reset()
  useCart.setState({ lines: [] })
})

describe('savedCard: a collected answer and a card the customer already used', () => {
  const card = cartCard()

  test('a card not shown yet starts waiting for the customer', () => {
    assert.deepEqual(savedCard(undefined, card), { card, state: 'pending' })
  })

  test('the same card keeps what the customer did with it, whatever it was', () => {
    for (const state of ['working', 'done', 'failed', 'dismissed'] as const) {
      const shown: CardView = { card, state, ...(state === 'failed' ? { message: 'Could not add' } : {}) }
      assert.equal(savedCard(shown, card), shown, state)
    }
  })

  test('a different card is a new one: it waits', () => {
    const other = cartCard()
    const shown: CardView = { card, state: 'done' }
    assert.deepEqual(savedCard(shown, other), { card: other, state: 'pending' })
  })
})

describe('an answer collected from the server (a reloaded or returning page)', () => {
  const realFetch = globalThis.fetch
  const answerWith = (card: CartCard) =>
    (async () =>
      new Response(JSON.stringify({ state: 'done', answer: { text: 'Here you go.', notes: [], cards: [card], buttons: false, go: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

  const collect = async (shown: CardView) => {
    const turn = newTurnId()
    useAssistant.setState({ messages: [{ id: 2, from: 'bot', text: '', card: shown }], waiting: { turn, msg: 'hello', botId: 2 } })
    resumeWaiting()
    for (let i = 0; i < 200 && useAssistant.getState().waiting; i++) await new Promise((r) => setTimeout(r, 5))
    return useAssistant.getState().messages.find((m) => m.id === 2)
  }

  test('does not put a card the customer already added back to waiting for a tap', async () => {
    const card = cartCard()
    globalThis.fetch = answerWith(card)
    try {
      const message = await collect({ card, state: 'done' })
      assert.equal(message?.text, 'Here you go.')
      assert.equal(message?.card?.state, 'done')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('keeps a dismissed or failed card as it is, and shows a card not seen before as waiting', async () => {
    const card = cartCard()
    globalThis.fetch = answerWith(card)
    try {
      assert.equal((await collect({ card, state: 'dismissed' }))?.card?.state, 'dismissed')
      assert.equal((await collect({ card, state: 'failed', message: 'x' }))?.card?.state, 'failed')
      const other = cartCard()
      assert.equal((await collect({ card: other, state: 'done' }))?.card?.card.id, card.id)
      assert.equal((await collect({ card: other, state: 'done' }))?.card?.state, 'pending')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('the typed fields of a card form', () => {
  test('are kept by card id, replaced as the customer types, and forgotten when the card is finished', () => {
    const a = newCardId()
    const b = newCardId()
    keepDraft(a, fields('first words'))
    keepDraft(b, fields('other card'))
    keepDraft(a, fields('first words, and more'))
    assert.equal(useAssistant.getState().drafts[a].message, 'first words, and more')
    assert.equal(useAssistant.getState().drafts[b].message, 'other card')
    clearDraft(a)
    assert.equal(a in useAssistant.getState().drafts, false)
    assert.equal(useAssistant.getState().drafts[b].message, 'other card')
    clearDraft(a)
  })

  test('only a few are kept at once, the newest', () => {
    const ids = Array.from({ length: 9 }, () => newCardId())
    for (const id of ids) keepDraft(id, fields(id))
    assert.deepEqual(Object.keys(useAssistant.getState().drafts), ids.slice(-6))
  })

  test('a new conversation starts with none', () => {
    keepDraft(newCardId(), fields('typed'))
    useAssistant.getState().reset()
    assert.deepEqual(useAssistant.getState().drafts, {})
  })
})

describe('Add and check out', () => {
  const show = (card: CartCard) =>
    useAssistant.setState({ open: true, messages: [{ id: 1, from: 'bot', text: 'Check it.', card: { card, state: 'pending' } }] })

  test('closes the chat panel on every screen (a desktop panel would cover the order summary), and goes to checkout', () => {
    const card = cartCard({ checkout: true })
    show(card)
    const went: string[] = []
    addCardToCart(1, card, (to) => went.push(to))
    assert.equal(useAssistant.getState().open, false)
    assert.deepEqual(went, ['/checkout'])
    assert.equal(useAssistant.getState().messages[0].card?.state, 'done')
    assert.equal(useCart.getState().lines.length, 1)
  })

  test('plain Add to cart leaves the panel as it is (on a desktop the customer carries on chatting)', () => {
    const card = cartCard()
    show(card)
    const went: string[] = []
    addCardToCart(1, card, (to) => went.push(to))
    assert.equal(useAssistant.getState().open, true)
    assert.deepEqual(went, [])
    assert.equal(useAssistant.getState().messages[0].card?.state, 'done')
  })
})
