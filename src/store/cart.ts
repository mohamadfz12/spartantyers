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
          // Price-on-application lines go to a quote, never the cart.
          if (!hasPrice(product)) return state
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
                  price: effectivePrice(product),
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
      // range or moved to price on application.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<CartState>
        const lines = (saved.lines ?? []).flatMap((line): CartLine[] => {
          const product = productById.get(line.id)
          if (!product || !hasPrice(product)) return []
          return [
            {
              ...line,
              sku: product.sku,
              brand: product.brand,
              model: product.model,
              size: product.size,
              tread: product.tread,
              price: effectivePrice(product),
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
}

export function cartTotals(state: {
  lines: CartLine[]
  fulfilment: Fulfilment
  fittingTyres: number
  promo: Promo | null
}): CartTotals {
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
  return cartTotals({ lines, fulfilment, fittingTyres, promo })
}
