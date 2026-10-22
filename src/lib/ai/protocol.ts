/**
 * What the assistant's chat and the server say to each other (api/ai/[action].ts and the engine
 * in api/_lib/ai/engine.ts).
 *
 * The browser sends one message; the server answers with a stream of events, one JSON object per
 * line, as they happen: text as it is written, a page the assistant opened, a card for the
 * customer to check, and so on. The assistant never orders anything itself: a card is shown, the
 * customer taps it, and the browser then does the work (adds to the cart, posts the enquiry) and
 * reports what happened.
 *
 * React-free on purpose: the browser, the API and the tests all import this file. Relative
 * imports end in `.js` because the API runs it as a plain ES module.
 */
import { site } from '../../config/site.js'

/* ------------------------------------------------------------------ ids */

const CONVERSATION_ID = /^c[A-Za-z0-9_-]{24,40}$/
const TURN_ID = /^t[A-Za-z0-9_-]{24,40}$/
const CARD_ID = /^k[A-Za-z0-9_-]{8,40}$/

export function isConversationId(value: unknown): value is string {
  return typeof value === 'string' && CONVERSATION_ID.test(value)
}

/** The id of one message in a chat, so its answer can be collected if the connection is lost. */
export function isTurnId(value: unknown): value is string {
  return typeof value === 'string' && TURN_ID.test(value)
}

export function isCardId(value: unknown): value is string {
  return typeof value === 'string' && CARD_ID.test(value)
}

/**
 * 128 random bits from the secure random source, as 32 hex characters. Whoever holds a chat's id
 * can continue the chat (and so the model's memory of it), so it must not be guessable.
 */
function randomHex(): string {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (c?.getRandomValues) {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Only where there is no secure random source (not a current browser or Node).
  const part = () => Math.random().toString(36).slice(2, 12).padEnd(10, '0')
  return `${Date.now().toString(36)}${part()}${part()}`.slice(0, 32).padEnd(32, '0')
}

/** A new chat id (matches isConversationId). */
export const newConversationId = () => `c${randomHex()}`

/** An id for one message (matches isTurnId). */
export const newTurnId = () => `t${randomHex()}`

/** An id for one card (matches isCardId). */
export const newCardId = () => `k${randomHex().slice(0, 16)}`

/**
 * A path on this site: the page the customer is looking at, cleaned so it cannot carry anything
 * else into the instructions. The browser and the server both use it, so they always agree.
 */
export const cleanPage = (value: unknown): string => {
  const path = typeof value === 'string' ? value.split(/[?#]/)[0] : ''
  return path.length <= 80 && /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/.test(path) ? path : '/'
}

/** The longest message the chat accepts, in characters. */
export const MESSAGE_MAX = 1500

/* ---------------------------------------------------------------- buttons */

/** A button that calls or emails the sales team (the assistant shows it; the customer taps it). */
export type ContactAction = { kind: 'call' | 'email'; label: string; href: string }

/** The call and email buttons, from the site's own contact details. */
export const contactActions = (): ContactAction[] => [
  { kind: 'call', label: `Call ${site.phone.display}`, href: site.phone.href },
  { kind: 'email', label: 'Email sales', href: `mailto:${site.email.sales}` },
]

/* ------------------------------------------------------------------ cards */

/**
 * Tyres for the customer to check. Nothing is in the cart yet: tapping the button puts the tyre
 * in the existing cart (opening checkout when `checkout` is set) and the site's own checkout takes
 * payment. The figures are what checkout will charge, worked out by the server.
 */
export type CartCard = {
  id: string
  kind: 'cart'
  productId: string
  name: string
  size: string
  positionLabel: string
  quantity: number
  /** Dollars each, inc. GST */
  unitPrice: number
  /** unitPrice x quantity, before the volume discount */
  lineTotal: number
  volumeDiscount: number
  /** "8+ tyres", or null when no volume break applies */
  volumeLabel: string | null
  /** Fitting at warehouse pickup was asked for */
  fitting: boolean
  fittingTotal: number
  /** What checkout will charge, inc. GST and any fitting */
  total: number
  preOrder: boolean
  stock: number
  /** The button reads "Add and check out" instead of "Add to cart" */
  checkout: boolean
  notes: string[]
}

export const ENQUIRY_TYPES = ['quote', 'fleet', 'wholesale', 'sourcing'] as const
export type QuoteEnquiryType = (typeof ENQUIRY_TYPES)[number]

/** A quote request for the customer to check, edit and send (the browser posts it to /api/contact). */
export type QuoteCard = {
  id: string
  kind: 'quote'
  enquiryType: QuoteEnquiryType
  productId?: string
  size?: string
  quantity?: number
  message: string
  name?: string
  email?: string
  phone?: string
  company?: string
}

/** A short message for the sales team, for the customer to check, complete and send. */
export type HandoverCard = {
  id: string
  kind: 'handover'
  reason: string
  message: string
  name?: string
  email?: string
  phone?: string
}

export type Card = CartCard | QuoteCard | HandoverCard

/** What the customer did with a card, reported by the browser. */
export const OUTCOMES = ['added', 'sent', 'dismissed', 'failed'] as const
export type CardOutcomeKind = (typeof OUTCOMES)[number]
export type CardOutcome = { cardId: string; outcome: CardOutcomeKind; detail?: string }

export const isOutcomeKind = (value: unknown): value is CardOutcomeKind =>
  typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)

/* ----------------------------------------------------------------- events */

export const FALLBACK_REASONS = ['busy', 'off', 'daily', 'monthly', 'not_configured', 'slow', 'error'] as const
export type FallbackReason = (typeof FALLBACK_REASONS)[number]

export type ChatEvent =
  /** Part of the answer, as it is written. */
  | { type: 'text'; text: string }
  /** The assistant opened a page for the customer; `note` says what, in a few words. */
  | { type: 'go'; to: string; note: string }
  /** A card to check; the customer taps its button. */
  | { type: 'card'; card: Card }
  /** Call and email buttons under the answer. */
  | { type: 'buttons'; actions: ContactAction[] }
  /** The assistant cannot answer this time (switched off, over a limit, unreachable). */
  | { type: 'fallback'; reason: FallbackReason }
  /** The answer is complete. */
  | { type: 'done' }

const KNOWN = new Set<ChatEvent['type']>(['text', 'go', 'card', 'buttons', 'fallback', 'done'])

/** One line of the stream as an event, or null when it is not one. */
export function parseEvent(line: string): ChatEvent | null {
  const t = line.trim()
  if (!t) return null
  try {
    const e = JSON.parse(t) as ChatEvent
    return e && typeof e === 'object' && KNOWN.has(e.type) ? e : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ saved answers */

/** An answer as the server saved it: its words, and what it did besides. */
export type SavedAnswer = {
  text: string
  /** The server's own record of what was done (searches made, pages opened, cards shown). */
  notes: string[]
  cards: Card[]
  /** The call and email buttons were shown. */
  buttons: boolean
  /** The pages it opened. */
  go: { to: string; note: string }[]
  /** Set when the assistant could not answer; the browser shows its own message. */
  fallback?: FallbackReason
}

/** Where the answer to one message is: not on the server, still being written, or saved. */
export type SavedTurn = { state: 'unknown' | 'pending' | 'done'; answer?: SavedAnswer }
