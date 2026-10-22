/**
 * What the admin panel sees of the AI: the chats and calls, read from the AI's own tables. Read
 * only. Nothing here returns an address or a hash of one (`ip_hash` is never selected), and the
 * customer's contact details on cards are left out: staff open the sales inbox for those.
 */
import { getAiDb, num } from './db.js'
import { metaOf } from './util.js'
import type { Card } from '../../../src/lib/ai/protocol.js'

export const CONVERSATIONS_PAGE = 25
const PREVIEW_CHARS = 140
const TRANSCRIPT_LIMIT = 1000

export const CONVERSATION_FILTERS = ['all', 'chat', 'call', 'person'] as const
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number]

export const isConversationFilter = (value: unknown): value is ConversationFilter =>
  typeof value === 'string' && (CONVERSATION_FILTERS as readonly string[]).includes(value)

/** A timestamp from either engine (a Date or a string) as an ISO string. */
const iso = (value: unknown): string => {
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/* ------------------------------------------------------------------ list */

export interface ConversationRow {
  id: string
  startedAt: string
  lastAt: string
  messages: number
  hasCall: boolean
  /** Has words typed in the chat (not only a call). */
  hasChat: boolean
  askedForPerson: boolean
  cardsShown: number
  cardsAdded: number
  cardsSent: number
  orderRef: string | null
  preview: string
}

/** Escapes the characters LIKE treats as patterns, so a search for "50%" finds "50%". */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** The paging position of a row: its last activity in microseconds, and its id. */
const parseCursor = (cursor: string | undefined): { at: string; id: string } | null => {
  const match = /^(\d{10,20})\.(c[A-Za-z0-9_-]{24,40})$/.exec(cursor ?? '')
  return match ? { at: match[1], id: match[2] } : null
}

const HANDOVER = `m.role = 'assistant' AND m.meta->'cards' @> '[{"kind":"handover"}]'::jsonb`

/** Chats, newest activity first, 25 at a time. `next` is the cursor of the following page, or null. */
export async function listConversations(o: {
  filter: ConversationFilter
  q: string
  cursor?: string
}): Promise<{ conversations: ConversationRow[]; next: string | null; total: number }> {
  const db = await getAiDb()
  const where: string[] = []
  const params: unknown[] = []
  const add = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  const mine = `m.conversation_id = c.id`
  const words = `m.role IN ('user', 'assistant')`
  if (o.filter === 'call') where.push(`EXISTS (SELECT 1 FROM ai_calls k WHERE k.conversation_id = c.id)`)
  if (o.filter === 'chat') {
    where.push(`EXISTS (SELECT 1 FROM ai_messages m WHERE ${mine} AND ${words} AND COALESCE(m.meta->>'voice', '') <> 'true')`)
  }
  if (o.filter === 'person') where.push(`EXISTS (SELECT 1 FROM ai_messages m WHERE ${mine} AND ${HANDOVER})`)
  if (o.q) {
    const like = add(`%${likeEscape(o.q)}%`)
    where.push(`(EXISTS (SELECT 1 FROM ai_messages m WHERE ${mine} AND ${words} AND m.content ILIKE ${like}) OR COALESCE(c.order_ref, '') ILIKE ${like})`)
  }
  const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const filterParams = [...params]

  const cursor = parseCursor(o.cursor)
  const pageSql = cursor
    ? `${filterSql ? 'AND' : 'WHERE'} ((EXTRACT(EPOCH FROM c.last_at) * 1000000)::bigint, c.id) < (${add(cursor.at)}::bigint, ${add(cursor.id)}::text)`
    : ''

  const [rows, count] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT c.id, c.started_at, c.last_at, c.order_ref,
              (EXTRACT(EPOCH FROM c.last_at) * 1000000)::bigint AS cursor_at,
              (SELECT COUNT(*) FROM ai_messages m WHERE ${mine} AND ${words})::int AS messages,
              EXISTS (SELECT 1 FROM ai_calls k WHERE k.conversation_id = c.id) AS has_call,
              EXISTS (SELECT 1 FROM ai_messages m WHERE ${mine} AND ${words} AND COALESCE(m.meta->>'voice', '') <> 'true') AS has_chat,
              EXISTS (SELECT 1 FROM ai_messages m WHERE ${mine} AND ${HANDOVER}) AS asked_person,
              (SELECT COALESCE(SUM(jsonb_array_length(m.meta->'cards')), 0) FROM ai_messages m
                WHERE ${mine} AND m.role = 'assistant' AND jsonb_typeof(m.meta->'cards') = 'array')::int AS cards_shown,
              (SELECT COUNT(*) FROM ai_messages m WHERE ${mine} AND m.role = 'note' AND m.meta->>'outcome' = 'added')::int AS cards_added,
              (SELECT COUNT(*) FROM ai_messages m WHERE ${mine} AND m.role = 'note' AND m.meta->>'outcome' = 'sent')::int AS cards_sent,
              (SELECT m.content FROM ai_messages m WHERE ${mine} AND ${words} AND m.content <> '' ORDER BY m.id DESC LIMIT 1) AS preview
         FROM ai_conversations c
         ${filterSql} ${pageSql}
        ORDER BY c.last_at DESC, c.id DESC
        LIMIT ${CONVERSATIONS_PAGE + 1}`,
      params,
    ),
    db.query<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ai_conversations c ${filterSql}`, filterParams),
  ])

  const page = rows.slice(0, CONVERSATIONS_PAGE)
  const last = page[page.length - 1]
  return {
    conversations: page.map((r) => ({
      id: String(r.id),
      startedAt: iso(r.started_at),
      lastAt: iso(r.last_at),
      messages: num(r.messages),
      hasCall: r.has_call === true,
      hasChat: r.has_chat === true,
      askedForPerson: r.asked_person === true,
      cardsShown: num(r.cards_shown),
      cardsAdded: num(r.cards_added),
      cardsSent: num(r.cards_sent),
      orderRef: typeof r.order_ref === 'string' && r.order_ref ? r.order_ref : null,
      preview: String(r.preview ?? '').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_CHARS),
    })),
    next: rows.length > CONVERSATIONS_PAGE && last ? `${String(last.cursor_at)}.${String(last.id)}` : null,
    total: num(count[0]?.n),
  }
}

/* ---------------------------------------------------------------- detail */

export type CardOutcomeView = 'added' | 'sent' | 'dismissed' | 'failed' | 'none'

export interface CardView {
  id: string
  kind: 'cart' | 'quote' | 'handover'
  summary: string
  /** What the customer did with it; `none` when they never answered it. */
  outcome: CardOutcomeView
}

export type TranscriptEntry =
  | {
      kind: 'message'
      id: number
      role: 'customer' | 'assistant'
      text: string
      at: string
      /** Said on a voice call, not typed in the chat. */
      onCall: boolean
      /** What the assistant did while writing this: searches, pages opened, cards shown. */
      did: string[]
      pages: { to: string; note: string }[]
      cards: CardView[]
      buttons: boolean
      emergency: boolean
      /** Set when the assistant could not answer this time, and why. */
      fallback: string | null
    }
  | { kind: 'event'; id: number; text: string; at: string }
  | {
      kind: 'call'
      id: string
      at: string
      endedAt: string | null
      status: string
      seconds: number
      endReason: string
      lines: number
      practice: boolean
    }

export interface ConversationDetail {
  id: string
  startedAt: string
  lastAt: string
  orderRef: string | null
  askedForPerson: boolean
  entries: TranscriptEntry[]
  /** There are more messages than are shown (it stops at the first 1000). */
  truncated: boolean
}

const dollars = (n: unknown) => `$${(Number(n) || 0).toFixed(2)}`

/** A card in a line of words for staff, without the customer's contact details. */
function cardSummary(card: Card): string {
  if (card.kind === 'cart') {
    const tyres = `${card.quantity} ${card.quantity === 1 ? 'tyre' : 'tyres'}`
    return `Add to cart: ${card.name} ${card.size}, ${tyres}, ${dollars(card.total)} inc. GST${card.fitting ? ', with fitting' : ''}`
  }
  if (card.kind === 'quote') {
    const what = [card.size, card.quantity ? `${card.quantity} tyres` : ''].filter(Boolean).join(', ')
    return `Quote request (${card.enquiryType})${what ? `: ${what}` : ''}`
  }
  return `Message for the sales team: ${String(card.reason ?? '').slice(0, 160)}`
}

const outcomeOf = (value: unknown): CardOutcomeView =>
  value === 'added' || value === 'sent' || value === 'dismissed' || value === 'failed' ? value : 'none'

type Sorted = TranscriptEntry & { sortAt: number; seq: number }

/** One chat's whole record in order, or null when there is no such chat. */
export async function getConversation(id: string): Promise<ConversationDetail | null> {
  const db = await getAiDb()
  const chats = await db.query<Record<string, unknown>>(
    `SELECT id, started_at, last_at, order_ref FROM ai_conversations WHERE id = $1::text`,
    [id],
  )
  const chat = chats[0]
  if (!chat) return null

  const [messages, calls] = await Promise.all([
    db.query<Record<string, unknown>>(
      `SELECT id, role, content, meta, created_at FROM ai_messages WHERE conversation_id = $1::text ORDER BY id LIMIT ${TRANSCRIPT_LIMIT + 1}`,
      [id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT id, status, practice, started_at, ended_at, seconds, end_reason, lines FROM ai_calls WHERE conversation_id = $1::text ORDER BY started_at, id`,
      [id],
    ),
  ])
  const truncated = messages.length > TRANSCRIPT_LIMIT
  const rows = messages.slice(0, TRANSCRIPT_LIMIT)

  // What the customer did with each card: the latest note for it.
  const outcomes = new Map<string, CardOutcomeView>()
  for (const r of rows) {
    if (r.role !== 'note') continue
    const meta = metaOf(r.meta)
    if (typeof meta.cardId === 'string') outcomes.set(meta.cardId, outcomeOf(meta.outcome))
  }
  const shownCards = new Set<string>()

  const entries: Sorted[] = []
  let seq = 0
  let askedForPerson = false
  for (const r of rows) {
    const meta = metaOf(r.meta)
    const at = iso(r.created_at)
    const sortAt = new Date(at).getTime() || 0
    if (r.role === 'note') {
      // A card's outcome is shown on the card; other notes are shown as they are.
      if (typeof meta.cardId === 'string' && shownCards.has(meta.cardId)) continue
      entries.push({ kind: 'event', id: num(r.id), text: String(r.content ?? ''), at, sortAt, seq: seq++ })
      continue
    }
    if (r.role !== 'user' && r.role !== 'assistant') continue
    const cards: CardView[] = (Array.isArray(meta.cards) ? (meta.cards as Card[]) : [])
      .filter((c) => c && typeof c === 'object' && (c.kind === 'cart' || c.kind === 'quote' || c.kind === 'handover'))
      .map((c) => {
        shownCards.add(c.id)
        if (c.kind === 'handover') askedForPerson = true
        return { id: c.id, kind: c.kind, summary: cardSummary(c), outcome: outcomes.get(c.id) ?? 'none' }
      })
    entries.push({
      kind: 'message',
      id: num(r.id),
      role: r.role === 'user' ? 'customer' : 'assistant',
      text: String(r.content ?? ''),
      at,
      sortAt,
      seq: seq++,
      onCall: meta.voice === true,
      did: Array.isArray(meta.notes) ? meta.notes.map(String) : [],
      pages: (Array.isArray(meta.go) ? (meta.go as { to?: unknown; note?: unknown }[]) : []).map((g) => ({
        to: String(g?.to ?? ''),
        note: String(g?.note ?? ''),
      })),
      cards,
      buttons: meta.buttons === true,
      emergency: meta.emergency === true,
      fallback: typeof meta.fallback === 'string' ? meta.fallback : null,
    })
  }
  for (const c of calls) {
    const at = iso(c.started_at)
    entries.push({
      kind: 'call',
      id: String(c.id),
      at,
      endedAt: c.ended_at ? iso(c.ended_at) : null,
      status: String(c.status ?? ''),
      seconds: num(c.seconds),
      endReason: String(c.end_reason ?? ''),
      lines: num(c.lines),
      practice: c.practice === true,
      sortAt: new Date(at).getTime() || 0,
      seq: seq++,
    })
  }
  entries.sort((a, b) => a.sortAt - b.sortAt || a.seq - b.seq)

  return {
    id: String(chat.id),
    startedAt: iso(chat.started_at),
    lastAt: iso(chat.last_at),
    orderRef: typeof chat.order_ref === 'string' && chat.order_ref ? chat.order_ref : null,
    askedForPerson,
    entries: entries.map(({ sortAt: _at, seq: _seq, ...entry }) => entry as TranscriptEntry),
    truncated,
  }
}
