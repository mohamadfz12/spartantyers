/**
 * How long the AI's records are kept.
 *
 *   Chats (and their messages and calls)   30 days, or 2 years when linked to an order.
 *   Spending rows                          400 days once settled; they hold no words.
 *   Rate-limit windows                     until they expire.
 *   Hashed visitor ids                      blanked after 35 days; the limits only look at today.
 *
 * There is no cron on this site, so `maybePurgeAi` runs the purge from the chat endpoint
 * at most once a day, without making the visitor wait for it.
 */
import { getAiDb, num } from './db.js'

export const KEEP_DAYS_NO_ORDER = 30
export const KEEP_DAYS_WITH_ORDER = 730
export const KEEP_USAGE_DAYS = 400
export const KEEP_IP_DAYS = 35

const DAY_MS = 86_400_000

/** The key in `ai_rate` that holds "a purge ran in the last day". */
const PURGE_KEY = 'purge:daily'

export interface PurgeResult {
  conversations: number
  usageRows: number
  rateWindows: number
  ipsBlanked: number
}

/** Deletes old records and blanks old hashed visitor ids; returns how many of each. Safe to run at any time. */
export async function purgeAi(now = new Date()): Promise<PurgeResult> {
  const db = await getAiDb()
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString()

  // Messages and calls go with their conversation (ON DELETE CASCADE).
  const plain = await db.query(
    `DELETE FROM ai_conversations WHERE order_ref IS NULL AND last_at < $1::timestamptz RETURNING id`,
    [before(KEEP_DAYS_NO_ORDER)],
  )
  const ordered = await db.query(
    `DELETE FROM ai_conversations WHERE order_ref IS NOT NULL AND last_at < $1::timestamptz RETURNING id`,
    [before(KEEP_DAYS_WITH_ORDER)],
  )
  const usage = await db.query(
    `DELETE FROM ai_usage WHERE status = 'settled' AND created_at < $1::timestamptz RETURNING id`,
    [before(KEEP_USAGE_DAYS)],
  )
  const rate = await db.query(
    `DELETE FROM ai_rate WHERE reset_at < $1::timestamptz RETURNING key`,
    [now.toISOString()],
  )

  const cut = before(KEEP_IP_DAYS)
  const blankedUsage = await db.query(
    `UPDATE ai_usage SET ip_hash = '' WHERE ip_hash <> '' AND created_at < $1::timestamptz RETURNING id`,
    [cut],
  )
  const blankedChats = await db.query(
    `UPDATE ai_conversations SET ip_hash = '' WHERE ip_hash <> '' AND last_at < $1::timestamptz RETURNING id`,
    [cut],
  )
  const blankedCalls = await db.query(
    `UPDATE ai_calls SET ip_hash = '' WHERE ip_hash <> '' AND started_at < $1::timestamptz RETURNING id`,
    [cut],
  )

  return {
    conversations: plain.length + ordered.length,
    usageRows: usage.length,
    rateWindows: rate.length,
    ipsBlanked: blankedUsage.length + blankedChats.length + blankedCalls.length,
  }
}

/**
 * Runs `purgeAi` if it has not run in the last day. The claim is one atomic statement, so
 * of many instances asking at once exactly one wins. Never throws and never waits for the
 * purge: hand it Vercel's `waitUntil` (when available) so the platform keeps the function
 * alive until the work finishes. Returns whether this call started a purge.
 */
export async function maybePurgeAi(
  waitUntil?: (work: Promise<unknown>) => void,
): Promise<boolean> {
  try {
    const db = await getAiDb()
    const claimed = await db.query(
      `INSERT INTO ai_rate (key, count, reset_at) VALUES ($1::text, 1, now() + interval '1 day')
       ON CONFLICT (key) DO UPDATE SET count = 1, reset_at = now() + interval '1 day'
         WHERE ai_rate.reset_at < now()
       RETURNING count`,
      [PURGE_KEY],
    )
    if (num(claimed[0]?.count) !== 1) return false
    const work = purgeAi().catch((error: unknown) => {
      console.error('[ai] purge failed:', error instanceof Error ? error.message : 'unknown error')
    })
    waitUntil?.(work)
    return true
  } catch (error) {
    console.error('[ai] purge check failed:', error instanceof Error ? error.message : 'unknown error')
    return false
  }
}
