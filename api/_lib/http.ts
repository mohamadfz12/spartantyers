/**
 * Minimal HTTP plumbing for the Vercel Node serverless functions.
 *
 * `@vercel/node` is deliberately NOT a dependency of this repo (zero new npm
 * packages), so the request/response shapes the runtime actually hands us are
 * declared locally. They are a structural subset of `VercelRequest` /
 * `VercelResponse`, so swapping in the real types later is a drop-in change.
 */

export interface ApiRequest {
  method?: string
  body?: any
  query?: Record<string, string | string[]>
  headers: Record<string, string | string[] | undefined>
}

export interface ApiResponse {
  status(code: number): ApiResponse
  json(body: unknown): void
  setHeader(k: string, v: string): void
  end(): void
}

export type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>

/* ------------------------------------------------------------------ *
 * Body + query parsing
 * ------------------------------------------------------------------ */

/**
 * Vercel's Node runtime normally parses `application/json` for us, but it
 * leaves the raw string in place when the content-type header is missing or
 * unexpected. Handle both so a client that forgets the header still works.
 */
export function readBody<T>(req: ApiRequest): T | null {
  const raw = req.body

  if (raw == null) return null

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      return JSON.parse(trimmed) as T
    } catch {
      return null
    }
  }

  // Buffer / Uint8Array bodies (no body parser configured at all).
  if (typeof raw === 'object' && raw !== null && isBinaryBody(raw)) {
    try {
      return JSON.parse(Buffer.from(raw as Uint8Array).toString('utf8')) as T
    } catch {
      return null
    }
  }

  if (typeof raw === 'object') return raw as T

  return null
}

function isBinaryBody(value: object): boolean {
  return (
    value instanceof Uint8Array ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
  )
}

/** First value of a query parameter, ignoring repeats. */
export function queryParam(req: ApiRequest, key: string): string | undefined {
  const value = req.query?.[key]
  if (value == null) return undefined
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : undefined
}

/** First value of a request header, lower-cased key lookup. */
export function header(req: ApiRequest, key: string): string | undefined {
  const value = req.headers?.[key.toLowerCase()]
  if (value == null) return undefined
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' ? first : undefined
}

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

export function ok(res: ApiResponse, data: unknown): void {
  res.status(200).json(data)
}

/**
 * Single error envelope: `src/lib/api.ts` reads `payload.error` for the
 * message it surfaces to the user, so every failure must use this key.
 */
export function fail(res: ApiResponse, status: number, message: string): void {
  res.status(status).json({ error: message })
}

/**
 * Returns true when the request may continue. Answers OPTIONS pre-flight and
 * 405s anything else, advertising the allowed verbs as the spec requires.
 */
export function methodGuard(
  req: ApiRequest,
  res: ApiResponse,
  methods: string[],
): boolean {
  const method = (req.method ?? 'GET').toUpperCase()
  const allowed = methods.map((m) => m.toUpperCase())

  if (method === 'OPTIONS') {
    res.setHeader('Allow', [...allowed, 'OPTIONS'].join(', '))
    res.setHeader(
      'Access-Control-Allow-Methods',
      [...allowed, 'OPTIONS'].join(', '),
    )
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.status(204).end()
    return false
  }

  if (!allowed.includes(method)) {
    res.setHeader('Allow', allowed.join(', '))
    fail(res, 405, `Method ${method} not allowed. Use ${allowed.join(' or ')}.`)
    return false
  }

  return true
}

/* ------------------------------------------------------------------ *
 * CORS
 *
 * The SPA is served from the same deployment as these functions, so no
 * cross-origin access is required in production. We therefore only ever echo
 * an origin we recognise as our own deployment (or a local dev server) and
 * otherwise omit the header entirely — an absent ACAO is the safe default.
 * ------------------------------------------------------------------ */

function allowedOrigins(): string[] {
  const list: string[] = []
  const push = (host: string | undefined) => {
    if (host) list.push(host.startsWith('http') ? host : `https://${host}`)
  }

  push(process.env.VERCEL_URL)
  push(process.env.VERCEL_BRANCH_URL)
  push(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  push(process.env.PUBLIC_SITE_URL)

  if (process.env.VERCEL_ENV !== 'production') {
    list.push('http://localhost:5173', 'http://127.0.0.1:5173')
  }

  return list
}

export function applyCors(req: ApiRequest, res: ApiResponse): void {
  res.setHeader('Vary', 'Origin')
  const origin = header(req, 'origin')
  if (!origin) return
  if (allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
}

/* ------------------------------------------------------------------ *
 * Error boundary
 * ------------------------------------------------------------------ */

/**
 * Wraps a handler so an unexpected throw becomes a generic 500. Stack traces
 * and secret-bearing messages are logged at most as a single-line label and
 * never serialised to the client.
 */
export function withGuard(handler: Handler): Handler {
  return async (req, res) => {
    applyCors(req, res)
    try {
      await handler(req, res)
    } catch (error) {
      // Log only the message — never the error object (it can carry request
      // headers / tokens from fetch failures) and never a stack trace.
      console.error('[api] unhandled error:', safeMessage(error))
      fail(res, 500, 'Something went wrong on our end. Please try again.')
    }
  }
}

export function safeMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}

/* ------------------------------------------------------------------ *
 * Validation helpers
 * ------------------------------------------------------------------ */

export function asString(value: unknown, maxLength = 2000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function asEmail(value: unknown): string | null {
  const text = asString(value, 254)
  if (!text) return null
  return EMAIL_RE.test(text) ? text : null
}

export function asPhone(value: unknown): string | null {
  const text = asString(value, 40)
  if (!text) return null
  // Australian numbers arrive in a dozen shapes; only require enough digits.
  const digits = text.replace(/\D/g, '')
  return digits.length >= 8 ? text : null
}

export function asPositiveInt(value: unknown, max = 100000): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max) {
    return null
  }
  return n
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
