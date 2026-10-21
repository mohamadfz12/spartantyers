/**
 * The assistant's engine, the website's chat: one AI agent with tools (api/ai/[action].ts calls this).
 *
 * One message goes through these steps, in this order:
 *   1. The fixed safety answer (src/lib/ai/emergency.ts). Danger gets the safety words and the call
 *      buttons at once, with no AI involved and no limit in the way.
 *   2. Limits: per connection, per chat, and the AI's daily, monthly and per-visitor spending limits.
 *   3. The AI model (gateway.ts) with the business's own facts as its instructions (rules.ts) and
 *      tools (tools.ts) to look up live tyres and prices, open pages, show a card, check an order
 *      and show the contact buttons. The model can never order: the customer taps the card.
 * Whenever the AI cannot answer, the browser says so (a `fallback` event), so the chat never just
 * stops working.
 */
import { site } from '../../../src/config/site.js'
import { EMERGENCY, isEmergency } from '../../../src/lib/ai/emergency.js'
import { looksForeign } from '../../../src/lib/ai/language.js'
import {
  contactActions,
  isCardId,
  isOutcomeKind,
  type Card,
  type CardOutcome,
  type ChatEvent,
  type FallbackReason,
  type SavedAnswer,
  type SavedTurn,
} from '../../../src/lib/ai/protocol.js'
import { todaySydney } from './dates.js'
import { aiDbConfigured, AiDbUnavailable, getAiDb, num } from './db.js'
import { AiError, aiConfig, CALL_TIMEOUT_MS, canFallBack, complete, worstCase, type Message, type PriceOf } from './gateway.js'
import { ENGLISH_ONLY_LEAD, instructions } from './rules.js'
import { aiAvailable, rateLimited, reserve, settle } from './spend.js'
import { metaOf } from './util.js'
import { aud, newTurn, NUDGES, openClaimedPage, runTool, showContactButtons, TOOLS, unbackedClaim, type Turn } from './tools.js'

/** The limits of one message and one chat. A plain object so tests can shorten them. */
export const CHAT = {
  /** Messages one connection may send in 10 minutes, and in a day. */
  perTenMinutes: 30,
  perDay: 100,
  /** Messages in one chat before the assistant suggests the sales team instead. */
  turnsPerChat: 40,
  /** Earlier messages the model sees. */
  history: 16,
  /** Model calls for one message (a tool and its answer is two). */
  steps: 4,
  /** Longest answer, in tokens. */
  maxTokens: 450,
  /** The most one message may take, in milliseconds: under the browser's patience and the function's time limit. */
  turnMs: 40_000,
  /** A model call is not started with less time than this left before the deadline. */
  minCallMs: 4000,
  /** The most one model call may take (a retry on the fallback model gets only what is left of the turn). */
  callMs: CALL_TIMEOUT_MS,
  /** Tool calls run in one model step; any more get an error to read ("one step at a time"). */
  toolsPerStep: 3,
  /** Card outcomes accepted with one request. */
  outcomesPerRequest: 6,
}

/** A model call slower than this is logged: GLM usually starts answering in 1 to 3 seconds. */
const SLOW_CALL_MS = 10_000

/**
 * Text before a tool call no longer than this is not shown: GLM writes a preamble ("Let me
 * check...") or the answer it then repeats after the tool. Answers are capped at about 80 words
 * (under 600 characters) by the rules, so in practice text before a tool call is never shown.
 * Longer text streams.
 */
export const PREAMBLE_CHARS = 700

/** One message from the customer. `turn` is the browser's id for it: the answer is saved under it so a lost connection can collect it. */
export type TurnInput = {
  conversationId: string
  message: string
  page: string
  ipHash: string
  turn?: string
  /** What the customer did with the cards of earlier answers */
  outcomes?: CardOutcome[]
}

/* ------------------------------------------------------------------- saving */

/** Starts or continues a chat; returns how many messages it now has from the customer. */
export async function touchConversation(id: string, ipHash: string): Promise<number> {
  const db = await getAiDb()
  const rows = await db.query<{ turns: number | string }>(
    `INSERT INTO ai_conversations (id, ip_hash, turns) VALUES ($1::text, $2::text, 1)
     ON CONFLICT (id) DO UPDATE SET turns = ai_conversations.turns + 1, last_at = now()
     RETURNING turns`,
    [id, ipHash],
  )
  return num(rows[0]?.turns) || 1
}

export async function save(
  conversationId: string,
  role: 'user' | 'assistant' | 'note',
  content: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const db = await getAiDb()
  await db.query(
    `INSERT INTO ai_messages (conversation_id, role, content, meta) VALUES ($1::text, $2::text, $3::text, $4::jsonb)`,
    [conversationId, role, content, JSON.stringify(meta)],
  )
}

/**
 * Saves an answer the customer has already been sent whole (after `done`). A database error here
 * is logged and nothing more: it must not make the turn stream "Sorry" and a second `done` after
 * the complete answer.
 */
async function saveAfterDone(conversationId: string, content: string, meta: Record<string, unknown>) {
  try {
    await save(conversationId, 'assistant', content, meta)
  } catch (err) {
    console.error('chat: could not save an answer that was already sent:', err instanceof Error ? err.message : 'unknown error')
  }
}

/** What an answer did besides its words, as saved with it: for staff, and for a browser collecting it later. */
const answerMeta = (t: Turn, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  notes: t.notes,
  ...(t.cards.length ? { cards: t.cards } : {}),
  ...(t.buttons ? { buttons: true } : {}),
  ...(t.went.length ? { go: t.went } : {}),
  ...extra,
})

/**
 * The answer to one message, for a browser that lost the connection while it was being written
 * (GET /api/ai/chat): 'unknown' when the server never saved that message (it did not arrive, or
 * was turned away before the AI started), 'pending' while the answer is still being written,
 * 'done' with the answer.
 */
export async function savedTurn(conversationId: string, turn: string): Promise<SavedTurn> {
  const db = await getAiDb()
  const asked = await db.query<{ id: number | string }>(
    `SELECT id FROM ai_messages WHERE conversation_id = $1::text AND role = 'user' AND meta->>'turn' = $2::text ORDER BY id DESC LIMIT 1`,
    [conversationId, turn],
  )
  if (!asked.length) return { state: 'unknown' }
  const after = await db.query<{ role: string; content: string; meta: unknown }>(
    `SELECT role, content, meta FROM ai_messages WHERE conversation_id = $1::text AND id > $2::bigint ORDER BY id LIMIT 20`,
    [conversationId, num(asked[0].id)],
  )
  for (const r of after) {
    // What the customer did with a card is not an answer.
    if (r.role === 'note') continue
    // The next message from the customer: this one has no answer of its own.
    if (r.role === 'user') return { state: 'unknown' }
    const meta = metaOf(r.meta)
    const answer: SavedAnswer = {
      text: String(r.content ?? ''),
      notes: Array.isArray(meta.notes) ? meta.notes.map(String) : [],
      cards: Array.isArray(meta.cards) ? (meta.cards as Card[]) : [],
      buttons: Boolean(meta.buttons),
      go: Array.isArray(meta.go) ? (meta.go as SavedAnswer['go']) : [],
      ...(typeof meta.fallback === 'string' ? { fallback: meta.fallback as FallbackReason } : {}),
    }
    return { state: 'done', answer }
  }
  return { state: 'pending' }
}

/* --------------------------------------------------------- card outcomes */

/** What the customer did with a card, in words, for staff and for the model. Null when that outcome makes no sense for that card. */
function outcomeNote(card: Card, outcome: CardOutcome['outcome'], detail: string): string | null {
  const failed = detail ? `: ${detail}` : ''
  switch (card.kind) {
    case 'cart': {
      const what = `${card.quantity} x ${card.name} ${card.size}`
      if (outcome === 'added') return `The customer tapped ${card.checkout ? 'Add and check out' : 'Add to cart'} on the card for ${what} (total ${aud(card.total)})`
      if (outcome === 'dismissed') return `The customer dismissed the Add to cart card for ${what}`
      if (outcome === 'failed') return `Adding ${what} to the cart failed${failed}`
      return null
    }
    case 'quote': {
      if (outcome === 'sent') return `The customer sent the quote request (${card.enquiryType}); it is in the sales inbox`
      if (outcome === 'dismissed') return `The customer dismissed the quote request (${card.enquiryType})`
      if (outcome === 'failed') return `Sending the quote request failed${failed}`
      return null
    }
    case 'handover': {
      if (outcome === 'sent') return 'The customer sent the message for the sales team; it is in the sales inbox'
      if (outcome === 'dismissed') return 'The customer dismissed the message for the sales team'
      if (outcome === 'failed') return `Sending the message for the sales team failed${failed}`
      return null
    }
  }
}

/**
 * Saves what the customer did with cards as notes on the chat, so staff see them and the model
 * knows them next message. A card must be one this chat really showed (its note is worded from the
 * saved card, never from the request), each outcome is saved once, and a chat that does not exist
 * is ignored. Returns how many were saved. Never throws for bad input.
 */
export async function recordOutcomes(conversationId: string, outcomes: CardOutcome[]): Promise<number> {
  const db = await getAiDb()
  let saved = 0
  for (const o of outcomes.slice(0, CHAT.outcomesPerRequest)) {
    if (!o || !isCardId(o.cardId) || !isOutcomeKind(o.outcome)) continue
    const shown = await db.query<{ cards: unknown }>(
      `SELECT meta->'cards' AS cards FROM ai_messages
        WHERE conversation_id = $1::text AND role = 'assistant' AND meta->'cards' @> $2::jsonb
        ORDER BY id DESC LIMIT 1`,
      [conversationId, JSON.stringify([{ id: o.cardId }])],
    )
    const cards = shown[0]?.cards
    const card = (typeof cards === 'string' ? (JSON.parse(cards) as Card[]) : (cards as Card[] | undefined))?.find((c) => c.id === o.cardId)
    if (!card) continue
    const detail = typeof o.detail === 'string' ? o.detail.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    const note = outcomeNote(card, o.outcome, o.outcome === 'failed' ? detail : '')
    if (!note) continue
    const already = await db.query(
      `SELECT 1 FROM ai_messages WHERE conversation_id = $1::text AND role = 'note' AND meta->>'cardId' = $2::text AND meta->>'outcome' = $3::text LIMIT 1`,
      [conversationId, o.cardId, o.outcome],
    )
    if (already.length) continue
    await save(conversationId, 'note', note, { cardId: o.cardId, outcome: o.outcome, kind: card.kind })
    saved += 1
  }
  if (saved) await db.query(`UPDATE ai_conversations SET last_at = now() WHERE id = $1::text`, [conversationId])
  return saved
}

/** The chat so far, as the model should see it: the last few messages, starting with the customer's. */
async function history(conversationId: string): Promise<Message[]> {
  const db = await getAiDb()
  const rows = await db.query<{ role: string; content: string; meta: unknown }>(
    `SELECT role, content, meta FROM ai_messages WHERE conversation_id = $1::text AND role IN ('user', 'assistant', 'note') ORDER BY id DESC LIMIT $2::int`,
    [conversationId, CHAT.history * 3],
  )
  const out: { role: 'user' | 'assistant'; content: string; notes: string[]; outcomes: string[] }[] = []
  for (const r of rows.reverse()) {
    const meta = metaOf(r.meta)
    const content = String(r.content ?? '')
    if (r.role === 'user') {
      out.push({ role: 'user', content, notes: [], outcomes: [] })
    } else if (r.role === 'note') {
      // What the customer did with a card belongs to the answer that showed it.
      const shown = out.at(-1)
      if (shown?.role === 'assistant') shown.outcomes.push(content)
    } else {
      // The browser said the AI could not answer those; the model has nothing to learn from them.
      if (meta.fallback || (!content && !meta.notes)) continue
      out.push({ role: 'assistant', content, notes: Array.isArray(meta.notes) ? meta.notes.map(String) : [], outcomes: [] })
    }
  }
  const messages: Message[] = out.slice(-CHAT.history).map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.content }
    const marks = [m.notes.length ? `[Done: ${m.notes.join('; ')}.]` : '', ...m.outcomes.map((o) => `[Customer: ${o}.]`)].filter(Boolean)
    return { role: 'assistant', content: marks.length ? `${m.content}\n${marks.join('\n')}` : m.content }
  })
  while (messages.length && messages[0].role !== 'user') messages.shift()
  return messages
}

/* ------------------------------------------------------------- text helpers */

/**
 * Takes the history notes ("[Done: ...]", "(Done: ...)", "[Customer: ...]") out of the model's text
 * as it streams. Earlier answers in the history end with such notes (what the assistant did, and
 * what the customer did with a card), and GLM sometimes copies the pattern into its own answer
 * whatever its instructions say; the customer must never see one. Text is held back only while it
 * could still be the start of a note, and spaces at the end of the answer are dropped.
 */
export function noteFilter() {
  const OPENERS = ['done:', 'customer:']
  /** `s` starts with a bracket: what follows (after spaces) so far, lower case. */
  const after = (s: string) => s.slice(1).replace(/^\s+/, '').toLowerCase()
  const couldOpen = (s: string) => OPENERS.some((o) => o.startsWith(after(s)))
  const opened = (s: string) => OPENERS.includes(after(s))
  let depth = 0 // brackets open inside a note: "[Done: Opened the shop (Greforce).]" ends at the last one
  let space = '' // whitespace waiting for the next word
  let maybe = '' // text that could still be the start of a note
  let skipping = false // inside a note
  let afterNote = false // just after a note: its own trailing space is not wanted
  let started = false // something has been passed on
  const pass = (s: string) => {
    if (s) started = true
    return s
  }
  const take = (ch: string): string => {
    if (skipping) {
      if (ch === '(' || ch === '[') depth++
      if (((ch === ')' || ch === ']') && --depth <= 0) || ch === '\n') {
        skipping = false
        depth = 0
        afterNote = true
        if (ch === '\n' && !space) space = ch
      }
      return ''
    }
    if (maybe) {
      const next = maybe + ch
      if (couldOpen(next)) {
        maybe = next
        if (opened(maybe)) {
          maybe = ''
          skipping = true
          depth = 1
        }
        return ''
      }
      const out = space + maybe
      space = maybe = ''
      return pass(out) + take(ch)
    }
    if (/\s/.test(ch)) {
      if (!(afterNote && (space || !started))) space += ch
      return ''
    }
    afterNote = false
    if (ch === '(' || ch === '[') {
      maybe = ch
      return ''
    }
    const out = space + ch
    space = ''
    return pass(out)
  }
  return {
    push: (s: string) => Array.from(s, take).join(''),
    /** The rest, once the model has finished: a note cut off by the end is dropped, and so is trailing space. */
    end: () => {
      const out = skipping || !maybe ? '' : space + maybe
      space = maybe = ''
      skipping = afterNote = started = false
      depth = 0
      return out
    },
  }
}

/**
 * Keeps the answer plain, whatever the model wrote, as it streams: the customer reads short
 * sentences, never a list, a table, a line break or a dash used as punctuation. It runs after
 * `noteFilter()` on every chunk sent to the browser, and the same text is saved, so staff see
 * what the customer saw.
 *   - A dash used as punctuation (an em dash, an en dash, or a hyphen with a space each side)
 *     becomes a comma and one space; between two numbers ("2-3") it becomes " to ".
 *   - A list item loses its marker ("- ", "* ", a bullet, "1. "); items are joined with "; "
 *     (or a space after a sentence end) and the last one ends with a full stop.
 *   - A table loses its separator row and header row; each data row becomes one sentence.
 *   - Any other line break becomes a single space. Bold and links are left alone.
 * Only the start of a line is held back (to tell a list marker from text), and a table row until
 * it is complete, so the stream stays live. The result does not depend on how the text is cut
 * into chunks.
 */
export function plainFilter() {
  let acc = '' // what the current call passes on
  // Inline layer: spaces and dashes.
  let space = false // whitespace waiting for the next word
  let started = false // something has been passed on
  let last = '' // the last character passed on that is not a space
  let dash: '' | 'hyphen' | 'wait' = '' // a hyphen after a space that may be a dash; a dash waiting for the next word
  const put = (s: string) => {
    acc += s
    started = true
    const t = s.trimEnd()
    if (t) last = t.slice(-1)
  }
  const inline = (ch: string) => {
    if (dash === 'hyphen') {
      if (/\s/.test(ch)) {
        dash = 'wait'
        return
      }
      dash = ''
      put(' -') // it was an ordinary hyphen after all
      space = false
    } else if (dash === 'wait') {
      if (/\s/.test(ch)) return
      dash = ''
      space = false
      if (/\d/.test(last) && /[\d$]/.test(ch)) {
        put(' to')
        space = true
      } else if (/[,;:.!?]/.test(ch)) {
        // The dash is just before a stop: nothing to replace it with.
      } else if (!last || /[,;:.!?(]/.test(last)) {
        space = true
      } else {
        put(',')
        space = true
      }
    }
    if (/\s/.test(ch)) {
      space = true
    } else if (ch === '\u2014' || ch === '\u2013') {
      space = false
      dash = 'wait'
    } else if (ch === '-' && space && started) {
      dash = 'hyphen'
    } else {
      put((space && started ? ' ' : '') + ch)
      space = false
    }
  }

  // Line layer: lists, tables and line breaks.
  let mode: 'start' | 'text' | 'row' = 'start'
  let head = '' // the start of the line so far, while it could still be a list marker
  let row = '' // a table row so far
  let sep = '' // what goes before the next words
  let list = false // the last line was a list item
  let header: string[] | null = null // a table row that may turn out to be the header
  let table = false // inside a table, past its separator row
  const ITEM = /^(?:[-*\u2022]|\d{1,3}[.)])[ \t]$/
  const MARKER_START = /^(?:[-*\u2022]|\d{1,3}[.)]?)$/
  const content = (s: string) => {
    for (const ch of s) {
      if (sep && !/\s/.test(ch)) {
        if (sep[0] !== ' ' && dash !== 'hyphen') space = false
        for (const c of sep) inline(c)
        sep = ''
      }
      inline(ch)
    }
  }
  /** A line of this kind starts: close the list if it ended, and choose what goes before it. */
  const begin = (kind: 'text' | 'item' | 'row') => {
    if (!started) {
      sep = ''
      list = kind === 'item'
      return
    }
    if (kind === 'item') {
      sep = list && !/[.!?;:]/.test(last) ? '; ' : ' '
      list = true
      return
    }
    if (list) {
      list = false
      if (!/[.!?]/.test(last)) {
        space = false
        inline('.')
      }
    }
    sep = ' '
  }
  const sentence = (cells: string[]) => {
    const parts = cells.filter((c) => c && !/^[\u2014\u2013-]+$/.test(c))
    if (!parts.length) return
    begin('row')
    const text = parts.join(', ')
    content(/[.!?]$/.test(text) ? text : `${text}.`)
  }
  const flushRows = () => {
    if (header) sentence(header)
    header = null
    table = false
  }
  const finishRow = () => {
    const cells = row.split('|').map((c) => c.trim())
    row = ''
    const filled = cells.filter(Boolean)
    if (filled.length && filled.every((c) => /^:?-+:?$/.test(c))) {
      header = null // the row before a separator is the header: dropped
      table = true
    } else if (table) {
      sentence(filled)
    } else {
      if (header) sentence(header)
      header = filled
    }
  }
  const text = (s: string) => {
    flushRows()
    begin('text')
    content(s)
  }
  const take = (ch: string) => {
    if (ch === '\r') return
    if (mode === 'row') {
      if (ch === '\n') {
        finishRow()
        mode = 'start'
      } else {
        row += ch
      }
      return
    }
    if (mode === 'text') {
      if (ch === '\n') {
        inline(' ')
        mode = 'start'
      } else {
        content(ch)
      }
      return
    }
    // The start of a line: tell a list item or a table row from text.
    if (ch === '\n') {
      const rest = head.replace(/^[ \t]+/, '').trimEnd()
      head = ''
      if (rest) text(rest)
      return
    }
    head += ch
    const rest = head.replace(/^[ \t]+/, '')
    if (!rest) return
    if (rest[0] === '|') {
      mode = 'row'
      row = rest
      head = ''
    } else if (ITEM.test(rest)) {
      flushRows()
      begin('item')
      mode = 'text'
      head = ''
    } else if (!MARKER_START.test(rest)) {
      mode = 'text'
      head = ''
      text(rest)
    }
  }
  return {
    push: (s: string) => {
      acc = ''
      for (const ch of s) take(ch)
      return acc
    },
    /** The rest, once the answer is finished: an unfinished row or line is passed on, the last list item gets its stop. */
    end: () => {
      acc = ''
      if (mode === 'row') {
        finishRow()
      } else if (mode === 'start') {
        const rest = head.replace(/^[ \t]+/, '').trimEnd()
        if (rest) text(rest)
      }
      flushRows()
      if (list && started && !/[.!?]/.test(last)) {
        space = false
        inline('.')
      }
      space = started = list = table = false
      dash = ''
      mode = 'start'
      head = row = sep = last = ''
      header = null
      return acc
    },
  }
}

/**
 * Whether the text tells the customer to phone the business: it gives the number (however it is
 * spaced), or says to call or ring us, the sales team or Spartan, or mentions a phone call. The
 * buttons then go with it: models often write this without using show_contact_buttons, and on a
 * phone the button is the one-tap way to call. Asking for the customer's own number, or saying
 * the team will call them, does not count.
 */
export const tellsToCall = (() => {
  const digits = site.phone.display.replace(/\D/g, '')
  const number = new RegExp(`\\b${digits.split('').join('[\\s.-]?')}(?!\\d)`)
  const us = `(?:us|the\\s+(?:sales\\s+)?team|our\\s+(?:sales\\s+)?team|sales|${site.name.toLowerCase()}|the\\s+warehouse|directly)`
  const words = new RegExp(`\\b(?:call|ring|phone)\\s+${us}\\b|\\bgive\\s+(?:us|the\\s+team|sales)\\s+a\\s+(?:ring|call|buzz)\\b|\\bphone\\s+(?:call|line)\\b|\\bby\\s+phone\\b`, 'i')
  return (s: string) => number.test(s) || words.test(s)
})()

/** What to say when the model acted (showed a card, opened a page, showed the buttons) but wrote nothing. */
export const actedText = (t: Turn): string => {
  const card = t.cards.at(-1)
  if (card?.kind === 'cart') return `Please check the details on the card, then tap ${card.checkout ? 'Add and check out' : 'Add to cart'}.`
  if (card?.kind === 'quote') return 'I have prepared a quote request. Please check it, fill in anything missing and tap Send.'
  if (card?.kind === 'handover') return 'I have prepared a message for the sales team. Please check it, fill in anything missing and tap the button.'
  const went = t.went[t.went.length - 1]
  if (went) return `I've ${went.note.charAt(0).toLowerCase()}${went.note.slice(1)} for you.`
  if (t.buttons) return 'The sales team can help with that one: tap a button to call or email.'
  return ''
}

const SORRY = `Sorry, I could not finish that answer. Please ask again, or call us on ${site.phone.display}.`

/* ------------------------------------------------------------------ the turn */

/**
 * Answers one message from the customer, sending events as they happen. Never throws: when the AI
 * cannot answer before saying anything, it sends a fallback event and the browser says so. The
 * answer is finished and saved even when `emit` stops working (the customer left), so staff's copy
 * has no gaps and the cost is recorded.
 */
export async function runTurn(input: TurnInput, emit: (e: ChatEvent) => void): Promise<void> {
  const { conversationId: id, message, page, ipHash } = input
  const askedMeta = input.turn ? { turn: input.turn } : {}
  const today = todaySydney()

  // 1. Danger: the fixed answer, at once, whatever else is going on.
  if (isEmergency(message)) {
    emit({ type: 'text', text: EMERGENCY.text })
    emit({ type: 'buttons', actions: EMERGENCY.actions })
    emit({ type: 'done' })
    try {
      if (aiDbConfigured() && !(ipHash && (await rateLimited(`chat:${ipHash}`, CHAT.perTenMinutes, 600)))) {
        await touchConversation(id, ipHash)
        await save(id, 'user', message, askedMeta)
        await save(id, 'assistant', EMERGENCY.text, { buttons: true, emergency: true, notes: ['Gave the safety words and the call buttons'] })
      }
    } catch (err) {
      console.error('chat: could not record a safety answer:', err instanceof Error ? err.message : 'unknown error')
    }
    return
  }

  let said = ''
  // The last text held back before a tool: shown after all if the model then says nothing else.
  let unsaid = ''
  // A message clearly not in English: the answer starts with ENGLISH_ONLY_LEAD, added here rather than
  // left to the model (in the real test it wrote it before a tool call, and such text is dropped).
  const foreign = looksForeign(message)
  let lead = foreign ? ENGLISH_ONLY_LEAD : ''
  /** The first words shown get the lead in front, once (unless the model already said it). */
  const led = (text: string) => {
    if (!lead) return text
    const out = /^\s*sorry,? i can only help in english/i.test(text) ? text : `${lead} ${text}`
    lead = ''
    return out
  }
  // Once the customer's message is saved, every answer is saved too, so staff's copy has no gaps.
  let asked = false
  const t = newTurn(today, page, emit, ipHash)
  /** The AI could not answer: the browser says so, and the chat records which. */
  const fallBack = async (reason: FallbackReason) => {
    emit({ type: 'fallback', reason })
    if (!asked) return
    try {
      await save(id, 'assistant', '', { fallback: reason, notes: ['The AI could not answer'] })
    } catch {
      // Best effort: the customer already has the answer.
    }
  }
  try {
    // 2. Limits.
    if (!aiDbConfigured()) {
      emit({ type: 'fallback', reason: 'not_configured' })
      return
    }
    if (ipHash && ((await rateLimited(`chat:${ipHash}`, CHAT.perTenMinutes, 600)) || (await rateLimited(`chatday:${ipHash}`, CHAT.perDay, 86400)))) {
      emit({ type: 'fallback', reason: 'busy' })
      return
    }
    const ready = await aiAvailable(ipHash)
    const config = aiConfig()
    if (!ready.ok || !config) {
      emit({ type: 'fallback', reason: !ready.ok ? (ready.reason === 'visitor' ? 'busy' : ready.reason) : 'not_configured' })
      return
    }
    const turns = await touchConversation(id, ipHash)
    // What the customer did with earlier cards, before the model reads the history.
    if (input.outcomes?.length) {
      try {
        await recordOutcomes(id, input.outcomes)
      } catch (err) {
        console.error('chat: could not save card outcomes:', err instanceof Error ? err.message : 'unknown error')
      }
    }
    const earlier = await history(id)
    await save(id, 'user', message, askedMeta)
    asked = true
    if (turns > CHAT.turnsPerChat) {
      const text = `We have covered a lot in this chat. To keep going, the sales team is the best place: call us on ${site.phone.display} or email ${site.email.sales}.`
      emit({ type: 'text', text })
      emit({ type: 'buttons', actions: contactActions() })
      emit({ type: 'done' })
      await saveAfterDone(id, text, { buttons: true, notes: ['Suggested the sales team: the chat is long'] })
      return
    }

    // 3. The model, with its tools. The whole turn has a deadline, well inside the function's time
    // limit and the browser's patience, so a slow model cannot leave it unfinished and unrecorded.
    const deadline = Date.now() + CHAT.turnMs
    const messages: Message[] = [{ role: 'system', content: instructions(today, page, foreign) }, ...earlier, { role: 'user', content: message }]
    const toolsChars = JSON.stringify(TOOLS).length
    let nudged = false
    for (let step = 0; step < CHAT.steps; step++) {
      const last = step === CHAT.steps - 1
      const requestChars = JSON.stringify(messages).length + toolsChars
      const left = deadline - Date.now()
      const gate = left < CHAT.minCallMs ? null : await reserve('chat', config.model, worstCase(requestChars, CHAT.maxTokens), ipHash)
      if (!gate || !gate.ok) {
        if (!said && !t.cards.length && !t.opened && !t.buttons) {
          await fallBack(!gate ? 'slow' : gate.reason === 'visitor' ? 'busy' : gate.reason)
          return
        }
        break
      }
      // GLM tends to write a short "Let me check..." before it uses a tool, whatever it is told.
      // So the start of each step's text is held back: if the step ends in a tool call, a short
      // preamble is dropped; a real answer is shown as soon as it is longer than that.
      let received = false
      let wrote = false
      let held = ''
      const show = (part: string) => {
        if (!wrote && said) {
          said += ' '
          emit({ type: 'text', text: ' ' })
        }
        wrote = true
        const shown = said ? part : led(part)
        said += shown
        emit({ type: 'text', text: shown })
      }
      const notes = noteFilter()
      const plain = plainFilter()
      const keep = (part: string) => {
        if (!part) return
        if (wrote) return show(part)
        held += part
        if (held.length > PREAMBLE_CHARS) {
          show(held)
          held = ''
        }
      }
      const onText = (part: string) => {
        received = true
        keep(plain.push(notes.push(part)))
      }
      let result
      // The main model first. If it times out or has a server error before saying anything, the
      // fallback model (when set) gets one try with its own reservation, at its own price, in the time left.
      let gateId = gate.id
      let which: PriceOf = 'main'
      for (;;) {
        const began = Date.now()
        const seconds = () => ((Date.now() - began) / 1000).toFixed(1)
        try {
          result = await complete({
            messages,
            tools: TOOLS,
            toolChoice: last ? 'none' : 'auto',
            maxTokens: CHAT.maxTokens,
            timeoutMs: Math.min(CHAT.callMs, deadline - began),
            onText,
            config,
            model: which === 'main' ? config.model : config.fallbackModel,
          })
          if (Date.now() - began > SLOW_CALL_MS) console.warn(`chat: model call ${step + 1} was slow: ${seconds()} s`)
          await settle(gateId, result.usage, 'done', which)
          break
        } catch (err) {
          console.warn(`chat: ${which} model call ${step + 1} failed after ${seconds()} s (${received ? 'it had started answering' : 'nothing received'})`)
          // Charged its worst case if it reached the model (cut off, timed out); nothing if it never did.
          await settle(gateId, null, err instanceof AiError && !err.billable && !received ? 'free' : 'billed', which)
          if (which === 'main' && canFallBack(err, config, received) && deadline - Date.now() >= CHAT.minCallMs) {
            const again = await reserve('chat', config.fallbackModel, worstCase(requestChars, CHAT.maxTokens, config, 'fallback'), ipHash)
            if (again.ok) {
              gateId = again.id
              which = 'fallback'
              continue
            }
          }
          throw err
        }
      }
      keep(plain.push(notes.end()) + plain.end())
      if (result.reasoningChars) console.warn(`chat: the model reasoned silently first (${result.reasoningChars} characters), which slows answers`)
      const usesTools = result.toolCalls.length > 0 && !last
      if (held && !usesTools) {
        // The model wrote that it added tyres to the cart, showed a card, prepared a request or passed
        // a message on, but never called the tool, so nothing is on screen. Its words are not shown:
        // it gets ONE hidden nudge and a call to try again (never a loop). The retry must not be the
        // last call, which has no tools.
        const claim = !nudged && step + 1 < CHAT.steps - 1 ? unbackedClaim(held, t) : null
        if (claim) {
          nudged = true
          messages.push({ role: 'assistant', content: held })
          messages.push({ role: 'user', content: `[Automatic note, not from the customer: ${NUDGES[claim]}]` })
          held = ''
          continue
        }
        show(held)
      }
      if (held && usesTools) unsaid = held.trim()
      if (!usesTools) break
      messages.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
      })
      // At most a few tools in one step; every call still gets an answer, so the conversation stays valid.
      for (const [i, call] of result.toolCalls.entries()) {
        const out = i < CHAT.toolsPerStep ? await runTool(call, t) : { error: 'One step at a time: ask again.' }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out) })
      }
    }

    if (!said && unsaid) {
      said = led(unsaid)
      emit({ type: 'text', text: said })
    }
    if (!said) {
      // The model only acted (opened a page, showed a card, the buttons) and wrote nothing: say what happened.
      const fill = actedText(t)
      if (!fill) {
        await fallBack('error')
        return
      }
      said = led(fill)
      emit({ type: 'text', text: said })
    }
    // The model wrote that it opened a page without calling open_page: open it, so the words are true.
    await openClaimedPage(said, t)
    if (!t.buttons && tellsToCall(said)) showContactButtons(t)
    emit({ type: 'done' })
    await saveAfterDone(id, said, answerMeta(t))
  } catch (err) {
    if (!(err instanceof AiError)) console.error('chat error:', err instanceof Error ? err.message : 'unknown error')
    else console.warn('chat: AI unavailable:', err.message)
    const acted = !!(t.cards.length || t.opened || t.buttons)
    if (!said && !acted) {
      await fallBack(err instanceof AiDbUnavailable ? 'not_configured' : 'error')
      return
    }
    if (!said) {
      // Nothing written, but what the customer asked for was done (a card, a page, the buttons): say
      // what happened, as when the model writes nothing, rather than "Sorry".
      const fill = led(actedText(t))
      emit({ type: 'text', text: fill })
      emit({ type: 'done' })
      try {
        await save(id, 'assistant', fill, answerMeta(t, { error: true }))
      } catch {
        // The database is what failed; the customer already has the answer.
      }
      return
    }
    // Part of the answer is already on the customer's screen: finish it honestly.
    emit({ type: 'text', text: `\n\n${SORRY}` })
    if (!t.buttons) {
      try {
        showContactButtons(t)
      } catch {
        // The buttons are a courtesy.
      }
    }
    emit({ type: 'done' })
    try {
      await save(id, 'assistant', `${said}\n\n${SORRY}`, answerMeta(t, { error: true }))
    } catch {
      // The database is what failed; the customer already has the answer.
    }
  }
}
