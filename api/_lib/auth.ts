/**
 * Admin authentication and permissions.
 *
 * Design notes:
 *
 * - TWO WAYS IN. The owner signs in with `ADMIN_PASSWORD` alone, which always
 *   works, so a lost staff database can never lock the business out of its
 *   own admin. Everyone else signs in with their email and their own password,
 *   created on the Staff page.
 *
 * - TIMING-SAFE COMPARE. `crypto.timingSafeEqual` throws on length mismatch,
 *   and a plain `===` on secrets leaks length/prefix information through
 *   response timing. Hashing both sides with SHA-256 first guarantees equal
 *   32-byte buffers, so one code path handles every input and the comparison
 *   runs in constant time regardless of what was submitted.
 *
 * - STAFF PASSWORDS ARE SCRYPT HASHES, salted per person. The plain password
 *   exists only for the length of the request that sets or checks it.
 *
 * - STATELESS TOKEN. The token carries its own expiry and is authenticated
 *   with an HMAC:
 *     base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))
 *   Tampering with the payload invalidates the signature. 12-hour lifetime,
 *   no refresh. A staff token also names the person and their `tokenVersion`,
 *   and `authorize` re-reads the person on every request: deactivating
 *   someone, changing their role or resetting their password takes effect on
 *   their very next click, not in 12 hours.
 *
 * - NEVER FAIL OPEN. If `ADMIN_PASSWORD` is unset the admin surface is
 *   *unconfigured*, not *open*: every admin endpoint answers 503. An
 *   accidentally missing env var must not expose orders.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'
import { can, type Permission, type StaffRole } from '../../src/lib/admin-roles.js'
import { fail, header, type ApiRequest, type ApiResponse } from './http.js'
import { getStaff, type StoredStaff } from './store.js'

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

/** The person behind a request. The env-password owner has id `owner`. */
export interface Actor {
  id: string
  name: string
  role: StaffRole
  email: string
}

export const OWNER_ACTOR: Actor = { id: 'owner', name: 'Owner', role: 'owner', email: '' }

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
 * Passwords
 * ------------------------------------------------------------------ */

/** Constant-time check of the owner password over equal-length SHA-256 digests. */
export function checkPassword(candidate: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  if (typeof candidate !== 'string') return false

  const a = sha256(candidate)
  const b = sha256(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const STAFF_PASSWORD_MIN = 10

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 }

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

/** `scrypt$N$r$p$salt$hash`, so the cost can be raised later without breaking old hashes. */
export async function hashStaffPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, base64url(salt), base64url(key)].join('$')
}

export async function verifyStaffPassword(password: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, hash] = parts
  const expected = fromBase64url(hash!)
  try {
    const key = await scrypt(password, fromBase64url(salt!), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      // Room for the configured cost; Node's default ceiling is exactly 32MB.
      maxmem: 64 * 1024 * 1024,
    })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/**
 * Runs the same work as a real check so "no such email" and "wrong password"
 * take the same time and cannot be told apart.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  await scrypt(password, randomBytes(16), SCRYPT.keyLength, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })
}

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

export interface IssuedToken {
  token: string
  expiresAt: string
}

interface TokenPayload {
  exp: number
  /** Staff id. Absent for the env-password owner. */
  sub?: string
  /** The staff member's `tokenVersion` when this was issued. */
  v?: number
}

/** With no staff member, a token for the env-password owner. */
export function issueToken(now = Date.now(), staff?: Pick<StoredStaff, 'id' | 'tokenVersion'>): IssuedToken | null {
  const secret = sessionSecret()
  if (!secret) return null

  const exp = now + TOKEN_TTL_MS
  const payload: TokenPayload = staff ? { exp, sub: staff.id, v: staff.tokenVersion } : { exp }
  const encoded = base64url(JSON.stringify(payload))
  const signature = base64url(
    createHmac('sha256', secret).update(encoded).digest(),
  )

  return {
    token: `${encoded}.${signature}`,
    expiresAt: new Date(exp).toISOString(),
  }
}

/**
 * Accepts either a full `Authorization: Bearer <token>` header value or a bare
 * token. Returns null for anything malformed, mis-signed or expired.
 */
function readToken(authHeader: string | undefined): TokenPayload | null {
  const secret = sessionSecret()
  if (!secret) return null
  if (!authHeader) return null

  const raw = authHeader.replace(/^Bearer\s+/i, '').trim()
  const parts = raw.split('.')
  if (parts.length !== 2) return null

  const [encoded, signature] = parts
  if (!encoded || !signature) return null

  const expected = createHmac('sha256', secret).update(encoded).digest()
  const provided = fromBase64url(signature)

  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  let payload: unknown
  try {
    payload = JSON.parse(fromBase64url(encoded).toString('utf8'))
  } catch {
    return null
  }

  const { exp, sub, v } = (payload ?? {}) as Partial<TokenPayload>
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  if (Date.now() >= exp) return null
  if (sub !== undefined && (typeof sub !== 'string' || typeof v !== 'number')) return null

  return { exp, ...(sub ? { sub, v } : {}) }
}

/** True for a well-formed, correctly signed, unexpired token. Does not check the person is still active. */
export function verifyToken(authHeader: string | undefined): boolean {
  return readToken(authHeader) !== null
}

export function actorFor(staff: StoredStaff): Actor {
  return { id: staff.id, name: staff.name, role: staff.role, email: staff.email }
}

const SESSION_ENDED = 'Your admin session has expired. Please sign in again.'

/**
 * Endpoint gate. Writes the response and returns null when the caller must
 * stop; otherwise returns who is asking.
 *
 * Order matters: "not configured" (503) before "not signed in" (401) before
 * "not allowed" (403), so an operator debugging a deploy gets a useful
 * message and nobody learns what an endpoint does before proving who they are.
 */
export async function authorize(
  req: ApiRequest,
  res: ApiResponse,
  permission: Permission,
): Promise<Actor | null> {
  if (!isAdminConfigured()) {
    fail(
      res,
      503,
      'Admin is not configured on this deployment. Set the ADMIN_PASSWORD environment variable.',
    )
    return null
  }

  const payload = readToken(header(req, 'authorization'))
  if (!payload) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    fail(res, 401, SESSION_ENDED)
    return null
  }

  let actor = OWNER_ACTOR
  if (payload.sub) {
    const staff = await getStaff(payload.sub)
    if (!staff || !staff.active || !staff.passwordHash || staff.tokenVersion !== payload.v) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      fail(res, 401, SESSION_ENDED)
      return null
    }
    actor = actorFor(staff)
  }

  if (!can(actor.role, permission)) {
    fail(res, 403, 'Your account does not have access to this. Ask the owner if you need it.')
    return null
  }

  return actor
}
