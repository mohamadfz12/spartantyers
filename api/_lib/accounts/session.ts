/**
 * Customer sessions. Completely separate from staff tokens (`auth.ts`):
 *
 *   - a different KEY: derived from `ADMIN_SESSION_SECRET` with the context label
 *     `spartan-customer-session-v1`, so a staff token never verifies here and a customer token never
 *     verifies there;
 *   - a `typ: 'customer'` claim, checked here and refused by the staff reader (a payload without
 *     `sub` is the OWNER in `authorize()`, so this must never be accepted there);
 *   - a different transport: an httpOnly cookie, never the `Authorization` header.
 *
 * The token only says who and which version. `getSessionAccount` re-reads the account on every
 * request, so suspending someone, or a password change, ends their sessions at once.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { header, type ApiRequest } from '../http.js'
import { getAccount, type AccountRecord } from './repo.js'

export const COOKIE_NAME = 'spt_session'
const TTL_SECONDS = 30 * 24 * 60 * 60
const CONTEXT = 'spartan-customer-session-v1'

/* ------------------------------------------------------------------ *
 * Key
 * ------------------------------------------------------------------ */

/** True on a deployment where the key must come from the environment, never from source. */
const requiresSecret = () => !!process.env.VERCEL || process.env.NODE_ENV === 'production'

/**
 * The signing key, or null when accounts are off. On Vercel (or in production) a missing
 * `ADMIN_SESSION_SECRET` means no accounts (503), never a built-in key. Only on a developer's own
 * machine is a clearly labelled local-only key used so accounts can be tried without setup.
 */
function customerKey(): Buffer | null {
  const secret = process.env.ADMIN_SESSION_SECRET
  const base = secret && secret.length > 0 ? secret : requiresSecret() ? null : 'LOCAL-DEVELOPMENT-ONLY-not-a-secret'
  if (!base) return null
  return createHmac('sha256', base).update(CONTEXT).digest()
}

/** False when customer accounts cannot run on this deployment (callers answer 503). */
export const accountsConfigured = (): boolean => customerKey() !== null

/* ------------------------------------------------------------------ *
 * Token
 * ------------------------------------------------------------------ */

interface CustomerPayload {
  typ: 'customer'
  sub: string
  v: number
  exp: number
}

const b64 = (value: Buffer | string): string => Buffer.from(value).toString('base64url')

const sign = (key: Buffer, encoded: string): Buffer => createHmac('sha256', key).update(encoded).digest()

export interface IssuedCustomerToken {
  token: string
  /** Seconds, for the cookie's Max-Age. */
  maxAge: number
  expiresAt: string
}

export function issueCustomerToken(
  account: Pick<AccountRecord, 'id' | 'tokenVersion'>,
  now = Date.now(),
): IssuedCustomerToken | null {
  const key = customerKey()
  if (!key) return null
  const exp = now + TTL_SECONDS * 1000
  const payload: CustomerPayload = { typ: 'customer', sub: account.id, v: account.tokenVersion, exp }
  const encoded = b64(JSON.stringify(payload))
  return { token: `${encoded}.${b64(sign(key, encoded))}`, maxAge: TTL_SECONDS, expiresAt: new Date(exp).toISOString() }
}

/** A correctly signed, unexpired customer token's payload, or null for anything else. */
export function readCustomerToken(raw: string | undefined, now = Date.now()): CustomerPayload | null {
  const key = customerKey()
  if (!key || !raw) return null
  const parts = raw.trim().split('.')
  if (parts.length !== 2) return null
  const [encoded, signature] = parts
  if (!encoded || !signature) return null

  const expected = sign(key, encoded)
  const provided = Buffer.from(signature, 'base64url')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const p = (payload ?? {}) as Partial<CustomerPayload>
  if (p.typ !== 'customer') return null
  if (typeof p.sub !== 'string' || !p.sub || typeof p.v !== 'number' || !Number.isInteger(p.v)) return null
  if (typeof p.exp !== 'number' || !Number.isFinite(p.exp) || now >= p.exp) return null
  return { typ: 'customer', sub: p.sub, v: p.v, exp: p.exp }
}

/* ------------------------------------------------------------------ *
 * Cookie
 * ------------------------------------------------------------------ */

/** A small cookie-header parser (no dependency). A repeated name keeps its first value. */
export function parseCookies(headerValue: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headerValue) return out
  for (const raw of headerValue.split(';')) {
    const part = raw.trim()
    const at = part.indexOf('=')
    if (at < 1) continue
    const name = part.slice(0, at).trim()
    let value = part.slice(at + 1).trim()
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1)
    if (name in out) continue
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}

/** True when the request came to a developer's own machine (the cookie then goes without `Secure`). */
function isLocalHost(req: ApiRequest): boolean {
  const host = (header(req, 'host') ?? '').toLowerCase().replace(/:\d+$/, '')
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
}

/** The `Set-Cookie` value that signs the browser in. `Secure` everywhere except localhost (never off on Vercel). */
export function sessionCookie(req: ApiRequest, issued: IssuedCustomerToken): string {
  const secure = !!process.env.VERCEL || !isLocalHost(req)
  return `${COOKIE_NAME}=${issued.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${issued.maxAge}${secure ? '; Secure' : ''}`
}

/** The `Set-Cookie` value that signs the browser out. */
export function clearedCookie(req: ApiRequest): string {
  const secure = !!process.env.VERCEL || !isLocalHost(req)
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
}

/* ------------------------------------------------------------------ *
 * Who is asking
 * ------------------------------------------------------------------ */

/**
 * The signed-in customer, or null. Only the cookie counts (never `Authorization`). The account must
 * still be active, have a password, and carry the same token version as the token.
 */
export async function getSessionAccount(req: ApiRequest): Promise<AccountRecord | null> {
  const raw = parseCookies(header(req, 'cookie'))[COOKIE_NAME]
  const payload = readCustomerToken(raw)
  if (!payload) return null
  const account = await getAccount(payload.sub)
  if (!account || account.status !== 'active' || !account.passwordHash || account.tokenVersion !== payload.v) return null
  return account
}
