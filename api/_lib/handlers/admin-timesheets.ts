/**
 * POST   /api/admin/timesheets { staffId, date, hours, note?, rate? } -> { entry }
 * PATCH  /api/admin/timesheets { action: 'pay', ids, date, method }  -> { entries, expense }
 * DELETE /api/admin/timesheets?id=                                   -> { ok }
 *
 * The list itself comes with GET /api/admin/staff.
 *
 * Paying hours turns them into ONE wages expense in the ledger and marks each
 * entry paid against it, so the Balance page shows wages without anyone typing
 * them in twice. Deleting that expense later un-pays the hours (see ledger).
 * Paid hours are locked: changing them would quietly break the expense they
 * were paid with.
 */

import { randomUUID } from 'node:crypto'
import { PAYMENT_METHODS } from '../../../src/lib/admin-ledger.js'
import { can } from '../../../src/lib/admin-roles.js'
import { asDate, audit, optionalText, sydneyDate } from '../audit.js'
import { authorize } from '../auth.js'
import { asString, fail, methodGuard, ok, queryParam, readBody, withGuard } from '../http.js'
import {
  deleteTimesheet,
  getStaff,
  getTimesheet,
  listTimesheets,
  saveLedgerEntry,
  saveTimesheet,
  type StoredLedgerEntry,
} from '../store.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST', 'PATCH', 'DELETE'])) return
  const actor = await authorize(req, res, 'staff')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  const method = (req.method ?? 'POST').toUpperCase()

  if (method === 'DELETE') {
    const entry = await getTimesheet(asString(queryParam(req, 'id'), 120) ?? '')
    if (!entry) return fail(res, 404, 'No timesheet entry with that id.')
    if (entry.paid) {
      return fail(res, 409, 'These hours have been paid. Delete the wages payment on the Balance page first.')
    }
    await deleteTimesheet(entry.id)
    const member = await getStaff(entry.staffId)
    await audit(actor, 'timesheet.delete', `Removed ${entry.hours}h on ${entry.date} for ${member?.name ?? 'a former staff member'}`)
    ok(res, { ok: true })
    return
  }

  const body = readBody<Record<string, unknown>>(req)
  if (!body) return fail(res, 400, 'Expected a JSON request body.')

  /* ---- Log hours ------------------------------------------------ */

  if (method === 'POST') {
    const member = await getStaff(asString(body.staffId, 120) ?? '')
    if (!member) return fail(res, 404, 'No staff member with that id.')

    const date = asDate(body.date)
    if (!date) return fail(res, 400, 'Pick the day the hours were worked.')

    const hours = Number(body.hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      return fail(res, 400, 'Hours must be more than 0 and no more than 24 for one day.')
    }

    let rate = member.payRate
    if (body.rate !== undefined && body.rate !== null && body.rate !== '') {
      const custom = Number(body.rate)
      if (!Number.isFinite(custom) || custom <= 0 || custom > 1000) {
        return fail(res, 400, 'Rate must be dollars per hour, between 0 and 1000.')
      }
      rate = custom
    }
    if (rate == null) {
      return fail(res, 400, `${member.name} has no pay rate. Set one on their profile, or enter a rate for these hours.`)
    }

    const note = optionalText(body.note, 300)
    if (note === null) return fail(res, 400, 'Notes can be at most 300 characters.')

    const entry = await saveTimesheet({
      id: randomUUID(),
      staffId: member.id,
      date,
      hours: Math.round(hours * 100) / 100,
      rate: Math.round(rate * 100) / 100,
      note,
      paid: false,
      createdAt: new Date().toISOString(),
      createdBy: actor.name,
    })
    await audit(actor, 'timesheet.create', `Logged ${entry.hours}h on ${date} for ${member.name}`)
    ok(res, { entry })
    return
  }

  /* ---- Pay hours ------------------------------------------------ */

  if (body.action !== 'pay') return fail(res, 400, 'Unknown action. Use "pay".')
  if (!can(actor.role, 'payments')) return fail(res, 403, 'Only an owner or manager can record wage payments.')

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === 'string') : []
  if (!ids.length || ids.length > 500) return fail(res, 400, 'Choose the hours to pay.')

  const all = await listTimesheets()
  const chosen = all.filter((entry) => ids.includes(entry.id))
  if (chosen.length !== new Set(ids).size) return fail(res, 404, 'Some of those hours no longer exist. Reload and try again.')
  if (chosen.some((entry) => entry.paid)) return fail(res, 409, 'Some of those hours are already paid. Reload and try again.')

  const staffIds = new Set(chosen.map((entry) => entry.staffId))
  if (staffIds.size !== 1) return fail(res, 400, 'Pay one person at a time.')
  const member = await getStaff(chosen[0]!.staffId)

  const date = body.date ? asDate(body.date) : sydneyDate()
  if (!date) return fail(res, 400, 'Payment date must be a real date (YYYY-MM-DD).')

  const methodName = typeof body.method === 'string' && (PAYMENT_METHODS as readonly string[]).includes(body.method)
    ? body.method
    : 'Bank transfer'

  const amount = Math.round(chosen.reduce((sum, entry) => sum + entry.hours * entry.rate, 0) * 100) / 100
  const hours = Math.round(chosen.reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100
  const dates = chosen.map((entry) => entry.date).sort()
  const name = member?.name ?? 'Former staff member'

  const now = new Date().toISOString()
  const expense: StoredLedgerEntry = {
    id: randomUUID(),
    type: 'expense',
    date,
    amount,
    // Wages carry no GST.
    gst: 0,
    category: 'Wages',
    method: methodName,
    description: `Wages: ${hours}h, ${dates[0]} to ${dates[dates.length - 1]}`,
    reference: '',
    counterparty: name,
    source: 'wages',
    createdAt: now,
    createdBy: actor.name,
  }
  await saveLedgerEntry(expense)

  const entries = []
  for (const entry of chosen) {
    entries.push(await saveTimesheet({ ...entry, paid: true, paidAt: now, expenseId: expense.id }))
  }

  await audit(actor, 'timesheet.pay', `Paid ${name} $${amount.toFixed(2)} for ${hours}h`)
  ok(res, { entries, expense })
})
