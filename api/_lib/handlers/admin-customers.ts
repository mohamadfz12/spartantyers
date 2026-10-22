/**
 * GET /api/admin/customers -> { customers }
 *
 * Built from the orders on every request rather than stored, so there is no
 * second copy of anyone's details to drift or to forget to delete. A customer
 * is one email address; the name, phone and company are the latest given.
 */

import { authorize } from '../auth.js'
import { methodGuard, ok, withGuard } from '../http.js'
import { listLedger, listOrders, listSubscribers } from '../store.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  const actor = await authorize(req, res, 'customers')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  const [orders, subscribers, ledger] = await Promise.all([
    listOrders(),
    listSubscribers(),
    listLedger(),
  ])
  const subscribed = new Set(subscribers.map((s) => s.email.toLowerCase()))

  // Money paid by bank transfer or cash against an order counts toward its customer.
  const manual = new Map<string, number>()
  for (const entry of ledger) {
    if (!entry.orderId || entry.type === 'expense') continue
    const sign = entry.type === 'payment' ? 1 : -1
    manual.set(entry.orderId, (manual.get(entry.orderId) ?? 0) + sign * entry.amount)
  }

  interface Customer {
    email: string
    name: string
    phone: string
    company: string
    suburb: string
    orders: number
    tyres: number
    spent: number
    firstOrder: string
    lastOrder: string
    references: string[]
    subscribed: boolean
  }

  const byEmail = new Map<string, Customer>()
  // Oldest first, so the latest details given win.
  for (const order of [...orders].reverse()) {
    const email = order.customer.email.trim().toLowerCase()
    const customer =
      byEmail.get(email) ??
      ({
        email,
        name: '',
        phone: '',
        company: '',
        suburb: '',
        orders: 0,
        tyres: 0,
        spent: 0,
        firstOrder: order.createdAt,
        lastOrder: order.createdAt,
        references: [],
        subscribed: subscribed.has(email),
      } satisfies Customer)

    customer.name = order.customer.name || customer.name
    customer.phone = order.customer.phone || customer.phone
    customer.company = order.customer.company || customer.company
    customer.suburb = order.address?.suburb || customer.suburb
    customer.lastOrder = order.createdAt
    customer.references.unshift(order.reference)

    if (order.status !== 'cancelled') {
      customer.orders += 1
      customer.tyres += order.lines.reduce((sum, line) => sum + line.quantity, 0)
      customer.spent += order.paymentId ? order.total : (manual.get(order.id) ?? 0)
    }
    byEmail.set(email, customer)
  }

  const customers = [...byEmail.values()]
    .map((c) => ({ ...c, spent: Math.round(c.spent * 100) / 100 }))
    .sort((a, b) => b.lastOrder.localeCompare(a.lastOrder))

  ok(res, { customers })
})
