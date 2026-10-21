/**
 * The browser's side of the assistant's routes (api/ai/[action].ts): sends one message and reads
 * the answer as a stream of events, collects a saved answer when the connection was lost, reports
 * what the customer did with a card, and asks whether the assistant can answer right now.
 *
 * React-free so the tests can run it. A phone that goes to another app drops its connection while
 * the server finishes (and saves) the answer, so the chat collects it afterwards.
 */
import { parseEvent, type CardOutcome, type ChatEvent, type SavedTurn } from './protocol.js'

/** What sending a message came to. */
export type ChatOutcome =
  /** The server answered (with the assistant, or with a fixed reply). */
  | 'answered'
  /** The server could not use the assistant, or nothing usable came back: answer with the quick answers. */
  | 'fallback'
  /** The server took the message, then the connection broke (or was given up): collect the saved answer. */
  | 'lost'
  /** The server could not be reached at all (offline, for example): it may never have had the message. */
  | 'unreached'

/** What collecting an answer found; 'offline' when the server could not be reached at all. */
export type Collected = SavedTurn | { state: 'offline' }

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

const defaultFetcher: Fetcher = (url, init) => fetch(url, init)

/**
 * Sends one message and calls `onEvent` for each event as it arrives (the `fallback` event too, so
 * the caller can see why). Reads the answer as a stream where the browser can, and all at once
 * where it cannot.
 */
export async function streamChat(
  o: {
    conversationId: string
    message: string
    page?: string
    turn?: string
    outcomes?: CardOutcome[]
    fetcher?: Fetcher
    timeoutMs?: number
    signal?: AbortSignal
  },
  onEvent: (e: ChatEvent) => void,
): Promise<ChatOutcome> {
  const fetcher = o.fetcher ?? defaultFetcher
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), o.timeoutMs ?? 45_000)
  const stop = () => controller.abort()
  o.signal?.addEventListener('abort', stop)
  let seen = false
  let finished = false
  let reached = false
  let broke = false

  const take = (line: string) => {
    const e = parseEvent(line)
    if (!e) return
    if (e.type === 'fallback' || e.type === 'done') finished = true
    else seen = true
    onEvent(e)
  }

  try {
    const res = await fetcher('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({
        conversationId: o.conversationId,
        message: o.message,
        page: o.page,
        ...(o.turn ? { turn: o.turn } : {}),
        ...(o.outcomes?.length ? { outcomes: o.outcomes } : {}),
      }),
      signal: controller.signal,
    })
    reached = true
    // Sent again, and the server already had it (202): its answer is collected instead.
    if (res.status === 202) return 'lost'
    if (!res.ok) return 'fallback'
    const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null
    if (reader) {
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          take(buffer.slice(0, nl))
          buffer = buffer.slice(nl + 1)
        }
      }
      take(buffer)
    } else {
      ;(await res.text()).split('\n').forEach(take)
    }
  } catch {
    // Offline, timed out, stopped, or cut off: decided below from what arrived.
    broke = true
  } finally {
    clearTimeout(timer)
    o.signal?.removeEventListener('abort', stop)
  }

  if (finished) return seen ? 'answered' : 'fallback'
  if (!reached) return 'unreached'
  // A stream that ended cleanly with nothing usable in it is an error page (the site without its
  // API behind it), not a lost connection.
  return broke || seen ? 'lost' : 'fallback'
}

const isSavedTurn = (v: unknown): v is SavedTurn => {
  const s = v as { state?: unknown; answer?: Record<string, unknown> } | null
  if (!s || typeof s !== 'object') return false
  if (s.state === 'unknown' || s.state === 'pending') return true
  const a = s.answer
  return s.state === 'done' && !!a && typeof a.text === 'string' && Array.isArray(a.notes) && Array.isArray(a.go)
}

/**
 * Collects the saved answer to a message whose connection was lost, asking every `everyMs` for up
 * to `waitMs` (0: ask once). 'unknown' only after the server says so twice in a row, because the
 * message may still be on its way to it. 'pending' when the answer is still not there in time.
 */
export async function collectAnswer(o: {
  conversationId: string
  turn: string
  fetcher?: Fetcher
  waitMs?: number
  everyMs?: number
  signal?: AbortSignal
}): Promise<Collected> {
  const fetcher = o.fetcher ?? defaultFetcher
  const every = o.everyMs ?? 2000
  const until = Date.now() + (o.waitMs ?? 60_000)
  const url = `/api/ai/chat?conversationId=${encodeURIComponent(o.conversationId)}&turn=${encodeURIComponent(o.turn)}`
  let reached = false
  let unknown = 0
  let last: SavedTurn | null = null
  for (;;) {
    let now: SavedTurn | null = null
    try {
      const res = await fetcher(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: o.signal })
      reached = true
      const body: unknown = res.ok ? await res.json() : null
      if (isSavedTurn(body)) now = body
    } catch {
      // Still offline, or stopped: asked again below while there is time.
    }
    if (now) last = now
    if (now?.state === 'done') return now
    if (now?.state === 'unknown') {
      if (++unknown >= 2) return now
    } else if (now) unknown = 0
    if (o.signal?.aborted || Date.now() + every > until) return last ?? (reached ? { state: 'pending' } : { state: 'offline' })
    await new Promise((r) => setTimeout(r, every))
  }
}

/** Tells the server what the customer did with cards. True when it was saved. */
export async function postOutcomes(
  conversationId: string,
  outcomes: CardOutcome[],
  fetcher: Fetcher = defaultFetcher,
): Promise<boolean> {
  if (!outcomes.length) return true
  try {
    const res = await fetcher('/api/ai/outcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, outcomes }),
    })
    return res.ok
  } catch {
    return false
  }
}

export type AssistantStatus = {
  /** True/false once known; null when the question could not be asked at all (the first message finds out). */
  chat: boolean | null
  voice: boolean
  /** How long a call may last and whether it is a practice call, when the server said (only with voice on). */
  voiceInfo?: { seconds: number; practice: boolean }
}

/** Whether the assistant can answer this visitor right now, and whether calls are on. False when the API is not there. */
export async function fetchStatus(fetcher: Fetcher = defaultFetcher): Promise<AssistantStatus> {
  try {
    const res = await fetcher('/api/ai/status', { method: 'GET', headers: { Accept: 'application/json' } })
    if (!(res.headers.get('content-type') ?? '').includes('application/json') || !res.ok) {
      return { chat: false, voice: false }
    }
    const body = (await res.json()) as {
      chat?: { available?: unknown }
      voice?: { available?: unknown; seconds?: unknown; practice?: unknown }
    }
    const voice = body.voice?.available === true
    const info =
      voice && typeof body.voice?.seconds === 'number' && typeof body.voice?.practice === 'boolean'
        ? { seconds: body.voice.seconds, practice: body.voice.practice }
        : null
    return { chat: body.chat?.available === true, voice, ...(info ? { voiceInfo: info } : {}) }
  } catch {
    return { chat: null, voice: false }
  }
}
