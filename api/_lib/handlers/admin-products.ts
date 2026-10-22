/**
 * GET   /api/admin/products            -> { products }
 * PATCH /api/admin/products { id, patch } -> { product }
 *
 * Edits are stored as *overrides* keyed by product id rather than by mutating
 * the catalogue: the bundled specs stay authoritative, only the commercial
 * fields (price, discount, stock) can be changed, and reverting is a matter of
 * clearing the override.
 */

import { randomUUID } from 'node:crypto'
import { can } from '../../../src/lib/admin-roles.js'
import { audit } from '../audit.js'
import { authorize } from '../auth.js'
import { mergeCatalogue, mergeOverride, getProduct } from '../catalogue.js'
import {
  asString,
  fail,
  methodGuard,
  ok,
  readBody,
  withGuard,
} from '../http.js'
import {
  getOverrides,
  saveStockMove,
  setOverride,
  type StoredOverride,
} from '../store.js'

const MAX_PRICE = 20000
const MAX_STOCK = 100000

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PATCH'])) return
  const actor = await authorize(req, res, 'products')
  if (!actor) return

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

  if (('price' in raw || 'discount' in raw) && !can(actor.role, 'pricing')) {
    fail(res, 403, 'Only an owner or manager can change prices and discounts.')
    return
  }

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

  const before = mergeOverride(base, (await getOverrides())[id])
  const stored = await setOverride(id, patch)
  const product = mergeOverride(base, stored)

  if (patch.stock !== undefined && patch.stock !== before.stock) {
    await saveStockMove({
      id: randomUUID(),
      productId: id,
      sku: base.sku,
      type: 'count',
      change: patch.stock - before.stock,
      before: before.stock,
      after: patch.stock,
      reason: 'Edited on the Products page',
      note: '',
      at: new Date().toISOString(),
      by: actor.name,
    })
  }

  const changes = [
    patch.price !== undefined ? `price ${before.price ?? 'POA'} → ${patch.price}` : '',
    patch.discount !== undefined ? `discount ${before.discount ?? 0}% → ${patch.discount ?? 0}%` : '',
    patch.stock !== undefined ? `stock ${before.stock} → ${patch.stock}` : '',
  ].filter(Boolean)
  await audit(actor, 'product.update', `${base.sku}: ${changes.join(', ')}`)

  ok(res, { product })
})
