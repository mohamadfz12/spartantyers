/**
 * Pay on account at the website checkout: the pure helpers (dates, credit, the request) and the one call to
 * POST /api/account/order. React-free so the maths can be tested; the screen is
 * src/components/checkout/PayOnAccount.tsx.
 *
 * The server is the authority on every figure: it prices the order at the account's prices, checks the total
 * against `expectedTotal`, and reserves the credit in one guarded step. What the browser shows (terms, credit left,
 * due date) is only what the customer is told before they press the button.
 */
import { availableCredit } from './account-portal.js'

const SYDNEY = 'Australia/Sydney'

/** Today in Sydney as YYYY-MM-DD (the server counts the due date from the same day). */
export function sydneyToday(now: Date = new Date()): string {
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: SYDNEY, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** A YYYY-MM-DD date plus whole days, in calendar terms (no daylight saving surprises). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days))
  return date.toISOString().slice(0, 10)
}

/** The due date an order placed now would have: today (Sydney) plus the account's terms. */
export const dueDateFor = (termsDays: number, now: Date = new Date()): string => addDaysIso(sydneyToday(now), Math.max(0, Math.floor(termsDays || 0)))

/** "Friday 27 November 2026" from YYYY-MM-DD. */
export function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

export interface CreditView {
  /** Credit left now (limit less owing), never below zero. */
  available: number
  /** Credit left if this order goes through (never below zero). */
  afterOrder: number
  /** True when the order is more than the credit left. The server decides; this only warns. */
  overLimit: boolean
}

export function creditView(creditLimit: number, outstanding: number, orderTotal: number): CreditView {
  const available = availableCredit(creditLimit, outstanding)
  const afterCents = Math.round(available * 100) - Math.round(orderTotal * 100)
  return { available, afterOrder: Math.max(0, afterCents) / 100, overLimit: afterCents < 0 }
}

/** Pay on account is offered only to an account with pay later switched on. */
export const canPayOnAccount = (me: { payLater: boolean; status: string; payLaterReady?: boolean } | null | undefined): boolean =>
  !!me && me.payLater === true && me.status === 'active' && me.payLaterReady === true

export interface AccountOrderInput {
  idempotencyKey: string
  lines: Array<{ id: string; quantity: number }>
  fulfilment: 'delivery' | 'pickup'
  fittingTyres: number
  address?: { line1: string; suburb: string; state: string; postcode: string }
  notes?: string
  /** The promo code in the cart; the server applies it to normal-price lines only, as the browser does. */
  promoCode?: string
  /** The total the customer was shown; compared, never used to price. */
  expectedTotal: number
}

export interface AccountOrderResult {
  reference: string
  orderId: string
  total: number
  dueDate: string
  outstanding: number
  creditAvailable: number
}

export class AccountOrderError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'AccountOrderError'
    this.status = status
  }
}

/** The request body exactly as the server wants it (fittingTyres only for pickup, address only for delivery). */
export function accountOrderBody(input: AccountOrderInput): Record<string, unknown> {
  return {
    idempotencyKey: input.idempotencyKey,
    lines: input.lines.map((line) => ({ id: line.id, quantity: line.quantity })),
    fulfilment: input.fulfilment,
    fittingTyres: input.fulfilment === 'pickup' ? input.fittingTyres : 0,
    ...(input.fulfilment === 'delivery' && input.address ? { address: input.address } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.promoCode ? { promoCode: input.promoCode } : {}),
    expectedTotal: input.expectedTotal,
  }
}

/** Places the order. Throws `AccountOrderError` carrying the server's plain-words message. */
export async function placeAccountOrder(input: AccountOrderInput): Promise<AccountOrderResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  let response: Response
  try {
    response = await fetch('/api/account/order', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(accountOrderBody(input)),
      signal: controller.signal,
    })
  } catch {
    throw new AccountOrderError('We could not reach the server, so we cannot tell whether the order went through. Please check My account, then try again.', 0)
  } finally {
    clearTimeout(timer)
  }
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  if (!response.ok) {
    const message =
      typeof record.error === 'string' && record.error
        ? record.error
        : response.status === 401
          ? 'Please log in again to place an order on your account.'
          : 'Something went wrong placing the order. Nothing has been charged. Please try again.'
    throw new AccountOrderError(message, response.status)
  }
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  if (typeof record.reference !== 'string' || typeof record.orderId !== 'string') {
    throw new AccountOrderError('The order reply was not understood. Please check My account before trying again.', response.status)
  }
  return {
    reference: record.reference,
    orderId: record.orderId,
    total: num(record.total),
    dueDate: typeof record.dueDate === 'string' ? record.dueDate : '',
    outstanding: num(record.outstanding),
    creditAvailable: num(record.creditAvailable),
  }
}
