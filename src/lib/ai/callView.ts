/**
 * The words and small decisions of the call screen that need no browser: the status line, why a call
 * ended, what the assistant is told when the customer taps a card, and which captions show. React-free
 * so the tests can run it (src/store/call.ts and src/components/assistant/CallScreen.tsx use it).
 */
import type { Card, CardOutcomeKind } from './protocol.js'
import type { CallPhase, EndReason, Talk } from './voiceCall.js'

/** One line of a call's transcript: what the customer said, what the assistant said, or what the assistant did. */
export type CallLine = {
  id: string
  who: 'you' | 'ai' | 'did'
  text: string
  /** Still being written down. */
  live?: boolean
  /** A page the assistant opened: the line is a button that goes there again. */
  to?: string
}

/** Which screen explains a call that could not start. */
export type CallErrorKind = 'mic' | 'busy' | 'failed'

/** The title and kind of the screen for a call that could not start, from why it ended (and the server's reason). */
export function errorFor(reason: EndReason, refusal?: string): { kind: CallErrorKind; title: string } {
  if (reason === 'mic') return { kind: 'mic', title: 'Microphone blocked' }
  if (reason === 'refused' && refusal === 'already') return { kind: 'busy', title: 'Call already open' }
  if (reason === 'refused' && refusal && ['busy', 'visitor', 'daily', 'monthly', 'off', 'not_configured'].includes(refusal)) {
    return { kind: 'busy', title: 'Calls are busy' }
  }
  return { kind: 'failed', title: 'Call could not start' }
}

/** What the call is doing, in a few words, for the status line and the minimised bar. `hearing`: the customer is talking right now. */
export function statusText(
  s: { phase: CallPhase | 'error'; practice: boolean; muted: boolean; tool: boolean; talk: Talk },
  hearing = false,
): string {
  if (s.phase === 'starting' || s.phase === 'connecting') return 'Connecting...'
  if (s.phase === 'ended') return 'Call ended'
  if (s.phase === 'error') return 'Call could not start'
  if (s.muted) return 'You are muted'
  if (s.tool) return 'Checking...'
  if (s.talk === 'speaking') return 'Speaking'
  if (s.talk === 'thinking') return 'Thinking...'
  if (hearing) return 'Hearing you...'
  return s.practice ? 'Your turn: type what you would say' : 'Listening, just talk'
}

/** Why a call ended, for the ended screen. Empty when there is nothing to add. */
export function endedReason(reason: EndReason | null): string {
  switch (reason) {
    case 'time':
      return 'The call reached its time limit.'
    case 'lost':
      return 'The connection dropped.'
    case 'error':
      return 'The call ended unexpectedly.'
    case 'user':
      return 'You ended the call.'
    default:
      return ''
  }
}

/** The button a card's customer taps, and the card's name, as the assistant is told about them. */
const cardWords = (card: Card) =>
  card.kind === 'cart'
    ? { tap: card.checkout ? 'Add and check out' : 'Add to cart', what: 'Add to cart' }
    : card.kind === 'quote'
      ? { tap: 'Send quote request', what: 'quote request' }
      : { tap: 'Ask someone to get back to me', what: 'message for the sales team' }

/**
 * The hidden note that tells the assistant what the customer did with a card ("(Call: the customer
 * tapped ...)", see ON_A_CALL in api/_lib/ai/voice-openai.ts). It is never read out.
 */
export function outcomeNote(card: Card, outcome: CardOutcomeKind, detail?: string): string {
  const { tap, what } = cardWords(card)
  if (outcome === 'added' && card.kind === 'cart') {
    return `the customer tapped ${tap} on the card for ${card.quantity} x ${card.name}, ${card.size}. It is in their cart${card.checkout ? ' and they are being taken to the checkout page' : ''}.`
  }
  if (outcome === 'sent') return `the customer tapped ${tap} on the ${what}. It was sent to the sales team.`
  if (outcome === 'dismissed') return `the customer tapped Not now on the ${what} card. Nothing was ${card.kind === 'cart' ? 'added' : 'sent'}.`
  const why = detail ? ` (${detail.replace(/[\r\n]+/g, ' ').slice(0, 160)})` : ''
  return `the customer tapped ${tap} on the ${what} card, but it could not be completed${why}. Offer the contact buttons.`
}

/** One line for the ended screen: what was put on the screen during the call. */
export function cardSummary(card: Card): string {
  if (card.kind === 'cart') return `Add to cart card: ${card.quantity} x ${card.name}, ${card.size}`
  if (card.kind === 'quote') return 'Quote request'
  return 'Message for the sales team'
}

/** The lines the live screen shows as captions: the last few with something to show, the "did" lines too (the screen draws those as buttons that open the page again). */
export function captionLines(lines: CallLine[], max = 3): CallLine[] {
  return lines.filter((l) => l.who === 'did' || l.text || l.live).slice(-max)
}

/** Whether the customer has said anything yet (the hints are shown until then). */
export const hasSpoken = (lines: CallLine[]) => lines.some((l) => l.who === 'you' && l.text)
