/**
 * Stock for a sale made on the website: each line comes off the product's stock, with a movement in the
 * stock log. Shared by card checkout and pay-later orders so both do it the same way. Never throws:
 * a paid or placed order with stale stock is recoverable, a failure after the money moved is not.
 */
import { randomUUID } from 'node:crypto'
import { resolveProduct } from './catalogue.js'
import { safeMessage } from './http.js'
import { saveStockMove, setOverride, type StoredOverride } from './store.js'

export async function takeOnlineStock(
  lines: Array<{ id: string; sku: string; quantity: number }>,
  overrides: Record<string, StoredOverride>,
  reference: string,
  by: string,
  tag: string,
): Promise<void> {
  for (const line of lines) {
    try {
      const product = resolveProduct(line.id, overrides)
      if (!product) continue
      const after = Math.max(0, product.stock - line.quantity)
      await setOverride(line.id, { stock: after })
      // The stockroom's history of this tyre; best-effort like the decrement.
      await saveStockMove({
        id: randomUUID(),
        productId: line.id,
        sku: line.sku,
        type: 'sale',
        change: after - product.stock,
        before: product.stock,
        after,
        reason: 'Sold online',
        note: '',
        reference,
        at: new Date().toISOString(),
        by,
      })
    } catch (error) {
      console.error(`[${tag}] stock decrement failed for ${line.id}: ${safeMessage(error)}`)
    }
  }
}
