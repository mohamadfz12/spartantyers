/**
 * The AI model: OpenAI's chat completions API, called with the site's own OpenAI key (the same key
 * the voice calls use). Everything the assistant asks of the model goes through complete(), so
 * every call uses the same timeouts, the same price table and the same usage figures.
 *
 * Settings: OPENAI_API_KEY and OPENAI_CHAT_MODEL (default gpt-4.1-mini), and optionally
 * AI_FALLBACK_MODEL (tried by the assistant in its own reservation, see canFallBack and runTurn in
 * the chat handler) and AI_REASONING_EFFORT for reasoning models (default low). Without a key the
 * AI is off. AI_API_URL points it somewhere other than api.openai.com (tests do). With
 * OPENAI_API_KEY=practice (never on Vercel) it talks to the practice AI (scripts/practice-ai.ts) on
 * localhost, which speaks the same protocol and costs nothing.
 */
import { cap } from './util.js'

export interface AiConfig {
  url: string
  key: string
  model: string
  /** Tried once when the main model fails with a server error or does not answer in time */
  fallbackModel: string
}

export const DEFAULT_CHAT_MODEL = 'gpt-4.1-mini'

/** The model settings, or null when the AI is not set up on this deployment. */
export function aiConfig(): AiConfig | null {
  const key = String(process.env.OPENAI_API_KEY || '').trim()
  if (!key) return null
  const practice = key === 'practice' && !process.env.VERCEL
  const url = String(
    process.env.AI_API_URL || (practice ? `http://localhost:${Number(process.env.PRACTICE_AI_PORT) || 3410}` : 'https://api.openai.com'),
  )
    .trim()
    .replace(/\/+$/, '')
  const model = String(process.env.OPENAI_CHAT_MODEL || '').trim() || (practice ? 'practice/assistant' : DEFAULT_CHAT_MODEL)
  const fallbackModel = String(process.env.AI_FALLBACK_MODEL || '').trim()
  return url ? { url, key, model, fallbackModel } : null
}

/**
 * True for the practice AI, which costs nothing: the URL is on this machine (localhost or
 * 127.0.0.1) AND the key is exactly `practice`. Never on Vercel. A real key on a local stand-in, or
 * the word `practice` on a real URL, is counted at full price.
 */
export function isPracticeAi(cfg: Pick<AiConfig, 'url'> & Partial<Pick<AiConfig, 'key'>> | null = aiConfig()): boolean {
  if (!cfg || process.env.VERCEL || cfg.key !== 'practice') return false
  try {
    const host = new URL(cfg.url).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

/**
 * OpenAI's reasoning models (gpt-5 and later, o1/o3/o4) think before they answer, take no
 * temperature, and count their thinking against the answer allowance.
 */
export const isReasoningModel = (model: string) => /^(gpt-[5-9]|o\d)/i.test(model.trim())

/** Room for a reasoning model's thinking on top of the visible answer, in tokens. */
const REASONING_HEADROOM = 2000

/** The output tokens one call may use: the answer, plus thinking room on a reasoning model. */
export const outputAllowance = (model: string, maxTokens: number) =>
  isReasoningModel(model) ? maxTokens + REASONING_HEADROOM : maxTokens

/* ------------------------------------------------------------------- prices */

/**
 * US dollars per million tokens. The defaults are deliberately above gpt-4.1-mini's and
 * gpt-5-mini's real prices, so the spending limits over-count rather than under-count; set
 * AI_PRICE_* when the model or its price changes (a larger model costs more than the defaults). The practice AI costs nothing. The fallback model has its own AI_FALLBACK_PRICE_* (each
 * defaults to the main model's price).
 */
export type PriceOf = 'main' | 'fallback'
type Priced = Pick<AiConfig, 'url'> & Partial<Pick<AiConfig, 'key' | 'model' | 'fallbackModel'>>
export function prices(cfg: Priced | null = aiConfig(), which: PriceOf = 'main') {
  if (isPracticeAi(cfg)) return { input: 0, cached: 0, output: 0 }
  const n = (v: string | undefined, fallback: number) => cap(v) ?? fallback
  const main = {
    input: n(process.env.AI_PRICE_INPUT_PER_M, 0.95),
    cached: n(process.env.AI_PRICE_CACHED_PER_M, 0.18),
    output: n(process.env.AI_PRICE_OUTPUT_PER_M, 3),
  }
  if (which === 'main') return main
  return {
    input: n(process.env.AI_FALLBACK_PRICE_INPUT_PER_M, main.input),
    cached: n(process.env.AI_FALLBACK_PRICE_CACHED_PER_M, main.cached),
    output: n(process.env.AI_FALLBACK_PRICE_OUTPUT_PER_M, main.output),
  }
}

export interface Usage {
  promptTokens: number
  cachedTokens: number
  completionTokens: number
}

/**
 * What one call cost, in micro-US-dollars (1 USD = 1,000,000), from the tokens the API
 * reported. A price per million tokens is the same number as micro-dollars per token.
 */
export function costOf(u: Usage, cfg: Priced | null = aiConfig(), which: PriceOf = 'main'): number {
  const p = prices(cfg, which)
  const cached = Math.min(u.cachedTokens, u.promptTokens)
  return Math.ceil((u.promptTokens - cached) * p.input + cached * p.cached + u.completionTokens * p.output)
}

/**
 * The most one call can cost before it is made, in micro-dollars: every character of the request
 * counted as a token (a generous over-count; English runs about four characters to a token) and the
 * full answer allowance (with a reasoning model's thinking room). The limits are checked against
 * this, so a call never crosses them by much.
 */
export function worstCase(requestChars: number, maxTokens: number, cfg: Priced | null = aiConfig(), which: PriceOf = 'main'): number {
  const p = prices(cfg, which)
  const model = (which === 'main' ? cfg?.model : cfg?.fallbackModel) ?? ''
  return Math.ceil(requestChars * p.input + outputAllowance(model, maxTokens) * p.output)
}

/* -------------------------------------------------------------------- calls */

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export type Message =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface Tool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** `reasoningChars`: "thinking" text streamed before the answer (OpenAI does not stream it, so 0 there). */
export interface Completion {
  text: string
  toolCalls: ToolCall[]
  usage: Usage | null
  finishReason: string
  reasoningChars: number
}

export type AiErrorReason = 'timeout' | 'http' | 'network' | 'bad_response' | 'not_configured'

/**
 * The AI answered with an error, or did not answer in time. `billable`: the request reached
 * the model (it was cut off or timed out), so it may have been charged. Messages never hold keys
 * or what the visitor wrote.
 */
export class AiError extends Error {
  reason: AiErrorReason
  status: number
  billable: boolean
  constructor(reason: AiErrorReason, message: string, status = 0, billable = false) {
    super(message)
    this.name = 'AiError'
    this.reason = reason
    this.status = status
    this.billable = billable
  }
}

/** How long one model call may take before it is given up. */
export const CALL_TIMEOUT_MS = 25_000

/** Calls slower than this are written to the server log, so a slow day shows up. */
const SLOW_MS = 10_000

const usageOf = (u: Record<string, unknown> | undefined | null): Usage | null => {
  if (!u) return null
  const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>
  return {
    promptTokens: Number(u.prompt_tokens ?? 0) || 0,
    cachedTokens: Number(details.cached_tokens ?? 0) || 0,
    completionTokens: Number(u.completion_tokens ?? 0) || 0,
  }
}

export interface CompleteOptions {
  messages: Message[]
  tools?: Tool[]
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  maxTokens: number
  temperature?: number
  /** Per call, not for the whole retry; default CALL_TIMEOUT_MS */
  timeoutMs?: number
  signal?: AbortSignal
  /** Receives the answer as it is written */
  onText?: (text: string) => void
  /** Default: aiConfig() */
  config?: AiConfig
  /** The model to ask; default: config.model (the assistant asks the fallback model this way) */
  model?: string
}

/**
 * One call to the model, streamed: `onText` receives the answer as it is written. Tool calls are
 * collected and returned at the end. Throws AiError when the API refuses or times out. It makes
 * exactly one request: the retry on AI_FALLBACK_MODEL is the caller's (runTurn), because a retry is a
 * second paid call and must have its own reservation and price.
 */
export async function complete(opts: CompleteOptions): Promise<Completion> {
  const config = opts.config ?? aiConfig()
  if (!config) throw new AiError('not_configured', 'The AI is not set up.')
  return timed(config, opts.model ?? config.model, opts, (t) => opts.onText?.(t))
}

/**
 * Whether a failed call is worth one retry on the fallback model: one is set, it differs from the
 * main model, nothing of the answer was sent yet, and the failure was a timeout or a server error.
 */
export function canFallBack(err: unknown, config: AiConfig, started = false): boolean {
  return (
    err instanceof AiError &&
    !!config.fallbackModel &&
    config.fallbackModel !== config.model &&
    !started &&
    (err.reason === 'timeout' || (err.reason === 'http' && err.status >= 500))
  )
}

/** One attempt on one model, with its slow or failed call written to the server log. */
async function timed(config: AiConfig, model: string, opts: CompleteOptions, onText: (t: string) => void): Promise<Completion> {
  const t0 = Date.now()
  try {
    const out = await attempt(config, model, opts, onText)
    const ms = Date.now() - t0
    if (ms > SLOW_MS) console.warn(`[ai] slow call on ${model}: ${ms} ms`)
    return out
  } catch (err) {
    const detail = err instanceof AiError ? `${err.reason}${err.status ? ` ${err.status}` : ''}` : 'error'
    console.warn(`[ai] call on ${model} failed: ${detail} after ${Date.now() - t0} ms`)
    throw err
  }
}

async function attempt(config: AiConfig, model: string, opts: CompleteOptions, onText: (t: string) => void): Promise<Completion> {
  const timeout = AbortSignal.timeout(Math.max(100, opts.timeoutMs ?? CALL_TIMEOUT_MS))
  const res = await fetch(`${config.url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto' } : {}),
      max_completion_tokens: outputAllowance(model, opts.maxTokens),
      ...(isReasoningModel(model)
        ? { reasoning_effort: String(process.env.AI_REASONING_EFFORT || '').trim() || 'low' }
        : { temperature: opts.temperature ?? 0.3 }),
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout,
  }).catch((err: unknown) => {
    // Timed out or stopped while waiting: the request may already be with the model.
    if (timeout.aborted) throw new AiError('timeout', 'The AI took too long to answer.', 0, true)
    if (opts.signal?.aborted) throw new AiError('network', 'The request was stopped.', 0, true)
    // fetch's own message can name the host but never holds the key
    throw new AiError('network', `Could not reach the AI: ${String((err as Error)?.message || err).slice(0, 200)}`)
  })
  if (!res.ok || !res.body) {
    // The body is read only to free the connection; it is not put in the message (it may echo the request)
    await res.text().catch(() => '')
    throw new AiError('http', `The AI answered ${res.status}.`, res.status)
  }

  const calls = new Map<number, ToolCall>()
  let text = ''
  let usage: Usage | null = null
  let finishReason = ''
  let reasoningChars = 0
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    let chunk: Record<string, unknown>
    try {
      chunk = JSON.parse(data)
    } catch {
      return
    }
    if (chunk.error) throw new AiError('bad_response', 'The AI reported an error while answering.', 0, true)
    if (chunk.usage) usage = usageOf(chunk.usage as Record<string, unknown>)
    const choice = ((chunk.choices as unknown[]) ?? [])[0] as Record<string, unknown> | undefined
    if (!choice) return
    if (choice.finish_reason) finishReason = String(choice.finish_reason)
    const delta = (choice.delta ?? {}) as Record<string, unknown>
    if (typeof delta.reasoning_content === 'string') reasoningChars += delta.reasoning_content.length
    if (typeof delta.content === 'string' && delta.content) {
      text += delta.content
      onText(delta.content)
    }
    for (const raw of (delta.tool_calls as Record<string, unknown>[] | undefined) ?? []) {
      const fn = (raw.function ?? {}) as Record<string, unknown>
      const id = typeof raw.id === 'string' ? raw.id : ''
      let index = typeof raw.index === 'number' ? raw.index : -1
      if (index < 0) {
        // A provider that leaves out the index: a new id starts a new call, anything else continues the last one.
        const known = id ? [...calls.entries()].find(([, c]) => c.id === id) : undefined
        index = known ? known[0] : id ? calls.size : Math.max(0, calls.size - 1)
      }
      let slot = calls.get(index) ?? { id: '', name: '', arguments: '' }
      if (id && slot.id && slot.id !== id) {
        // A different call at an index already in use: keep both.
        index = Math.max(...calls.keys()) + 1
        slot = { id: '', name: '', arguments: '' }
      }
      if (id) slot.id = id
      // Usually the name comes once; some providers repeat it whole in later pieces.
      if (typeof fn.name === 'string' && fn.name && slot.name !== fn.name) slot.name += fn.name
      if (typeof fn.arguments === 'string') slot.arguments += fn.arguments
      calls.set(index, slot)
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, nl).trim())
        buffer = buffer.slice(nl + 1)
      }
    }
    handle(buffer.trim())
  } catch (err) {
    if (err instanceof AiError) throw err
    if (timeout.aborted) throw new AiError('timeout', 'The AI took too long to answer.', 0, true)
    throw new AiError('network', 'The AI answer was cut off.', 0, true)
  }
  const toolCalls = [...calls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([i, c]) => ({ ...c, id: c.id || `call_${i}` }))
    .filter((c) => c.name)
  return { text, toolCalls, usage, finishReason, reasoningChars }
}
