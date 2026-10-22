/**
 * GET   /api/admin/orders              -> { orders }
 * PATCH /api/admin/orders { id, status } -> { order }
 *
 * Status is the only mutable field — money and line items are whatever the
 * payment recorded, so letting an admin edit them would break reconciliation
 * against Square.
 */

import { audit } from '../audit.js'
import { authorize } from '../auth.js'
import {
  asString,
  fail,
  methodGuard,
  ok,
  readBody,
  withGuard,
} from '../http.js'
import { listOrders, updateOrderStatus, type StoredOrder } from '../store.js'

const STATUSES: StoredOrder['status'][] = [
  'pending',
  'paid',
  'packing',
  'dispatched',
  'collected',
  'cancelled',
]

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PATCH'])) return
  const actor = await authorize(req, res, 'orders')
  if (!actor) return

  res.setHeader('Cache-Control', 'private, no-store')

  if ((req.method ?? 'GET').toUpperCase() === 'GET') {
    ok(res, { orders: await listOrders() })
    return
  }

  /* ---- PATCH ---------------------------------------------------- */

  const body = readBody<{ id?: unknown; status?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with "id" and "status".')
    return
  }

  const id = asString(body.id, 120)
  if (!id) {
    fail(res, 400, 'An order "id" is required.')
    return
  }

  const status = asString(body.status, 40)
  if (!status || !isStatus(status)) {
    fail(res, 400, `"status" must be one of ${STATUSES.join(', ')}.`)
    return
  }

  const order = await updateOrderStatus(id, status)
  if (!order) {
    fail(res, 404, `No order with id "${id}".`)
    return
  }

  await audit(actor, 'order.status', `${order.reference} marked ${status}`)

  ok(res, { order })
})

function isStatus(value: string): value is StoredOrder['status'] {
  return (STATUSES as string[]).includes(value)
}
