/**
 * GET   /api/admin/products            -> { products }
 * PATCH /api/admin/products { id, patch } -> { product }
 *
 * Edits are stored as *overrides* keyed by product id rather than by mutating
 * the catalogue: the bundled specs stay authoritative, only the commercial
 * fields (price, discount, stock) can be changed, and reverting is a matter of
 * clearing the override.
 */

import { requireAdmin } from '../auth.js'
import { mergeCatalogue, mergeOverride, getProduct } from '../catalogue.js'
import {
  asString,
  fail,
  methodGuard,
  ok,
  readBody,
  withGuard,
} from '../http.js'
import { getOverrides, setOverride, type StoredOverride } from '../store.js'

const MAX_PRICE = 20000
const MAX_STOCK = 100000

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PATCH'])) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store')

  if ((req.method ?? 'GET').toUpperCase() === 'GET') {
    const overrides = await getOverrides()
    ok(res, { products: mergeCatalogue(overrides) })
    return
  }

  /* ---- PATCH ---------------------------------------------------- */

  const body = readBody<{ id?: unknown; patch?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with "id" and "patch".')
    return
  }

  const id = asString(body.id, 120)
  if (!id) {
    fail(res, 400, 'A product "id" is required.')
    return
  }

  const base = getProduct(id)
  if (!base) {
    fail(res, 404, `No product with id "${id}".`)
    return
  }

  if (!body.patch || typeof body.patch !== 'object') {
    fail(res, 400, 'A "patch" object is required.')
    return
  }

  const raw = body.patch as Record<string, unknown>
  const patch: StoredOverride = {}

  if ('price' in raw) {
    const price = Number(raw.price)
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      fail(res, 400, `"price" must be a number between 0 and ${MAX_PRICE}.`)
      return
    }
    patch.price = Math.round(price * 100) / 100
  }

  if ('discount' in raw) {
    // `null` clears the discount; Product.discount is a whole percentage.
    if (raw.discount === null) {
      patch.discount = null
    } else {
      const discount = Number(raw.discount)
      if (!Number.isFinite(discount) || discount < 0 || discount >= 100) {
        fail(res, 400, '"discount" must be a percentage between 0 and 99, or null.')
        return
      }
      patch.discount = Math.round(discount)
    }
  }

  if ('stock' in raw) {
    const stock = Number(raw.stock)
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      fail(res, 400, `"stock" must be a whole number between 0 and ${MAX_STOCK}.`)
      return
    }
    patch.stock = stock
  }

  if (!Object.keys(patch).length) {
    fail(res, 400, 'Patch must set at least one of "price", "discount" or "stock".')
    return
  }

  const stored = await setOverride(id, patch)

  ok(res, { product: mergeOverride(base, stored) })
})
