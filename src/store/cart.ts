import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { site } from '@/config/site'
import {
  PRICE_BREAKS,
  effectivePrice,
  hasPrice,
  priceBreakFor,
  productById,
} from '@/data/products'
import type { CartLine, Product } from '@/data/types'
import { accountUnitPrice, priceCart, type AccountPricing, type PriceBasis, type PricingProduct } from '@/lib/account-pricing'
import { useAccount } from '@/store/account'
import { useAccountPrices } from '@/store/account-prices'

export type Fulfilment = 'delivery' | 'pickup'

export interface Promo {
  code: string
  /** Fractional discount, e.g. 0.1 for 10% off. */
  percentOff: number
  description: string
}

interface CartState {
  lines: CartLine[]
  fulfilment: Fulfilment
  /** How many tyres in the order should be professionally fitted (pickup only). */
  fittingTyres: number
  promo: Promo | null
  isOpen: boolean

  add: (product: Product, quantity?: number) => void
  remove: (id: string) => void
  setQuantity: (id: string, quantity: number) => void
  increment: (id: string) => void
  decrement: (id: string) => void
  clear: () => void

  setFulfilment: (fulfilment: Fulfilment) => void
  setFittingTyres: (count: number) => void
  applyPromo: (promo: Promo | null) => void

  open: () => void
  close: () => void
  toggle: () => void
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      fulfilment: 'delivery',
      fittingTyres: 0,
      promo: null,
      isOpen: false,

      add: (product, quantity = 1) =>
        set((state) => {
          // Price-on-application lines go to a quote, never the cart, unless the signed-in
          // customer has their own price for the tyre (then it is theirs to buy).
          const accountUnit = useAccountPrices.getState().prices[product.id]?.unit
          if (!hasPrice(product) && !(typeof accountUnit === 'number' && accountUnit > 0)) return state
          const existing = state.lines.find((line) => line.id === product.id)
          const lines = existing
            ? state.lines.map((line) =>
                line.id === product.id
                  ? { ...line, quantity: line.quantity + quantity }
                  : line,
              )
            : [
                ...state.lines,
                {
                  id: product.id,
                  sku: product.sku,
                  brand: product.brand,
                  model: product.model,
                  size: product.size,
                  price: effectivePrice(product) ?? accountUnit ?? 0,
                  tread: product.tread,
                  quantity,
                } satisfies CartLine,
              ]
          return { lines, isOpen: true }
        }),

      remove: (id) =>
        set((state) => {
          const lines = state.lines.filter((line) => line.id !== id)
          const total = lines.reduce((sum, line) => sum + line.quantity, 0)
          // Never leave more fitting slots than there are tyres.
          return { lines, fittingTyres: Math.min(state.fittingTyres, total) }
        }),

      setQuantity: (id, quantity) => {
        if (quantity <= 0) {
          get().remove(id)
          return
        }
        set((state) => {
          const lines = state.lines.map((line) =>
            line.id === id ? { ...line, quantity } : line,
          )
          const total = lines.reduce((sum, line) => sum + line.quantity, 0)
          return { lines, fittingTyres: Math.min(state.fittingTyres, total) }
        })
      },

      increment: (id) => {
        const line = get().lines.find((l) => l.id === id)
        if (line) get().setQuantity(id, line.quantity + 1)
      },

      decrement: (id) => {
        const line = get().lines.find((l) => l.id === id)
        if (line) get().setQuantity(id, line.quantity - 1)
      },

      clear: () => set({ lines: [], fittingTyres: 0, promo: null }),

      setFulfilment: (fulfilment) =>
        set((state) => ({
          fulfilment,
          // Fitting is a warehouse service, so it cannot survive a switch to delivery.
          fittingTyres: fulfilment === 'pickup' ? state.fittingTyres : 0,
        })),

      setFittingTyres: (count) =>
        set((state) => {
          const total = state.lines.reduce((sum, line) => sum + line.quantity, 0)
          return { fittingTyres: Math.min(Math.max(count, 0), total) }
        }),

      applyPromo: (promo) => set({ promo }),

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),
    }),
    {
      name: 'spartan-cart',
      version: 1,
      partialize: (state) => ({
        lines: state.lines,
        fulfilment: state.fulfilment,
        fittingTyres: state.fittingTyres,
        promo: state.promo,
      }),
      // A saved cart carries the unit price and SKU from the day it was
      // filled. Re-read both from the catalogue on every load so the cart
      // never shows yesterday's price, and drop lines that have left the
      // range. A price-on-application line is kept for now (it may be a
      // customer's own priced tyre); `dropUnbuyableLines` below removes it as
      // soon as it is known the visitor has no account price for it.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<CartState>
        const lines = (saved.lines ?? []).flatMap((line): CartLine[] => {
          const product = productById.get(line.id)
          if (!product) return []
          return [
            {
              ...line,
              sku: product.sku,
              brand: product.brand,
              model: product.model,
              size: product.size,
              tread: product.tread,
              price: effectivePrice(product) ?? line.price,
            },
          ]
        })
        const total = lines.reduce((sum, line) => sum + line.quantity, 0)
        return {
          ...current,
          ...saved,
          lines,
          fittingTyres: Math.min(saved.fittingTyres ?? 0, total),
        }
      },
    },
  ),
)

/* ------------------------------------------------------------------ *
 * Totals
 *
 * Kept as a pure function of cart state rather than stored, so there is
 * exactly one place where order money is calculated. The checkout API
 * recomputes the same way server-side and will not trust these numbers.
 * ------------------------------------------------------------------ */

export interface CartTotals {
  itemCount: number
  lineCount: number
  subtotal: number
  /** Automatic volume discount from the price-break table. */
  volumeDiscount: number
  volumeDiscountRate: number
  volumeLabel: string | null
  promoDiscount: number
  fittingTotal: number
  total: number
  /** GST component of the total — prices are GST inclusive. */
  gst: number
  nextBreak: { min: number; discount: number; label: string } | null
  tyresToNextBreak: number
  /** What a signed-in customer's own prices saved on this cart (0 for a guest). */
  accountSaving: number
  /** Per product: what each tyre costs this customer and why. Empty for a guest. */
  lineUnits: Record<string, { unit: number; retailUnit: number | null; basis: PriceBasis }>
}

export function cartTotals(
  state: {
    lines: CartLine[]
    fulfilment: Fulfilment
    fittingTyres: number
    promo: Promo | null
  },
  /** A signed-in customer's pricing context; null or omitted for a guest (then nothing below changes). */
  account: AccountPricing | null = null,
): CartTotals {
  if (account) return accountCartTotals(state, account)
  const itemCount = state.lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = state.lines.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  )

  const band = priceBreakFor(itemCount)
  const volumeDiscountRate = band?.discount ?? 0
  const volumeDiscount = round(subtotal * volumeDiscountRate)

  const afterVolume = subtotal - volumeDiscount
  const promoDiscount = state.promo
    ? round(afterVolume * state.promo.percentOff)
    : 0

  const fittingTotal =
    state.fulfilment === 'pickup'
      ? state.fittingTyres * site.commerce.fittingFeePerTyre
      : 0

  const total = round(afterVolume - promoDiscount + fittingTotal)

  const nextBreak =
    PRICE_BREAKS.find((b) => itemCount < b.min) ?? null

  return {
    itemCount,
    lineCount: state.lines.length,
    subtotal: round(subtotal),
    volumeDiscount,
    volumeDiscountRate,
    volumeLabel: band?.label ?? null,
    promoDiscount,
    fittingTotal,
    total,
    gst: round(total - total / (1 + site.commerce.gstRate)),
    nextBreak: nextBreak ? { ...nextBreak } : null,
    tyresToNextBreak: nextBreak ? nextBreak.min - itemCount : 0,
    accountSaving: 0,
    lineUnits: {},
  }
}

/**
 * A signed-in customer's totals: the SHARED rule (src/lib/account-pricing.ts), the same function the server
 * prices the order with, so the total equals the server's to the cent.
 */
function accountCartTotals(
  state: { lines: CartLine[]; fulfilment: Fulfilment; fittingTyres: number; promo: Promo | null },
  account: AccountPricing,
): CartTotals {
  const items = state.lines.flatMap((line) => {
    const product: PricingProduct = productById.get(line.id) ?? { id: line.id, price: line.price }
    // A line nobody can price (a quote-only tyre with no account price) is left out, as the server would refuse it.
    if (effectivePrice(product as Product) == null && accountUnitPrice(product, account) == null) return []
    return [{ product, quantity: line.quantity }]
  })
  const priced = priceCart(items, {
    account,
    fulfilment: state.fulfilment,
    fittingTyres: state.fittingTyres,
    promoPercentOff: state.promo?.percentOff ?? 0,
  })
  const nextBreak = PRICE_BREAKS.find((b) => priced.itemCount < b.min) ?? null
  const lineUnits: CartTotals['lineUnits'] = {}
  for (const line of priced.lines) lineUnits[line.id] = { unit: line.unit, retailUnit: line.retailUnit, basis: line.basis }
  return {
    itemCount: priced.itemCount,
    lineCount: state.lines.length,
    subtotal: priced.subtotal,
    volumeDiscount: priced.volumeDiscount,
    volumeDiscountRate: priced.volumeDiscountRate,
    volumeLabel: priced.volumeLabel,
    promoDiscount: priced.promoDiscount,
    fittingTotal: priced.fittingTotal,
    total: priced.total,
    gst: priced.gst,
    nextBreak: nextBreak ? { ...nextBreak } : null,
    tyresToNextBreak: nextBreak ? nextBreak.min - priced.itemCount : 0,
    accountSaving: priced.accountSaving,
    lineUnits,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Convenience selector so components don't re-derive totals by hand. */
export function useCartTotals(): CartTotals {
  const lines = useCart((s) => s.lines)
  const fulfilment = useCart((s) => s.fulfilment)
  const fittingTyres = useCart((s) => s.fittingTyres)
  const promo = useCart((s) => s.promo)
  const pricing = useAccountPrices((s) => s.pricing)
  return cartTotals({ lines, fulfilment, fittingTyres, promo }, pricing)
}

/**
 * True while a signed-in customer's prices are not known yet (or could not be loaded): the cart then shows
 * shelf prices that the server will not charge, so checkout waits.
 */
export function useAccountPricesPending(): boolean {
  const signedIn = useAccount((s) => s.me !== null)
  const status = useAccountPrices((s) => s.status)
  return signedIn && status !== 'ready'
}

/**
 * A quote-only (price-on-application) tyre can be in the cart only for a customer with their own price for it.
 * Once it is known who is signed in and what their prices are, drop any such line they cannot buy.
 */
export function dropUnbuyableLines(): void {
  const account = useAccount.getState()
  if (!account.ready) return
  const prices = useAccountPrices.getState()
  if (account.me && prices.status !== 'ready') return
  const buyable = (id: string) => {
    const product = productById.get(id)
    return !!product && (hasPrice(product) || prices.prices[id] != null)
  }
  const { lines } = useCart.getState()
  if (lines.every((line) => buyable(line.id))) return
  useCart.setState((state) => {
    const kept = state.lines.filter((line) => buyable(line.id))
    const total = kept.reduce((sum, line) => sum + line.quantity, 0)
    return { lines: kept, fittingTyres: Math.min(state.fittingTyres, total) }
  })
}

useAccount.subscribe(dropUnbuyableLines)
useAccountPrices.subscribe(dropUnbuyableLines)
