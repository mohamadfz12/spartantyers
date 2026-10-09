/**
 * GET /api/inventory -> { products, updatedAt }
 *
 * The bundled catalogue plus any stored price/stock overrides. The SPA already
 * ships the catalogue, so this endpoint only ever *refines* what the browser
 * has; callers fall back to bundled data when it fails.
 */

import { mergeCatalogue } from './_lib/catalogue'
import { methodGuard, ok, withGuard } from './_lib/http'
import { getOverrides } from './_lib/store'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return

  const overrides = await getOverrides()
  const products = mergeCatalogue(overrides)

  // Newest override timestamp, so a client can tell whether anything moved.
  const updatedAt = Object.values(overrides)
    .map((o) => o.updatedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .pop()

  // Stock changes on every order; a short shared cache keeps the shop snappy
  // without serving genuinely stale numbers.
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120')

  ok(res, { products, updatedAt: updatedAt ?? new Date().toISOString() })
})
