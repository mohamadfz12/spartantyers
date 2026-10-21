/**
 * What the browser and the server say to each other about a voice call with the assistant
 * (api/ai/[action].ts, api/_lib/ai/voice.ts). Plain TypeScript only: the browser, the server and
 * the tests import this file.
 *
 * The voice itself goes straight between the browser and OpenAI's Realtime API (WebRTC). Our
 * server opens each call, answers the assistant's tools, keeps what was said with the chat, and
 * ends the call when its time is up.
 */
import type { ChatEvent } from './protocol.js'

/** The server's id for one call: given to the browser that started it, and needed for everything after. */
export const isCallId = (value: unknown): value is string => typeof value === 'string' && /^v[0-9a-f]{32}$/.test(value)

/** GET /api/ai/voice (and `voice` in GET /api/ai/status): whether the chat shows the Call button, and how long a call may last. */
export type VoiceStatus = { available: boolean; practice: boolean; seconds: number }

/** POST /api/ai/voice { action: 'start' }: the call, ready for the browser to connect. */
export type StartedCall = {
  id: string
  /** OpenAI's answer to the browser's offer (WebRTC). Absent in practice mode, where nothing is connected. */
  sdp?: string
  practice: boolean
  /** How long the call may last, and when it ends (ISO). */
  seconds: number
  endsAt: string
}

/** Why a call could not start: the chat says so in plain words (refusalText). */
export type VoiceRefusal = 'not_configured' | 'off' | 'busy' | 'daily' | 'monthly' | 'visitor' | 'already' | 'unavailable' | 'error'

/** POST /api/ai/voice { action: 'tool' }: what the tool returned for the model, and what to show on screen. */
export type ToolAnswer = { output: string; events: ChatEvent[] }

/** One message in a practice call, in the chat format the practice AI reads. */
export type PracticeMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

/** POST /api/ai/voice { action: 'practice' }: the practice AI's next step. */
export type PracticeAnswer = { text: string; calls: { id: string; name: string; arguments: string }[] }

/**
 * The tokens a call used, summed from OpenAI's response.done events, sent with the end of the call
 * so the server can record what it cost (api/_lib/ai/voice.ts checks and caps it).
 */
export type VoiceUsage = { audioIn: number; textIn: number; cachedAudio: number; cachedText: number; audioOut: number; textOut: number }

export const emptyUsage = (): VoiceUsage => ({ audioIn: 0, textIn: 0, cachedAudio: 0, cachedText: 0, audioOut: 0, textOut: 0 })

const count = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * Adds one answer's usage (the `usage` of a Realtime response.done event) to the call's total.
 * When OpenAI does not say which cached tokens were audio, they are counted as text, the smaller
 * discount, so the cost is never under-counted.
 */
export function addUsage(sum: VoiceUsage, raw: unknown): VoiceUsage {
  const u = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const input = (u.input_token_details ?? {}) as Record<string, unknown>
  const output = (u.output_token_details ?? {}) as Record<string, unknown>
  const cached = (input.cached_tokens_details ?? null) as Record<string, unknown> | null
  const audioIn = count(input.audio_tokens)
  const textIn = count(input.text_tokens) || Math.max(0, count(u.input_tokens) - audioIn)
  const cachedAudio = cached ? Math.min(audioIn, count(cached.audio_tokens)) : 0
  const cachedText = Math.min(textIn, cached ? count(cached.text_tokens) : count(input.cached_tokens))
  const audioOut = count(output.audio_tokens)
  const textOut = count(output.text_tokens) || Math.max(0, count(u.output_tokens) - audioOut)
  return {
    audioIn: sum.audioIn + audioIn,
    textIn: sum.textIn + textIn,
    cachedAudio: sum.cachedAudio + cachedAudio,
    cachedText: sum.cachedText + cachedText,
    audioOut: sum.audioOut + audioOut,
    textOut: sum.textOut + textOut,
  }
}

/** A usage total as the server accepts it: whole, non-negative numbers, each within a sane bound. */
export function cleanUsage(raw: unknown): VoiceUsage | null {
  if (!raw || typeof raw !== 'object') return null
  const u = raw as Record<string, unknown>
  const n = (value: unknown) => Math.min(10_000_000, count(value))
  const out = { audioIn: n(u.audioIn), textIn: n(u.textIn), cachedAudio: n(u.cachedAudio), cachedText: n(u.cachedText), audioOut: n(u.audioOut), textOut: n(u.textOut) }
  out.cachedAudio = Math.min(out.cachedAudio, out.audioIn)
  out.cachedText = Math.min(out.cachedText, out.textIn)
  return out
}

/** The longest line of a call's transcript the server keeps, in characters. */
export const LINE_MAX = 1000

/** An en or em dash, written as codes so this file holds none. */
const DASH = String.fromCharCode(0x2013, 0x2014)
const BETWEEN_NUMBERS = new RegExp(String.raw`(\d)\s*[${DASH}]\s*(?=\d)`, 'g')
const AS_PUNCTUATION = new RegExp(String.raw`\s*[${DASH}]+\s*|\s+-\s+`, 'g')

/**
 * A call's words as the site shows and keeps them. OpenAI's transcripts use dashes as punctuation,
 * which the site never shows: a dash between numbers becomes "to", any other a comma.
 */
export const plainDashes = (text: string) =>
  text
    .replace(BETWEEN_NUMBERS, '$1 to ')
    .replace(AS_PUNCTUATION, ', ')
    .replace(/,(\s*,)+/g, ',')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/^,\s*/, '')

/** What the chat says when a call cannot start, by reason. */
export function refusalText(reason: VoiceRefusal | string, phone: string): string {
  switch (reason) {
    case 'busy':
    case 'visitor':
      return `Calls with the assistant are busy right now. You can keep typing here, or call the sales team on ${phone}.`
    case 'daily':
    case 'monthly':
    case 'off':
    case 'not_configured':
      return `Calls with the assistant are not available right now. You can keep typing here, or call the sales team on ${phone}.`
    case 'already':
      return `You already have a call going in another window or tab. End that one first, or keep typing here, or call the sales team on ${phone}.`
    case 'unavailable':
      return `The assistant's voice is not answering right now. Please try again in a minute, keep typing here, or call the sales team on ${phone}.`
    default:
      return `The call could not start. Please try again, keep typing here, or call the sales team on ${phone}.`
  }
}

/** "1:05": minutes and seconds, for the call's timer. */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
