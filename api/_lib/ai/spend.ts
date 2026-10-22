/**
 * What the AI may spend. Every paid call is reserved before it is made (`reserve`), at its
 * worst-case cost, and settled afterwards with what it really cost (`settle`). The daily,
 * monthly and per-visitor limits are checked against those rows inside one short
 * transaction that first takes an advisory lock, so calls made at the same moment count
 * each other and can never overspend together.
 *
 * Money here is integer micro-US-dollars (1 USD = 1,000,000) in the database and in this
 * file's functions, except the limits and `spentUsd()`, which are in dollars because the
 * admin settings are.
 */
import { createHash } from 'node:crypto'
import { isIPv6 } from 'node:net'
import { monthStart, todaySydney } from './dates.js'
import { AiDbUnavailable, getAiDb, num } from './db.js'
import { aiConfig, costOf, type PriceOf, type Usage } from './gateway.js'
import { getAiSettings, type AiSettings } from './settings.js'
import { cap } from './util.js'

const MICROS = 1_000_000

/* ------------------------------------------------------------------ *
 * Visitors
 * ------------------------------------------------------------------ */

/**
 * The network a visitor's address belongs to: the /24 for IPv4 and the /64 for IPv6 (the
 * block one home or phone is given), so moving to another address in it does not reset a
 * limit. IPv4 written as `::ffff:1.2.3.4` is read as IPv4.
 */
export function networkOf(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i.exec(ip)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`
  if (!isIPv6(ip)) return ip
  const [head, tail = ''] = ip.toLowerCase().split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = [
    ...left,
    ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'),
    ...right,
  ]
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

/** True on a deployment where the visitor key must come from the environment, never from source. */
const requiresSecret = () => !!process.env.VERCEL || process.env.NODE_ENV === 'production'

/** The key `hashIp` uses, or null when this deployment has none and must not guess one. */
function visitorKey(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (secret) return secret
  return requiresSecret() ? null : 'local-development-only-ai-salt'
}

/** False on Vercel without `ADMIN_SESSION_SECRET`: the AI stays off rather than hash with a known salt. */
export const visitorKeyConfigured = (): boolean => visitorKey() !== null

/**
 * A visitor's network as a short keyed hash: enough to count their requests, useless to
 * anyone else. Raw addresses are never stored. Empty for an unknown address.
 */
export function hashIp(ip: string): string {
  if (!ip || ip === 'unknown') return ''
  const key = visitorKey()
  if (!key) throw new Error('ADMIN_SESSION_SECRET is not configured.')
  return createHash('sha256').update(`ai-ip:${key}:${networkOf(ip)}`).digest('base64url').slice(0, 22)
}

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

/**
 * The limits in force, in dollars: the admin setting, or the environment cap if that is
 * lower. `AI_DAILY_LIMIT_USD` and `AI_MONTHLY_LIMIT_USD` count only when set to a valid
 * number, so a machine can be held to a small spend whatever the saved settings say.
 */
export function effectiveLimits(
  settings: Pick<AiSettings, 'dailyLimitUsd' | 'monthlyLimitUsd'>,
): { dailyUsd: number; monthlyUsd: number } {
  const daily = cap(process.env.AI_DAILY_LIMIT_USD)
  const monthly = cap(process.env.AI_MONTHLY_LIMIT_USD)
  return {
    dailyUsd: daily === null ? settings.dailyLimitUsd : Math.min(settings.dailyLimitUsd, daily),
    monthlyUsd:
      monthly === null ? settings.monthlyLimitUsd : Math.min(settings.monthlyLimitUsd, monthly),
  }
}

/** The most one visitor may spend in a Sydney day: a fifth of the daily limit, at least 20 cents. */
export const visitorShare = (dailyUsd: number): number =>
  Math.max(0.2, Math.round(dailyUsd * 20) / 100)

export const toMicros = (usd: number) => Math.round(usd * MICROS)

/** The lock every money transaction takes first, so a chat message and a call starting together count each other. */
export const SPEND_LOCK = `SELECT pg_advisory_xact_lock(hashtext('spartan-ai-spend'))`

/** 'visitor': this connection has used its share of today's limit. */
export type Refusal = 'not_configured' | 'off' | 'daily' | 'monthly' | 'visitor'

export type Purpose = 'chat' | 'voice'

export interface Totals {
  today: number
  month: number
  visitor: number
}

/** Adds up spending (reserved or settled) in micro-dollars; the SQL that both `totals` and `reserve` use. */
export const TOTALS_SQL = `SELECT COALESCE(SUM(cost_micros) FILTER (WHERE day = $1::text), 0) AS today,
        COALESCE(SUM(cost_micros), 0) AS month,
        COALESCE(SUM(cost_micros) FILTER (WHERE day = $1::text AND ip_hash = $3::text AND $3::text <> ''), 0) AS visitor
   FROM ai_usage WHERE day >= $2::text AND day <= $1::text`

export const asTotals = (row: Record<string, unknown> | undefined): Totals => ({
  today: num(row?.today),
  month: num(row?.month),
  visitor: num(row?.visitor),
})

/** What has been spent so far today, this month and by this visitor, in micro-dollars. */
export async function totals(day: string, ipHash: string): Promise<Totals> {
  const db = await getAiDb()
  const rows = await db.query(TOTALS_SQL, [day, monthStart(day), ipHash])
  return asTotals(rows[0])
}

/** The first limit that `add` more micro-dollars would cross (`atLimit`: reaching it counts), or null. */
export function crossed(
  t: Totals,
  add: number,
  settings: AiSettings,
  ipHash: string,
  atLimit = false,
): Refusal | null {
  const { dailyUsd, monthlyUsd } = effectiveLimits(settings)
  const over = (spent: number, limitUsd: number) =>
    atLimit ? spent + add >= toMicros(limitUsd) : spent + add > toMicros(limitUsd)
  if (over(t.today, dailyUsd)) return 'daily'
  if (over(t.month, monthlyUsd)) return 'monthly'
  if (ipHash && over(t.visitor, visitorShare(dailyUsd))) return 'visitor'
  return null
}

/**
 * Whether the AI can answer at all right now (set up, switched on, under every limit).
 * Books nothing. Chat needs the OpenAI key (aiConfig); voice has its own OpenAI settings which the voice
 * code checks, so purpose 'voice' looks only at the switches and the limits.
 */
export async function aiAvailable(
  ipHash = '',
  purpose: Purpose = 'chat',
): Promise<{ ok: true } | { ok: false; reason: Refusal }> {
  if (purpose === 'chat' && !aiConfig()) return { ok: false, reason: 'not_configured' }
  if (!visitorKeyConfigured()) return { ok: false, reason: 'not_configured' }
  let settings: AiSettings
  let spent: Totals
  try {
    settings = await getAiSettings()
    if (!settings.enabled || (purpose === 'voice' && !settings.voiceEnabled)) {
      return { ok: false, reason: 'off' }
    }
    spent = await totals(todaySydney(), ipHash)
  } catch (error) {
    if (error instanceof AiDbUnavailable) return { ok: false, reason: 'not_configured' }
    throw error
  }
  const reason = crossed(spent, 0, settings, ipHash, true)
  return reason ? { ok: false, reason } : { ok: true }
}

/* ------------------------------------------------------------------ *
 * Reserve and settle
 * ------------------------------------------------------------------ */

/**
 * Books one call before it is made: a usage row holding the call's worst-case cost. One
 * transaction of three statements: take the spend lock; insert the row only if it keeps
 * every limit (the sums are read after the lock is granted, so they include every
 * reservation that committed first); read the totals to say which limit refused.
 * `settle` then writes what the call really cost. A row that is never settled (the
 * function was stopped half way) keeps the worst case, never nothing. Nothing in the
 * transaction waits for the network.
 */
export async function reserve(
  purpose: Purpose,
  model: string,
  worstMicros: number,
  ipHash = '',
): Promise<{ ok: true; id: string } | { ok: false; reason: Refusal }> {
  const settings = await getAiSettings()
  if (!settings.enabled || (purpose === 'voice' && !settings.voiceEnabled)) {
    return { ok: false, reason: 'off' }
  }
  const day = todaySydney()
  const add = Math.max(0, Math.ceil(worstMicros))
  const { dailyUsd, monthlyUsd } = effectiveLimits(settings)
  const db = await getAiDb()

  const [, inserted, after] = await db.transaction([
    { text: SPEND_LOCK },
    {
      text: `WITH t AS (${TOTALS_SQL})
             INSERT INTO ai_usage (day, purpose, model, ip_hash, cost_micros, status)
             SELECT $1::text, $4::text, $5::text, $3::text, $6::int, 'reserved' FROM t
              WHERE t.today + $6::bigint <= $7::bigint
                AND t.month + $6::bigint <= $8::bigint
                AND ($3::text = '' OR t.visitor + $6::bigint <= $9::bigint)
             RETURNING id`,
      params: [
        day,
        monthStart(day),
        ipHash,
        purpose,
        model,
        add,
        toMicros(dailyUsd),
        toMicros(monthlyUsd),
        toMicros(visitorShare(dailyUsd)),
      ],
    },
    { text: TOTALS_SQL, params: [day, monthStart(day), ipHash] },
  ])

  const id = inserted[0]?.id
  if (typeof id === 'string') return { ok: true, id }
  // Refused: say which limit, from the totals the same transaction read under the lock.
  return { ok: false, reason: crossed(asTotals(after[0]), add, settings, ipHash) ?? 'daily' }
}

/**
 * Writes what a booked call really cost.
 *   'done':   answered; the cost of the tokens reported (the worst case stays if none were).
 *   'billed': cut off or timed out after the gateway took it; the worst case stays.
 *   'free':   it never reached the model (refused, or the connection failed); nothing.
 */
export async function settle(
  id: string,
  usage: Usage | null,
  outcome: 'done' | 'billed' | 'free',
  which: PriceOf = 'main',
): Promise<void> {
  const u = usage ?? { promptTokens: 0, cachedTokens: 0, completionTokens: 0 }
  const cost =
    outcome === 'free' ? 0 : outcome === 'done' && usage ? costOf(usage, aiConfig(), which) : null
  const db = await getAiDb()
  await db.query(
    `UPDATE ai_usage SET prompt_tokens = $2::int, cached_tokens = $3::int, completion_tokens = $4::int,
            cost_micros = COALESCE($5::int, cost_micros), status = 'settled', updated_at = now()
      WHERE id = $1::uuid`,
    [id, u.promptTokens, u.cachedTokens, u.completionTokens, cost],
  )
}

/**
 * Writes the exact cost of a settled voice call (micro-dollars, worked out by the server)
 * and the tokens it used. Chat uses `settle`, which prices tokens with the gateway's table.
 */
export async function settleMicros(id: string, micros: number, usage: Usage): Promise<void> {
  const cost = Math.min(2_000_000_000, Math.max(0, Math.round(micros)))
  const db = await getAiDb()
  await db.query(
    `UPDATE ai_usage SET prompt_tokens = $2::int, cached_tokens = $3::int, completion_tokens = $4::int,
            cost_micros = $5::int, status = 'settled', updated_at = now()
      WHERE id = $1::uuid`,
    [id, usage.promptTokens, usage.cachedTokens, usage.completionTokens, cost],
  )
}

/* ------------------------------------------------------------------ *
 * Rate limits and reporting
 * ------------------------------------------------------------------ */

/**
 * Counts a hit against `key` and says whether it is over `limit` within `windowSec`. One
 * statement, so two requests at the same moment cannot both read "under the limit". In
 * the database, not in memory, because Vercel runs many instances.
 */
export async function rateLimited(key: string, limit: number, windowSec: number): Promise<boolean> {
  const db = await getAiDb()
  const rows = await db.query<{ count: number | string }>(
    `INSERT INTO ai_rate (key, count, reset_at) VALUES ($1::text, 1, now() + make_interval(secs => $2::int))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN ai_rate.reset_at < now() THEN 1 ELSE ai_rate.count + 1 END,
       reset_at = CASE WHEN ai_rate.reset_at < now() THEN now() + make_interval(secs => $2::int) ELSE ai_rate.reset_at END
     RETURNING count`,
    [key, windowSec],
  )
  return num(rows[0]?.count) > limit
}

/** What the AI has spent today and this month (Sydney dates), in US dollars. */
export async function spentUsd(day: string = todaySydney()): Promise<{ today: number; month: number }> {
  const t = await totals(day, '')
  return { today: t.today / MICROS, month: t.month / MICROS }
}
