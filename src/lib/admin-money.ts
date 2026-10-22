/**
 * One list of every dollar, for the Payments and Balance pages.
 *
 * Website card payments (read from orders) and everything typed into the
 * ledger become the same row shape, so totals, filters and exports are
 * written once. A cancelled order's card payment stays visible but is not
 * counted: Square returned that money.
 */

import { ONLINE_METHOD } from '@/lib/admin-ledger'
import { inRange, type DateRange } from '@/lib/admin-periods'
import type { LedgerEntry, LedgerResponse, OnlinePayment } from '@/lib/api'

export interface MoneyRow {
  id: string
  date: string
  type: 'payment' | 'refund' | 'expense'
  amount: number
  gst: number
  category: string
  method: string
  description: string
  reference: string
  counterparty: string
  source: 'website' | 'manual' | 'stock' | 'wages'
  /** False only for the card payment of a cancelled order. */
  counted: boolean
  entry?: LedgerEntry
  online?: OnlinePayment
}

export const SOURCE_LABELS: Record<MoneyRow['source'], string> = {
  website: 'Website checkout',
  manual: 'Entered by hand',
  stock: 'Stock delivery',
  wages: 'Wages run',
}

export function moneyRows(data: LedgerResponse): MoneyRow[] {
  const online: MoneyRow[] = data.online.map((payment) => ({
    id: `online-${payment.id}`,
    date: payment.date,
    type: 'payment',
    amount: payment.amount,
    gst: payment.gst,
    category: 'Online sales',
    method: ONLINE_METHOD,
    description: payment.counted ? `Order ${payment.reference}` : `Order ${payment.reference} (cancelled, refunded in Square)`,
    reference: payment.reference,
    counterparty: payment.customer,
    source: 'website',
    counted: payment.counted,
    online: payment,
  }))

  const manual: MoneyRow[] = data.entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    type: entry.type,
    amount: entry.amount,
    gst: entry.gst,
    category: entry.category,
    method: entry.method,
    description: entry.description,
    reference: entry.reference,
    counterparty: entry.counterparty,
    source: entry.source,
    counted: true,
    entry,
  }))

  return [...online, ...manual].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  )
}

export interface MoneyTotals {
  /** Payments received. */
  received: number
  refunds: number
  /** received − refunds */
  income: number
  expenses: number
  /** income − expenses */
  net: number
  gstCollected: number
  gstPaid: number
  online: number
  manualIn: number
}

const cents = (n: number) => Math.round(n * 100) / 100

export function totalsFor(rows: MoneyRow[], range: DateRange): MoneyTotals {
  let received = 0
  let refunds = 0
  let expenses = 0
  let gstCollected = 0
  let gstPaid = 0
  let online = 0
  let manualIn = 0

  for (const row of rows) {
    if (!row.counted || !inRange(row.date, range)) continue
    if (row.type === 'payment') {
      received += row.amount
      gstCollected += row.gst
      if (row.source === 'website') online += row.amount
      else manualIn += row.amount
    } else if (row.type === 'refund') {
      refunds += row.amount
      // A refund hands the GST back too.
      gstCollected -= row.gst
    } else {
      expenses += row.amount
      gstPaid += row.gst
    }
  }

  const income = received - refunds
  return {
    received: cents(received),
    refunds: cents(refunds),
    income: cents(income),
    expenses: cents(expenses),
    net: cents(income - expenses),
    gstCollected: cents(gstCollected),
    gstPaid: cents(gstPaid),
    online: cents(online),
    manualIn: cents(manualIn),
  }
}

/** Puts a saved entry into the cached response, and settles its order if it was marked paid. */
export function updateEntries(
  data: LedgerResponse,
  entry: LedgerEntry,
  orderMarkedPaid: boolean,
): LedgerResponse {
  const entries = data.entries.some((e) => e.id === entry.id)
    ? data.entries.map((e) => (e.id === entry.id ? entry : e))
    : [entry, ...data.entries]
  const unpaidOrders = data.unpaidOrders
    .filter((order) => !(orderMarkedPaid && order.id === entry.orderId))
    .map((order) => {
      const paidSoFar = entries
        .filter((e) => e.orderId === order.id && e.type !== 'expense')
        .reduce((sum, e) => sum + (e.type === 'payment' ? e.amount : -e.amount), 0)
      return { ...order, paidSoFar: cents(paidSoFar) }
    })
  return { ...data, entries, unpaidOrders }
}

/** Opening balance plus everything since the opening date: what should be in the account. */
export function cashBalance(rows: MoneyRow[], data: LedgerResponse): number {
  const { openingBalance, openingDate } = data.settings
  const t = totalsFor(rows, { from: openingDate, to: '' })
  return cents(openingBalance + t.net)
}
