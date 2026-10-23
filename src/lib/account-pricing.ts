/**
 * The one pricing rule for customer accounts, shared by the server (api/_lib/pricing.ts, checkout, pay
 * later, the prices endpoint) and the browser (the cart shows the same numbers). React-free, with no
 * server code, so a Vercel function can load it by a relative `.js` path like src/lib/admin-ledger.ts.
 *
 * THE RULE, per cart line
 *
 *   retail unit   the shelf price: `effectivePrice(product)` (includes a sale `discountPrice`)
 *   band unit     the retail unit after the order's volume break, to the cent
 *   account unit  the account's special price for this product if it has one, otherwise (when the
 *                 account has an agreed %) the RRP `price` less that %, to the cent; never above
 *                 the retail unit
 *   FINAL unit    the account unit when it is LOWER than the band unit, otherwise the line stays in
 *                 the normal retail/volume pool. Never both discounts together.
 *
 * `basis` says which one won, for receipts and reports:
 *   'account'  the account's price won; no volume break and no promo code on this line
 *   'volume'   normal price, and the order's volume break applies
 *   'retail'   normal price, no volume break on the order
 *
 * A price-on-application tyre stays quote-only, unless the account has a special price for it: then
 * it is sold at that price to that account only.
 *
 * ORDER MATH, exactly the website's (and for a guest, byte for byte what it always was)
 *   subtotal  = every line at its unit price
 *   volume    = round2(pool subtotal x the break rate)         pool = lines not priced by the account
 *   promo     = round2((pool subtotal - volume) x promo rate)   promo only ever touches the pool
 *   total     = round2(subtotal - volume - promo + fitting)
 *   GST       = total - total / 11   (prices include GST)
 *
 * Money rounds half up to the cent, in whole cents for the account and band prices, so a price such
 * as 95.095 never depends on how a float happens to be stored. The pool's volume and promo rounding
 * is the website's long-standing `Math.round(x * 100) / 100`, left alone so no guest total moves.
 */
import { site } from '../config/site.js'
import { effectivePrice, priceBreakFor } from '../data/products.js'
import type { Product } from '../data/types.js'

export type AccountLevel = 'customer' | 'bulk' | 'wholesaler'
export type SaleChannel = 'retail' | 'bulk' | 'wholesale'
export type PriceBasis = 'retail' | 'volume' | 'account'

/** What an account is priced by: its level, its agreed %, and its special prices by product id. */
export interface AccountPricing {
  level: AccountLevel
  /** 0 to 60. */
  discountPct: number
  special: Record<string, number>
}

/** The product fields the rule reads (the live catalogue's overrides already applied). */
export type PricingProduct = Pick<Product, 'id' | 'price' | 'discountPrice'>

export const round2 = (value: number): number => Math.round(value * 100) / 100

const toCents = (value: number): number => Math.round(value * 100)

/** `cents` less `hundredths` of a percent (e.g. 750 = 7.5%), half up, in whole cents. */
const lessPercent = (cents: number, hundredths: number): number => Math.round((cents * (10000 - hundredths)) / 10000) / 100

const has = (record: Record<string, number>, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key)

/**
 * The account's own unit price for this product before any volume break, or null when the account
 * has nothing for it. Never above the retail unit.
 */
export function accountUnitPrice(product: PricingProduct, account: AccountPricing | null | undefined): number | null {
  if (!account) return null
  const retail = effectivePrice(product as Product)
  let unit: number | null = null
  const special = has(account.special, product.id) ? account.special[product.id] : undefined
  if (typeof special === 'number' && Number.isFinite(special) && special > 0) {
    unit = round2(special)
  } else if (account.discountPct > 0 && product.price != null) {
    unit = lessPercent(toCents(product.price), Math.round(account.discountPct * 100))
  }
  if (unit == null) return null
  return retail != null && unit > retail ? retail : unit
}

/** The retail unit after the volume break at `rate` (0.03 = 3%), to the cent. */
export const bandUnitPrice = (retailUnit: number, rate: number): number => lessPercent(toCents(retailUnit), Math.round(rate * 10000))

/**
 * The price list for the account: every product where its price beats retail (or where it can buy a
 * price-on-application tyre at its own price). `unit` is before any volume break.
 */
export function accountPriceList(
  products: Iterable<PricingProduct>,
  account: AccountPricing | null | undefined,
): Record<string, { unit: number; basis: 'account' }> {
  const out: Record<string, { unit: number; basis: 'account' }> = {}
  if (!account) return out
  for (const product of products) {
    const unit = accountUnitPrice(product, account)
    if (unit == null) continue
    const retail = effectivePrice(product as Product)
    if (retail == null || unit < retail) out[product.id] = { unit, basis: 'account' }
  }
  return out
}

/** `wholesale` for a Wholesaler, `bulk` for a Bulk account or an order of the bulk threshold or more, else `retail`. */
export function saleChannel(level: AccountLevel | null | undefined, tyreCount: number): SaleChannel {
  if (level === 'wholesaler') return 'wholesale'
  if (level === 'bulk' || tyreCount >= site.commerce.bulkThreshold) return 'bulk'
  return 'retail'
}

/* ------------------------------------------------------------------ *
 * A whole cart
 * ------------------------------------------------------------------ */

export interface CartItem {
  product: PricingProduct
  quantity: number
}

export interface CartOptions {
  account?: AccountPricing | null
  fulfilment: 'delivery' | 'pickup'
  /** Already limited to the tyres in the order, and 0 for delivery. */
  fittingTyres: number
  /** A promo's fraction (0.1 = 10% off), or 0. */
  promoPercentOff?: number
}

export interface PricedCartLine {
  id: string
  quantity: number
  /** What the customer pays per tyre. For a pool line this is the shelf price; the volume break is order-level. */
  unit: number
  /** The shelf price, or null for a price-on-application tyre sold at an account price. */
  retailUnit: number | null
  basis: PriceBasis
  lineTotal: number
  /** (shelf price - account price) x quantity on a line the account priced, else 0. */
  accountSaving: number
}

export interface PricedCart {
  lines: PricedCartLine[]
  itemCount: number
  subtotal: number
  volumeDiscount: number
  volumeDiscountRate: number
  volumeLabel: string | null
  promoDiscount: number
  fittingTotal: number
  total: number
  gst: number
  channel: SaleChannel
  accountSaving: number
}

/**
 * Prices a cart. Every item must be buyable: it has a shelf price, or the account has a price for it
 * (the server turns the other cases into errors before it gets here).
 */
export function priceCart(items: CartItem[], options: CartOptions): PricedCart {
  const account = options.account ?? null
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const band = priceBreakFor(itemCount)
  const rate = band?.discount ?? 0

  const lines: PricedCartLine[] = items.map(({ product, quantity }) => {
    const retail = effectivePrice(product as Product)
    const own = accountUnitPrice(product, account)
    if (retail == null) {
      if (own == null) throw new Error(`${product.id} has no price`)
      return { id: product.id, quantity, unit: own, retailUnit: null, basis: 'account', lineTotal: round2(own * quantity), accountSaving: 0 }
    }
    if (own != null && own < bandUnitPrice(retail, rate)) {
      return { id: product.id, quantity, unit: own, retailUnit: retail, basis: 'account', lineTotal: round2(own * quantity), accountSaving: round2((retail - own) * quantity) }
    }
    return { id: product.id, quantity, unit: retail, retailUnit: retail, basis: rate > 0 ? 'volume' : 'retail', lineTotal: round2(retail * quantity), accountSaving: 0 }
  })

  const subtotal = round2(lines.reduce((sum, line) => sum + line.unit * line.quantity, 0))
  const poolSubtotal = round2(lines.filter((l) => l.basis !== 'account').reduce((sum, line) => sum + line.unit * line.quantity, 0))
  const volumeDiscount = round2(poolSubtotal * rate)
  const afterVolume = subtotal - volumeDiscount
  const promoDiscount = options.promoPercentOff ? round2((poolSubtotal - volumeDiscount) * options.promoPercentOff) : 0
  const fittingTotal = options.fulfilment === 'pickup' ? round2(options.fittingTyres * site.commerce.fittingFeePerTyre) : 0
  const total = round2(afterVolume - promoDiscount + fittingTotal)

  return {
    lines,
    itemCount,
    subtotal,
    volumeDiscount,
    volumeDiscountRate: rate,
    volumeLabel: band?.label ?? null,
    promoDiscount,
    fittingTotal,
    total,
    gst: round2(total - total / (1 + site.commerce.gstRate)),
    channel: saleChannel(account?.level, itemCount),
    accountSaving: round2(lines.reduce((sum, line) => sum + line.accountSaving, 0)),
  }
}
