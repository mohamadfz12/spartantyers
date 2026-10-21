/**
 * POST /api/promo/validate -> { valid, code?, percentOff?, description?, reason? }
 *
 * `percentOff` is fractional (0.1 === 10% off) so the response object can be
 * handed straight to `useCart().applyPromo()`.
 *
 * This endpoint is advisory only. The code is re-validated — against the real
 * tyre count — inside `pricing.ts` when the order is charged, so a promo that
 * passes here can still be dropped at checkout if its minimum is not met.
 */

import { fail, methodGuard, ok, readBody, withGuard } from '../_lib/http.js'
import { resolvePromo } from '../_lib/promos.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  const body = readBody<{ code?: unknown; tyreCount?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with a "code" field.')
    return
  }

  // The client contract only sends `code`; `tyreCount` is accepted as an
  // optional extra so a cart-aware caller can get an exact answer.
  const rawCount = Number(body.tyreCount)
  const tyreCount =
    Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : undefined

  ok(res, resolvePromo(body.code, tyreCount))
})
