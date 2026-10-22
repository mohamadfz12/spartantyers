/**
 * The AI's switches and spending limits, kept in one row of `ai_settings` so the
 * admin panel can change them without a deploy.
 */
import { getAiDb } from './db.js'

export interface AiSettings {
  enabled: boolean
  voiceEnabled: boolean
  dailyLimitUsd: number
  monthlyLimitUsd: number
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: true,
  voiceEnabled: true,
  dailyLimitUsd: 5,
  monthlyLimitUsd: 60,
}

export const MAX_LIMIT_USD = 1000

/** `AI_DISABLED=1` switches the whole AI off whatever the saved settings say. */
export function aiDisabledByEnv(): boolean {
  const v = String(process.env.AI_DISABLED ?? '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

/** A dollar limit in range, rounded to cents; null when it is not acceptable. */
export function asLimitUsd(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > MAX_LIMIT_USD) return null
  return Math.round(value * 100) / 100
}

/** Fills the gaps in whatever is stored, ignoring anything that is not valid. */
function normalise(raw: unknown): AiSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_AI_SETTINGS.enabled,
    voiceEnabled:
      typeof data.voiceEnabled === 'boolean' ? data.voiceEnabled : DEFAULT_AI_SETTINGS.voiceEnabled,
    dailyLimitUsd: asLimitUsd(data.dailyLimitUsd) ?? DEFAULT_AI_SETTINGS.dailyLimitUsd,
    monthlyLimitUsd: asLimitUsd(data.monthlyLimitUsd) ?? DEFAULT_AI_SETTINGS.monthlyLimitUsd,
  }
}

/** What an admin saved (defaults for anything unset), ignoring `AI_DISABLED`. For the admin panel. */
export async function getStoredAiSettings(): Promise<AiSettings> {
  const db = await getAiDb()
  const rows = await db.query<{ data: unknown }>(`SELECT data FROM ai_settings WHERE id = 1`)
  return normalise(rows[0]?.data)
}

/** The settings in force: what an admin saved, with everything off when `AI_DISABLED` is set. */
export async function getAiSettings(): Promise<AiSettings> {
  const stored = await getStoredAiSettings()
  return aiDisabledByEnv() ? { ...stored, enabled: false, voiceEnabled: false } : stored
}

export class AiSettingsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiSettingsError'
  }
}

/**
 * Saves the fields given and keeps the rest. Throws `AiSettingsError` (a message safe to
 * show an admin) for a wrong type or a limit outside 0 to 1000; nothing is saved then.
 */
export async function saveAiSettings(partial: Partial<AiSettings>): Promise<AiSettings> {
  const current = await getStoredAiSettings()
  const next: AiSettings = { ...current }

  for (const key of ['enabled', 'voiceEnabled'] as const) {
    if (partial[key] === undefined) continue
    if (typeof partial[key] !== 'boolean') throw new AiSettingsError(`${key} must be true or false.`)
    next[key] = partial[key]
  }
  for (const key of ['dailyLimitUsd', 'monthlyLimitUsd'] as const) {
    if (partial[key] === undefined) continue
    const limit = asLimitUsd(partial[key])
    if (limit === null) {
      throw new AiSettingsError(`${key} must be a number from 0 to ${MAX_LIMIT_USD}.`)
    }
    next[key] = limit
  }

  const db = await getAiDb()
  await db.query(
    `INSERT INTO ai_settings (id, data, updated_at) VALUES (1, $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(next)],
  )
  return next
}
