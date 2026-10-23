/**
 * The customer account API (`/api/account/<action>`, one Vercel function: api/account/[action].ts).
 *
 *   GET  me            the signed-in customer's account, or 401
 *   GET  session       the same, but signed out is a normal 200 { account: null } (the browser's check)
 *   POST signup        open a Customer account (and ask for Bulk / Wholesaler); signs in
 *   POST login         email + password; sets the session cookie
 *   POST logout        clears the cookie
 *   POST forgot        always { ok: true }; emails a reset link when an active account exists
 *   POST set-password  uses a single-use invite / reset link; signs in
 *   POST details       the customer's own name, company, phone, ABN and address
 *   POST password      change the password (needs the current one)
 *   GET  prices        the signed-in customer's own prices (where they beat the shop price)
 *   GET  orders        the customer's own website orders, newest first
 *   GET  statement     what they owe (due dates, overdue), payments received, balance
 *   POST order         a pay-later order (needs pay later on the account); all or nothing
 *   GET  dev-outbox    local development only: the emails that would have been sent
 *
 * Every answer is `Cache-Control: private, no-store`. Every POST needs this site's `Origin` and a JSON
 * body. Errors are `{ error, field? }`. See api/README.md for the exact shapes.
 */
import { site } from '../../../src/config/site.js'
import { accountPriceList } from '../../../src/lib/account-pricing.js'
import { mergeCatalogue } from '../catalogue.js'
import { getOverrides } from '../store.js'
import { burnPasswordCheck, hashStaffPassword, verifyStaffPassword } from '../auth.js'
import { devOutbox, outboxEnabled, sendEmail } from '../email.js'
import { asEmail, asString, header, isAllowedOrigin, methodGuard, readBody, safeMessage, type ApiRequest, type ApiResponse } from '../http.js'
import { DbUnavailable, dbConfigured } from '../db.js'
import { rateLimited, visitorKeyConfigured } from '../rate.js'
import { optionalText } from '../audit.js'
import { alreadyRegisteredEmail, newApplicationEmail, passwordChangedEmail, resetEmail, setPasswordLink, signupReceivedEmail, siteBase } from './emails.js'
import {
  consumeToken,
  createToken,
  customerView,
  findAccountByEmail,
  getAccount,
  peekToken,
  sha256Hex,
  updateAccount,
  type AccountRecord,
} from './repo.js'
import { LEVELS, type AccountLevel } from './schema.js'
import { linkPosCustomer, syncPosCustomer } from './pos-link.js'
import {
  accountsConfigured,
  clearedCookie,
  getSessionAccount,
  issueCustomerToken,
  sessionCookie,
} from './session.js'
import { cleanProfile, later, openAccount, passwordProblem, visitorKey } from './service.js'
import { reconcileOutstanding } from './credit.js'
import { placeAccountOrder } from './orders.js'
import { ordersFor, statementFor } from './statement.js'
import { pricingContext } from './pricing.js'

const MAX_BODY_CHARS = 20_000

/** Rate limits: [how many, per how many seconds]. */
export const LIMITS = {
  loginEmail: [5, 15 * 60],
  loginIp: [30, 3600],
  signupIp: [5, 3600],
  signupEmail: [3, 3600],
  forgotEmail: [3, 3600],
  forgotIp: [10, 3600],
  setPasswordIp: [10, 3600],
  passwordAccount: [5, 15 * 60],
  orderAccount: [30, 3600],
} as const satisfies Record<string, readonly [number, number]>

type Body = Record<string, unknown>
type Route = (req: ApiRequest, res: ApiResponse, body: Body) => Promise<void>

function send(res: ApiResponse, status: number, payload: unknown): void {
  res.status(status).json(payload)
}

function bad(res: ApiResponse, status: number, error: string, field?: string): void {
  send(res, status, field ? { error, field } : { error })
}

/** True when `key` is over its limit. The key is hashed so an email never sits in the counter table. */
async function over(scope: string, id: string, [limit, seconds]: readonly [number, number]): Promise<boolean> {
  return rateLimited(`acct:${scope}:${sha256Hex(id).slice(0, 22)}`, limit, seconds)
}

const TOO_MANY = 'Too many attempts. Please wait a little and try again.'

function startSession(req: ApiRequest, res: ApiResponse, account: AccountRecord): boolean {
  const issued = issueCustomerToken(account)
  if (!issued) return false
  res.setHeader('Set-Cookie', sessionCookie(req, issued))
  return true
}

const SIGN_IN_FAILED = 'That email and password do not match an active account.'

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

const me: Route = async (req, res) => {
  const account = await getSessionAccount(req)
  if (!account) {
    // A cookie that no longer works (suspended, password changed, expired) is cleared.
    if (header(req, 'cookie')?.includes('spt_session=')) res.setHeader('Set-Cookie', clearedCookie(req))
    return bad(res, 401, 'Please sign in.')
  }
  send(res, 200, { account: customerView(account) })
}

/**
 * Who is signed in, if anyone: always 200 with `{ account }` or `{ account: null }`. The browser asks
 * this on every page load, so a signed-out visitor must not get an error (a 401 shows as a red line
 * in every guest's console). `me` keeps its 401 for API callers.
 */
const session: Route = async (req, res) => {
  const account = await getSessionAccount(req)
  if (!account && header(req, 'cookie')?.includes('spt_session=')) res.setHeader('Set-Cookie', clearedCookie(req))
  send(res, 200, { account: account ? customerView(account) : null })
}

const signup: Route = async (req, res, body) => {
  const visitor = visitorKey(req)
  if (await over('signup-ip', visitor, LIMITS.signupIp)) return bad(res, 429, TOO_MANY)

  const email = asEmail(body.email)?.toLowerCase()
  if (!email) return bad(res, 400, 'Enter a valid email address.', 'email')
  const profile = cleanProfile(body)
  if (!profile.ok) return bad(res, 400, profile.error, profile.field)

  const asked = body.requestedLevel === undefined || body.requestedLevel === null || body.requestedLevel === '' ? 'customer' : body.requestedLevel
  if (typeof asked !== 'string' || !(LEVELS as readonly string[]).includes(asked)) {
    return bad(res, 400, 'Choose Customer, Bulk or Wholesaler.', 'requestedLevel')
  }
  const message = optionalText(body.message, 1000)
  if (message === null) return bad(res, 400, 'Your message must be at most 1000 characters.', 'message')
  const problem = passwordProblem(body.password, email)
  if (problem) return bad(res, 400, problem, 'password')

  if (await over('signup-email', email, LIMITS.signupEmail)) return bad(res, 429, TOO_MANY)

  const passwordHash = await hashStaffPassword(body.password as string)
  const account = await openAccount(
    {
      email,
      ...profile.value,
      level: 'customer',
      requestedLevel: asked === 'customer' ? null : (asked as 'bulk' | 'wholesaler'),
      passwordHash,
      emailVerified: false,
      notes: message ? `Sign-up message: ${message}` : '',
      createdBy: 'self',
    },
    'self',
    { claimExisting: false },
  )

  if (!account) {
    // Taken. The answer is the same whoever asks; the real owner is told by email instead.
    const existing = await findAccountByEmail(email)
    if (existing && existing.status === 'active') {
      await later(sendEmail(alreadyRegisteredEmail(existing, `${siteBase(req)}/account/login`)))
    }
    return bad(res, 409, 'We could not open an account with those details. If you already have an account, sign in or reset your password.')
  }

  if (!startSession(req, res, account)) return bad(res, 503, 'Customer accounts are not available right now.')
  const base = siteBase(req)
  await later(
    Promise.all([
      sendEmail(signupReceivedEmail(account, `${base}/account`)),
      sendEmail(newApplicationEmail(account, `${base}/admin/accounts`)),
    ]),
  )
  send(res, 200, { account: customerView(account) })
}

const login: Route = async (req, res, body) => {
  const visitor = visitorKey(req)
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return bad(res, 400, 'Enter your email and password.')

  if ((await over('login-ip', visitor, LIMITS.loginIp)) || (await over('login-email', email, LIMITS.loginEmail))) {
    return bad(res, 429, TOO_MANY)
  }

  // The same work and the same answer for an unknown email, a wrong password and a suspended account.
  const account = await findAccountByEmail(email)
  const attempt = password.slice(0, 200)
  let good = false
  if (account?.passwordHash) good = await verifyStaffPassword(attempt, account.passwordHash)
  else await burnPasswordCheck(attempt)
  if (!account || !good || account.status !== 'active') return bad(res, 401, SIGN_IN_FAILED)

  const updated = (await updateAccount(account.id, { lastLoginAt: new Date().toISOString() })) ?? account
  if (!startSession(req, res, updated)) return bad(res, 503, 'Customer accounts are not available right now.')
  send(res, 200, { account: customerView(updated) })
}

const logout: Route = async (req, res) => {
  res.setHeader('Set-Cookie', clearedCookie(req))
  send(res, 200, { ok: true })
}

const forgot: Route = async (req, res, body) => {
  const visitor = visitorKey(req)
  const email = asEmail(body.email)?.toLowerCase()
  // A malformed address gets the same answer as any other: nothing here depends on whether it exists.
  if (!email) return send(res, 200, { ok: true })
  if ((await over('forgot-ip', visitor, LIMITS.forgotIp)) || (await over('forgot-email', email, LIMITS.forgotEmail))) {
    return bad(res, 429, TOO_MANY)
  }
  const account = await findAccountByEmail(email)
  if (account && account.status === 'active') {
    const base = siteBase(req)
    await later(
      createToken(account.id, 'reset', 'self').then((token) => sendEmail(resetEmail(account, setPasswordLink(base, token)))),
    )
  }
  send(res, 200, { ok: true })
}

const setPassword: Route = async (req, res, body) => {
  const visitor = visitorKey(req)
  if (await over('setpw-ip', visitor, LIMITS.setPasswordIp)) return bad(res, 429, TOO_MANY)

  const token = asString(body.token, 200)
  const problem = passwordProblem(body.password)
  if (problem) return bad(res, 400, problem, 'password')
  if (!token) return bad(res, 400, 'This link is not valid. Ask for a new one.', 'token')

  // Every check on the password happens before the link is used up, so a refused password keeps it.
  const ownerId = await peekToken(token)
  const owner = ownerId ? await getAccount(ownerId) : null
  if (!owner) return bad(res, 400, 'This link has expired or was already used. Ask for a new one.', 'token')
  const ownerProblem = passwordProblem(body.password, owner.email)
  if (ownerProblem) return bad(res, 400, ownerProblem, 'password')

  const hash = await hashStaffPassword(body.password as string)
  const used = await consumeToken(token)
  if (!used || used.accountId !== owner.id) return bad(res, 400, 'This link has expired or was already used. Ask for a new one.', 'token')

  let account = await updateAccount(owner.id, { passwordHash: hash, emailVerified: true, bumpTokenVersion: true })
  if (!account) return bad(res, 400, 'This link is not valid. Ask for a new one.', 'token')
  // The link reached this inbox, so the email is now proven: a sign-up that was left unlinked because a
  // counter customer already had this email is linked to it now (or given a new one).
  if (!account.posCustomerId) {
    account = (await updateAccount(account.id, { posCustomerId: await linkPosCustomer(account, 'self', { claimExisting: true }) })) ?? account
    // The till customer may already owe money: the account starts with the real figure.
    await reconcileOutstanding(account.id, { settleSeconds: 0 })
    account = (await getAccount(account.id)) ?? account
  }
  if (!startSession(req, res, account)) return bad(res, 503, 'Customer accounts are not available right now.')
  if (used.purpose === 'reset') await later(sendEmail(passwordChangedEmail(account, `${siteBase(req)}/account/forgot`)))
  send(res, 200, { account: customerView(account) })
}

const details: Route = async (req, res, body) => {
  const current = await getSessionAccount(req)
  if (!current) return bad(res, 401, 'Please sign in.')
  const profile = cleanProfile(body)
  if (!profile.ok) return bad(res, 400, profile.error, profile.field)
  const account = await updateAccount(current.id, profile.value)
  if (!account) return bad(res, 401, 'Please sign in.')
  await syncPosCustomer(account)
  send(res, 200, { account: customerView(account) })
}

const password: Route = async (req, res, body) => {
  const current = await getSessionAccount(req)
  if (!current) return bad(res, 401, 'Please sign in.')
  if (await over('password', current.id, LIMITS.passwordAccount)) return bad(res, 429, TOO_MANY)

  const given = typeof body.current === 'string' ? body.current.slice(0, 200) : ''
  if (!given || !(await verifyStaffPassword(given, current.passwordHash ?? undefined))) {
    return bad(res, 400, 'Your current password is not right.', 'current')
  }
  const problem = passwordProblem(body.next, current.email)
  if (problem) return bad(res, 400, problem, 'next')
  if (body.next === given) return bad(res, 400, 'Choose a password different from your current one.', 'next')

  const account = await updateAccount(current.id, { passwordHash: await hashStaffPassword(body.next as string), bumpTokenVersion: true })
  if (!account) return bad(res, 401, 'Please sign in.')
  if (!startSession(req, res, account)) return bad(res, 503, 'Customer accounts are not available right now.')
  await later(sendEmail(passwordChangedEmail(account, `${siteBase(req)}/account/forgot`)))
  send(res, 200, { account: customerView(account) })
}

const prices: Route = async (req, res) => {
  const account = await getSessionAccount(req)
  if (!account) return bad(res, 401, 'Please sign in.')
  // Only this account's own prices, read fresh with the live catalogue. Never cached, never public.
  const list = accountPriceList(mergeCatalogue(await getOverrides()), await pricingContext(account))
  send(res, 200, { prices: list, discountPct: account.discountPct, level: account.level })
}

const myOrders: Route = async (req, res) => {
  const account = await getSessionAccount(req)
  if (!account) return bad(res, 401, 'Please sign in.')
  send(res, 200, { orders: await ordersFor(account) })
}

const statement: Route = async (req, res) => {
  const account = await getSessionAccount(req)
  if (!account) return bad(res, 401, 'Please sign in.')
  send(res, 200, await statementFor(account))
}

const order: Route = async (req, res, body) => {
  const account = await getSessionAccount(req)
  if (!account) return bad(res, 401, 'Please sign in.')
  if (await over('order', account.id, LIMITS.orderAccount)) return bad(res, 429, TOO_MANY)
  const reply = await placeAccountOrder(account, body)
  send(res, reply.status, reply.json)
}

const devOutboxRoute: Route = async (req, res) => {
  const host = (header(req, 'host') ?? '').toLowerCase()
  if (!outboxEnabled() || !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return bad(res, 404, 'Not found.')
  send(res, 200, { emails: devOutbox() })
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

const ROUTES: Record<string, { method: 'GET' | 'POST'; run: Route; bodyOptional?: boolean }> = {
  me: { method: 'GET', run: me },
  session: { method: 'GET', run: session },
  signup: { method: 'POST', run: signup },
  login: { method: 'POST', run: login },
  logout: { method: 'POST', run: logout, bodyOptional: true },
  forgot: { method: 'POST', run: forgot },
  'set-password': { method: 'POST', run: setPassword },
  details: { method: 'POST', run: details },
  password: { method: 'POST', run: password },
  prices: { method: 'GET', run: prices },
  order: { method: 'POST', run: order },
  orders: { method: 'GET', run: myOrders },
  statement: { method: 'GET', run: statement },
  'dev-outbox': { method: 'GET', run: devOutboxRoute },
}

export async function handleAccountRequest(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Personal data: no shared cache, no browser cache, on every answer including errors.
  res.setHeader('Cache-Control', 'private, no-store')

  const raw = req.query?.action
  const action = Array.isArray(raw) ? raw[0] : raw
  const route = action && Object.prototype.hasOwnProperty.call(ROUTES, action) ? ROUTES[action]! : undefined
  if (!route) return bad(res, 404, 'Not found.')
  if (!methodGuard(req, res, [route.method])) return

  if (!accountsConfigured() || !visitorKeyConfigured()) {
    return bad(res, 503, `Customer accounts are not available right now. Please call us on ${site.phone.display}.`)
  }
  if (!dbConfigured()) return bad(res, 503, `Customer accounts are not available right now. Please call us on ${site.phone.display}.`)

  let body: Body = {}
  if (route.method === 'POST') {
    if (!isAllowedOrigin(req)) return bad(res, 403, 'That request did not come from this website.')
    if (!(header(req, 'content-type') ?? '').toLowerCase().includes('application/json')) {
      return bad(res, 415, 'Send the request as JSON.')
    }
    const parsed = route.bodyOptional && req.body == null ? {} : readBody<Body>(req)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return bad(res, 400, 'That request could not be read.')
    if (JSON.stringify(parsed).length > MAX_BODY_CHARS) return bad(res, 413, 'That request is too large.')
    body = parsed
  }

  try {
    await route.run(req, res, body)
  } catch (error) {
    if (error instanceof DbUnavailable) {
      return bad(res, 503, `Customer accounts are not available right now. Please call us on ${site.phone.display}.`)
    }
    console.error('[accounts] unhandled error:', safeMessage(error))
    if (!res.headersSent) bad(res, 500, 'Something went wrong on our end. Please try again.')
  }
}

export type { AccountLevel }
