/**
 * The admin activity log: one line per change, naming who made it.
 *
 * Recording is best-effort. The change it describes has already been saved
 * by the time this runs, so a failed log write is reported in the function
 * logs and never turned into an error for the person who made the change.
 */

import { randomUUID } from 'node:crypto'
import type { Actor } from './auth.js'
import { safeMessage } from './http.js'
import { saveAudit } from './store.js'

export async function audit(actor: Actor, action: string, detail: string): Promise<void> {
  try {
    await saveAudit({
      id: randomUUID(),
      at: new Date().toISOString(),
      actorId: actor.id,
      actorName: actor.name,
      action,
      detail: detail.slice(0, 500),
    })
  } catch (error) {
    console.error(`[audit] could not record ${action}: ${safeMessage(error)}`)
  }
}

/** Today in Sydney as YYYY-MM-DD: the business's own calendar, not UTC's. */
export function sydneyDate(at: Date | string = new Date()): string {
  const date = typeof at === 'string' ? new Date(at) : at
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** A real calendar day in YYYY-MM-DD form, or null. */
export function asDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  // Rejects 2026-02-31, which Date would quietly roll into March.
  return parsed.toISOString().slice(0, 10) === value ? value : null
}

/** Dollars to the cent, within (0, max]. */
export function asMoney(value: unknown, max = 10_000_000): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > max) return null
  return Math.round(n * 100) / 100
}

/** Optional free text: '' when absent, null when present but too long or not text. */
export function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > max ? null : trimmed
}
