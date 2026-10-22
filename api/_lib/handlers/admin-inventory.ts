/**
 * GET  /api/admin/inventory -> { items, moves, defaultReorderLevel }
 * POST /api/admin/inventory { action: 'receive' | 'adjust' | 'settings', productId, ... }
 *
 * - receive:  a delivery came in. Adds to stock, updates the average cost and,
 *             if asked, records what it cost as a "Stock purchases" expense.
 * - adjust:   add, remove or set (a stocktake count), always with a reason.
 * - settings: reorder level, cost, bin location, usual supplier.
 *
 * The count itself lives in the product override the storefront already
 * reads, so a delivery logged here is on sale the moment it is saved. Every
 * change is written to the movement log with who made it.
 */

import { randomUUID } from 'node:crypto'
import { gstInside } from '../../../src/lib/admin-ledger.js'
import { can } from '../../../src/lib/admin-roles.js'
import { asMoney, audit, optionalText, sydneyDate } from '../audit.js'
import { authorize } from '../auth.js'
import { getProduct, mergeCatalogue, mergeOverride } from '../catalogue.js'
import { asString, fail, methodGuard, ok, readBody, withGuard } from '../http.js'
import {
  getOverrides,
  getStockSettings,
  listStockMoves,
  saveLedgerEntry,
  saveStockMove,
  setOverride,
  setStockSettings,
  type StoredStockMove,
} from '../store.js'

const MAX_STOCK = 100000
/** The same default the dashboard's low-stock list uses. */
const DEFAULT_REORDER = Number(process.env.LOW_STOCK_THRESHOLD ?? 24)
/** The movement history sent to the page; older moves stay stored. */
const MOVES_SHOWN = 1000

export const ADJUST_REASONS = [
  'Stocktake count',
  'Damaged',
  'Returned by customer',
  'Warranty claim',
  'Fitted in workshop',
  'Sold in store',
  'Transferred out',
  'Correction',
  'Other',
] as const

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return
  const actor = await authorize(req, res, 'inventory')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  if ((req.method ?? 'GET').toUpperCase() === 'GET') {
    const [overrides, settings, moves] = await Promise.all([
      getOverrides(),
      getStockSettings(),
      listStockMoves(),
    ])
    const items = mergeCatalogue(overrides).map((product) => ({
      product,
      settings: settings[product.id] ?? null,
    }))
    ok(res, {
      items,
      moves: moves.slice(0, MOVES_SHOWN),
      totalMoves: moves.length,
      defaultReorderLevel: DEFAULT_REORDER,
      reasons: ADJUST_REASONS,
    })
    return
  }

  /* ---- POST ----------------------------------------------------- */

  const body = readBody<Record<string, unknown>>(req)
  if (!body) return fail(res, 400, 'Expected a JSON request body.')

  const productId = asString(body.productId, 120)
  const base = productId ? getProduct(productId) : undefined
  if (!productId || !base) return fail(res, 404, 'No product with that id.')

  const overrides = await getOverrides()
  const current = mergeOverride(base, overrides[productId])
  const action = body.action

  /* ---- settings ---- */

  if (action === 'settings') {
    const patch: Parameters<typeof setStockSettings>[1] = {}

    if ('reorderLevel' in body) {
      if (body.reorderLevel === null || body.reorderLevel === '') patch.reorderLevel = null
      else {
        const level = Number(body.reorderLevel)
        if (!Number.isInteger(level) || level < 0 || level > MAX_STOCK) {
          return fail(res, 400, 'Reorder level must be a whole number of tyres.')
        }
        patch.reorderLevel = level
      }
    }
    if ('costPrice' in body) {
      if (body.costPrice === null || body.costPrice === '') patch.costPrice = null
      else {
        const cost = asMoney(body.costPrice, 20000)
        if (cost === null) return fail(res, 400, 'Cost must be dollars per tyre, more than $0.')
        patch.costPrice = cost
      }
    }
    for (const [key, max] of [['location', 60], ['supplier', 120]] as const) {
      if (!(key in body)) continue
      const text = optionalText(body[key], max)
      if (text === null) return fail(res, 400, `"${key}" must be at most ${max} characters.`)
      patch[key] = text
    }
    if (!Object.keys(patch).length) return fail(res, 400, 'Nothing to change.')

    const settings = await setStockSettings(productId, patch)
    await audit(actor, 'stock.settings', `${base.sku}: ${Object.keys(patch).join(', ')} updated`)
    ok(res, { item: { product: current, settings } })
    return
  }

  /* ---- receive / adjust ---- */

  if (action !== 'receive' && action !== 'adjust') {
    return fail(res, 400, 'Unknown action. Use receive, adjust or settings.')
  }

  const quantity = Number(body.quantity)
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_STOCK) {
    return fail(res, 400, 'Quantity must be a whole number of tyres.')
  }

  const note = optionalText(body.note, 300)
  if (note === null) return fail(res, 400, 'Notes can be at most 300 characters.')

  const before = current.stock
  let after = before
  let reason = ''
  let type: StoredStockMove['type'] = 'adjust'
  let unitCost: number | null = null
  let supplier = ''
  let reference = ''

  if (action === 'receive') {
    if (quantity < 1) return fail(res, 400, 'Receive at least one tyre.')
    after = before + quantity
    type = 'receive'
    reason = 'Delivery received'

    if (body.unitCost !== undefined && body.unitCost !== null && body.unitCost !== '') {
      unitCost = asMoney(body.unitCost, 20000)
      if (unitCost === null) return fail(res, 400, 'Cost must be dollars per tyre, more than $0.')
    }
    const s = optionalText(body.supplier, 120)
    const r = optionalText(body.reference, 80)
    if (s === null || r === null) return fail(res, 400, 'Supplier and invoice number must be short text.')
    supplier = s
    reference = r

    if (body.recordExpense === true) {
      if (unitCost === null) return fail(res, 400, 'Enter the cost per tyre to record the delivery as an expense.')
      if (!can(actor.role, 'finance')) return fail(res, 403, 'Only an owner or manager can record expenses.')
    }
  } else {
    const mode = body.mode
    const reasonRaw = body.reason
    if (typeof reasonRaw !== 'string' || !(ADJUST_REASONS as readonly string[]).includes(reasonRaw)) {
      return fail(res, 400, `Reason must be one of: ${ADJUST_REASONS.join(', ')}.`)
    }
    reason = reasonRaw
    if (mode === 'add') after = before + quantity
    else if (mode === 'remove') after = before - quantity
    else if (mode === 'set') {
      after = quantity
      type = 'count'
    } else return fail(res, 400, '"mode" must be add, remove or set.')

    if (after < 0) return fail(res, 400, `Only ${before} in stock, so ${quantity} can't be removed.`)
    if (mode !== 'set' && quantity === 0) return fail(res, 400, 'Enter how many tyres.')
  }

  if (after > MAX_STOCK) return fail(res, 400, `Stock can't go above ${MAX_STOCK}.`)

  await setOverride(productId, { stock: after })

  let settings = (await getStockSettings())[productId] ?? null
  if (unitCost !== null || (supplier && !settings?.supplier)) {
    const patch: Parameters<typeof setStockSettings>[1] = {}
    if (unitCost !== null) {
      // Weighted average: what is already on the shelf keeps its cost.
      const oldCost = settings?.costPrice
      patch.costPrice =
        oldCost != null && before > 0
          ? Math.round(((oldCost * before + unitCost * quantity) / (before + quantity)) * 100) / 100
          : unitCost
    }
    if (supplier && !settings?.supplier) patch.supplier = supplier
    settings = await setStockSettings(productId, patch)
  }

  const move = await saveStockMove({
    id: randomUUID(),
    productId,
    sku: base.sku,
    type,
    change: after - before,
    before,
    after,
    reason,
    note,
    ...(unitCost !== null ? { unitCost } : {}),
    ...(supplier ? { supplier } : {}),
    ...(reference ? { reference } : {}),
    at: new Date().toISOString(),
    by: actor.name,
  })

  let expenseId: string | null = null
  if (action === 'receive' && body.recordExpense === true && unitCost !== null) {
    const amount = Math.round(unitCost * quantity * 100) / 100
    const expense = await saveLedgerEntry({
      id: randomUUID(),
      type: 'expense',
      date: sydneyDate(),
      amount,
      gst: gstInside(amount),
      category: 'Stock purchases',
      method: 'Bank transfer',
      description: `${quantity} × ${base.brand} ${base.model} ${base.size} (${base.sku})`,
      reference,
      counterparty: supplier,
      source: 'stock',
      createdAt: new Date().toISOString(),
      createdBy: actor.name,
    })
    expenseId = expense.id
  }

  await audit(
    actor,
    action === 'receive' ? 'stock.receive' : 'stock.adjust',
    `${base.sku}: ${before} → ${after} (${reason}${note ? `: ${note}` : ''})${expenseId ? ', recorded as an expense' : ''}`,
  )

  ok(res, {
    item: { product: mergeOverride(base, { ...overrides[productId], stock: after }), settings },
    move,
    expenseId,
  })
})
