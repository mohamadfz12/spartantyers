/**
 * GET /api/inventory -> { products, updatedAt }
 *
 * The bundled catalogue plus any stored price/stock overrides. The SPA already
 * ships the catalogue, so this endpoint only ever *refines* what the browser
 * has; callers fall back to bundled data when it fails.
 */

import { mergeCatalogue } from './_lib/catalogue.js'
import { methodGuard, ok, withGuard } from './_lib/http.js'
import { getOverrides } from './_lib/store.js'

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

  // Prices are edited in the admin and stock changes on every order, so the
  // shared cache is only long enough to absorb a burst of visitors: an admin
  // change reaches the shop within seconds.
  res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=10')

  ok(res, { products, updatedAt: updatedAt ?? new Date().toISOString() })
})
