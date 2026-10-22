/**
 * GET /api/admin/ai-status (bearer token)
 *   -> { chat, voice, limits, spend, database, warnings, settings }
 * (`voice.callSeconds` is the length calls really get on this deployment, which can be shorter than
 * the configured one: it is fitted to the function's time limit.)
 *
 * Everything staff need to tell whether the AI is working and what it may spend: which model
 * answers the chat (the free practice one on a developer's machine, or the real one), how voice
 * calls are set up, the limits in force (the saved setting, or the environment cap when that is
 * lower), what has been spent today and this month (Sydney dates), and whether the AI's database
 * is connected. No key, address or secret is returned: only names and numbers.
 */

import { requireAdmin } from '../auth.js'
import { methodGuard, ok, withGuard } from '../http.js'
import { todaySydney } from '../ai/dates.js'
import { AiDbUnavailable, aiDbConfigured, getAiDb } from '../ai/db.js'
import { aiConfig, isPracticeAi } from '../ai/gateway.js'
import { aiDisabledByEnv, DEFAULT_AI_SETTINGS, getStoredAiSettings, type AiSettings } from '../ai/settings.js'
import { effectiveLimits, spentUsd, visitorKeyConfigured } from '../ai/spend.js'
import { callSeconds, voiceConfig } from '../ai/voice-openai.js'
import { minDailyUsd, plannedSeconds } from '../ai/voice.js'
import { cap } from '../ai/util.js'

const usd = (n: number) => `US$${n.toFixed(2)}`

export type ChatMode = 'real' | 'practice' | 'off' | 'not_configured'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store')

  let connected = aiDbConfigured()
  let settings: AiSettings = { ...DEFAULT_AI_SETTINGS }
  let spend = { today: 0, month: 0 }
  if (connected) {
    try {
      await getAiDb()
      settings = await getStoredAiSettings()
      spend = await spentUsd(todaySydney())
    } catch (error) {
      if (!(error instanceof AiDbUnavailable)) throw error
      connected = false
    }
  }

  const disabledByEnv = aiDisabledByEnv()
  const gateway = aiConfig()
  const practiceChat = isPracticeAi(gateway)

  let chatMode: ChatMode
  let chatReason = ''
  if (disabledByEnv) {
    chatMode = 'off'
    chatReason = 'AI_DISABLED is set on the server, which switches the whole assistant off.'
  } else if (!settings.enabled) {
    chatMode = 'off'
    chatReason = 'The assistant is switched off here.'
  } else if (!gateway || !visitorKeyConfigured()) {
    chatMode = 'not_configured'
    chatReason = !gateway ? 'The chat model is not set up on this server.' : 'ADMIN_SESSION_SECRET is not set on this server.'
  } else {
    chatMode = practiceChat ? 'practice' : 'real'
  }

  const voice = voiceConfig()
  const voiceOn = settings.voiceEnabled && settings.enabled && !disabledByEnv
  let voiceMode: ChatMode
  let voiceReason = ''
  if (disabledByEnv) {
    voiceMode = 'off'
    voiceReason = 'AI_DISABLED is set on the server, which switches the whole assistant off.'
  } else if (!voiceOn) {
    voiceMode = 'off'
    voiceReason = settings.enabled ? 'Voice calls are switched off here.' : 'The assistant is switched off here.'
  } else if (!voice) {
    voiceMode = 'not_configured'
    voiceReason = 'Voice calls are not set up on this server.'
  } else {
    voiceMode = voice.practice ? 'practice' : 'real'
  }

  // The length calls really get on this deployment: the configured one, shortened to fit the function's time limit.
  const configuredSeconds = callSeconds()
  const fittedSeconds = plannedSeconds(configuredSeconds)
  const dailyCap = cap(process.env.AI_DAILY_LIMIT_USD)
  const monthlyCap = cap(process.env.AI_MONTHLY_LIMIT_USD)
  const effective = effectiveLimits(settings)

  const warnings: string[] = []
  if (!connected) {
    warnings.push('The AI database is not connected, so chats, calls, spending and these settings cannot be saved or read. Check the database connection in the Vercel project, then redeploy.')
  }
  if (disabledByEnv) warnings.push('AI_DISABLED is set on the server. The assistant stays off whatever is switched on here, until that is removed and the site is redeployed.')
  if (dailyCap !== null && dailyCap < settings.dailyLimitUsd) {
    warnings.push(`The server caps the daily limit at ${usd(dailyCap)} (AI_DAILY_LIMIT_USD), lower than the ${usd(settings.dailyLimitUsd)} saved here. The lower figure is the one in force.`)
  }
  if (monthlyCap !== null && monthlyCap < settings.monthlyLimitUsd) {
    warnings.push(`The server caps the monthly limit at ${usd(monthlyCap)} (AI_MONTHLY_LIMIT_USD), lower than the ${usd(settings.monthlyLimitUsd)} saved here. The lower figure is the one in force.`)
  }

  // A real call sets money aside before it starts, and one visitor may use a fifth of the day: below this no call can start.
  const fewest = voice && !voice.practice ? minDailyUsd(voice, fittedSeconds) : null
  if (voiceMode === 'real' && fewest !== null && effective.dailyUsd < fewest) {
    warnings.push(`Voice calls are switched on but cannot start: the daily limit in force is ${usd(effective.dailyUsd)}, and a call needs a daily limit of at least ${usd(fewest)}. Raise the daily limit${dailyCap !== null && dailyCap < fewest ? ' (and the AI_DAILY_LIMIT_USD cap on the server)' : ''}.`)
  }
  if (voiceMode === 'real' && fittedSeconds < configuredSeconds) {
    warnings.push(`Calls are shortened to ${Math.floor(fittedSeconds / 60)} min ${fittedSeconds % 60} s (set to ${Math.round(configuredSeconds / 60)} min) to fit the server's time limit. Ten-minute calls need Vercel Pro with a longer maximum duration.`)
  }

  ok(res, {
    chat: {
      mode: chatMode,
      reason: chatReason,
      // The model's name is not a secret; the key and the gateway address never leave the server.
      model: chatMode === 'real' && gateway ? gateway.model : null,
    },
    voice: {
      mode: voiceMode,
      reason: voiceReason,
      model: voiceMode === 'real' && voice && !voice.practice ? voice.model : null,
      // What calls really get here (shortened to fit the server's time limit when needed), and what is set.
      callSeconds: fittedSeconds,
      configuredSeconds,
      minDailyUsd: fewest,
    },
    limits: {
      dailyUsd: effective.dailyUsd,
      monthlyUsd: effective.monthlyUsd,
      savedDailyUsd: settings.dailyLimitUsd,
      savedMonthlyUsd: settings.monthlyLimitUsd,
      dailyCapUsd: dailyCap,
      monthlyCapUsd: monthlyCap,
    },
    spend: { todayUsd: spend.today, monthUsd: spend.month, day: todaySydney() },
    database: { connected },
    disabledByEnv,
    settings,
    warnings,
  })
})
