/**
 * Admin authentication.
 *
 * Design notes:
 *
 * - TIMING-SAFE COMPARE. `crypto.timingSafeEqual` throws on length mismatch,
 *   and a plain `===` on secrets leaks length/prefix information through
 *   response timing. Hashing both sides with SHA-256 first guarantees equal
 *   32-byte buffers, so one code path handles every input and the comparison
 *   runs in constant time regardless of what was submitted.
 *
 * - STATELESS TOKEN. There is no session table (the KV store is optional), so
 *   the token carries its own expiry and is authenticated with an HMAC:
 *     base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))
 *   Tampering with `exp` invalidates the signature; the signature alone is
 *   useless without the payload. 12-hour lifetime, no refresh.
 *
 * - NEVER FAIL OPEN. If `ADMIN_PASSWORD` is unset the admin surface is
 *   *unconfigured*, not *open*: every admin endpoint answers 503. An
 *   accidentally missing env var must not expose orders.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { fail, header, type ApiRequest, type ApiResponse } from './http.js'

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

export function isAdminConfigured(): boolean {
  const password = process.env.ADMIN_PASSWORD
  return typeof password === 'string' && password.length > 0
}

/**
 * Signing key for tokens. A dedicated `ADMIN_SESSION_SECRET` is strongly
 * preferred; if it is absent we derive a stable key from the password so the
 * admin panel still works on a minimal deployment. The derived form means
 * rotating the password also invalidates every issued token, which is the
 * safer of the two behaviours.
 */
function sessionSecret(): string | null {
  const explicit = process.env.ADMIN_SESSION_SECRET
  if (explicit && explicit.length > 0) return explicit

  const password = process.env.ADMIN_PASSWORD
  if (!password) return null

  return createHash('sha256')
    .update(`spartan-admin-session:${password}`)
    .digest('hex')
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function base64url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64')
}

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */

/** Constant-time password check over equal-length SHA-256 digests. */
export function checkPassword(candidate: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  if (typeof candidate !== 'string') return false

  const a = sha256(candidate)
  const b = sha256(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface IssuedToken {
  token: string
  expiresAt: string
}

export function issueToken(now = Date.now()): IssuedToken | null {
  const secret = sessionSecret()
  if (!secret) return null

  const exp = now + TOKEN_TTL_MS
  const payload = JSON.stringify({ exp })
  const encoded = base64url(payload)
  const signature = base64url(
    createHmac('sha256', secret).update(encoded).digest(),
  )

  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(exp).toISOString(),
  }
}

/* ------------------------------------------------------------------ *
 * Verification
 * ------------------------------------------------------------------ */

/**
 * Accepts either a full `Authorization: Bearer <token>` header value or a bare
 * token. Returns false for anything malformed, mis-signed or expired.
 */
export function verifyToken(authHeader: string | undefined): boolean {
  const secret = sessionSecret()
  if (!secret) return false
  if (!authHeader) return false

  const raw = authHeader.replace(/^Bearer\s+/i, '').trim()
  const parts = raw.split('.')
  if (parts.length !== 2) return false

  const [encoded, signature] = parts
  if (!encoded || !signature) return false

  const expected = createHmac('sha256', secret).update(encoded).digest()
  const provided = fromBase64url(signature)

  if (provided.length !== expected.length) return false
  if (!timingSafeEqual(provided, expected)) return false

  let payload: unknown
  try {
    payload = JSON.parse(fromBase64url(encoded).toString('utf8'))
  } catch {
    return false
  }

  const exp = (payload as { exp?: unknown } | null)?.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return false

  return Date.now() < exp
}

/**
 * Endpoint gate. Writes the response and returns false when the caller must
 * stop. Order matters: "not configured" (503) is reported before "not
 * authorised" (401) so an operator debugging a deploy gets a useful message.
 */
export function requireAdmin(req: ApiRequest, res: ApiResponse): boolean {
  if (!isAdminConfigured()) {
    fail(
      res,
      503,
      'Admin is not configured on this deployment. Set the ADMIN_PASSWORD environment variable.',
    )
    return false
  }

  if (!verifyToken(header(req, 'authorization'))) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    fail(res, 401, 'Your admin session has expired. Please sign in again.')
    return false
  }

  return true
}
