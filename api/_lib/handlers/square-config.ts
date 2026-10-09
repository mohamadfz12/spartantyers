/**
 * GET /api/square/config
 *   -> { applicationId, locationId, environment, afterpayEnabled, afterpayMaxOrder }
 *
 * The Square Web Payments SDK needs the application and location id to boot.
 * When Square is not configured we answer 503 with `{ error }` so the checkout
 * can render a clear "card payment unavailable — call us" state rather than
 * mounting a card form that could never succeed.
 */

import { site } from '../../../src/config/site'
import { methodGuard, ok, fail, withGuard } from '../http'
import { getSquareConfig, missingSquareVars } from '../square'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return

  const config = getSquareConfig()

  if (!config) {
    // The message is customer-facing; the missing variable names are logged
    // for the operator and not returned.
    console.error(
      `[square/config] not configured, missing: ${missingSquareVars().join(', ')}`,
    )
    fail(
      res,
      503,
      `Card payment is temporarily unavailable. Please call us on ${site.phone.display} to place your order.`,
    )
    return
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  ok(res, {
    applicationId: config.applicationId,
    locationId: config.locationId,
    environment: config.environment,
    // Afterpay rides on the same Square account; the cap is a business rule
    // from site config, not a Square setting.
    afterpayEnabled: process.env.SQUARE_AFTERPAY_ENABLED !== 'false',
    afterpayMaxOrder: site.commerce.afterpayMaxOrder,
  })
})
