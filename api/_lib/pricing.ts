/**
 * The authoritative order total.
 *
 * WHY THIS EXISTS: `src/store/cart.ts` computes totals in the browser, where
 * every input — unit price, promo, fitting count — is attacker-controlled. The
 * checkout endpoint therefore sends only `{id, quantity}` pairs and this module
 * re-derives everything from the server-side catalogue. The client's numbers
 * are never read, only compared.
 *
 * The maths mirrors `cartTotals()` exactly, in this order:
 *   1. subtotal  = sum(effectivePrice(product) * quantity)
 *   2. volume    = round2(subtotal * PRICE_BREAKS rate for total tyre count)
 *   3. promo     = round2((subtotal - volume) * promo.percentOff)
 *   4. fitting   = pickup only, fittingTyres * site.commerce.fittingFeePerTyre
 *   5. total     = round2(subtotal - volume - promo + fitting)
 * Any divergence here shows up as a price mismatch between cart and receipt,
 * so keep the two in lockstep.
 */

import { site } from '../../src/config/site'
import { effectivePrice, priceBreakFor, resolveProduct } from './catalogue'
import { resolvePromo } from './promos'
import type { StoredOverride } from './store'
import { round2 } from './http'

export interface PriceRequestLine {
  id: string
  quantity: number
}

export interface PricedLine {
  id: string
  sku: string
  /** `${brand} ${model}` — what goes on the order record and the receipt. */
  name: string
  size: string
  quantity: number
  unitPrice: number
  lineTotal: number
  /** True when the item is out of stock but still orderable as a pre-order. */
  preOrder: boolean
  stock: number
}

export interface PricingResult {
  lines: PricedLine[]
  /** Total tyres across all lines — drives the volume break. */
  itemCount: number
  subtotal: number
  volumeDiscount: number
  volumeDiscountRate: number
  volumeLabel: string | null
  promoCode?: string
  promoDiscount: number
  promoPercentOff: number
  fittingTyres: number
  fittingTotal: number
  total: number
  /** GST component — prices are GST inclusive. */
  gst: number
  /** Human-readable rejection reasons. Non-empty means do not charge. */
  errors: string[]
  /** Non-fatal notices (pre-orders, promo not applied, fitting clamped). */
  warnings: string[]
}

export interface PricingInput {
  lines: unknown
  fulfilment: unknown
  fittingTyres?: unknown
  promoCode?: unknown
}

const MAX_LINES = 40
const MAX_QTY_PER_LINE = 500

export function priceOrder(
  input: PricingInput,
  overrides: Record<string, StoredOverride>,
): PricingResult {
  const errors: string[] = []
  const warnings: string[] = []

  const fulfilment: 'delivery' | 'pickup' =
    input.fulfilment === 'pickup' ? 'pickup' : 'delivery'

  if (input.fulfilment !== 'pickup' && input.fulfilment !== 'delivery') {
    errors.push('Fulfilment must be either "delivery" or "pickup".')
  }

  /* ---- Lines ---------------------------------------------------- */

  const rawLines = Array.isArray(input.lines) ? input.lines : []

  if (!rawLines.length) errors.push('Your cart is empty.')
  if (rawLines.length > MAX_LINES) {
    errors.push(
      `Too many different products in one order (max ${MAX_LINES}). Please call us for a bulk quote.`,
    )
  }

  const lines: PricedLine[] = []
  const seen = new Set<string>()

  for (const entry of rawLines.slice(0, MAX_LINES)) {
    if (!entry || typeof entry !== 'object') {
      errors.push('One of the cart lines is malformed.')
      continue
    }

    const { id, quantity } = entry as { id?: unknown; quantity?: unknown }

    if (typeof id !== 'string' || !id.trim()) {
      errors.push('One of the cart lines is missing a product id.')
      continue
    }

    const productId = id.trim()

    if (seen.has(productId)) {
      errors.push(`Product "${productId}" appears more than once in the cart.`)
      continue
    }
    seen.add(productId)

    const qty = typeof quantity === 'number' ? quantity : Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      errors.push(
        `Quantity for "${productId}" must be a whole number between 1 and ${MAX_QTY_PER_LINE}.`,
      )
      continue
    }

    // Unknown ids are a hard error: never invent a price for something that
    // is not in the catalogue.
    const product = resolveProduct(productId, overrides)
    if (!product) {
      errors.push(`"${productId}" is no longer available.`)
      continue
    }

    // Stock 0 is a pre-order (we restock continuously), but a partially
    // stocked line cannot be over-sold.
    const preOrder = product.stock <= 0
    if (!preOrder && qty > product.stock) {
      errors.push(
        `Only ${product.stock} × ${product.brand} ${product.model} ${product.size} left in stock.`,
      )
      continue
    }
    if (preOrder) {
      warnings.push(
        `${product.brand} ${product.model} ${product.size} is on back-order — dispatch may take longer than ${site.commerce.dispatchWindow}.`,
      )
    }

    const unitPrice = effectivePrice(product)

    lines.push({
      id: product.id,
      sku: product.sku,
      name: `${product.brand} ${product.model}`,
      size: product.size,
      quantity: qty,
      unitPrice,
      lineTotal: round2(unitPrice * qty),
      preOrder,
      stock: product.stock,
    })
  }

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = round2(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  )

  /* ---- Volume break --------------------------------------------- */

  const band = priceBreakFor(itemCount)
  const volumeDiscountRate = band?.discount ?? 0
  const volumeDiscount = round2(subtotal * volumeDiscountRate)
  const afterVolume = subtotal - volumeDiscount

  /* ---- Promo (applied to the post-volume amount) ---------------- */

  let promoCode: string | undefined
  let promoPercentOff = 0

  const rawPromo = input.promoCode
  if (typeof rawPromo === 'string' && rawPromo.trim()) {
    const resolved = resolvePromo(rawPromo, itemCount)
    if (resolved.valid && resolved.percentOff != null) {
      promoCode = resolved.code
      promoPercentOff = resolved.percentOff
    } else {
      // A bad promo must not silently inflate the charge, but it also must not
      // block the sale — drop it and tell the caller.
      warnings.push(resolved.reason ?? 'Promo code could not be applied.')
    }
  }

  const promoDiscount = promoPercentOff ? round2(afterVolume * promoPercentOff) : 0

  /* ---- Fitting (pickup only) ------------------------------------ */

  const requestedFitting =
    typeof input.fittingTyres === 'number'
      ? input.fittingTyres
      : Number(input.fittingTyres ?? 0)

  let fittingTyres = 0

  if (Number.isInteger(requestedFitting) && requestedFitting >= 0) {
    if (fulfilment === 'pickup') {
      fittingTyres = Math.min(requestedFitting, itemCount)
      if (fittingTyres !== requestedFitting) {
        warnings.push(
          `Fitting reduced to ${fittingTyres} tyres — you cannot fit more tyres than you ordered.`,
        )
      }
    } else if (requestedFitting > 0) {
      warnings.push(
        'Fitting is a warehouse service and is only available with warehouse pickup.',
      )
    }
  } else {
    errors.push('Fitting tyre count must be a whole number of tyres.')
  }

  const fittingTotal = round2(fittingTyres * site.commerce.fittingFeePerTyre)

  /* ---- Total ---------------------------------------------------- */

  const total = round2(afterVolume - promoDiscount + fittingTotal)

  if (!errors.length && total <= 0) {
    errors.push('Order total must be greater than zero.')
  }

  return {
    lines,
    itemCount,
    subtotal,
    volumeDiscount,
    volumeDiscountRate,
    volumeLabel: band?.label ?? null,
    promoCode,
    promoDiscount,
    promoPercentOff,
    fittingTyres,
    fittingTotal,
    total,
    gst: round2(total - total / (1 + site.commerce.gstRate)),
    errors,
    warnings,
  }
}

/** Square works in minor units; AUD has 2 decimal places. */
export function toCents(amount: number): number {
  return Math.round(amount * 100)
}
