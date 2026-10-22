/**
 * A short memory for the public status answer (GET /api/ai/status). Every page of the site asks
 * whether the assistant is on, and each answer reads the database for the spending so far, so
 * answers are kept for about 15 seconds per instance, one per visitor (the answer depends on that
 * visitor's share of the daily limit). The answer holds only yes or no and the call length: nothing
 * sensitive is ever kept here. AI_STATUS_CACHE_SECONDS changes the time (0 turns it off).
 */

const DEFAULT_SECONDS = 15
const MAX_ENTRIES = 500

const cache = new Map<string, { at: number; value: Promise<unknown> }>()

const keepMs = () => {
  const raw = process.env.AI_STATUS_CACHE_SECONDS
  const n = Number(raw)
  return (String(raw ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : DEFAULT_SECONDS) * 1000
}

/** The kept answer for this visitor when it is fresh, otherwise `compute()` (shared by requests made while it runs). A failure is never kept. */
export function cachedStatus<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const keep = keepMs()
  if (keep <= 0) return compute()
  const now = Date.now()
  const found = cache.get(key)
  if (found && now - found.at < keep) return found.value as Promise<T>
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) if (now - v.at >= keep) cache.delete(k)
    // Still full of fresh answers: drop the oldest.
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  }
  const value = compute()
  const entry = { at: now, value }
  cache.set(key, entry)
  value.catch(() => {
    if (cache.get(key) === entry) cache.delete(key)
  })
  return value
}

/** Forgets every kept answer (for tests). */
export const clearStatusCache = () => cache.clear()
