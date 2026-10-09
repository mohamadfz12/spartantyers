/**
 * GET /api/orders?reference=&email= -> { order } | 404
 *
 * Customer-facing order tracking. Both parameters are required and matched
 * case-insensitively: the reference alone would make this an enumeration
 * oracle, and customers routinely retype their email with different casing.
 *
 * Returns 404 for "no such order" and for "reference exists but email does not
 * match" — the two cases are deliberately indistinguishable.
 */

import {
  asEmail,
  asString,
  fail,
  methodGuard,
  ok,
  queryParam,
  withGuard,
} from './_lib/http'
import { findOrder, isPersistent } from './_lib/store'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return

  const reference = asString(queryParam(req, 'reference'), 60)
  const email = asEmail(queryParam(req, 'email'))

  if (!reference) {
    fail(res, 400, 'Please provide your order reference.')
    return
  }
  if (!email) {
    fail(res, 400, 'Please provide the email address used on the order.')
    return
  }

  // Order lookups must never be cached by the CDN — they are per-customer.
  res.setHeader('Cache-Control', 'private, no-store')

  const order = await findOrder(reference, email)

  if (!order) {
    fail(
      res,
      404,
      isPersistent()
        ? 'We could not find an order with that reference and email address.'
        : 'Order lookup is unavailable on this deployment (no order database configured).',
    )
    return
  }

  ok(res, { order })
})
