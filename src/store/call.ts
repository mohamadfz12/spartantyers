import { create } from 'zustand'
import { cardSummary, errorFor, outcomeNote, type CallErrorKind, type CallLine } from '@/lib/ai/callView'
import { isCallId, plainDashes } from '@/lib/ai/voice'
import type { Card, CardOutcomeKind, CartCard, ChatEvent, ContactAction } from '@/lib/ai/protocol'
import { canCall, endCallOnServer, VoiceCall, type CallPhase, type EndReason, type Talk } from '@/lib/ai/voiceCall'
import {
  CANNOT_ADD,
  navigateTo,
  putCardInCart,
  reportOutcome,
  useAssistant,
  type CardState,
} from '@/store/assistant'
import { useCart } from '@/store/cart'

/**
 * The voice call as the screen shows it: one global store, so the call goes on while the customer
 * moves between pages. The call itself (microphone, WebRTC, practice mode) is src/lib/ai/voiceCall.ts;
 * this file turns what happens on it into what the call screen and its minimised bar show.
 * Nothing said on a call is ever added to the chat's messages (the server keeps the transcript).
 */

/** The card the assistant put on the call screen, and where it is. */
export type CallCard = { card: Card; state: CardState; message?: string }

export type CallView = {
  phase: CallPhase | 'error'
  talk: Talk
  /** One of the assistant's tools is running. */
  tool: boolean
  muted: boolean
  loud: boolean
  practice: boolean
  /** How long the call may last, in seconds. */
  seconds: number
  /** When it went live, and when it ended (ms). */
  since: number
  endedAt: number
  /** The call shrunk to its bar, so the page is in view. */
  minimized: boolean
  /** The full transcript sheet is open. */
  transcript: boolean
  lines: CallLine[]
  /** The card the customer is looking at (one at a time). */
  card: CallCard | null
  /** Call and email buttons the assistant showed. */
  buttons: ContactAction[]
  /** What was put on the screen during the call, for the end screen. */
  shown: string[]
  /** The customer described danger: the safety steps and the call buttons show. */
  danger: boolean
  /** What the assistant last opened ("Opened Shop"), shown on the bar. */
  note: string
  endReason: EndReason | null
  /** Why the call could not start, in plain words. */
  message: string
  errorKind: CallErrorKind
  errorTitle: string
}

const LOUD_KEY = 'spt-call-loud'

const readLoud = () => {
  try {
    return globalThis.localStorage?.getItem(LOUD_KEY) === '1'
  } catch {
    return false
  }
}

const newView = (o: { seconds: number; practice: boolean }): CallView => ({
  phase: 'starting',
  talk: 'thinking',
  tool: false,
  muted: false,
  loud: readLoud(),
  practice: o.practice,
  seconds: o.seconds,
  since: 0,
  endedAt: 0,
  minimized: false,
  transcript: false,
  lines: [],
  card: null,
  buttons: [],
  shown: [],
  danger: false,
  note: '',
  endReason: null,
  message: '',
  errorKind: 'failed',
  errorTitle: '',
})

/** A call is under way (starting, connecting or live), not over and not failed. */
export const isGoing = (v: CallView | null) => !!v && (v.phase === 'starting' || v.phase === 'connecting' || v.phase === 'live')

/** The call, from its start to its end screen; null when there is none. */
export const useCall = create<{ view: CallView | null }>()(() => ({ view: null }))

const set = useCall.setState
const get = useCall.getState

/* ------------------------------------------------------------------ keeping */

/** The live call's id, kept for this tab: a page that was killed (a phone putting it away) cannot say goodbye, so the next load does. */
const KEPT = 'spt-call-v1'

const storage = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

const keepCall = (id: string | null) => {
  try {
    if (id) storage()?.setItem(KEPT, id)
    else storage()?.removeItem(KEPT)
  } catch {
    // Blocked: the server still ends the call at its time.
  }
}

/** The page went away during a call (a reload): that call is over, so it is ended now. Runs once when the page loads. */
if (typeof window !== 'undefined') {
  const left = storage()?.getItem(KEPT)
  if (isCallId(left)) endCallOnServer(left, 'page')
  keepCall(null)
}

/* ------------------------------------------------------------------ the call */

let vc: VoiceCall | null = null

/** How loud the customer and the assistant are (for the orb), read on every frame. */
export const callLevels = () => vc?.levels() ?? { mic: 0, out: 0 }

const patch = (fn: (v: CallView) => CallView) => set((s) => (s.view ? { view: fn(s.view) } : s))

/** One stretch of the call's transcript, updated as the words come (shown on the captions and in the transcript). */
const putLine = (who: 'you' | 'ai', key: string, raw: string, final: boolean) => {
  const id = `${who}:${key}`
  const text = plainDashes(raw)
  patch((v) => {
    if (final && !text) return { ...v, lines: v.lines.filter((l) => l.id !== id) }
    const line: CallLine = { id, who, text, live: !final }
    return { ...v, lines: v.lines.some((l) => l.id === id) ? v.lines.map((l) => (l.id === id ? line : l)) : [...v.lines, line] }
  })
}

/** A new card replaces any older one still waiting for the customer: one card is active at a time. */
function retireOlderCard() {
  const old = get().view?.card
  if (old && (old.state === 'pending' || old.state === 'working')) {
    reportOutcome({ cardId: old.card.id, outcome: 'dismissed', detail: 'replaced by a newer card' })
  }
}

/** What the assistant's tools did on a call: pages open (and the call shrinks to its bar so the page shows); cards and buttons show on the call screen. */
function did(events: ChatEvent[]) {
  for (const e of events) {
    const at = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    if (e.type === 'go') {
      if (!navigateTo(e.to)) continue
      patch((v) => ({
        ...v,
        minimized: true,
        note: e.note,
        lines: [...v.lines, { id: `did:${at}`, who: 'did', text: e.note, to: e.to }],
      }))
    } else if (e.type === 'buttons') {
      patch((v) => ({ ...v, buttons: [...v.buttons.filter((b) => !e.actions.some((a) => a.href === b.href)), ...e.actions] }))
    } else if (e.type === 'card') {
      retireOlderCard()
      // The full screen comes back when a card needs the customer.
      patch((v) => ({
        ...v,
        minimized: false,
        card: { card: e.card, state: 'pending' },
        shown: [...v.shown, cardSummary(e.card)],
      }))
    }
  }
}

function ended(reason: EndReason, message: string, refusal?: string) {
  vc = null
  keepCall(null)
  set((s) => {
    const v = s.view
    if (!v) return s
    const lines = v.lines.filter((l) => l.text).map((l) => ({ ...l, live: false }))
    // The call never connected: the error screen says why, with Try again.
    if (reason === 'refused' || reason === 'mic' || (reason === 'error' && !v.since)) {
      const found = errorFor(reason, refusal)
      return { view: { ...v, phase: 'error', lines, errorKind: found.kind, errorTitle: found.title, message, tool: false, minimized: false } }
    }
    // The end shows on the full screen, even if the call was shrunk to its bar.
    return { view: { ...v, phase: 'ended', lines, endedAt: Date.now(), endReason: reason, message, tool: false, minimized: false } }
  })
}

/**
 * Starts a call. Call it straight from the tap on a Call button (the launcher, the chat's phone
 * button, the Contact page's card): phones only give the microphone and sound to a tap. The chat
 * panel closes first, so the call is the only thing on screen.
 */
export function startCall() {
  if (vc) return
  const assistant = useAssistant.getState()
  const info = assistant.voiceInfo ?? { seconds: 300, practice: false }
  useAssistant.setState({ open: false, aside: null })
  const view: CallView = newView(info)
  if (!info.practice && !canCall()) {
    set({
      view: {
        ...view,
        phase: 'error',
        errorKind: 'failed',
        errorTitle: 'Call could not start',
        message: 'This browser cannot make voice calls here. Try Chrome, Safari or Edge on a phone or computer, or call us instead.',
      },
    })
    return
  }
  set({ view })
  const call = new VoiceCall({
    conversationId: assistant.conversationId,
    loud: view.loud,
    hooks: {
      phase: (phase, extra) => {
        if (phase === 'ended') return
        if (phase === 'connecting' && call.callId) keepCall(call.callId)
        patch((v) => ({ ...v, phase, ...(extra ? { seconds: extra.seconds, practice: extra.practice } : {}), since: phase === 'live' ? Date.now() : v.since }))
      },
      talk: (talk) => patch((v) => ({ ...v, talk })),
      tool: (tool) => patch((v) => ({ ...v, tool })),
      heard: (key, text, final) => putLine('you', key, text, final),
      said: (key, text, final) => putLine('ai', key, text, final),
      did,
      danger: () => patch((v) => ({ ...v, danger: true })),
      ended,
    },
  })
  vc = call
  void call.start(info.practice)
}

/** Closes the end screen (or the error screen): never while a call is going. */
export function closeCall() {
  if (!vc) set({ view: null })
}

export const endCall = () => vc?.end('user')

export function toggleMute() {
  if (!vc) return
  vc.setMuted(!vc.isMuted)
  patch((v) => ({ ...v, muted: vc?.isMuted ?? false }))
}

export function toggleLoud() {
  if (!vc) return
  vc.setLoud(!vc.isLoud)
  const on = vc.isLoud
  try {
    globalThis.localStorage?.setItem(LOUD_KEY, on ? '1' : '0')
  } catch {
    // Not remembered, still works for this call.
  }
  patch((v) => ({ ...v, loud: on }))
}

export const toggleTranscript = () => patch((v) => ({ ...v, transcript: !v.transcript }))

/** What a customer on a practice call types: it stands for what they would say. */
export const typeInCall = (text: string) => vc?.type(text)

/** Shrinks the call to its bar, so the whole website is in view; the call goes on. */
export function minimizeCall() {
  if (isGoing(get().view)) patch((v) => ({ ...v, minimized: true }))
}

/** Back from the bar to the call screen. */
export const expandCall = () => patch((v) => ({ ...v, minimized: false }))

/** Opens a page the assistant opened earlier, from its pill on the captions, and shrinks the call so the page shows. */
export function reopenPage(to: string) {
  if (navigateTo(to)) minimizeCall()
}

/* ------------------------------------------------------------------ cards on a call */

const setCard = (state: CardState, message?: string) =>
  patch((v) => (v.card ? { ...v, card: { card: v.card.card, state, ...(message ? { message } : {}) } } : v))

/** Finishes the call's card with what the customer did, tells the server, and tells the assistant (a hidden note) so it can carry on. */
function finish(card: Card, outcome: CardOutcomeKind, detail?: string) {
  const state: CardState = outcome === 'added' || outcome === 'sent' ? 'done' : outcome
  setCard(state, outcome === 'failed' ? detail : undefined)
  reportOutcome({ cardId: card.id, outcome, ...(detail ? { detail: detail.slice(0, 200) } : {}) })
  vc?.tell(outcomeNote(card, outcome, detail))
}

/**
 * The customer tapped the button on the call's cart card: the tyre goes into the existing cart
 * (with fitting at pickup when asked for), and the call shrinks to its bar so the cart drawer, or
 * the checkout page, is usable. The site's own checkout takes payment from there.
 */
export function addCallCardToCart(card: CartCard) {
  setCard('working')
  if (!putCardInCart(card)) {
    finish(card, 'failed', CANNOT_ADD)
    return
  }
  finish(card, 'added')
  if (card.checkout) {
    useCart.getState().close()
    navigateTo('/checkout')
  }
  minimizeCall()
}

export const dismissCallCard = (card: Card) => finish(card, 'dismissed')

export const callCardSent = (card: Card) => finish(card, 'sent')

export const callCardFailed = (card: Card, message: string) => {
  // The form stays open for another try: only the server and the assistant are told.
  reportOutcome({ cardId: card.id, outcome: 'failed', detail: message.slice(0, 200) })
  vc?.tell(outcomeNote(card, 'failed', message))
}

