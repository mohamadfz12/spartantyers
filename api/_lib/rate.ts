/**
 * Visitor hashing and rate limits, shared by the AI (`ai/spend.ts` re-exports them) and customer
 * accounts. A visitor is only ever a short keyed hash of their network, never a raw address, and
 * the counters live in the database (not memory) because Vercel runs many instances.
 */
import { createHash } from 'node:crypto'
import { isIPv6 } from 'node:net'
import { getDb, num, type Schema } from './db.js'

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

/** False on Vercel without `ADMIN_SESSION_SECRET`: such features stay off rather than hash with a known salt. */
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

/**
 * The counter table. It keeps its original name, `ai_rate`, because the AI's retention sweep and
 * tests already use it; the AI schema creates the same table (`IF NOT EXISTS`), so either may run first.
 */
const RATE_SCHEMA: Schema = {
  name: 'rate',
  statements: [
    `CREATE TABLE IF NOT EXISTS ai_rate (
       key      text PRIMARY KEY,
       count    integer NOT NULL DEFAULT 0,
       reset_at timestamptz NOT NULL
     )`,
  ],
}

/**
 * Counts a hit against `key` and says whether it is over `limit` within `windowSec`. One
 * statement, so two requests at the same moment cannot both read "under the limit". In
 * the database, not in memory, because Vercel runs many instances.
 */
export async function rateLimited(key: string, limit: number, windowSec: number): Promise<boolean> {
  const db = await getDb(RATE_SCHEMA)
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
