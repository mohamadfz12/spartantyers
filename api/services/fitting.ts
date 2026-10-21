/**
 * POST /api/services/fitting -> { tyres, perTyre, total }
 *
 * A pure quote. The per-tyre fee is a business fact from `site.commerce`, so
 * the endpoint needs no environment variables and cannot be unavailable.
 */

import { site } from '../../src/config/site.js'
import {
  asPositiveInt,
  fail,
  methodGuard,
  ok,
  readBody,
  round2,
  withGuard,
} from '../_lib/http.js'

const MAX_TYRES = 500

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  const body = readBody<{ tyres?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with a "tyres" field.')
    return
  }

  const tyres = asPositiveInt(body.tyres, MAX_TYRES)
  if (tyres == null) {
    fail(
      res,
      400,
      `"tyres" must be a whole number between 0 and ${MAX_TYRES}. For larger jobs please call ${site.phone.display}.`,
    )
    return
  }

  const perTyre = site.commerce.fittingFeePerTyre

  ok(res, { tyres, perTyre, total: round2(tyres * perTyre) })
})
