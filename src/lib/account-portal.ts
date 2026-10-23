/* ------------------------------------------------------------------ *
 * Customer portal helpers that need no browser: the safe "go back to"
 * path after signing in, available credit, level names and the password
 * rules shown beside the form. Kept React-free so they are unit tested.
 * ------------------------------------------------------------------ */

export type AccountLevel = 'customer' | 'bulk' | 'wholesaler'

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 200

export const LEVEL_LABEL: Record<AccountLevel, string> = {
  customer: 'Customer',
  bulk: 'Bulk',
  wholesaler: 'Wholesaler',
}

const BACKSLASH = String.fromCharCode(92)

function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code < 32 || code === 127) return true
  }
  return false
}

/** The level named by `?level=`; anything else is a plain Customer sign-up. */
export function levelFromParam(value: string | null | undefined): AccountLevel {
  return value === 'wholesaler' || value === 'bulk' ? value : 'customer'
}

/**
 * Where to go after signing in. Only a path on this site inside /account, the home page, or one of
 * the shopping pages a customer logs in from to see their prices (shop, product, compare, deals, cart,
 * checkout) is followed. An absolute URL, a protocol-relative `//host`, a backslash trick or anything
 * with control characters falls back to /account.
 */
export function safeNext(value: string | null | undefined, fallback = '/account'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 300) return fallback
  // The raw text and every decoded form (twice, to catch double encoding) must all be safe.
  const forms = [value]
  try {
    const once = decodeURIComponent(value)
    forms.push(once, decodeURIComponent(once))
  } catch {
    return fallback
  }
  for (const form of forms) if (!isSafeLocalPath(form)) return fallback
  return value
}

/** Shopping pages a signed-out customer may come back to after logging in. */
const RETURN_PAGES = new Set(['/shop', '/products', '/compare', '/deals', '/cart', '/checkout'])

/** A path on this site we may return to: no scheme, no host, no backslash, no dot segments. */
function isSafeLocalPath(text: string): boolean {
  if (!text.startsWith('/') || text.startsWith('//')) return false
  if (text.includes(BACKSLASH) || hasControlCharacter(text)) return false
  const path = text.split(/[?#]/)[0] ?? ''
  if (path.split('/').some((part) => part === '..' || part === '.')) return false
  if (path === '/' || path === '/account' || path.startsWith('/account/')) return true
  return RETURN_PAGES.has(path) || /^\/product\/[A-Za-z0-9_-]+$/.test(path)
}

/** The login address that brings a signed-out visitor back to `from` afterwards. */
export function loginPathFor(from: string): string {
  const next = safeNext(from, '')
  return next && next !== '/account' ? `/account/login?next=${encodeURIComponent(next)}` : '/account/login'
}

/** Credit left to spend: limit minus what is owed, never below zero. Works in whole cents. */
export function availableCredit(limit: number, outstanding: number): number {
  const cents = Math.round(limit * 100) - Math.round(outstanding * 100)
  return Math.max(0, cents) / 100
}

/** Short name for the header: first name, else company, else the email's first part. */
export function shortName(account: { name: string; company: string; email: string }): string {
  const first = account.name.trim().split(/\s+/)[0]
  if (first) return first
  if (account.company.trim()) return account.company.trim()
  return account.email.split('@')[0] ?? 'Account'
}

export interface PasswordCheck {
  id: string
  label: string
  ok: boolean
}

/** What the sign-up and set-password forms tell the customer about the password they are typing. */
export function passwordChecks(password: string, email = ''): PasswordCheck[] {
  const sameAsEmail = email.trim() !== '' && password.trim().toLowerCase() === email.trim().toLowerCase()
  return [
    { id: 'length', label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { id: 'email', label: 'Not the same as your email address', ok: password.length > 0 && !sameAsEmail },
  ]
}

export function passwordAcceptable(password: string, email = ''): boolean {
  return password.length <= PASSWORD_MAX && passwordChecks(password, email).every((check) => check.ok)
}

/** Due date style used on the dashboard: "30 days" or "Due on delivery". */
export function termsText(termsDays: number): string {
  if (!termsDays || termsDays <= 0) return 'Payment on delivery'
  return `${termsDays} ${termsDays === 1 ? 'day' : 'days'} from the invoice`
}
