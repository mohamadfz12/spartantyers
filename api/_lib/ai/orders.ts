/**
 * Links an order to the chat that led to it. A chat with an order is kept for 2 years instead of
 * 30 days (see retention.ts), so staff can look back at how an order came about.
 */
import { waitUntil } from '@vercel/functions'
import { aiDbConfigured, getAiDb } from './db.js'

/** How long the background link may work before it is given up (the payment never waits for it). */
export const LINK_LIMIT_MS = 1500

/**
 * Best effort and silent: it must never affect a payment. Returns whether a chat was linked
 * (false when there is no AI database here, or no such chat).
 */
export async function linkOrderToChat(conversationId: string, reference: string): Promise<boolean> {
  try {
    if (!aiDbConfigured()) return false
    const db = await getAiDb()
    const rows = await db.query(
      `UPDATE ai_conversations SET order_ref = $2::text, last_at = now() WHERE id = $1::text RETURNING id`,
      [conversationId, reference],
    )
    return rows.length > 0
  } catch (error) {
    console.error('[ai] could not link an order to its chat:', error instanceof Error ? error.message : 'unknown error')
    return false
  }
}

/** What the background link uses (a test replaces `link` with one that hangs, to prove the payment does not wait for it). */
export const orders = { link: linkOrderToChat, limitMs: LINK_LIMIT_MS }

/**
 * Links the order in the background and returns at once: the payment's answer never waits for the
 * AI's database, and a slow or hanging one is given up after `limitMs`. On Vercel `waitUntil` keeps
 * the function alive for the work; locally it does nothing and the promise simply runs on its own.
 * The promise is returned for tests; it never rejects.
 */
export function linkOrderInBackground(
  conversationId: string,
  reference: string,
  link: (conversationId: string, reference: string) => Promise<boolean> = orders.link,
  limitMs = orders.limitMs,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const gaveUp = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), limitMs)
  })
  const work = Promise.race([link(conversationId, reference).catch(() => false), gaveUp]).finally(() => clearTimeout(timer))
  try {
    waitUntil(work)
  } catch {
    // No request context to hand the work to: it still runs.
  }
  return work
}
