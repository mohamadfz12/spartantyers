/**
 * GET    /api/admin/ledger  -> { entries, online, unpaidOrders, settings }
 * POST   /api/admin/ledger  { type, date, amount, gst, category, method, ... } -> { entry }
 * PATCH  /api/admin/ledger  { id, ...same fields }      -> { entry }
 * PATCH  /api/admin/ledger  { settings: { ... } }        -> { settings }
 * DELETE /api/admin/ledger?id=                           -> { ok }
 *
 * The money side of the admin, behind the Payments and Balance pages.
 *
 * `online` is NOT stored: it is worked out from the orders on every request,
 * so a card payment taken by the website appears here once, exactly as the
 * order recorded it, and can never be edited away from what Square charged.
 * `entries` is everything else: bank transfers, cash, refunds, expenses.
 */

import { randomUUID } from 'node:crypto'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  gstInside,
} from '../../../src/lib/admin-ledger.js'
import { can } from '../../../src/lib/admin-roles.js'
import { asDate, asMoney, audit, optionalText, sydneyDate } from '../audit.js'
import { authorize } from '../auth.js'
import { asString, fail, methodGuard, ok, queryParam, readBody, withGuard } from '../http.js'
import {
  deleteLedgerEntry,
  getFinanceSettings,
  getLedgerEntry,
  getOrder,
  listLedger,
  listOrders,
  listTimesheets,
  saveLedgerEntry,
  saveTimesheet,
  setFinanceSettings,
  updateOrderStatus,
  type LedgerType,
  type StoredLedgerEntry,
} from '../store.js'

const TYPES: LedgerType[] = ['payment', 'refund', 'expense']

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return
  const actor = await authorize(req, res, 'payments')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  const method = (req.method ?? 'GET').toUpperCase()

  /* ---- GET ------------------------------------------------------ */

  if (method === 'GET') {
    const [entries, orders, settings] = await Promise.all([
      listLedger(),
      listOrders(),
      getFinanceSettings(),
    ])

    const online = orders
      .filter((order) => order.paymentId)
      .map((order) => ({
        id: order.id,
        reference: order.reference,
        date: sydneyDate(order.createdAt),
        createdAt: order.createdAt,
        amount: order.total,
        gst: gstInside(order.total),
        customer: order.customer.company
          ? `${order.customer.name} (${order.customer.company})`
          : order.customer.name,
        email: order.customer.email,
        status: order.status,
        paymentId: order.paymentId!,
        // A cancelled order's card payment is refunded in Square, so it is not income.
        counted: order.status !== 'cancelled',
      }))

    const paidAgainst = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.orderId || entry.type === 'expense') continue
      const sign = entry.type === 'payment' ? 1 : -1
      paidAgainst.set(entry.orderId, (paidAgainst.get(entry.orderId) ?? 0) + sign * entry.amount)
    }

    const unpaidOrders = orders
      .filter((order) => order.status === 'pending')
      .map((order) => ({
        id: order.id,
        reference: order.reference,
        date: sydneyDate(order.createdAt),
        total: order.total,
        customer: order.customer.name,
        paidSoFar: Math.round((paidAgainst.get(order.id) ?? 0) * 100) / 100,
      }))

    ok(res, { entries, online, unpaidOrders, settings, today: sydneyDate() })
    return
  }

  /* ---- DELETE --------------------------------------------------- */

  if (method === 'DELETE') {
    const entry = await getLedgerEntry(asString(queryParam(req, 'id'), 120) ?? '')
    if (!entry) return fail(res, 404, 'No ledger entry with that id.')
    if (entry.type === 'expense' && !can(actor.role, 'finance')) {
      return fail(res, 403, 'Only an owner or manager can remove expenses.')
    }

    await deleteLedgerEntry(entry.id)

    // A deleted wages payment puts the hours it paid back to "unpaid".
    let unpaid = 0
    if (entry.source === 'wages') {
      for (const sheet of await listTimesheets()) {
        if (sheet.expenseId !== entry.id) continue
        const { paidAt, expenseId, ...rest } = sheet
        await saveTimesheet({ ...rest, paid: false })
        unpaid += 1
      }
    }

    await audit(
      actor,
      'ledger.delete',
      `Deleted ${entry.type} of $${entry.amount.toFixed(2)} (${entry.category}${entry.counterparty ? `, ${entry.counterparty}` : ''})${unpaid ? `; ${unpaid} timesheet entries back to unpaid` : ''}`,
    )
    ok(res, { ok: true, unpaid })
    return
  }

  const body = readBody<Record<string, unknown>>(req)
  if (!body) return fail(res, 400, 'Expected a JSON request body.')

  /* ---- PATCH settings ------------------------------------------- */

  if (method === 'PATCH' && body.settings && typeof body.settings === 'object') {
    if (!can(actor.role, 'finance')) return fail(res, 403, 'Only an owner or manager can change balance settings.')
    const raw = body.settings as Record<string, unknown>
    const patch: Parameters<typeof setFinanceSettings>[0] = {}

    if ('openingBalance' in raw) {
      const n = Number(raw.openingBalance)
      if (!Number.isFinite(n) || Math.abs(n) > 100_000_000) {
        return fail(res, 400, 'Opening balance must be an amount in dollars (it can be negative).')
      }
      patch.openingBalance = Math.round(n * 100) / 100
    }
    if ('openingDate' in raw) {
      if (!raw.openingDate) patch.openingDate = ''
      else {
        const date = asDate(raw.openingDate)
        if (!date) return fail(res, 400, 'Opening date must be a real date (YYYY-MM-DD).')
        patch.openingDate = date
      }
    }
    if ('gstRegistered' in raw) {
      if (typeof raw.gstRegistered !== 'boolean') return fail(res, 400, '"gstRegistered" must be true or false.')
      patch.gstRegistered = raw.gstRegistered
    }

    const settings = await setFinanceSettings(patch)
    await audit(
      actor,
      'finance.settings',
      `Opening balance $${settings.openingBalance.toFixed(2)}${settings.openingDate ? ` from ${settings.openingDate}` : ''}, GST ${settings.gstRegistered ? 'registered' : 'not registered'}`,
    )
    ok(res, { settings })
    return
  }

  /* ---- POST (create) / PATCH (edit) an entry -------------------- */

  const existing = method === 'PATCH' ? await getLedgerEntry(asString(body.id, 120) ?? '') : null
  if (method === 'PATCH' && !existing) return fail(res, 404, 'No ledger entry with that id.')
  if (existing && existing.source !== 'manual') {
    return fail(
      res,
      409,
      existing.source === 'wages'
        ? 'Wages payments are made from timesheets. Delete this one and pay the hours again to change it.'
        : 'Stock deliveries are recorded on the Inventory page. Delete this one and re-enter it to change it.',
    )
  }

  const pick = (key: string) => (existing && !(key in body) ? (existing as unknown as Record<string, unknown>)[key] : body[key])

  const type = pick('type')
  if (typeof type !== 'string' || !TYPES.includes(type as LedgerType)) {
    return fail(res, 400, '"type" must be payment, refund or expense.')
  }
  if (type === 'expense' && !can(actor.role, 'finance')) {
    return fail(res, 403, 'Only an owner or manager can record expenses.')
  }

  const date = asDate(pick('date'))
  if (!date) return fail(res, 400, 'Pick the date the money moved.')

  const amount = asMoney(pick('amount'))
  if (amount === null) return fail(res, 400, 'Amount must be more than $0.')

  const gstRaw = pick('gst')
  const gst = gstRaw === undefined || gstRaw === null || gstRaw === '' ? gstInside(amount) : Number(gstRaw)
  if (!Number.isFinite(gst) || gst < 0 || gst > amount) {
    return fail(res, 400, 'GST must be between $0 and the amount.')
  }

  const categories: readonly string[] = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  const category = pick('category')
  if (typeof category !== 'string' || !categories.includes(category)) {
    return fail(res, 400, `Category must be one of: ${categories.join(', ')}.`)
  }

  const paymentMethod = pick('method')
  if (typeof paymentMethod !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    return fail(res, 400, `Method must be one of: ${PAYMENT_METHODS.join(', ')}.`)
  }

  const description = optionalText(pick('description'), 300)
  const reference = optionalText(pick('reference'), 80)
  const counterparty = optionalText(pick('counterparty'), 120)
  if (description === null || reference === null || counterparty === null) {
    return fail(res, 400, 'Description, reference and name must be short text.')
  }

  let orderId: string | undefined
  const orderRaw = pick('orderId')
  if (orderRaw) {
    if (type === 'expense') return fail(res, 400, 'Expenses cannot be linked to a customer order.')
    const order = await getOrder(asString(orderRaw, 120) ?? '')
    if (!order) return fail(res, 404, 'That order no longer exists.')
    orderId = order.id
  }

  const now = new Date().toISOString()
  const entry: StoredLedgerEntry = {
    id: existing?.id ?? randomUUID(),
    type: type as LedgerType,
    date,
    amount,
    gst: Math.round(gst * 100) / 100,
    category,
    method: paymentMethod,
    description,
    reference,
    counterparty,
    ...(orderId ? { orderId } : {}),
    source: 'manual',
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actor.name,
  }
  await saveLedgerEntry(entry)

  let orderMarkedPaid = false
  if (orderId && entry.type === 'payment' && body.markOrderPaid === true) {
    const order = await getOrder(orderId)
    if (order?.status === 'pending') {
      await updateOrderStatus(orderId, 'paid')
      orderMarkedPaid = true
    }
  }

  const label = `${entry.type} $${amount.toFixed(2)} (${category}${counterparty ? `, ${counterparty}` : ''})`
  await audit(actor, existing ? 'ledger.update' : 'ledger.create', `${existing ? 'Edited' : 'Recorded'} ${label}${orderMarkedPaid ? '; order marked paid' : ''}`)
  ok(res, { entry, orderMarkedPaid })
})
