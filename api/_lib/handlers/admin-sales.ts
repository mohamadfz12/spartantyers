/**
 * GET /api/admin/sales-by-channel?from=YYYY-MM-DD&to=YYYY-MM-DD  (permission `finance`: owner and manager)
 *   -> { from, to, channels: { retail, bulk, wholesale }, total }
 *
 * Every sale of the website (orders that are not cancelled) and of the till (tickets paid or on account),
 * split by the sale label: Retail, Bulk or Wholesale. Each of the three, and `total`, is
 *
 *   { website: Part, till: Part, all: Part }
 *   Part = { count, total, paid, owing, onAccount: { count, total } }
 *
 * `total` is the value of the sales (GST included), `paid` what has been received so far, `owing` the
 * rest (a pay-later sale not yet paid, or an order waiting for payment), and `onAccount` the pay-later
 * sales whether or not they have since been paid. Days are Sydney days; `from` and `to` are included.
 * Defaults to the last 30 days. Older records with no label are labelled by the same rule (20 or more
 * tyres is Bulk, else Retail).
 */
import { saleChannel, type SaleChannel } from '../../../src/lib/account-pricing.js'
import { asDate, sydneyDate } from '../audit.js'
import { authorize } from '../auth.js'
import { fail, methodGuard, ok, queryParam, round2, withGuard } from '../http.js'
import { addDays } from '../square-api.js'
import { listOrders, listPosTickets, type StoredOrder, type StoredPosTicket } from '../store.js'

const MAX_DAYS = 400

interface Part {
  count: number
  total: number
  paid: number
  owing: number
  onAccount: { count: number; total: number }
}

const emptyPart = (): Part => ({ count: 0, total: 0, paid: 0, owing: 0, onAccount: { count: 0, total: 0 } })

function add(part: Part, sale: { total: number; paid: number; onAccount: boolean }) {
  part.count += 1
  part.total = round2(part.total + sale.total)
  part.paid = round2(part.paid + sale.paid)
  part.owing = round2(part.total - part.paid)
  if (sale.onAccount) {
    part.onAccount.count += 1
    part.onAccount.total = round2(part.onAccount.total + sale.total)
  }
}

const merge = (a: Part, b: Part): Part => ({
  count: a.count + b.count,
  total: round2(a.total + b.total),
  paid: round2(a.paid + b.paid),
  owing: round2(a.total + b.total - (a.paid + b.paid)),
  onAccount: { count: a.onAccount.count + b.onAccount.count, total: round2(a.onAccount.total + b.onAccount.total) },
})

const tyresIn = (lines: Array<{ quantity: number }>) => lines.reduce((n, l) => n + l.quantity, 0)

/** The label of an order: the stored one, else the tyre count rule. */
export const orderChannel = (o: StoredOrder): SaleChannel => o.channel ?? saleChannel(null, tyresIn(o.lines))

/** The label of a till ticket: the stored one, else the tyre count rule. */
export const ticketChannel = (t: StoredPosTicket): SaleChannel =>
  t.channel ?? saleChannel(null, t.lines.filter((l) => l.source === 'tyre').reduce((n, l) => n + l.qty, 0))

/** Money received against an order so far. */
function orderPaid(o: StoredOrder, ticketPaid: Map<string, number>): number {
  if (o.payment === 'account') {
    if (o.accountPaidAt) return o.total
    return Math.min(o.total, ticketPaid.get(o.posTicketRef ?? '') ?? 0)
  }
  // A card order is paid; any other order is paid once it has left 'pending' (marked paid by hand).
  return o.paymentId || o.status !== 'pending' ? o.total : 0
}

/** The day a ticket was sold: when it was paid, or put on account (a later payment does not move it). */
function ticketDay(t: StoredPosTicket): string {
  const onAccount = t.history.find((h) => h.what.startsWith('On account'))
  if (t.payment === 'account' && onAccount) return sydneyDate(onAccount.at)
  return sydneyDate(t.paidAt ?? t.createdAt)
}

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  const actor = await authorize(req, res, 'finance')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  const today = sydneyDate()
  const rawTo = queryParam(req, 'to')
  const rawFrom = queryParam(req, 'from')
  const to = rawTo ? asDate(rawTo) : today
  const from = rawFrom ? asDate(rawFrom) : to ? addDays(to, -29) : null
  if (!to || !from) return fail(res, 400, '"from" and "to" must be real dates (YYYY-MM-DD).')
  if (from > to) return fail(res, 400, '"from" cannot be after "to".')
  if (addDays(from, MAX_DAYS) < to) return fail(res, 400, `Pick a range of at most ${MAX_DAYS} days.`)

  const [orders, tickets] = await Promise.all([listOrders(), listPosTickets()])
  const ticketPaid = new Map(tickets.map((t) => [t.ref, t.amountPaid]))

  const blank = () => ({ website: emptyPart(), till: emptyPart() })
  const by: Record<SaleChannel, ReturnType<typeof blank>> = { retail: blank(), bulk: blank(), wholesale: blank() }

  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const day = sydneyDate(o.createdAt)
    if (day < from || day > to) continue
    add(by[orderChannel(o)].website, { total: o.total, paid: orderPaid(o, ticketPaid), onAccount: o.payment === 'account' })
  }
  for (const t of tickets) {
    if (t.status !== 'paid' && t.status !== 'account') continue
    // A website order's ticket is the order itself, counted above.
    if (t.orderId) continue
    const day = ticketDay(t)
    if (day < from || day > to) continue
    add(by[ticketChannel(t)].till, { total: t.total, paid: t.amountPaid, onAccount: t.payment === 'account' })
  }

  const withAll = (b: ReturnType<typeof blank>) => ({ website: b.website, till: b.till, all: merge(b.website, b.till) })
  const channels = { retail: withAll(by.retail), bulk: withAll(by.bulk), wholesale: withAll(by.wholesale) }
  const total = {
    website: merge(merge(by.retail.website, by.bulk.website), by.wholesale.website),
    till: merge(merge(by.retail.till, by.bulk.till), by.wholesale.till),
  }
  ok(res, { from, to, channels, total: { ...total, all: merge(total.website, total.till) } })
})
