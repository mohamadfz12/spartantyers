/**
 * GET   /api/admin/ai-settings                -> { settings, disabledByEnv }
 * PATCH /api/admin/ai-settings { enabled?, voiceEnabled?, dailyLimitUsd?, monthlyLimitUsd? }
 *                                             -> { settings, disabledByEnv }
 *
 * The AI's switches and its two spending limits, as an admin saved them. `AI_DISABLED` on the
 * server overrides the switches; `disabledByEnv` says so, so the panel can explain it.
 * The limits are validated as in `saveAiSettings` (a number from 0 to 1000, rounded to cents).
 */

import { authorize } from '../auth.js'
import { fail, methodGuard, ok, readBody, withGuard } from '../http.js'
import { AiDbUnavailable } from '../ai/db.js'
import { aiDisabledByEnv, AiSettingsError, getStoredAiSettings, saveAiSettings, type AiSettings } from '../ai/settings.js'

const FIELDS = ['enabled', 'voiceEnabled', 'dailyLimitUsd', 'monthlyLimitUsd'] as const

const NOT_CONNECTED = 'The AI database is not connected, so these settings cannot be read or saved.'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PATCH'])) return
  const actor = await authorize(req, res, 'ai')
  if (!actor) return

  res.setHeader('Cache-Control', 'private, no-store')

  try {
    if ((req.method ?? 'GET').toUpperCase() === 'GET') {
      ok(res, { settings: await getStoredAiSettings(), disabledByEnv: aiDisabledByEnv() })
      return
    }

    const body = readBody<Record<string, unknown>>(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      fail(res, 400, 'Send the settings to change as JSON.')
      return
    }
    const partial: Partial<AiSettings> = {}
    for (const key of FIELDS) {
      if (body[key] !== undefined) (partial as Record<string, unknown>)[key] = body[key]
    }
    if (Object.keys(partial).length === 0) {
      fail(res, 400, `Send at least one of: ${FIELDS.join(', ')}.`)
      return
    }

    const settings = await saveAiSettings(partial)
    ok(res, { settings, disabledByEnv: aiDisabledByEnv() })
  } catch (error) {
    if (error instanceof AiSettingsError) {
      fail(res, 400, error.message)
      return
    }
    if (error instanceof AiDbUnavailable) {
      fail(res, 503, NOT_CONNECTED)
      return
    }
    throw error
  }
})
