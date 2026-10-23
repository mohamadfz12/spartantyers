/**
 * What a signed-in customer may read about their own business: their website orders and their
 * statement. Both are built only from records that belong to THIS account: orders carry its id, and
 * the till side is read only through its own linked till customer (a two-way link). Nothing here takes
 * an id from the request.
 */
import { sydneyDate } from '../audit.js'
import { balanceOf } from '../pos.js'
import { getPosCustomer, listAccountPayments, listOrders, listPosTickets, type StoredOrder } from '../store.js'
import type { AccountRecord } from './repo.js'

const round2 = (n: number) => Math.round(n * 100) / 100

/** An order as its owner sees it: no internal ids, no card payment id. */
export function orderView(o: StoredOrder, today = sydneyDate()) {
  const onAccount = o.payment === 'account'
  return {
    reference: o.reference,
    createdAt: o.createdAt,
    status: o.status,
    fulfilment: o.fulfilment,
    lines: o.lines.map((l) => ({ name: l.name, size: l.size, quantity: l.quantity, unitPrice: l.unitPrice, ...(l.basis ? { basis: l.basis } : {}) })),
    fittingTyres: o.fittingTyres,
    subtotal: o.subtotal,
    discount: o.discount,
    fittingTotal: o.fittingTotal,
    total: o.total,
    channel: o.channel ?? 'retail',
    payment: onAccount ? 'account' : 'card',
    ...(onAccount
      ? {
          dueDate: o.dueDate ?? null,
          paid: Boolean(o.accountPaidAt),
          overdue: !o.accountPaidAt && o.status !== 'cancelled' && Boolean(o.dueDate && o.dueDate < today),
        }
      : {}),
  }
}

/** The signed-in customer's own website orders, newest first. */
export async function ordersFor(account: AccountRecord) {
  return (await listOrders()).filter((o) => o.accountId === account.id).map((o) => orderView(o))
}

/**
 * The statement: what is owed (with due dates and an overdue flag), payments received, and the balance.
 * A linked account reads its own till customer's open account tickets and payments. An unlinked account
 * gets its website on-account orders only, and no till data at all.
 */
export async function statementFor(account: AccountRecord) {
  const today = sydneyDate()
  const orders = await listOrders()
  const mine = orders.filter((o) => o.accountId === account.id)

  const till = account.posCustomerId ? await getPosCustomer(account.posCustomerId) : null
  if (!till || till.accountId !== account.id) {
    const open = mine
      .filter((o) => o.payment === 'account' && !o.accountPaidAt && o.status !== 'cancelled')
      .map((o) => ({
        kind: 'order' as const,
        reference: o.reference,
        date: o.createdAt,
        dueDate: o.dueDate ?? null,
        total: o.total,
        paid: 0,
        owing: o.total,
        overdue: Boolean(o.dueDate && o.dueDate < today),
      }))
    const due = round2(open.reduce((s, x) => s + x.owing, 0))
    const overdue = round2(open.filter((x) => x.overdue).reduce((s, x) => s + x.owing, 0))
    return { linked: false, balance: { due, overdue, count: open.length }, open, payments: [] as unknown[] }
  }

  const [tickets, payments] = await Promise.all([listPosTickets(), listAccountPayments()])
  const refByOrder = new Map(mine.map((o) => [o.id, o.reference]))
  const mineTickets = tickets.filter((t) => t.customerId === till.id)
  const open = mineTickets
    .filter((t) => t.status === 'account' && round2(t.total - t.amountPaid) > 0)
    .sort((a, b) => `${a.dueDate}|${a.createdAt}`.localeCompare(`${b.dueDate}|${b.createdAt}`))
    .map((t) => ({
      kind: 'ticket' as const,
      reference: t.orderId && refByOrder.has(t.orderId) ? refByOrder.get(t.orderId)! : t.ref,
      date: t.createdAt,
      dueDate: t.dueDate,
      total: t.total,
      paid: t.amountPaid,
      owing: round2(t.total - t.amountPaid),
      overdue: Boolean(t.dueDate && t.dueDate < today),
    }))
  const received = payments
    .filter((p) => p.customerId === till.id && p.status === 'paid')
    .slice(0, 100)
    .map((p) => ({
      ref: p.ref,
      date: p.paidAt ?? p.createdAt,
      amount: p.amount,
      method: p.methodLabel,
      allocations: p.allocations.map((a) => ({ ticketRef: a.ticketRef, amount: a.amount })),
    }))
  return { linked: true, balance: balanceOf(till.id, tickets, today), open, payments: received }
}
