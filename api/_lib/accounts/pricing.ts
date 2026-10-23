/**
 * An account's prices as the pricing rule wants them (src/lib/account-pricing.ts): its level, its
 * agreed %, and its special prices by product id. Read fresh for every order, never cached, so a
 * price staff just changed is the price charged.
 */
import { round2, type AccountPricing } from '../../../src/lib/account-pricing.js'
import { listPrices, type AccountRecord } from './repo.js'

export async function pricingContext(account: Pick<AccountRecord, 'id' | 'level' | 'discountPct'>): Promise<AccountPricing> {
  const prices = await listPrices(account.id)
  return {
    level: account.level,
    discountPct: account.discountPct,
    special: Object.fromEntries(prices.map((p) => [p.productId, p.price])),
  }
}

/** What is left of the credit limit, never below zero. */
export const creditAvailable = (account: Pick<AccountRecord, 'creditLimit' | 'outstanding'>): number =>
  Math.max(0, round2(account.creditLimit - account.outstanding))

/** True when the account may buy on pay later right now (before looking at the amount). */
export const canPayLater = (account: Pick<AccountRecord, 'status' | 'payLater' | 'posCustomerId'>): boolean =>
  account.status === 'active' && account.payLater && Boolean(account.posCustomerId)

/** In plain words, why this account cannot pay later; null when it can. */
export function payLaterRefusal(account: Pick<AccountRecord, 'status' | 'payLater' | 'posCustomerId'>): string | null {
  if (account.status !== 'active') return 'This account is not active.'
  if (!account.payLater) return 'Pay later is not set up on this account. Please call us.'
  if (!account.posCustomerId) return 'Pay later is not available on this account yet. Please call us.'
  return null
}

/**
 * Why the TILL cannot put a sale on this account, in words for staff (not the customer), or null when it
 * can. An account whose pay later was never set is not refused here: the till works as before for it.
 */
export function tillRefusal(account: Pick<AccountRecord, 'status' | 'payLater' | 'creditSetAt'>): string | null {
  if (account.status !== 'active') return 'their website account is suspended.'
  if (!account.creditSetAt) return null
  if (!account.payLater) return 'pay later is switched off on their website account. An owner or manager can change it in Customer accounts.'
  return null
}

/**
 * What the till shows about a counter customer's website account: the level, the agreed %, and whether
 * (and how much) it can buy on pay later. No special prices, no contact details.
 */
export function accountSummary(account: AccountRecord) {
  return {
    id: account.id,
    level: account.level,
    status: account.status,
    discountPct: account.discountPct,
    payLater: account.payLater,
    termsDays: account.termsDays,
    creditLimit: account.creditLimit,
    outstanding: account.outstanding,
    available: creditAvailable(account),
    /** False until an owner or manager sets pay later: the till then works as before (no limit applied). */
    creditSet: account.creditSetAt !== null,
    /** Null when the till may put a sale on account; otherwise the reason, in words for staff. */
    refusal: tillRefusal(account),
  }
}
