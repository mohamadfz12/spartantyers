/**
 * Voice calls with the assistant: the customer taps Call in the chat and talks; the assistant talks
 * back. The voice is OpenAI's Realtime API, connected straight from the browser (voice-openai.ts).
 * This server stays in charge of everything else (api/ai/[action].ts calls these):
 *
 *   start  checks the switches and limits, reserves the call's worst-case cost, opens the call with
 *          OpenAI using the browser's offer (the browser never sees a key), and starts a timer that
 *          hangs up when the call's time is up.
 *   tool   runs the assistant's tools for the call: the same tools and rules as the chat (tools.ts).
 *          The model can never order: the customer taps the card.
 *   line   keeps what was said, in the chat's own transcript, so staff read calls and chats alike.
 *          A real call's lines are written by the server's own line to OpenAI (keepServerLine); the
 *          browser's lines are kept for practice calls only.
 *   end    hangs up and records what the call really cost.
 *
 * Money is integer micro-US-dollars, as in spend.ts, and every money change takes the same spend
 * lock as the chat's reservations (SPEND_LOCK), so chat messages and calls count each other.
 *
 * The database cannot hold a transaction open between round trips (db.ts), so each money change is
 * one short transaction of fixed statements that decide inside SQL, the way spend.ts `reserve` does.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { getDeadline, waitUntil } from '@vercel/functions'
import { isEmergency } from '../../../src/lib/ai/emergency.js'
import { cleanPage, type Card, type ChatEvent } from '../../../src/lib/ai/protocol.js'
import {
  cleanUsage,
  isCallId,
  LINE_MAX,
  plainDashes,
  type PracticeAnswer,
  type PracticeMessage,
  type StartedCall,
  type ToolAnswer,
  type VoiceRefusal,
  type VoiceStatus,
  type VoiceUsage,
} from '../../../src/lib/ai/voice.js'
import { safeMessage } from '../http.js'
import { monthStart, todaySydney } from './dates.js'
import { aiDbConfigured, AiDbUnavailable, getAiDb } from './db.js'
import { aiConfig, complete, isPracticeAi, type Message } from './gateway.js'
import { getAiSettings, type AiSettings } from './settings.js'
import { aiAvailable, asTotals, crossed, effectiveLimits, rateLimited, settleMicros, SPEND_LOCK, toMicros, TOTALS_SQL, visitorKeyConfigured, visitorShare } from './spend.js'
import { newTurn, runTool, TOOLS, unbackedClaim, type CardClaim } from './tools.js'
import { metaOf } from './util.js'
import {
  callSeconds,
  costOfCall,
  hangUp,
  openCall,
  openMonitor,
  sessionExpect,
  VOICE,
  voiceConfig,
  voiceInstructions,
  worstPerMinute,
  type Budget,
  type Expect,
  type Monitor,
  type RealVoiceConfig,
  type VoiceConfig,
} from './voice-openai.js'

/**
 * The two things this file needs from the host that a test must be able to replace: how long the
 * function may still run (Vercel only), and keeping it alive after the answer is sent.
 */
export const runtime = {
  /** The time (ms since 1970) the function must finish by, or undefined when there is no deadline (locally). */
  deadline: (): number | undefined => getDeadline()?.getTime(),
  waitUntil: (work: Promise<unknown>): void => waitUntil(work),
}

const MICROS = 1_000_000
const INT_MAX = 2_000_000_000

/* ----------------------------------------------------------------- database */

type CallRow = {
  id: string
  conversation_id: string
  openai_id: string
  ip_hash: string
  practice: boolean
  usage_id: string | null
  reserve_micros: number | string
  status: 'opening' | 'live' | 'ended'
  tools: number | string
  lines: number | string
  opened: boolean
  pending: unknown
  monitored: boolean
  measured: unknown
  reported: unknown
  settled: boolean
  cost_micros: number | string
  started_ms: number | string
  ends_ms: number | string
  ended_ms: number | string | null
  reserved_ms: number | string | null
  measured_ms: number | string | null
}

const ms = (column: string) => `(extract(epoch from ${column}) * 1000)::double precision`
/** Every column of a call, with its times as milliseconds (the two database drivers give dates in different shapes). */
const CALL = `id, conversation_id, openai_id, ip_hash, practice, usage_id, reserve_micros, status, tools, lines, opened, pending, monitored, measured, reported, settled, cost_micros,
   ${ms('started_at')} AS started_ms, ${ms('ends_at')} AS ends_ms, ${ms('ended_at')} AS ended_ms, ${ms('reserved_until')} AS reserved_ms, ${ms('measured_until')} AS measured_ms`

const run = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await getAiDb()).query<T>(text, params)
const calls = (text: string, params: unknown[] = []) => run<CallRow>(text, params)

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const at = (v: number | string | null) => (v == null ? 0 : Number(v))

/* ------------------------------------------------------------------- money */

/** The worst case, in micro-dollars, set aside for this many seconds of a call (nothing for a practice call). */
export const reserveFor = (cfg: VoiceConfig, seconds: number) => (cfg.practice ? 0 : Math.ceil((worstPerMinute(cfg.model, cfg.transcribe) * seconds) / 60))

/** What a call sets aside when it starts: its first few minutes (VOICE.chunkSeconds), topped up as it goes on. */
export const firstReserve = (cfg: VoiceConfig, seconds = callSeconds()) => reserveFor(cfg, Math.min(seconds, VOICE.chunkSeconds))

/** The smallest daily limit, in dollars, that leaves one visitor (a fifth of it) room to start a call. */
export const minDailyUsd = (cfg: VoiceConfig, seconds = callSeconds()) => Math.ceil((firstReserve(cfg, seconds) * 5) / 10_000) / 100

/**
 * The time (ms since 1970) this function must finish by, or undefined when there is no limit (a
 * computer). On Vercel, where @vercel/functions sometimes has no deadline to give, the function is
 * taken to have AI_FUNCTION_MAX_SECONDS (default 300, the maxDuration in vercel.json) from `from`,
 * so a watcher never believes it can run for ever.
 */
let warnedNoDeadline = false
/** The time limit assumed for the AI function on Vercel when the host gives none: AI_FUNCTION_MAX_SECONDS, default 300 (the maxDuration in vercel.json). */
export function assumedFunctionSeconds(): number {
  const n = Math.floor(Number(process.env.AI_FUNCTION_MAX_SECONDS))
  return Number.isFinite(n) && n >= 1 ? n : 300
}
export function functionDeadline(from = Date.now()): number | undefined {
  const real = runtime.deadline()
  if (real) return real
  if (!process.env.VERCEL) return undefined
  if (!warnedNoDeadline) {
    warnedNoDeadline = true
    console.warn('voice: Vercel gave no deadline for this function; assuming AI_FUNCTION_MAX_SECONDS (default 300) from the start of the call')
  }
  return from + assumedFunctionSeconds() * 1000
}

/**
 * How long this call may last: the configured length, made shorter if needed so that this function,
 * which hangs the call up, outlives it, with room for OpenAI to open it and for the browser's grace.
 * Not on Vercel (no deadline): as configured.
 */
let warnedShort = false
const spareSeconds = () => VOICE.openSeconds + VOICE.graceSeconds + 5
export function fitSeconds(configured: number, quiet = false) {
  const deadline = functionDeadline()
  if (!deadline) return configured
  const room = Math.floor((deadline - Date.now()) / 1000 - spareSeconds())
  if (room >= configured) return configured
  if (!quiet && !warnedShort) {
    warnedShort = true
    console.warn(`voice: calls are shortened to about ${Math.max(VOICE.minSeconds, room)} s to fit the function's time limit (give api/ai/[action].ts maxDuration 800 on Vercel Pro for 10-minute calls)`)
  }
  return Math.max(VOICE.minSeconds, room)
}

/**
 * The call length this deployment gives, worked out where there is no AI request to ask (the admin
 * panel's status runs in another function): the configured length, fitted to the AI function's time
 * limit (assumedFunctionSeconds) on Vercel, and as configured on a computer. The same sum as fitSeconds.
 */
export function plannedSeconds(configured: number): number {
  if (!process.env.VERCEL) return configured
  const room = assumedFunctionSeconds() - spareSeconds()
  return room >= configured ? configured : Math.max(VOICE.minSeconds, room)
}

/* ------------------------------------------------------------------- status */

/** Practice calls are answered by the practice AI on this computer: they need it, and never a real gateway. */
const practiceReady = () => isPracticeAi(aiConfig())

/**
 * Whether the Call button is shown: calls are set up and switched on (the voice settings, the
 * `enabled` and `voiceEnabled` settings, AI_DISABLED), the limits have room, and the daily limit
 * leaves a visitor room for a first stretch of call (below about US$2 a day none could start). The
 * chat gateway does not matter: voice has its own settings. The per-connection call limits are
 * checked when a call starts, where the customer is told why.
 */
export async function voiceStatus(ipHash = ''): Promise<VoiceStatus> {
  const cfg = voiceConfig()
  const seconds = callSeconds()
  if (!cfg) return { available: false, practice: false, seconds }
  const fitted = fitSeconds(seconds, true)
  try {
    const settings = await getAiSettings()
    // Practice calls cost nothing: only the switches and the practice AI matter.
    if (cfg.practice) return { available: settings.enabled && settings.voiceEnabled && practiceReady(), practice: true, seconds: fitted }
    const ready = await aiAvailable(ipHash, 'voice')
    const room = Math.round(visitorShare(effectiveLimits(settings).dailyUsd) * MICROS) >= firstReserve(cfg, fitted)
    return { available: ready.ok && room, practice: false, seconds: fitted }
  } catch (err) {
    if (err instanceof AiDbUnavailable) return { available: false, practice: cfg.practice, seconds: fitted }
    throw err
  }
}

/* ----------------------------------------------------------------- the calls */

type Fail = { ok: false; status: number; reason: VoiceRefusal; error: string }
const fail = (status: number, reason: VoiceRefusal, error: string): Fail => ({ ok: false, status, reason, error })

const newCallId = () => `v${randomBytes(16).toString('hex')}`

const live = (row: { status: string } | undefined) => !!row && row.status === 'live'

const zeroTokens = { promptTokens: 0, cachedTokens: 0, completionTokens: 0 }

/** Calls that are opening or live now, for the liveAtOnce cap. */
const LIVE_COUNT = `SELECT COUNT(*)::int AS n FROM ai_calls WHERE status IN ('opening', 'live')`

/** Real calls of one visitor (the hashed network, $3 in claim) that are opening or live now: a visitor has one at a time. */
const VISITOR_LIVE = `SELECT 1 FROM ai_calls WHERE ip_hash = $3::text AND NOT practice AND status IN ('opening', 'live')`

/**
 * Claims a slot and sets the money aside together, in one short transaction under the spend lock, so
 * calls starting at the same moment (and chat messages) count each other. Three statements after the
 * lock: the usage row (a real call only), the call itself, and the totals that say why it was refused.
 * Each insert decides in SQL: the call goes in only if fewer than VOICE.liveAtOnce are live, the visitor
 * has no other real call going (when their address is known) and, for a real call, its usage row went in
 * (it keeps every limit, as spend.ts `reserve` does).
 */
async function claim(o: { id: string; conversationId: string; ip: string; practice: boolean; model: string; reserve: number; seconds: number; day: string; settings: AiSettings }) {
  const { dailyUsd, monthlyUsd } = effectiveLimits(o.settings)
  const usageId = o.practice ? null : randomUUID()
  const db = await getAiDb()
  const [, usage, inserted, after] = await db.transaction([
    { text: SPEND_LOCK },
    {
      text: `WITH t AS (${TOTALS_SQL}), l AS (${LIVE_COUNT})
             INSERT INTO ai_usage (id, day, purpose, model, ip_hash, cost_micros, status)
             SELECT $10::uuid, $1::text, 'voice', $4::text, $3::text, $5::int, 'reserved' FROM t, l
              WHERE NOT $11::boolean
                AND l.n < $9::int
                AND ($3::text = '' OR NOT EXISTS (${VISITOR_LIVE}))
                AND t.today + $5::bigint <= $6::bigint
                AND t.month + $5::bigint <= $7::bigint
                AND ($3::text = '' OR t.visitor + $5::bigint <= $8::bigint)
             RETURNING id`,
      params: [o.day, monthStart(o.day), o.ip, o.model, o.reserve, toMicros(dailyUsd), toMicros(monthlyUsd), toMicros(visitorShare(dailyUsd)), VOICE.liveAtOnce, usageId, o.practice],
    },
    {
      text: `INSERT INTO ai_calls (id, conversation_id, ip_hash, practice, usage_id, reserve_micros, status, ends_at)
             SELECT $1::text, $2::text, $3::text, $4::boolean, $5::uuid, $6::int, 'opening', now() + make_interval(secs => $7::int)
              WHERE (SELECT n FROM (${LIVE_COUNT}) counted) < $8::int
                AND ($4::boolean OR $3::text = '' OR NOT EXISTS (${VISITOR_LIVE}))
                AND ($4::boolean OR EXISTS (SELECT 1 FROM ai_usage WHERE id = $5::uuid))
             RETURNING id`,
      params: [o.id, o.conversationId, o.ip, o.practice, usageId, o.reserve, o.seconds, VOICE.liveAtOnce],
    },
    {
      text: `WITH t AS (${TOTALS_SQL}) SELECT t.today, t.month, t.visitor, (SELECT n FROM (${LIVE_COUNT}) counted) AS live,
                    (SELECT COUNT(*)::int FROM ai_calls WHERE ip_hash = $3::text AND $3::text <> '' AND NOT practice AND status IN ('opening', 'live')) AS mine FROM t`,
      params: [o.day, monthStart(o.day), o.ip],
    },
  ])
  if (inserted.length) return { ok: true as const, usageId }
  // Refused. A usage row that went in without its call (it cannot, both decide under the lock) is let go.
  if (usageId && usage.length) await settleMicros(usageId, 0, zeroTokens)
  if (!o.practice && Number((after[0] as { mine?: unknown } | undefined)?.mine ?? 0) > 0) return { ok: false as const, reason: 'already' as const }
  if (Number((after[0] as { live?: unknown } | undefined)?.live ?? 0) >= VOICE.liveAtOnce) return { ok: false as const, reason: 'busy' as const }
  return { ok: false as const, reason: crossed(asTotals(after[0]), o.reserve, o.settings, o.ip) ?? ('daily' as const) }
}

/**
 * Starts a call in a chat. `sdp` is the browser's WebRTC offer (not needed for practice calls).
 * Refuses when calls are off or not set up, when this connection has started too many, when too
 * many are live, or when the first stretch of the call would cross a spending limit.
 */
export async function startCall(input: { conversationId: string; page: string; ipHash: string; sdp: string }): Promise<{ ok: true; call: StartedCall } | Fail> {
  const cfg = voiceConfig()
  if (!cfg) return fail(503, 'not_configured', 'Voice calls are not set up on this site.')
  if (cfg.practice && !practiceReady()) return fail(503, 'not_configured', 'Practice calls need the practice AI (AI_GATEWAY_URL=http://localhost:3410).')
  if (!aiDbConfigured() || !visitorKeyConfigured()) return fail(503, 'not_configured', 'Voice calls are not set up on this site.')
  let settings: AiSettings
  try {
    settings = await getAiSettings()
  } catch (err) {
    if (err instanceof AiDbUnavailable) return fail(503, 'not_configured', 'Voice calls are not set up on this site.')
    throw err
  }
  if (!settings.enabled || !settings.voiceEnabled) return fail(403, 'off', 'Voice calls are switched off.')
  if (!cfg.practice && !/^v=0\r?\n/.test(input.sdp)) return fail(400, 'error', 'Missing the connection offer.')
  const ip = input.ipHash
  // Practice calls cost nothing and only run on a computer: they are not counted, so testing is not held up.
  if (!cfg.practice && ip && ((await rateLimited(`voice:${ip}`, VOICE.perTenMinutes, 600)) || (await rateLimited(`voiceday:${ip}`, VOICE.perDay, 86400)))) {
    return fail(429, 'busy', 'Too many calls from this connection. Please try again later.')
  }
  await sweepCalls()
  // A call still going in this chat (the page was reloaded mid-call, say) ends when a new one starts.
  for (const old of await run<{ id: string }>(`SELECT id FROM ai_calls WHERE conversation_id = $1::text AND status IN ('opening', 'live')`, [input.conversationId])) {
    await endCall(old.id, 'replaced', null)
  }

  const seconds = fitSeconds(callSeconds())
  const reserve = firstReserve(cfg, seconds)
  const day = todaySydney()
  // The chat exists from here (the call belongs to it), without counting the call as a message.
  await run(
    `INSERT INTO ai_conversations (id, ip_hash) VALUES ($1::text, $2::text)
     ON CONFLICT (id) DO UPDATE SET last_at = now()`,
    [input.conversationId, ip],
  )
  const id = newCallId()
  // The call is 'opening' until OpenAI has opened it.
  const claimed = await claim({ id, conversationId: input.conversationId, ip, practice: cfg.practice, model: cfg.model, reserve, seconds, day, settings })
  if (!claimed.ok) {
    if (claimed.reason === 'already') return fail(429, 'already', 'You already have a call going. End it first, then start a new one.')
    return fail(429, claimed.reason, claimed.reason === 'busy' || claimed.reason === 'visitor' ? 'Calls are busy right now. Please try again in a minute.' : 'Voice calls are not available right now.')
  }
  const usageId = claimed.usageId

  /** The call is open at OpenAI (or, in practice, needs nothing more): live from now, for its length. */
  const goLive = async (openaiId: string, firstSeconds: number) => {
    const [row] = await run<{ ends_ms: number | string; reserved_ms: number | string }>(
      `UPDATE ai_calls SET status = 'live', openai_id = $2::text, started_at = now(), ends_at = now() + make_interval(secs => $3::int),
              reserved_until = now() + make_interval(secs => LEAST($3::int, $4::int))
        WHERE id = $1::text AND status = 'opening' RETURNING ${ms('ends_at')} AS ends_ms, ${ms('reserved_until')} AS reserved_ms`,
      [id, openaiId, seconds, firstSeconds],
    )
    return row
  }

  if (cfg.practice) {
    const row = await goLive('', seconds)
    if (!row) return fail(409, 'error', 'This call was replaced by a newer one.')
    const endsAt = new Date(Number(row.ends_ms))
    watch(id, endsAt, null)
    return { ok: true, call: { id, practice: true, seconds, endsAt: endsAt.toISOString() } }
  }

  const instructions = await voiceInstructions(day, input.page, input.conversationId, seconds)
  let opened: { id: string; sdp: string }
  try {
    opened = await openCall(cfg, input.sdp, instructions)
  } catch (err) {
    console.warn('voice: could not open the call', safeMessage(err))
    // Nothing was connected, so nothing is charged (OpenAI bills a call once the browser joins it).
    await run(`UPDATE ai_calls SET status = 'ended', ended_at = now(), end_reason = 'failed', settled = true WHERE id = $1::text`, [id])
    if (usageId) await settleMicros(usageId, 0, zeroTokens)
    return fail(502, 'unavailable', "The assistant's voice is not answering right now.")
  }
  const row = await goLive(opened.id, VOICE.chunkSeconds)
  if (!row) {
    // Ended while OpenAI was opening it (a newer call in the same chat): the browser never joins it.
    await hangUp(opened.id)
    return fail(409, 'error', 'This call was replaced by a newer one.')
  }
  // The call's time starts now that it is open, so a slow open does not eat into it.
  const endsAt = new Date(Number(row.ends_ms))
  watch(id, endsAt, { openaiId: opened.id, cfg, budget: { reserve, until: new Date(Number(row.reserved_ms)) }, expect: sessionExpect(instructions) })
  return { ok: true, call: { id, sdp: opened.sdp, practice: false, seconds, endsAt: endsAt.toISOString() } }
}

/**
 * Ends a call: hangs up at OpenAI and, unless the server's own line to OpenAI is still collecting
 * its last numbers (it settles the call itself when it closes), records what the call cost
 * (settleCall). `usage` is the browser's own count, kept only as a lower bound. The call's real length
 * is stored with it (`seconds`: from when it went live to now, counted no further than its time plus
 * the grace, so a call swept up late is not lengthened). Ending twice is fine.
 */
export async function endCall(id: string, reason: string, usage: VoiceUsage | null) {
  const [row] = await calls(
    `UPDATE ai_calls SET status = 'ended', ended_at = now(), end_reason = $2::text, reported = COALESCE($3::jsonb, reported),
            seconds = CASE WHEN status = 'live' THEN GREATEST(0, LEAST(extract(epoch FROM now() - started_at), extract(epoch FROM ends_at - started_at) + $4::int))::int ELSE 0 END
      WHERE id = $1::text AND status IN ('opening', 'live') RETURNING ${CALL}`,
    [id, reason.slice(0, 40), usage ? JSON.stringify(usage) : null, VOICE.graceSeconds],
  )
  if (!row) return { ended: false }
  if (row.openai_id) await hangUp(row.openai_id)
  if (!row.monitored) await settleCall(id)
  return { ended: true }
}

/**
 * Records what an ended call really cost, once, counting no further than the call's own time. With
 * the server's own measurements (the normal case): what OpenAI reported for every answer, plus the
 * worst case for any stretch the server could not watch. Without them (the server's line never
 * connected): the worst case for how long the call lasted. Either way the browser's count can raise
 * it, up to the most the call could cost, but never lower it. A call never opened at OpenAI costs nothing.
 */
export async function settleCall(id: string) {
  const [row] = await calls(`UPDATE ai_calls SET settled = true WHERE id = $1::text AND status = 'ended' AND NOT settled RETURNING ${CALL}`, [id])
  if (!row || row.usage_id == null) return null
  // Never opened at OpenAI (it failed, or was replaced while opening): nothing was connected, nothing to pay.
  if (!row.openai_id) {
    await settleMicros(row.usage_id, 0, zeroTokens)
    return 0
  }
  const cfg = voiceConfig()
  const model = cfg && !cfg.practice ? cfg.model : ''
  const transcribe = cfg && !cfg.practice ? cfg.transcribe : ''
  const started = at(row.started_ms)
  // A call is counted only up to its time: the timer hangs it up then, or the sweep soon after. A
  // call ended late (nobody was left to end it on time) is not charged for hours it was not used; if
  // a changed page kept one open meanwhile, the OpenAI project's own budget is the backstop.
  const lastMoment = at(row.ends_ms) + VOICE.graceSeconds * 1000
  const ended = Math.min(row.ended_ms == null ? Date.now() : at(row.ended_ms), lastMoment)
  const minutes = Math.max(0, (ended - started) / 60_000)
  const measured = row.measured ? cleanUsage(metaOf(row.measured)) : null
  const reported = row.reported ? cleanUsage(metaOf(row.reported)) : null
  const worstPerMin = worstPerMinute(model, transcribe)
  // The most the call could have cost: what was set aside, or more for a call that ran its full time.
  const most = Math.max(Number(row.reserve_micros), worstPerMin * minutes)
  const browser = reported ? Math.min(costOfCall(model, transcribe, reported, minutes), most) : 0
  let cost: number
  if (measured) {
    const until = Math.min(row.measured_ms == null ? started : at(row.measured_ms), ended)
    // Time after the server's line closed (the function ran out of time, say) is counted at the worst case.
    const unwatched = Math.min(minutes, Math.max(0, (ended - until) / 60_000 - 0.1))
    // Each minute counted once: measured (with its words written down) while watched, at the worst case after.
    const own = costOfCall(model, transcribe, measured, minutes - unwatched) + worstPerMin * unwatched
    if (minutes > 1 && measured.audioIn + measured.textIn + measured.audioOut + measured.textOut === 0) {
      console.warn(`voice: call ${id} lasted ${minutes.toFixed(1)} min and the server line measured nothing`)
    }
    // The browser's count can only raise it (if the server's line missed something), never lower it.
    cost = Math.max(own, browser)
  } else {
    // Unmeasured: the worst case for how long the call lasted, or the browser's count if higher,
    // never more than the call could cost (a made-up count must not use up everyone's daily limit).
    cost = Math.max(worstPerMin * minutes, browser)
  }
  cost = Math.min(INT_MAX, Math.ceil(cost))
  const u = measured ?? reported
  const tokens = u ? { promptTokens: u.audioIn + u.textIn, cachedTokens: u.cachedAudio + u.cachedText, completionTokens: u.audioOut + u.textOut } : zeroTokens
  await settleMicros(row.usage_id, cost, tokens)
  await run(`UPDATE ai_calls SET cost_micros = $2::int WHERE id = $1::text`, [id, cost])
  return cost
}

/**
 * The backstop when a timer did not run (there is no cron on this site): ends every call past its
 * time (plus a grace for the browser), every call whose money set aside ran out (whether or not it is
 * marked as watched: a watcher that died with its function never clears that mark, and a live one
 * tops the money up 45 s before it runs out, so the 15 s grace never races it), every call stuck
 * opening, every live call once voice is switched off, and settles ended calls whose server line went away without settling them. Runs when a
 * call starts, on every tool use, and from the chat's daily clean-up.
 */
export async function sweepCalls() {
  const overdue = await run<{ id: string; status: string }>(
    `SELECT id, status FROM ai_calls
      WHERE (status = 'live' AND ends_at < now() - make_interval(secs => $1::int))
         OR (status = 'live' AND reserved_until < now() - make_interval(secs => $1::int))
         OR (status = 'opening' AND started_at < now() - interval '1 minute')`,
    [VOICE.graceSeconds],
  )
  for (const r of overdue) await endCall(r.id, r.status === 'opening' ? 'failed' : 'time', null)
  // Voice (or the whole assistant, or AI_DISABLED) switched off: no call goes on. A call's own timer notices within
  // one poll and says goodbye first; this is the backstop for a call with no timer running.
  let off = 0
  const settings = await getAiSettings()
  if (!settings.enabled || !settings.voiceEnabled) {
    for (const r of await run<{ id: string }>(`SELECT id FROM ai_calls WHERE status = 'live'`)) off += (await endCall(r.id, 'off', null)).ended ? 1 : 0
  }
  for (const r of await run<{ id: string }>(`SELECT id FROM ai_calls WHERE status = 'ended' AND NOT settled AND ended_at < now() - interval '2 minutes'`)) {
    await settleCall(r.id)
  }
  return overdue.length + off
}

const sleep = (time: number) => new Promise((r) => setTimeout(r, time))

/** What the website tells the assistant when the server ends a call early (no more money could be set aside). */
export const ENDING_NOTE = 'The call ends in a few seconds. Say goodbye now in one short sentence, and say they can keep typing in the chat or call the sales team.'

/** The goodbye cue for a call ending early: the same words, with the reason when it helps the assistant. Always holds "Say goodbye now", which the call screen takes as a planned end. */
export const endingNote = (reason: string) =>
  reason === 'idle'
    ? 'No one has spoken for a while, so the call ends in a few seconds. Say goodbye now in one short sentence, and say they can keep typing in the chat or call the sales team.'
    : ENDING_NOTE

/**
 * Sets aside the next few seconds of a live call, under the spending lock and against the same
 * daily, monthly and per-visitor limits as the start. Returns the micro-dollars added, or 0 when a
 * limit would be crossed or the call is no longer live (the call then ends when what it has runs out).
 * The checks and both updates are one statement: the usage row only grows if the call is still live
 * and the limits have room, and the call's own row only grows if the usage row did.
 */
export async function topUp(id: string, seconds: number): Promise<number> {
  const cfg = voiceConfig()
  if (!cfg || cfg.practice) return 0
  const settings = await getAiSettings()
  if (!settings.enabled || !settings.voiceEnabled) return 0
  const add = reserveFor(cfg, seconds)
  const [call] = await run<{ usage_id: string; ip_hash: string; day: string }>(
    `SELECT c.usage_id, c.ip_hash, u.day FROM ai_calls c JOIN ai_usage u ON u.id = c.usage_id WHERE c.id = $1::text AND c.status = 'live'`,
    [id],
  )
  if (!call) return 0
  const { dailyUsd, monthlyUsd } = effectiveLimits(settings)
  const db = await getAiDb()
  const [, done] = await db.transaction([
    { text: SPEND_LOCK },
    {
      text: `WITH t AS (${TOTALS_SQL}),
                  u AS (UPDATE ai_usage SET cost_micros = cost_micros + $4::int, updated_at = now()
                         WHERE id = $5::uuid
                           AND EXISTS (SELECT 1 FROM ai_calls WHERE id = $6::text AND status = 'live')
                           AND (SELECT today FROM t) + $4::bigint <= $7::bigint
                           AND (SELECT month FROM t) + $4::bigint <= $8::bigint
                           AND ($3::text = '' OR (SELECT visitor FROM t) + $4::bigint <= $9::bigint)
                     RETURNING id)
             UPDATE ai_calls SET reserve_micros = reserve_micros + $4::int, reserved_until = reserved_until + make_interval(secs => $10::int)
              WHERE id = $6::text AND status = 'live' AND EXISTS (SELECT 1 FROM u)
          RETURNING id`,
      params: [call.day, monthStart(call.day), call.ip_hash, add, call.usage_id, id, toMicros(dailyUsd), toMicros(monthlyUsd), toMicros(visitorShare(dailyUsd)), seconds],
    },
  ])
  return done.length ? add : 0
}

/**
 * Waits until a call's time is up, then ends it, unless it ended first (checked every 10 seconds,
 * and at once when the server's line closes). Along the way it sets aside the call's next few
 * minutes before what it has runs out; when a spending limit stops that, the assistant says goodbye
 * and the call ends when what it has runs out. It also ends the call early, with the same goodbye,
 * when voice (or the whole assistant) is switched off, and when the customer has said nothing for
 * VOICE.idleSeconds (the server's line hears the speech). Then it waits briefly for the line's last
 * numbers and settles the call. It runs after the answer is sent (waitUntil), for as long as the
 * function may: if that is shorter than the call, the sweep (sweepCalls) ends it later. VOICE_WATCH=0
 * turns it off (the tests run it themselves).
 *
 * One failed check (a database error, say) never stops the watching: it is logged and tried again,
 * and once the call's time is past the call is always ended (and hung up at OpenAI, whose id is
 * `openaiId`) in the `finally`, even if the database could not be reached.
 */
export async function watchCall(id: string, endsAt: Date, monitor: Monitor | null, everyMs = 10_000, budget: Budget | null = null, openaiId = '') {
  let until = endsAt.getTime() + VOICE.graceSeconds * 1000
  const deadline = functionDeadline() ?? Infinity
  let lineClosed = false
  monitor?.closed.then(() => (lineClosed = true))
  /** When the assistant is told to say goodbye, if the call was cut short. */
  let goodbyeAt = Infinity
  /** More money can still be set aside (false once a limit stopped it, or for a practice call). */
  let topping = Boolean(budget)
  /** Why the call is ending early, once it is (the call's own end reason). */
  let endReason = 'time'
  let closing = false
  let result = 'left to the sweep'
  /** The call is ending early: the assistant says goodbye now, and the call is hung up once it has had time to. */
  const endEarly = (reason: string) => {
    if (closing) return
    closing = true
    endReason = reason
    topping = false
    goodbyeAt = Infinity
    const said = !lineClosed && monitor?.say(endingNote(reason)) === true
    // With no line to say it on (a practice call, or the line closed) there is nobody to wait for.
    until = Math.min(until, Date.now() + (said ? VOICE.goodbyeSeconds * 1000 : 0))
  }
  try {
    while (Date.now() < Math.min(until, deadline - 5_000)) {
      const idleAt = monitor && !lineClosed && !closing ? monitor.heardAt() + VOICE.idleSeconds * 1000 : Infinity
      const next = Math.min(until, deadline - 5_000, goodbyeAt, idleAt, topping && budget ? budget.until.getTime() - VOICE.topUpSeconds * 1000 : Infinity)
      const wait = sleep(Math.max(0, Math.min(everyMs, next - Date.now())))
      await (monitor && !lineClosed ? Promise.race([wait, monitor.closed]) : wait)
      try {
        const [row] = await run<{ status: string }>(`SELECT status FROM ai_calls WHERE id = $1::text`, [id])
        if (!live(row)) {
          result = 'ended'
          break
        }
        if (Date.now() >= goodbyeAt) {
          goodbyeAt = Infinity
          monitor?.say(ENDING_NOTE)
        }
        // Switched off while the call is going (voice, the whole assistant, or AI_DISABLED): it ends now.
        if (!closing) {
          const settings = await getAiSettings()
          if (!settings.enabled || !settings.voiceEnabled) endEarly('off')
        }
        // Nobody has spoken for a long while: a goodbye, then the end.
        if (!closing && monitor && !lineClosed && Date.now() - monitor.heardAt() >= VOICE.idleSeconds * 1000) endEarly('idle')
        // The money set aside runs out soon and the call has longer to go: set aside the next few minutes.
        if (topping && budget && budget.until.getTime() < endsAt.getTime() && Date.now() >= budget.until.getTime() - VOICE.topUpSeconds * 1000) {
          const seconds = Math.min(VOICE.chunkSeconds, Math.ceil((endsAt.getTime() - budget.until.getTime()) / 1000))
          const added = await topUp(id, seconds)
          if (added) {
            budget.reserve += added
            budget.until = new Date(budget.until.getTime() + seconds * 1000)
          } else {
            // A limit was reached: the call ends when what it has runs out, after the assistant says goodbye.
            const end = budget.until.getTime()
            await run(`UPDATE ai_calls SET ends_at = $2::timestamptz WHERE id = $1::text`, [id, new Date(end).toISOString()])
            console.warn(`voice: call ${id} ends early: a spending limit was reached`)
            until = end
            goodbyeAt = end - 15_000
            topping = false
            if (Date.now() >= goodbyeAt) {
              goodbyeAt = Infinity
              monitor?.say(ENDING_NOTE)
            }
          }
        }
      } catch (err) {
        console.warn(`voice: a check on call ${id} failed, trying again: ${safeMessage(err)}`)
        await sleep(everyMs)
      }
    }
  } finally {
    // Whatever happened above, a call past its time is ended here (the sweep is only the backstop).
    if (result !== 'ended' && Date.now() >= until) {
      try {
        await endCall(id, endReason, null)
        result = 'hung up'
      } catch (err) {
        console.error(`voice: could not end call ${id} in the timer: ${safeMessage(err)}`)
        // The database could not be reached: at least the call itself is hung up at OpenAI.
        await hangUp(openaiId)
      }
    }
    if (monitor) {
      // Once OpenAI hangs up it closes the line, after its last answer's numbers.
      if (result !== 'left to the sweep') await Promise.race([monitor.closed, sleep(5000)])
      monitor.close()
      await monitor.closed
    }
    await settleCall(id).catch((err) => console.error(`voice: could not settle call ${id}: ${safeMessage(err)}`))
  }
  return result
}

type Watch = { openaiId: string; cfg: RealVoiceConfig; budget: Budget; expect: Expect }

function watch(id: string, endsAt: Date, w: Watch | null) {
  if (process.env.VOICE_WATCH === '0') return
  const monitor = w ? openMonitor({ id, ...w, stopCall: (reason) => endCall(id, reason, null), keepLine: (role, text) => keepServerLine(id, role, text) }) : null
  runtime.waitUntil(watchCall(id, endsAt, monitor, 10_000, w?.budget ?? null, w?.openaiId ?? '').catch((err) => console.error('voice: the call timer failed', safeMessage(err))))
}

/** A live call, or why there is none. Every call past its time, this one included, is ended first (sweepCalls). */
async function liveCall(id: unknown): Promise<{ ok: true; row: CallRow } | Fail> {
  if (!isCallId(id)) return fail(400, 'error', 'Missing the call id.')
  await sweepCalls()
  const [row] = await calls(`SELECT ${CALL} FROM ai_calls WHERE id = $1::text`, [id])
  if (!row || !live(row)) return fail(410, 'error', 'This call has ended.')
  return { ok: true, row }
}

/** What the tools of one step did, to be kept until the assistant's next words are saved. */
type Effects = { notes: string[]; went: { to: string; note: string }[]; cards: Card[]; buttons: boolean }

/**
 * Adds what the tools did to what earlier tools did since the assistant last spoke: notes and pages
 * add up, cards add up (each card once), the buttons are shown once. Shaped like an answer's own
 * record in the chat (notes, cards, buttons, go), so the assistant's saved line can take it as it is.
 */
function mergePending(pending: Record<string, unknown>, ours: Effects) {
  const cards = list(pending.cards) as Card[]
  for (const card of ours.cards) if (!cards.some((c) => c.id === card.id)) cards.push(card)
  const go = [...list(pending.go), ...ours.went]
  const next: Record<string, unknown> = { ...pending, notes: [...list(pending.notes), ...ours.notes] }
  if (go.length) next.go = go
  if (cards.length) next.cards = cards
  if (ours.buttons || pending.buttons === true) next.buttons = true
  return next
}

/**
 * Keeps what a tool did with the call. It is compared and swapped in one statement, so a line saved
 * at the same moment (which takes and clears it) cannot lose it or take it twice: if the pending record
 * changed in between, it is read again and merged again.
 */
async function savePending(callId: string, ours: Effects) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [current] = await run<{ pending: unknown }>(`SELECT pending FROM ai_calls WHERE id = $1::text`, [callId])
    if (!current) return
    const pending = metaOf(current.pending)
    const saved = await run(
      `UPDATE ai_calls SET opened = opened OR $3::boolean, pending = $4::jsonb WHERE id = $1::text AND pending = $2::jsonb RETURNING id`,
      [callId, JSON.stringify(pending), ours.went.length > 0, JSON.stringify(mergePending(pending, ours))],
    )
    if (saved.length) return
  }
  console.warn(`voice: could not keep what the tools did for call ${callId}`)
}

/**
 * Runs one of the assistant's tools for a call, as the chat does. What it did on screen (a page
 * opened, the buttons, a card) comes back as events for the browser, and is kept until the
 * assistant's next words are saved, which then carry it into the transcript (OpenAI runs a tool and
 * speaks about it in two separate steps). One page may be opened per answer, and one card of each
 * kind, as in the chat. `page` is the page the customer is on now (so the assistant does not open
 * the page they are on).
 */
export async function callTool(input: { callId: unknown; name: unknown; arguments: unknown; page?: string }): Promise<{ ok: true; answer: ToolAnswer } | Fail> {
  const found = await liveCall(input.callId)
  if (found.ok === false) return found
  const name = typeof input.name === 'string' ? input.name.slice(0, 60) : ''
  const args = typeof input.arguments === 'string' ? input.arguments.slice(0, 4000) : '{}'
  const [counted] = await run<{ opened: boolean; pending: unknown }>(
    `UPDATE ai_calls SET tools = tools + 1 WHERE id = $1::text AND tools < $2::int RETURNING opened, pending`,
    [found.row.id, VOICE.toolsPerCall],
  )
  if (!counted) return fail(429, 'busy', 'This call has used its tools too many times.')
  const events: ChatEvent[] = []
  const t = newTurn(todaySydney(), input.page ?? '', (e) => events.push(e), found.row.ip_hash)
  // What this answer has done so far counts: a second card of a kind, a second page or the buttons again are refused as in the chat.
  const before = metaOf(counted.pending)
  t.opened = counted.opened === true
  t.cards = [...(list(before.cards) as Card[])]
  t.buttons = before.buttons === true
  const shown = t.cards.length
  const result = await runTool({ id: 'voice', name, arguments: args }, t)
  const ours: Effects = { notes: t.notes, went: t.went, cards: t.cards.slice(shown), buttons: t.buttons && before.buttons !== true }
  if (ours.notes.length || ours.cards.length || ours.buttons || ours.went.length) await savePending(found.row.id, ours)
  return { ok: true, answer: { output: JSON.stringify(result), events } }
}

const cleanLine = (v: unknown) =>
  plainDashes(
    String(typeof v === 'string' ? v : '')
      // Control characters go (tab and line breaks become spaces), then runs of spaces collapse
      .replace(/\p{Cc}/gu, (c) => (/\s/.test(c) ? ' ' : ''))
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .trim()
    .slice(0, LINE_MAX)

/** What the transcript says about words that speak of a card the call did not make. */
const UNBACKED_NOTE: Record<CardClaim, string> = {
  cart: 'The words mention an Add to cart card, but no such card was shown with them',
  request: 'The words mention a prepared request, but none was shown with them',
  handover: 'The words mention a message for the sales team, but none was shown with them',
}

/**
 * Writes one line of a call into the chat's transcript: the customer's words as they were written
 * down, or the assistant's, which take along what its tools did since it last spoke. The caps are the
 * call's (VOICE.linesPerCall, LINE_MAX). Lines from the browser (practice calls only) are accepted
 * while the call is live and for a minute after; lines from the server's own line to OpenAI have no
 * time limit of their own: they stop when that line closes, which is shortly after the hang-up.
 * Returns whether a line was kept.
 *
 * One statement: the call's row is locked while it is read, so a tool finishing at the same moment
 * waits, and its record is either taken with these words or kept for the next ones, never lost or
 * taken twice. The row, the line count and the message go in together.
 */
async function storeLine(callId: string, role: 'user' | 'assistant', text: string, from: 'browser' | 'server'): Promise<boolean> {
  const meta: Record<string, unknown> = { voice: true }
  if (role === 'user' && isEmergency(text)) Object.assign(meta, { emergency: true, notes: ['Gave the emergency safety steps on the call'] })
  const taking = role === 'assistant'
  const [saved] = await run<{ id: number | string; meta: unknown }>(
    `WITH c AS (
       SELECT conversation_id, pending FROM ai_calls
        WHERE id = $1::text AND lines < $2::int
          AND ($3::boolean OR status = 'live' OR ended_at > now() - make_interval(secs => $4::int))
          FOR UPDATE),
     u AS (
       UPDATE ai_calls SET lines = lines + 1,
              pending = CASE WHEN $5::boolean THEN '{}'::jsonb ELSE pending END,
              opened = CASE WHEN $5::boolean THEN false ELSE opened END
        WHERE id = $1::text AND EXISTS (SELECT 1 FROM c) RETURNING id)
     INSERT INTO ai_messages (conversation_id, role, content, meta)
     SELECT c.conversation_id, $6::text, $7::text, $8::jsonb || CASE WHEN $5::boolean THEN c.pending ELSE '{}'::jsonb END
       FROM c WHERE EXISTS (SELECT 1 FROM u)
     RETURNING id, meta`,
    [callId, VOICE.linesPerCall, from === 'server', VOICE.lateLineSeconds, taking, role, text, JSON.stringify(meta)],
  )
  if (!saved) return false
  if (taking) {
    // The words speak of a card the tools did not make (a model that says it without doing it): staff are told.
    const saidMeta = metaOf(saved.meta)
    const claim = unbackedClaim(text, { cards: list(saidMeta.cards) as Card[] })
    if (claim) {
      console.warn(`voice: call ${callId} spoke of a card that was not shown (${claim})`)
      await run(`UPDATE ai_messages SET meta = jsonb_set(meta, '{notes}', COALESCE(meta->'notes', '[]'::jsonb) || $2::jsonb) WHERE id = $1::bigint`, [
        Number(saved.id),
        JSON.stringify([UNBACKED_NOTE[claim]]),
      ])
    }
  }
  return true
}

/** What the server's line to OpenAI uses to write a real call's transcript (see openMonitor). */
export const keepServerLine = (callId: string, role: 'user' | 'assistant', text: string) => {
  const clean = cleanLine(text)
  return clean ? storeLine(callId, role, clean, 'server') : Promise.resolve(false)
}

/**
 * A line of a call posted by the browser. Only a practice call keeps it (its words are typed and
 * spoken by the browser, so the browser is the only one that knows them). A real call's transcript
 * is written by the server from its own line to OpenAI, so a real call's browser lines are answered
 * `ignored` and nothing is saved: what a browser says it heard cannot be trusted into the records.
 */
export async function callLine(input: { callId: unknown; role: unknown; text: unknown }): Promise<{ ok: true; ignored?: true } | Fail> {
  if (!isCallId(input.callId)) return fail(400, 'error', 'Missing the call id.')
  const role = input.role === 'user' || input.role === 'assistant' ? input.role : null
  const text = cleanLine(input.text)
  if (!role || !text) return fail(400, 'error', 'Nothing to keep.')
  const [call] = await run<{ practice: boolean }>(`SELECT practice FROM ai_calls WHERE id = $1::text`, [input.callId])
  if (!call) return fail(410, 'error', 'This call has ended.')
  if (!call.practice) return { ok: true, ignored: true }
  return (await storeLine(input.callId, role, text, 'browser')) ? { ok: true } : fail(410, 'error', 'This call has ended.')
}

/* ------------------------------------------------------------ practice calls */

const PRACTICE_LIMIT = { messages: 40, chars: 24_000 }

const isPracticeMessages = (v: unknown): v is PracticeMessage[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= PRACTICE_LIMIT.messages &&
  JSON.stringify(v).length <= PRACTICE_LIMIT.chars &&
  v.every((m) => {
    const x = m as Record<string, unknown>
    if (x?.role === 'user') return typeof x.content === 'string'
    if (x?.role === 'tool') return typeof x.tool_call_id === 'string' && typeof x.content === 'string'
    return x?.role === 'assistant' && (typeof x.content === 'string' || x.content === null) && (x.tool_calls === undefined || Array.isArray(x.tool_calls))
  })

/**
 * A practice call's next step: the practice AI (scripts/practice-ai.ts, free) answers the
 * conversation so far with words or tool uses, which the browser then plays like a real call. Only
 * for practice calls, and only with the practice AI: a real gateway is never used here.
 */
export async function practiceTurn(input: { callId: unknown; page: unknown; messages: unknown }): Promise<{ ok: true; answer: PracticeAnswer } | Fail> {
  const cfg = voiceConfig()
  if (!cfg?.practice) return fail(403, 'off', 'Practice calls are not on.')
  const ai = aiConfig()
  if (!ai || !isPracticeAi(ai)) return fail(503, 'not_configured', 'Practice calls need the practice AI (AI_GATEWAY_URL=http://localhost:3410).')
  const found = await liveCall(input.callId)
  if (found.ok === false) return found
  if (!isPracticeMessages(input.messages)) return fail(400, 'error', 'That practice conversation could not be read.')
  const page = cleanPage(input.page)
  const system = await voiceInstructions(todaySydney(), page, found.row.conversation_id, callSeconds())
  const messages: Message[] = [{ role: 'system', content: system }, ...(input.messages as Message[])]
  try {
    const out = await complete({ messages, tools: TOOLS, toolChoice: 'auto', maxTokens: 300, timeoutMs: 15_000, config: ai })
    return { ok: true, answer: { text: out.text.trim(), calls: out.toolCalls.map((c) => ({ id: c.id, name: c.name, arguments: c.arguments })) } }
  } catch (err) {
    console.warn('voice: the practice AI did not answer', safeMessage(err))
    return fail(502, 'unavailable', 'The practice AI is not answering (is `npm run dev` running?).')
  }
}
