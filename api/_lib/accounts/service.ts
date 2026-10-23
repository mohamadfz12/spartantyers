/**
 * What the customer API and the admin handlers share: checking input, opening an account (with its
 * counter customer), making and sending a set-password or reset link.
 */
import { waitUntil } from '@vercel/functions'
import { optionalText } from '../audit.js'
import { STAFF_PASSWORD_MIN } from '../auth.js'
import { sendEmail } from '../email.js'
import { asPhone, asString, clientIp, safeMessage, type ApiRequest } from '../http.js'
import { hashIp } from '../rate.js'
import { inviteEmail, resetEmail, setPasswordLink, siteBase } from './emails.js'
import { linkPosCustomer } from './pos-link.js'
import { reconcileOutstanding } from './credit.js'
import { createToken, deleteAccount, getAccount, insertAccount, updateAccount, type AccountRecord, type NewAccount, type TokenPurpose } from './repo.js'

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

export const PASSWORD_MIN = STAFF_PASSWORD_MIN
export const PASSWORD_MAX = 200

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string; field?: string }

/** A password's problem in plain words, or null when it is acceptable. */
export function passwordProblem(password: unknown, email = ''): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `Choose a password of at least ${PASSWORD_MIN} characters.`
  if (password.length > PASSWORD_MAX) return `Passwords can be at most ${PASSWORD_MAX} characters.`
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return 'Your password cannot be your email address.'
  return null
}

export interface Profile {
  name: string
  company: string
  phone: string
  abn: string
  address: string
}

/** An ABN is 11 digits; stored as `12 345 678 901`. Empty is fine. Null when it cannot be an ABN. */
export function cleanAbn(value: unknown): string | null {
  const text = optionalText(value, 30)
  if (text === null) return null
  if (!text) return ''
  const digits = text.replace(/\s/g, '')
  if (!/^\d{11}$/.test(digits)) return null
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
}

/** The details every account has, checked. `name` is required. */
export function cleanProfile(body: Record<string, unknown>): Checked<Profile> {
  const name = asString(body.name, 120)
  if (!name) return { ok: false, field: 'name', error: 'Enter a name (up to 120 characters).' }
  const company = optionalText(body.company, 160)
  if (company === null) return { ok: false, field: 'company', error: 'Company must be at most 160 characters.' }
  let phone = ''
  if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    const p = asPhone(body.phone)
    if (!p) return { ok: false, field: 'phone', error: 'Enter a phone number we can call.' }
    phone = p
  }
  const abn = cleanAbn(body.abn)
  if (abn === null) return { ok: false, field: 'abn', error: 'An ABN has 11 digits.' }
  const address = optionalText(body.address, 300)
  if (address === null) return { ok: false, field: 'address', error: 'Address must be at most 300 characters.' }
  return { ok: true, value: { name, company, phone, abn, address } }
}

/* ------------------------------------------------------------------ *
 * Visitors and background work
 * ------------------------------------------------------------------ */

/** The visitor's hashed network for rate limits; 'unknown' when the address is not known. */
export function visitorKey(req: ApiRequest): string {
  return hashIp(clientIp(req)) || 'unknown'
}

/**
 * Runs slow work (an email) without making the answer wait for it on Vercel, so how long a request
 * takes does not tell a visitor whether an account exists. Locally it is awaited, so tests and the
 * dev outbox see the result at once. Never rejects.
 */
export async function later(work: Promise<unknown>): Promise<void> {
  const safe = work.catch((error) => console.error(`[accounts] background work failed: ${safeMessage(error).slice(0, 120)}`))
  try {
    waitUntil(safe)
  } catch {
    // No request context: it runs anyway.
  }
  if (!process.env.VERCEL) await safe
}

/* ------------------------------------------------------------------ *
 * Opening an account
 * ------------------------------------------------------------------ */

/**
 * Creates the account and its counter customer. Null when the email is already taken. If linking the
 * counter customer fails, the account is removed again, so there is never one without the other.
 * `claimExisting` is false for a self sign-up (see `linkPosCustomer`): if a counter customer already
 * has that email, the account stays unlinked until the email is proven or staff link it.
 */
export async function openAccount(input: NewAccount, by: string, options: { claimExisting: boolean }): Promise<AccountRecord | null> {
  const created = await insertAccount(input)
  if (!created) return null
  try {
    const posCustomerId = await linkPosCustomer(created, by, options)
    if (!posCustomerId) return created
    const linked = (await updateAccount(created.id, { posCustomerId })) ?? created
    // A till customer taken over may already owe money: the account starts with the real figure.
    await reconcileOutstanding(created.id, { settleSeconds: 0 })
    return (await getAccount(created.id)) ?? linked
  } catch (error) {
    await deleteAccount(created.id).catch(() => undefined)
    throw error
  }
}

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

export interface IssuedLink {
  link: string
  sent: boolean
}

/** Makes a single-use link for an account and emails it. `sent` is false when email is not set up or failed. */
export async function issueLink(req: ApiRequest, account: AccountRecord, purpose: TokenPurpose, by: string): Promise<IssuedLink> {
  const token = await createToken(account.id, purpose, by)
  const link = setPasswordLink(siteBase(req), token)
  const result = await sendEmail(purpose === 'invite' ? inviteEmail(account, link) : resetEmail(account, link))
  return { link, sent: result.sent }
}
