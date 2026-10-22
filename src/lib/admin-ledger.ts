/**
 * Money categories and payment methods for the admin ledger.
 *
 * Shared by the API (which validates against them) and the Payments and
 * Balance pages (which offer them as choices). Imports nothing, so the Vercel
 * functions can load it with a plain relative path.
 */

export const INCOME_CATEGORIES = [
  'Online sales',
  'In-store sales',
  'Fleet account',
  'Fitting & services',
  'Other income',
] as const

export const EXPENSE_CATEGORIES = [
  'Stock purchases',
  'Wages',
  'Rent',
  'Fuel',
  'Vehicles & equipment',
  'Utilities',
  'Insurance',
  'Marketing',
  'Software & subscriptions',
  'Freight',
  'Bank & card fees',
  'Tax & super',
  'Other expense',
] as const

/** Ways money moves. "Card (website)" is only ever set by the checkout itself. */
export const PAYMENT_METHODS = [
  'Bank transfer',
  'Card (in store)',
  'Cash',
  'Cheque',
  'Direct debit',
  'Other',
] as const

export const ONLINE_METHOD = 'Card (website)'

/** GST inside a GST-inclusive Australian amount (10%, so one eleventh). */
export function gstInside(amount: number): number {
  return Math.round((amount / 11) * 100) / 100
}
