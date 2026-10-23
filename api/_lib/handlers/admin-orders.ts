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
import { cancelAccountOrder } from '../accounts/orders.js'
import { getOrder, listOrders, updateOrderStatus, type StoredOrder } from '../store.js'

const STATUSES: StoredOrder['status'][] = [
  'pending',
  'paid',
  'account',
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

  // A pay-later order is paid at the till, in the customer's account, so their balance stays right:
  // it is never marked paid (or pending) from here, and cancelling it cancels its ticket and frees the credit.
  const existing = await getOrder(id)
  if (existing?.payment === 'account') {
    // Cancelling it voided its ticket and gave the credit back: shipping it now would send tyres nobody owes for.
    if (existing.status === 'cancelled' && status !== 'cancelled') {
      fail(res, 409, 'This order on account was cancelled, so nothing is owed for it. Ask the customer to place a new order.')
      return
    }
    if (status === 'paid' || status === 'pending' || status === 'account') {
      fail(
        res,
        409,
        existing.accountPaidAt
          ? 'This order was paid on the customer account.'
          : "This order is on the customer's account. Take the payment in the till's customer account, so the balance stays right.",
      )
      return
    }
    if (status === 'cancelled') {
      const blocked = await cancelAccountOrder(existing, actor.name)
      if (blocked) {
        fail(res, 409, blocked)
        return
      }
    }
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
