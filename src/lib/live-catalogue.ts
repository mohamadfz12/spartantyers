import { create } from 'zustand'
import { applyLiveCatalogue, effectivePrice, productById } from '@/data/products'
import { api } from '@/lib/api'
import type { CartLine } from '@/data/types'
import { dropUnbuyableLines, useCart } from '@/store/cart'
import { useAccountPrices } from '@/store/account-prices'

/* ------------------------------------------------------------------ *
 * Live catalogue
 *
 * Prices, discounts and stock are edited in the admin panel and stored in
 * the database; the specs ship with the site. On load (and when a tab
 * comes back after a while) this fetches /api/inventory, applies it to the
 * bundled catalogue in place, re-prices anything already in the cart, and
 * bumps `version` so pages that memoise product lists recompute.
 *
 * If the request fails the bundled values stay on screen. The server
 * always prices an order from the database at checkout, so the customer
 * is never charged a figure they were not shown: a mismatch is caught
 * there and they are asked to review the new total.
 * ------------------------------------------------------------------ */

interface CatalogueState {
  /** Increases each time live data changed something on screen. */
  version: number
}

export const useCatalogue = create<CatalogueState>(() => ({ version: 0 }))

/** Subscribe to live-catalogue updates; add the result to a memo's deps. */
export const useCatalogueVersion = () => useCatalogue((s) => s.version)

/** Re-fetch at most this often when the tab regains focus. */
const REFRESH_MS = 60_000

let lastFetch = 0
let inFlight: Promise<void> | null = null

export function refreshCatalogue(force = false): Promise<void> {
  if (inFlight) return inFlight
  if (!force && Date.now() - lastFetch < REFRESH_MS) return Promise.resolve()

  lastFetch = Date.now()
  inFlight = api
    .inventory()
    .then(({ products }) => {
      if (!Array.isArray(products) || !applyLiveCatalogue(products)) return
      repriceCart()
      useCatalogue.setState((s) => ({ version: s.version + 1 }))
    })
    .then(() => {
      // A signed-in customer's prices depend on the catalogue (a shelf price that moved can change which is lower).
      void useAccountPrices.getState().reload()
    })
    .catch(() => {
      // Keep the bundled prices; try again on the next focus.
      lastFetch = 0
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/**
 * Same rule as the cart's own rehydration: current price. A line that has become price on application stays
 * (its saved price is kept) only until `dropUnbuyableLines` finds the visitor has no account price for it.
 */
function repriceCart() {
  useCart.setState((state) => {
    const lines = state.lines.flatMap((line): CartLine[] => {
      const product = productById.get(line.id)
      if (!product) return []
      return [{ ...line, price: effectivePrice(product) ?? line.price }]
    })
    const total = lines.reduce((sum, line) => sum + line.quantity, 0)
    return { lines, fittingTyres: Math.min(state.fittingTyres, total) }
  })
  dropUnbuyableLines()
}

/** Starts the first fetch and refreshes when the visitor returns to the tab. */
export function startLiveCatalogue(): () => void {
  void refreshCatalogue(true)
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshCatalogue()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}
