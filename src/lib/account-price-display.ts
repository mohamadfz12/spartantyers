/**
 * What to show for a tyre's price, one rule for every screen (React-free, so it can be tested).
 *
 * A signed-in customer's account price comes from GET /api/account/prices (see src/store/account-prices.ts).
 * It is shown only when it BEATS the shelf price: then the account price leads, the usual price is struck
 * through and a "Your price" badge says why. In every other case (a guest, or an account with nothing
 * better for this tyre) the result says `yours: false` and the screen shows exactly what it always did.
 *
 * `unit` from the server is the account price BEFORE any volume break. At the checkout the customer pays the
 * lower of that and the shelf price after the order's volume break (src/lib/account-pricing.ts); `volumeUnit`
 * below gives the same per-tyre figure for the volume ladders.
 */
import { bandUnitPrice } from './account-pricing.js'
import { effectivePrice, hasPrice } from '../data/products.js'
import type { Product } from '../data/types.js'

export type AccountPriceMap = Record<string, { unit: number; basis?: string }>

export interface PriceView {
  /** The per-tyre price to lead with before volume breaks: the account price when `yours`, else the shelf price. Null = quote only. */
  current: number | null
  /** The shelf price (sale price included), or null for a price-on-application tyre. */
  retail: number | null
  /** True when `current` is this customer's own price and beats the shelf price. */
  yours: boolean
  /** True when the tyre can go in the cart (a shelf price, or an account price). */
  buyable: boolean
}

const own = (prices: AccountPriceMap | null | undefined, id: string): number | null => {
  if (!prices || !Object.prototype.hasOwnProperty.call(prices, id)) return null
  const unit = prices[id]?.unit
  return typeof unit === 'number' && Number.isFinite(unit) && unit > 0 ? unit : null
}

type PriceFields = Pick<Product, 'id' | 'price' | 'discountPrice'>

export function priceView(product: PriceFields, prices: AccountPriceMap | null | undefined): PriceView {
  const retail = effectivePrice(product as Product)
  const unit = own(prices, product.id)
  if (unit != null && (retail == null || unit < retail)) {
    return { current: unit, retail, yours: true, buyable: true }
  }
  return { current: retail, retail, yours: false, buyable: retail != null }
}

/**
 * A cart line priced by the customer's account: `{ unit, retail }`, or null when the line is at the normal price
 * (a guest, or the volume price won). Read from the cart totals so it is exactly what the order will be charged.
 */
export function accountLine(
  totals: { lineUnits: Record<string, { unit: number; retailUnit: number | null; basis: string }> },
  id: string,
): { unit: number; retail: number | null } | null {
  const line = Object.prototype.hasOwnProperty.call(totals.lineUnits, id) ? totals.lineUnits[id] : undefined
  return line && line.basis === 'account' ? { unit: line.unit, retail: line.retailUnit } : null
}

/** Can this tyre go in the cart for the current visitor? */
export const isBuyable = (product: PriceFields, prices: AccountPriceMap | null | undefined): boolean =>
  hasPrice(product as Product) || own(prices, product.id) != null

/**
 * The per-tyre price at a volume `rate` (0.03 = 3%). For a guest, or when the account price does not win, this is the
 * long-standing `price x (1 - rate)`; for an account price it is the lower of the account price and the band price.
 */
export function volumeUnit(view: PriceView, rate: number): number | null {
  if (view.current == null) return null
  if (!view.yours) return view.current * (1 - rate)
  if (view.retail == null) return view.current
  return Math.min(view.current, bandUnitPrice(view.retail, rate))
}
