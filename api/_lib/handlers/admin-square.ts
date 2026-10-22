/**
 * The Square account, for the admin's Square page (see ../square-api.ts).
 *
 * GET /api/admin/square?view=
 *   summary            -> today / 7 days / month totals, the 14-day chart, sources
 *   payments&range=    -> { items, cursor }   range: today | week | month | 90
 *   refunds | payouts | items | devices  -> { items, cursor }
 *   terminal           -> { devices, code }  paired Terminals and a code waiting to be used
 *   (add &cursor= for the next page, &fresh=1 to skip the one-minute cache)
 *
 * POST /api/admin/square { action }
 *   pair { name }      -> a code to type into the Terminal   (owner / manager)
 *   forget { deviceId } -> stop sending charges to a Terminal (owner / manager)
 *   charge { amount, description, deviceId? } -> send any amount to the Terminal
 */

import { can } from '../../../src/lib/admin-roles.js'
import { audit } from '../audit.js'
import { authorize } from '../auth.js'
import { asString, fail, methodGuard, ok, readBody, withGuard } from '../http.js'
import '../pos.js'
import {
  SquareApiError,
  squareStatus,
  forgetTerminal,
  listSquareDevices,
  listSquareItems,
  listSquarePayments,
  listSquarePayouts,
  listSquareRefunds,
  sendToTerminal,
  squareReady,
  squareSummary,
  startPairing,
  terminalStatus,
} from '../square-api.js'
import { squareEnvironment } from '../square.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return
  const actor = await authorize(req, res, 'payments')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  if (!squareReady()) {
    return fail(
      res,
      503,
      'Square is not set up on this server. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Vercel (Settings → Environment Variables), then redeploy.',
    )
  }

  const query = req.query ?? {}
  const q = (key: string) => {
    const v = query[key]
    return ((Array.isArray(v) ? v[0] : v) ?? '') as string
  }
  const fresh = q('fresh') === '1'
  const cursor = q('cursor')

  try {
    if ((req.method ?? 'GET').toUpperCase() === 'GET') {
      switch (q('view')) {
        case 'summary':
          return ok(res, await squareSummary(fresh))
        case 'payments':
          return ok(res, await listSquarePayments(q('range') || 'week', cursor, fresh))
        case 'refunds':
          return ok(res, await listSquareRefunds(cursor, fresh))
        case 'payouts':
          return ok(res, await listSquarePayouts(cursor, fresh))
        case 'items':
          return ok(res, await listSquareItems(cursor, fresh))
        case 'devices':
          return ok(res, await listSquareDevices(fresh))
        case 'terminal': {
          const state = await terminalStatus()
          return ok(res, { ...state, environment: squareEnvironment() })
        }
      }
      return fail(res, 400, 'Unknown view.')
    }

    const body = readBody<Record<string, unknown>>(req) ?? {}
    switch (body.action) {
      case 'pair': {
        if (!can(actor.role, 'finance')) return fail(res, 403, 'Only an owner or manager can pair a Terminal.')
        const code = await startPairing(asString(body.name, 100) ?? 'Front counter')
        await audit(actor, 'square.pair', `Started pairing a Square Terminal (${code.name})`)
        return ok(res, { code })
      }
      case 'forget': {
        if (!can(actor.role, 'finance')) return fail(res, 403, 'Only an owner or manager can remove a Terminal.')
        const state = await forgetTerminal(asString(body.deviceId, 100) ?? '')
        await audit(actor, 'square.forget', 'Removed a Square Terminal from the counter')
        return ok(res, state)
      }
      case 'charge': {
        const amount = Number(body.amount)
        const description = asString(body.description, 120)
        if (!description) return fail(res, 400, 'Say what the charge is for; it shows on the receipt.')
        if (!(amount > 0 && amount <= 100000)) return fail(res, 400, 'Enter an amount between $0 and $100,000.')
        const checkout = await sendToTerminal({
          purpose: 'custom',
          ref: '',
          amount,
          note: description,
          lines: [{ name: description, qty: 1, amount }],
          deviceId: asString(body.deviceId, 100) ?? undefined,
          by: actor.name,
        })
        await audit(actor, 'square.charge', `Sent $${amount.toFixed(2)} to the Terminal: ${description}`)
        return ok(res, { checkout })
      }
    }
    return fail(res, 400, 'Unknown action.')
  } catch (error) {
    // Square refusing our token must not read as the admin's own session ending (401 signs out).
    if (error instanceof SquareApiError) return fail(res, squareStatus(error.status), error.message)
    throw error
  }
})
