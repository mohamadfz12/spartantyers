import { create } from 'zustand'
import { getProduct, hasPrice } from '@/data/products'
import {
  collectAnswer,
  fetchStatus,
  postOutcomes,
  streamChat,
  type ChatOutcome,
  type Collected,
} from '@/lib/ai/client'
import type { EnquiryFields } from '@/lib/ai/cardForm'
import { FALLBACK_NOTE, OFFLINE_NOTE, quickAnswer } from '@/lib/ai/fallback'
import { ASSISTANT_STORAGE_KEY } from '@/lib/ai/link'
import { isInternalPath } from '@/lib/ai/markup'
import {
  contactActions,
  isConversationId,
  isTurnId,
  MESSAGE_MAX,
  newConversationId,
  newTurnId,
  type Card,
  type CardOutcome,
  type CartCard,
  type ChatEvent,
  type ContactAction,
  type SavedAnswer,
} from '@/lib/ai/protocol'
import { site } from '@/config/site'
import { useCart } from '@/store/cart'

/**
 * The assistant's chat: its messages, the card the customer is looking at, and the conversation
 * with the server (src/lib/ai/client.ts). The chat is kept in this tab's session storage, so it
 * comes back when the page reloads (a phone reloads a page it put away while the customer was in
 * another app) or the customer moves between pages, and it ends with the tab.
 */

/** Where a card is: shown, being acted on, or finished. */
export type CardState = 'pending' | 'working' | 'done' | 'failed' | 'dismissed'

export type CardView = { card: Card; state: CardState; message?: string }

/** One message in the chat. `notes` say what the assistant opened; `quick` marks a quick answer. */
export type Msg = {
  id: number
  from: 'me' | 'bot'
  text: string
  notes?: string[]
  card?: CardView
  actions?: ContactAction[]
  quick?: 'busy' | 'offline'
  /** The server saved this answer (it came from the assistant, not from the quick answers or a failure). */
  kept?: true
}

/** A message still being answered: kept, so its answer can be collected if the connection or the page is lost. */
type Waiting = { turn: string; msg: string; botId: number }

type Mode = 'unknown' | 'ai' | 'quick'

interface AssistantState {
  messages: Msg[]
  /** The server keeps the chat under this id (made once; nothing is stored there until a message is sent). */
  conversationId: string
  waiting: Waiting | null
  /** Waiting for the first part of an answer. */
  typing: boolean
  busy: boolean
  /** Counts every event of an answer, so the chat can tell when it goes quiet (a tool is working). */
  activity: number
  /** Whether the assistant answers (asked when the panel opens); the quick answers otherwise. */
  mode: Mode
  /** Whether calls are on (the server says so). */
  voice: boolean
  /** How long a call may last, and whether it is a practice call (known when `voice` is on). */
  voiceInfo: { seconds: number; practice: boolean } | null
  /** The panel is open. */
  open: boolean
  /** On phones the panel steps aside to a pill after the assistant opens a page: what it did. */
  aside: string | null
  /** What the customer did with cards that the server has not been told yet (sent with the next message). */
  unsent: CardOutcome[]
  /** A card of this chat put something in the cart (so the order is linked to the chat). */
  cartFromChat: boolean
  /** What the customer has typed into the quote and message cards that are still open, by card id (kept in memory only, so it survives the panel or the call screen closing, not a reload). */
  drafts: Record<string, EnquiryFields>
  setOpen: (open: boolean) => void
  setAside: (note: string | null) => void
  ask: (question: string) => void
  goTo: (to: string, note: string) => void
  reset: () => void
}

/* ---------------------------------------------------------------- keeping */

const KEEP_MS = 12 * 60 * 60 * 1000
const KEEP_MESSAGES = 40

type Kept = {
  v: 1
  at: number
  conversationId: string
  messages: Msg[]
  open: boolean
  aside: string | null
  waiting?: Waiting
  unsent: CardOutcome[]
  cartFromChat: boolean
}

const storage = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    // Blocked, as in some private windows.
    return null
  }
}

const isMsg = (m: unknown): m is Msg => {
  const x = m as Msg | null
  return !!x && typeof x.id === 'number' && (x.from === 'me' || x.from === 'bot') && typeof x.text === 'string'
}

let nextId = 1

function loadKept(): Kept | null {
  try {
    const k = JSON.parse(storage()?.getItem(ASSISTANT_STORAGE_KEY) ?? 'null') as Kept | null
    if (!k || k.v !== 1 || !isConversationId(k.conversationId) || !(Date.now() - k.at < KEEP_MS) || !Array.isArray(k.messages)) {
      return null
    }
    // A card that was being acted on when the page went away starts again from the top.
    const messages = k.messages
      .filter(isMsg)
      .map((m) => (m.card?.state === 'working' ? { ...m, card: { ...m.card, state: 'pending' as const } } : m))
    const w = k.waiting
    const waiting = w && isTurnId(w.turn) && typeof w.msg === 'string' && typeof w.botId === 'number' ? w : undefined
    nextId = Math.max(nextId, ...messages.map((m) => m.id + 1), waiting ? waiting.botId + 1 : 0)
    return {
      v: 1,
      at: k.at,
      conversationId: k.conversationId,
      messages,
      open: k.open === true,
      aside: typeof k.aside === 'string' ? k.aside : null,
      ...(waiting ? { waiting } : {}),
      unsent: Array.isArray(k.unsent) ? k.unsent.slice(0, 6) : [],
      cartFromChat: k.cartFromChat === true,
    }
  } catch {
    return null
  }
}

const kept = loadKept()

export const useAssistant = create<AssistantState>()((set, get) => ({
  messages: kept?.messages ?? [],
  conversationId: kept?.conversationId ?? newConversationId(),
  waiting: kept?.waiting ?? null,
  typing: false,
  busy: false,
  activity: 0,
  mode: 'unknown',
  voice: false,
  voiceInfo: null,
  open: kept?.open === true,
  aside: kept?.aside ?? null,
  unsent: kept?.unsent ?? [],
  cartFromChat: kept?.cartFromChat === true,
  drafts: {},
  setOpen: (open) => set({ open }),
  setAside: (aside) => set({ aside }),
  ask: (question) => {
    const msg = question.trim().slice(0, MESSAGE_MAX)
    if (!msg || get().busy) return
    void send(msg)
  },
  goTo,
  reset: () => {
    nextId = 1
    set({
      messages: [],
      conversationId: newConversationId(),
      waiting: null,
      typing: false,
      busy: false,
      aside: null,
      unsent: [],
      cartFromChat: false,
      drafts: {},
    })
  },
}))

const set = useAssistant.setState
const get = useAssistant.getState

/** While an answer streams in, the chat is saved at most this often (and at once when the answer is done). */
const KEEP_EVERY_MS = 500
let keptAt = 0
let keepTimer: ReturnType<typeof setTimeout> | null = null

function keepNow() {
  if (keepTimer) clearTimeout(keepTimer)
  keepTimer = null
  keptAt = Date.now()
  const s = get()
  const k: Kept = {
    v: 1,
    at: Date.now(),
    conversationId: s.conversationId,
    messages: s.messages.slice(-KEEP_MESSAGES),
    open: s.open,
    aside: s.aside,
    ...(s.waiting ? { waiting: s.waiting } : {}),
    unsent: s.unsent,
    cartFromChat: s.cartFromChat,
  }
  try {
    storage()?.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(k))
  } catch {
    // Full or blocked: the chat still works, it is just not kept.
  }
}

/**
 * Saves the chat after a change: at once when it has been a while, otherwise within half a second.
 * Text streams in a few characters at a time, and writing the whole chat to storage on each piece
 * is wasted work on a phone. A finished answer, and the page being put away, save at once.
 */
function keep() {
  if (!get().waiting || Date.now() - keptAt >= KEEP_EVERY_MS) return keepNow()
  keepTimer ??= setTimeout(keepNow, KEEP_EVERY_MS - (Date.now() - keptAt))
}

if (typeof window !== 'undefined') {
  useAssistant.subscribe(keep)
  // A phone puts the page away without warning: whatever is waiting to be saved goes now.
  window.addEventListener('pagehide', keepNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && keepNow())
  // Once the cart is empty again (the order was paid, or it was cleared) it no longer comes from the chat.
  useCart.subscribe((s) => {
    if (s.lines.length === 0 && get().cartFromChat) set({ cartFromChat: false })
  })
}

/* ------------------------------------------------------------------ pages */

const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia(query).matches

/** Where the panel covers the whole screen. */
export const PHONE_QUERY = '(max-width: 639.98px)'
/** Where opening a page closes the panel, so the page can be seen. */
const NARROW_QUERY = '(max-width: 699.98px)'

export const isPhone = () => matches(PHONE_QUERY)

let navigator_: ((to: string) => void) | null = null

/** The component hands over the router's navigate, so the chat can open pages from here. */
export const setNavigator = (fn: ((to: string) => void) | null) => {
  navigator_ = fn
}

/** Steps the panel aside on a narrow screen, leaving a pill that brings it back. */
function stepAside(note: string) {
  if (!matches(NARROW_QUERY)) return
  set({ open: false, aside: note })
}

/** Opens a page on this site (never another website) for the customer. Returns whether it did. */
export function navigateTo(to: string): boolean {
  if (!isInternalPath(to)) return false
  navigator_?.(to)
  return true
}

/** Opens a page for the customer, and on a narrow screen steps the chat aside so the page can be seen. */
function goTo(to: string, note: string) {
  if (navigateTo(to)) stepAside(note)
}

/* ------------------------------------------------------------------ cards */

/** Tells the server what the customer did with a card; kept and sent with the next message if that fails. */
export function reportOutcome(outcome: CardOutcome) {
  const same = (o: CardOutcome) => o.cardId === outcome.cardId && o.outcome === outcome.outcome
  if (!get().unsent.some(same)) set((s) => ({ unsent: [...s.unsent, outcome].slice(-6) }))
  void postOutcomes(get().conversationId, [outcome]).then((ok) => {
    if (ok) set((s) => ({ unsent: s.unsent.filter((o) => !same(o)) }))
  })
}

const updateCard = (messageId: number, fn: (view: CardView) => CardView) =>
  set((s) => ({ messages: s.messages.map((m) => (m.id === messageId && m.card ? { ...m, card: fn(m.card) } : m)) }))

/** Moves a card to a new state. */
export const setCardState = (messageId: number, state: CardState, message?: string) =>
  updateCard(messageId, (view) => ({ card: view.card, state, ...(message ? { message } : {}) }))

/** Finishes a card with what the customer did, and tells the server. */
export function finishCard(messageId: number, card: Card, outcome: CardOutcome['outcome'], detail?: string) {
  const state: CardState = outcome === 'added' || outcome === 'sent' ? 'done' : outcome
  setCardState(messageId, state, outcome === 'failed' ? detail : undefined)
  if (outcome !== 'failed') clearDraft(card.id)
  reportOutcome({ cardId: card.id, outcome, ...(detail ? { detail: detail.slice(0, 200) } : {}) })
}

/** How many forms' typed fields are kept at once (one card is active at a time; a few more cover cards just replaced). */
const DRAFTS_KEPT = 6

/** Keeps what the customer has typed into a card's form, so closing and opening the panel (or the call screen) does not lose it. */
export function keepDraft(cardId: string, fields: EnquiryFields) {
  set((s) => ({ drafts: { ...Object.fromEntries(Object.entries(s.drafts).slice(1 - DRAFTS_KEPT)), [cardId]: fields } }))
}

/** Forgets a card's typed fields (it was sent or dismissed). */
export function clearDraft(cardId: string) {
  if (!(cardId in get().drafts)) return
  set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([id]) => id !== cardId)) }))
}

/** A new card replaces any older one still waiting for the customer: one card is active at a time. */
function retireOlderCards(exceptId: number) {
  for (const m of get().messages) {
    if (m.id === exceptId || m.card?.state !== 'pending') continue
    finishCard(m.id, m.card.card, 'dismissed', 'replaced by a newer card')
  }
}

/** What the customer sees when a cart card's tyre cannot be put in the cart. */
export const CANNOT_ADD = `That tyre cannot be added online. Please call ${site.phone.display} and the team will help.`

/**
 * Puts a cart card's tyres in the existing cart (with fitting at pickup when asked for) and marks
 * the cart as filled by the assistant, so the order is linked to the chat. False when the tyre is
 * not there, or is price on request. Used by the chat's cards and the call's.
 */
export function putCardInCart(card: CartCard): boolean {
  const product = getProduct(card.productId)
  if (!product || !hasPrice(product)) return false
  const cart = useCart.getState()
  cart.add(product, card.quantity)
  if (card.fitting) {
    cart.setFulfilment('pickup')
    const now = useCart.getState()
    now.setFittingTyres(now.fittingTyres + card.quantity)
  }
  set({ cartFromChat: true })
  return true
}

/**
 * The customer tapped the button on a cart card: the tyre goes into the existing cart (with
 * fitting at pickup when asked for) and the site's own checkout takes payment from there.
 */
export function addCardToCart(messageId: number, card: CartCard, navigate: (to: string) => void) {
  const product = getProduct(card.productId)
  if (!product || !hasPrice(product)) {
    finishCard(messageId, card, 'failed', CANNOT_ADD)
    return
  }
  setCardState(messageId, 'working')
  // On a phone the panel is out of the way before the cart (or checkout) takes the screen.
  if (matches(PHONE_QUERY)) set({ open: false })
  putCardInCart(card)
  finishCard(messageId, card, 'added')
  if (card.checkout) {
    useCart.getState().close()
    // The panel is closed on every screen (not only phones): on a desktop it would sit over the checkout's order summary.
    set({ open: false })
    navigate('/checkout')
    stepAside('Taking you to checkout')
  } else {
    stepAside('Added to your cart')
  }
}

/* ---------------------------------------------------------------- answers */

/** Creates or updates the assistant's answer with this id. */
const upsert = (id: number, fn: (m: Msg) => Msg) =>
  set((s) => ({
    messages: s.messages.some((m) => m.id === id)
      ? s.messages.map((m) => (m.id === id ? fn(m) : m))
      : [...s.messages, fn({ id, from: 'bot', text: '' })],
  }))

const markKept = (id: number) => upsert(id, (m) => (m.kept ? m : { ...m, kept: true }))

/** How long a quick answer waits, so it reads as typing rather than a glitch: longer for a longer answer. */
const typingBeat = (text: string, started: number) =>
  Math.max(0, 500 + Math.min(900, text.length * 4) - (Date.now() - started))

/** Shows the quick answer for a message (the assistant is off, over its limit, busy, or cannot be reached). */
async function showQuickAnswer(w: Waiting, started: number, offline = false) {
  const a = quickAnswer(w.msg)
  await new Promise((r) => setTimeout(r, typingBeat(a.text, started)))
  set({ typing: false })
  // A safety answer needs no note about why it is a quick one.
  const emergency = a.actions.some((x) => x.href === 'tel:000')
  upsert(w.botId, () => ({
    id: w.botId,
    from: 'bot',
    text: a.text,
    actions: a.actions,
    ...(emergency ? {} : { quick: offline ? ('offline' as const) : ('busy' as const) }),
  }))
}

/**
 * The card of an answer collected from the server. When this chat already shows that very card, it
 * keeps what the customer did with it (added, failed, dismissed): a collected answer never puts a
 * finished card back to waiting for a tap.
 */
export const savedCard = (shown: CardView | undefined, card: Card): CardView =>
  shown && shown.card.id === card.id ? shown : { card, state: 'pending' }

/** Shows an answer collected from the server, and opens what it opened if that has not happened here. */
function showSaved(w: Waiting, a: SavedAnswer, opened: boolean): Promise<void> | void {
  if (a.fallback) return showQuickAnswer(w, 0)
  const notes = a.go.map((g) => g.note)
  const card = a.cards[0]
  const isNew = !!card && get().messages.find((m) => m.id === w.botId)?.card?.card.id !== card.id
  upsert(w.botId, (m) => ({
    ...m,
    text: a.text,
    ...(a.buttons ? { actions: contactActions() } : {}),
    ...(notes.length ? { notes } : {}),
    ...(card ? { card: savedCard(m.card, card) } : {}),
  }))
  if (card && isNew) retireOlderCards(w.botId)
  markKept(w.botId)
  if (!opened) a.go.forEach((g) => goTo(g.to, g.note))
}

/**
 * Sends a message (or sends it again, under the same id) and shows the answer as it streams in.
 * Back on the page after leaving it mid-answer, when the answer is already saved, it stops waiting
 * on the old connection (the phone may have dropped it without saying so).
 */
async function request(w: Waiting) {
  let shown = false
  let opened = false
  const sentOutcomes = get().unsent.slice(0, 6)
  const update = (fn: (m: Msg) => Msg) => {
    if (!shown) {
      shown = true
      set({ typing: false })
    }
    set((s) => ({ activity: s.activity + 1 }))
    upsert(w.botId, fn)
  }
  const stop = new AbortController()
  const back = () => {
    if (document.visibilityState !== 'visible') return
    void collectAnswer({ conversationId: get().conversationId, turn: w.turn, waitMs: 0 }).then(
      (r) => r.state === 'done' && stop.abort(),
    )
  }
  document.addEventListener('visibilitychange', back)
  const outcome = await streamChat(
    {
      conversationId: get().conversationId,
      turn: w.turn,
      message: w.msg,
      page: window.location.pathname,
      outcomes: sentOutcomes,
      signal: stop.signal,
    },
    (e: ChatEvent) => {
      if (e.type === 'text') update((m) => ({ ...m, text: m.text + e.text }))
      else if (e.type === 'buttons') update((m) => ({ ...m, actions: [...(m.actions ?? []), ...e.actions] }))
      else if (e.type === 'card') {
        update((m) => ({ ...m, card: { card: e.card, state: 'pending' } }))
        retireOlderCards(w.botId)
      } else if (e.type === 'go') {
        opened = true
        update((m) => ({ ...m, notes: [...(m.notes ?? []), e.note] }))
        goTo(e.to, e.note)
      }
      // `fallback` shows nothing by itself: the outcome tells the caller to use the quick answers.
    },
  )
  document.removeEventListener('visibilitychange', back)
  // The server has them now (it saves outcomes before it answers); do not send them again.
  if (outcome !== 'unreached' && sentOutcomes.length) {
    set((s) => ({ unsent: s.unsent.filter((o) => !sentOutcomes.some((x) => x.cardId === o.cardId && x.outcome === o.outcome)) }))
  }
  return { outcome, shown, opened }
}

/**
 * After the answer's stream ends: when the connection was lost (a phone in another app drops it),
 * the answer is collected from the server, which finishes and saves it either way. When the server
 * never had the message (an iPhone reloading the page as it went out), it is sent again, once.
 * When the assistant could not answer, or the server cannot be reached, the quick answers do.
 */
async function conclude(
  w: Waiting,
  outcome: ChatOutcome,
  shown: boolean,
  opened: boolean,
  started: number,
  again = false,
): Promise<void> {
  if (outcome === 'answered') return
  const id = get().conversationId
  let found: Collected | null = null
  if (outcome === 'unreached') {
    // Usually offline: one quick look, so the quick answer can come at once if the server never had it.
    found = await collectAnswer({ conversationId: id, turn: w.turn, waitMs: 0 })
    if (found.state === 'pending') found = await collectAnswer({ conversationId: id, turn: w.turn })
  } else if (outcome === 'lost') found = await collectAnswer({ conversationId: id, turn: w.turn })
  if (found?.state === 'done' && found.answer) return showSaved(w, found.answer, opened)
  if (found?.state === 'unknown' && !shown && !again) {
    const r = await request(w)
    return conclude(w, r.outcome, r.shown, opened || r.opened, started, true)
  }
  if (!shown && (outcome === 'fallback' || found?.state === 'unknown' || found?.state === 'offline')) {
    const offline = found?.state === 'offline' || outcome === 'unreached'
    return showQuickAnswer(w, started, offline)
  }
  upsert(w.botId, (m) => ({
    ...m,
    text: `${m.text ? `${m.text}\n\n` : ''}The connection dropped there. Please ask again, or call ${site.phone.display}.`,
    actions: m.actions?.length ? m.actions : contactActions(),
  }))
}

async function send(msg: string) {
  set({ busy: true, typing: true })
  const meId = nextId++
  const w: Waiting = { turn: newTurnId(), msg, botId: nextId++ }
  set((s) => ({ waiting: w, messages: [...s.messages, { id: meId, from: 'me', text: msg }] }))
  const started = Date.now()
  try {
    if (get().mode === 'quick') await showQuickAnswer(w, started)
    else {
      const r = await request(w)
      if (r.outcome === 'answered' && r.shown) markKept(w.botId)
      await conclude(w, r.outcome, r.shown, r.opened, started)
    }
  } finally {
    set({ waiting: null, typing: false, busy: false })
  }
}

/** The page reloaded while the assistant was answering: collect that answer now. Called once when the panel mounts. */
export function resumeWaiting() {
  const w = get().waiting
  if (!w) return
  const before = get().messages.find((m) => m.id === w.botId)
  set({ busy: true, typing: !before?.text })
  void conclude(w, 'lost', !!before?.text, !!before?.notes?.length, Date.now()).finally(() =>
    set({ waiting: null, typing: false, busy: false }),
  )
}

/* ----------------------------------------------------------------- status */

let statusAt = 0
let statusBusy = false
/** How long the chat stays in quick-answer mode before it asks again whether the assistant is back. */
const RECHECK_MS = 60_000

/**
 * Asks whether the assistant can answer (and whether calls are on): when the launcher first shows,
 * each time the panel opens, and at most every 60 seconds while the panel is open in quick-answer
 * mode, so a chat that began without the assistant goes back to it as soon as it is available.
 * A question that could not be asked at all leaves the mode as it was (the first message finds out).
 */
export function checkStatus(reopened = false) {
  const { mode } = get()
  if (statusBusy) return
  if (mode === 'quick' && !reopened && Date.now() - statusAt < RECHECK_MS) return
  if (mode === 'ai' && !reopened) return
  statusBusy = true
  void fetchStatus()
    .then((s) => {
      if (s.chat === null) return
      statusAt = Date.now()
      set({ mode: s.chat ? 'ai' : 'quick', voice: s.voice, voiceInfo: s.voiceInfo ?? null })
    })
    .finally(() => (statusBusy = false))
}

export { FALLBACK_NOTE, OFFLINE_NOTE }
