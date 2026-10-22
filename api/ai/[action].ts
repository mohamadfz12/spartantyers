/**
 * The AI assistant's routes, in one function (Vercel bills a function per routable file and the
 * Hobby plan allows twelve, so every AI route lives behind this one dynamic file):
 *
 *   POST /api/ai/chat     { conversationId, message, page, turn?, outcomes? }: one message. The
 *                         answer is a stream of events, one JSON object per line
 *                         (src/lib/ai/protocol.ts), so the customer sees it as it is written.
 *                         400 for a message that cannot be read, 403 from another website, 413
 *                         for a body over 8 KB, 202 for a message already taken.
 *   GET  /api/ai/chat?conversationId=&turn=
 *                         The saved answer to one message, for a browser that lost the connection
 *                         while it was being written. Only whoever holds the chat's id can ask.
 *   POST /api/ai/outcome  { conversationId, outcomes }: what the customer did with cards (added,
 *                         sent, dismissed, failed), saved as notes on the chat.
 *   GET  /api/ai/status   { chat: { available }, voice: { available, practice, seconds } }: whether
 *                         the AI can answer this visitor right now, and whether the Call button is
 *                         offered. Kept for about 15 seconds per visitor (status-cache.ts).
 *   GET  /api/ai/voice    { available, practice, seconds }: the voice part of /status on its own.
 *   POST /api/ai/voice    Voice calls (api/_lib/ai/voice.ts). The voice itself goes straight between
 *                         the browser and OpenAI; these requests open, run and end each call. By action:
 *     { action: 'start', conversationId, page, sdp }  Opens a call in that chat. 200 { call }, or an
 *                         error with `reason` (403 off, 429 busy, already (this visitor has a call going) or a spending limit, 502 OpenAI not
 *                         answering, 503 not set up).
 *     { action: 'tool', call, name, arguments, page }  Runs one of the assistant's tools. 200 { output, events }.
 *     { action: 'line', call, role, text }  Keeps one line of what was said (practice calls only; a
 *                         real call's transcript is written by the server). 200 { ok: true }, or
 *                         { ok: true, ignored: true } for a real call.
 *     { action: 'end', call, usage, reason }  Hangs up and records the cost. 200 { ok: true }. Also
 *                         sent by navigator.sendBeacon when the page closes.
 *     { action: 'practice', call, page, messages }  The practice AI's next step (practice calls only).
 *                         410 (with `ended: true`) is a call that has ended; 403 is another website.
 *
 * Messages, outcomes and calls can cost money or write records, so they must come from this website's
 * own pages (the Origin header). The visitor is identified by a keyed hash of their network, never
 * by a stored address.
 */
import { aiDbConfigured } from '../_lib/ai/db.js'
import { maybePurgeAi } from '../_lib/ai/retention.js'
import { runTurn, recordOutcomes, savedTurn } from '../_lib/ai/engine.js'
import { cachedStatus } from '../_lib/ai/status-cache.js'
import { aiAvailable, hashIp, rateLimited } from '../_lib/ai/spend.js'
import { callLine, callTool, endCall, practiceTurn, startCall, sweepCalls, voiceStatus } from '../_lib/ai/voice.js'
import { clientIp, fail, isAllowedOrigin, methodGuard, ok, readBody, applyCors, safeMessage } from '../_lib/http.js'
import type { ApiRequest, ApiResponse } from '../_lib/http.js'
import {
  cleanPage,
  isCardId,
  isConversationId,
  isOutcomeKind,
  isTurnId,
  MESSAGE_MAX,
  type CardOutcome,
  type ChatEvent,
} from '../../src/lib/ai/protocol.js'
import { cleanUsage, isCallId } from '../../src/lib/ai/voice.js'

const MAX_BODY_BYTES = 8_000
/** A WebRTC offer is a few kilobytes; a practice conversation up to about 24 KB. */
const MAX_VOICE_BODY_BYTES = 40_000

/** Why the browser ended a call, in a word, for the record. */
const END_REASONS = new Set(['user', 'time', 'lost', 'error', 'page', 'mic'])

/** How often one connection may ask for saved answers: a browser asks about every two seconds, for a minute at most. */
const COLLECT = { per: 200, seconds: 600 }

/** How often one connection may report card outcomes. */
const OUTCOME = { per: 60, seconds: 600 }

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** Vercel's `waitUntil`, when this runs there, so the platform keeps the function alive for background work. */
function vercelWaitUntil(): ((work: Promise<unknown>) => void) | undefined {
  const context = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
    | { get?: () => { waitUntil?: (work: Promise<unknown>) => void } | undefined }
    | undefined
  return context?.get?.()?.waitUntil
}

/** The visitor's hashed network. Empty when the address is unknown or the deployment has no key (the AI is then off anyway). */
function visitorOf(req: ApiRequest): string {
  try {
    return hashIp(clientIp(req))
  } catch {
    return ''
  }
}

/** A JSON body no larger than `max`, as an object, or an error to send. */
function readObject(req: ApiRequest, max = MAX_BODY_BYTES): { body: Record<string, unknown> } | { status: number; error: string } {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > max) return { status: 413, error: 'That request is too large.' }
  const body = readBody<Record<string, unknown>>(req)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, error: 'That request could not be read.' }
  if (JSON.stringify(body).length > max) return { status: 413, error: 'That request is too large.' }
  return { body }
}

/** The card outcomes in a request, checked; anything that is not an outcome is dropped. */
function readOutcomes(value: unknown): CardOutcome[] {
  if (!Array.isArray(value)) return []
  const out: CardOutcome[] = []
  for (const o of value.slice(0, 6)) {
    if (!o || typeof o !== 'object') continue
    const { cardId, outcome, detail } = o as Record<string, unknown>
    if (!isCardId(cardId) || !isOutcomeKind(outcome)) continue
    out.push({ cardId, outcome, ...(typeof detail === 'string' ? { detail: detail.slice(0, 200) } : {}) })
  }
  return out
}

async function collect(req: ApiRequest, res: ApiResponse) {
  const conversationId = one(req.query?.conversationId)
  const turn = one(req.query?.turn)
  if (!isConversationId(conversationId) || !isTurnId(turn)) return fail(res, 400, 'Missing chat or message id.')
  res.setHeader('Cache-Control', 'no-store')
  if (!aiDbConfigured()) return ok(res, { state: 'unknown' })
  if (await rateLimited(`aicollect:${visitorOf(req) || 'unknown'}`, COLLECT.per, COLLECT.seconds)) {
    return fail(res, 429, 'Too many requests. Please wait a moment.')
  }
  return ok(res, await savedTurn(conversationId, turn))
}

async function chat(req: ApiRequest, res: ApiResponse) {
  // Every message can cost money: only this website's own pages may use it.
  if (!isAllowedOrigin(req)) return fail(res, 403, 'This request is not allowed from here.')
  const read = readObject(req)
  if ('error' in read) return fail(res, read.status, read.error)
  const { body } = read
  if (!isConversationId(body.conversationId)) return fail(res, 400, 'Missing chat id.')
  if (body.turn !== undefined && !isTurnId(body.turn)) return fail(res, 400, 'Bad message id.')
  const message = typeof body.message === 'string' ? body.message.split('\0').join('').trim() : ''
  if (!message) return fail(res, 400, 'Type a message first.')
  if (message.length > MESSAGE_MAX) return fail(res, 400, `Keep it under ${MESSAGE_MAX} characters.`)
  if (!res.write) return fail(res, 501, 'Streaming is not available here.')

  const input = {
    conversationId: body.conversationId,
    message,
    page: cleanPage(body.page),
    ipHash: visitorOf(req),
    outcomes: readOutcomes(body.outcomes),
    ...(isTurnId(body.turn) ? { turn: body.turn } : {}),
  }

  // The same message sent again (its browser could not tell whether it arrived: a phone reloading
  // the page as it went out, for example) is answered once. 202: already taken, so the browser
  // collects that answer.
  try {
    if (input.turn && (await savedTurn(input.conversationId, input.turn)).state !== 'unknown') {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(202).json({ already: true })
    }
  } catch {
    // No database: the engine answers with a "not configured" fallback below.
  }

  // There is no cron on this site: the clean-up runs from here at most once a day, in the background.
  // It also ends any call left running (the sweep), so a call whose timer died is not left open for long.
  const waitUntil = vercelWaitUntil()
  void maybePurgeAi(waitUntil).then((ran) => {
    if (!ran) return
    const sweep = sweepCalls().catch((error: unknown) => console.error('[ai] call sweep failed:', safeMessage(error)))
    waitUntil?.(sweep)
  })

  res.status(200)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  // The answer is finished and saved even when the customer leaves halfway (a phone switching apps
  // drops the connection): their browser collects it with GET when they come back, staff's copy
  // has no gaps, and its cost is recorded. Writes after the customer left are dropped, never thrown.
  let open = true
  res.on?.('close', () => {
    open = false
  })
  const emit = (e: ChatEvent) => {
    if (!open || res.writableEnded || res.destroyed) return
    try {
      res.write!(`${JSON.stringify(e)}\n`)
    } catch {
      open = false
    }
  }
  await runTurn(input, emit)
  if (open && !res.writableEnded) res.end()
}

async function outcome(req: ApiRequest, res: ApiResponse) {
  if (!isAllowedOrigin(req)) return fail(res, 403, 'This request is not allowed from here.')
  const read = readObject(req)
  if ('error' in read) return fail(res, read.status, read.error)
  const { body } = read
  if (!isConversationId(body.conversationId)) return fail(res, 400, 'Missing chat id.')
  const outcomes = readOutcomes(body.outcomes)
  if (!outcomes.length) return fail(res, 400, 'Nothing to save.')
  res.setHeader('Cache-Control', 'no-store')
  if (!aiDbConfigured()) return ok(res, { ok: true, saved: 0 })
  if (await rateLimited(`aioutcome:${visitorOf(req) || 'unknown'}`, OUTCOME.per, OUTCOME.seconds)) {
    return fail(res, 429, 'Too many requests. Please wait a moment.')
  }
  return ok(res, { ok: true, saved: await recordOutcomes(body.conversationId, outcomes) })
}

async function status(req: ApiRequest, res: ApiResponse) {
  const visitor = visitorOf(req)
  res.setHeader('Cache-Control', 'no-store')
  // Kept for about 15 seconds per visitor (status-cache.ts): every page of the site asks.
  return ok(
    res,
    await cachedStatus(visitor, async () => ({ chat: { available: (await aiAvailable(visitor)).ok }, voice: await voiceStatus(visitor) })),
  )
}

async function voiceGet(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  return ok(res, await voiceStatus(visitorOf(req)))
}

/** Sends a failed voice answer: the reason, and `ended` when the call is over. */
const voiceFail = (res: ApiResponse, out: { status: number; error: string; reason?: string }) =>
  res.status(out.status).json({ error: out.error, ...(out.reason ? { reason: out.reason } : {}), ...(out.status === 410 ? { ended: true } : {}) })

async function voice(req: ApiRequest, res: ApiResponse) {
  // Every call costs money: only this website's own pages may start or run one.
  if (!isAllowedOrigin(req)) return fail(res, 403, 'This request is not allowed from here.')
  const read = readObject(req, MAX_VOICE_BODY_BYTES)
  if ('error' in read) return fail(res, read.status, read.error)
  const { body } = read
  res.setHeader('Cache-Control', 'no-store')
  switch (body.action) {
    case 'start': {
      if (!isConversationId(body.conversationId)) return fail(res, 400, 'Missing chat id.')
      const out = await startCall({
        conversationId: body.conversationId,
        page: cleanPage(body.page),
        ipHash: visitorOf(req),
        sdp: typeof body.sdp === 'string' ? body.sdp.slice(0, 20_000) : '',
      })
      return out.ok ? ok(res, { call: out.call }) : voiceFail(res, out)
    }
    case 'tool': {
      const out = await callTool({ callId: body.call, name: body.name, arguments: body.arguments, page: typeof body.page === 'string' ? cleanPage(body.page) : '' })
      return out.ok ? ok(res, out.answer) : voiceFail(res, out)
    }
    case 'line': {
      const out = await callLine({ callId: body.call, role: body.role, text: body.text })
      return out.ok ? ok(res, out.ignored ? { ok: true, ignored: true } : { ok: true }) : voiceFail(res, out)
    }
    case 'end': {
      if (!isCallId(body.call)) return fail(res, 400, 'Missing the call id.')
      const reason = typeof body.reason === 'string' && END_REASONS.has(body.reason) ? body.reason : 'user'
      await endCall(body.call, reason, cleanUsage(body.usage))
      return ok(res, { ok: true })
    }
    case 'practice': {
      const out = await practiceTurn({ callId: body.call, page: body.page, messages: body.messages })
      return out.ok ? ok(res, out.answer) : voiceFail(res, out)
    }
    default:
      return fail(res, 400, 'Unknown action.')
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  applyCors(req, res)
  try {
    const raw = req.query?.action
    const action = Array.isArray(raw) ? raw[0] : raw
    switch (action) {
      case 'chat':
        if (!methodGuard(req, res, ['GET', 'POST'])) return
        return (req.method ?? 'GET').toUpperCase() === 'GET' ? await collect(req, res) : await chat(req, res)
      case 'outcome':
        if (!methodGuard(req, res, ['POST'])) return
        return await outcome(req, res)
      case 'status':
        if (!methodGuard(req, res, ['GET'])) return
        return await status(req, res)
      case 'voice':
        if (!methodGuard(req, res, ['GET', 'POST'])) return
        return (req.method ?? 'GET').toUpperCase() === 'GET' ? await voiceGet(req, res) : await voice(req, res)
      default:
        return fail(res, 404, 'Unknown endpoint.')
    }
  } catch (error) {
    // Once the stream has started the status is sent; there is nothing more to say but to end it.
    console.error('[api/ai] error:', safeMessage(error))
    if (res.headersSent) {
      if (!res.writableEnded) res.end()
      return
    }
    fail(res, 500, 'Something went wrong on our end. Please try again.')
  }
}
