/**
 * The API's view of the product catalogue.
 *
 * `src/data/products.ts` is the single source of truth for every tyre spec, so
 * the functions re-export it rather than keeping a second copy that could drift.
 *
 * NOTE ON THE IMPORT PATH: the app imports catalogue data as `@/data/products`,
 * but the `@/*` tsconfig path alias is a Vite/bundler concern — the Vercel Node
 * runtime compiles each `api/**` entrypoint with esbuild and does not read that
 * alias. The relative path below is therefore mandatory, not a style choice.
 * It is also safe: `src/data/products.ts` imports nothing except `./types`
 * (type-only), so pulling it in drags in no React, no Vite env and no CSS.
 */

import {
  products,
  getProduct,
  effectivePrice,
  hasPrice,
  pricedProducts,
  poaProducts,
  PRICE_BREAKS,
  priceBreakFor,
} from '../../src/data/products.js'
import type { Product } from '../../src/data/types.js'

export { products, getProduct, effectivePrice, hasPrice, PRICE_BREAKS, priceBreakFor }
export type { Product }

/** Stock/price adjustments stored outside the bundle (admin edits, sales). */
export interface ProductOverride {
  price?: number
  discount?: number | null
  stock?: number
  updatedAt?: string
}

/**
 * Applies an override on top of a bundled product. `discountPrice` is derived
 * here exactly as `buildProduct` derives it so the two can never disagree.
 *
 * A price override on a price-on-application line gives it a price; without
 * one it stays POA, and a discount has nothing to apply to.
 */
export function mergeOverride(
  product: Product,
  override: ProductOverride | undefined,
): Product {
  if (!override) return product

  const price = typeof override.price === 'number' ? override.price : product.price

  const discount =
    price == null || override.discount === null
      ? undefined
      : typeof override.discount === 'number'
        ? override.discount
        : product.discount

  const stock = typeof override.stock === 'number' ? override.stock : product.stock

  return {
    ...product,
    price,
    discount,
    discountPrice:
      price != null && discount != null
        ? Math.round(price * (1 - discount / 100) * 100) / 100
        : undefined,
    stock,
  }
}

/** The full catalogue with every stored override applied. */
export function mergeCatalogue(
  overrides: Record<string, ProductOverride>,
): Product[] {
  return products.map((product) => mergeOverride(product, overrides[product.id]))
}

/** A single product with its override applied, or undefined if unknown. */
export function resolveProduct(
  id: string,
  overrides: Record<string, ProductOverride>,
): Product | undefined {
  const base = getProduct(id)
  if (!base) return undefined
  return mergeOverride(base, overrides[id])
}

/**
 * Compact catalogue facts for the chat system prompt. Intentionally excludes
 * per-product stock so the assistant has nothing to quote stock levels from.
 */
export function catalogueSummary(): {
  count: number
  pricedCount: number
  poaCount: number
  brands: string[]
  sizes: string[]
  positions: string[]
  applications: string[]
  priceMin: number
  priceMax: number
  models: string[]
  poaModels: string[]
} {
  const prices = pricedProducts.map((p) => effectivePrice(p))
  const name = (p: Product) => `${p.brand} ${p.model} ${p.size}`
  return {
    count: products.length,
    pricedCount: pricedProducts.length,
    poaCount: poaProducts.length,
    brands: [...new Set(products.map((p) => p.brand))],
    sizes: [...new Set(products.map((p) => p.size))],
    positions: [...new Set(products.flatMap((p) => p.position))],
    applications: [...new Set(products.map((p) => p.application))],
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    models: products.map(name),
    poaModels: poaProducts.map(name),
  }
}
