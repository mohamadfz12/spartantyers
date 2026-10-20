/**
 * GET /api/admin/stats (bearer token)
 *   -> { revenue, orderCount, unitsSold, averageOrderValue,
 *        lowStock, revenueByDay, topProducts }
 *
 * Everything is derived from stored orders and the merged catalogue — there is
 * no separate analytics store to fall out of sync. Cancelled orders are
 * excluded from revenue but still counted nowhere, so the numbers match what
 * the business actually banked.
 */

import { requireAdmin } from '../auth'
import { mergeCatalogue } from '../catalogue'
import { methodGuard, ok, round2, withGuard } from '../http'
import { getOverrides, listOrders } from '../store'

const REVENUE_DAYS = 14
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD ?? 24)

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store')

  const [orders, overrides] = await Promise.all([listOrders(), getOverrides()])
  const products = mergeCatalogue(overrides)

  const paid = orders.filter((order) => order.status !== 'cancelled')

  const revenue = round2(paid.reduce((sum, order) => sum + order.total, 0))
  const orderCount = paid.length

  const unitsSold = paid.reduce(
    (sum, order) =>
      sum + order.lines.reduce((lineSum, line) => lineSum + line.quantity, 0),
    0,
  )

  /* ---- Revenue by day: a dense series over the last 14 days ----- */

  const byDay = new Map<string, number>()
  const today = new Date()

  for (let i = REVENUE_DAYS - 1; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() - i)
    byDay.set(day.toISOString().slice(0, 10), 0)
  }

  for (const order of paid) {
    const day = order.createdAt.slice(0, 10)
    // Zero-filled keys mean a day with no orders still plots, and orders
    // older than the window are ignored rather than bunched onto day one.
    if (byDay.has(day)) {
      byDay.set(day, (byDay.get(day) ?? 0) + order.total)
    }
  }

  const revenueByDay = [...byDay.entries()].map(([date, value]) => ({
    date,
    revenue: round2(value),
  }))

  /* ---- Top products, keyed by SKU (ids are not on order lines) -- */

  const unitsBySku = new Map<string, number>()
  for (const order of paid) {
    for (const line of order.lines) {
      unitsBySku.set(line.sku, (unitsBySku.get(line.sku) ?? 0) + line.quantity)
    }
  }

  const topProducts = [...unitsBySku.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sku, units]) => {
      const product = products.find((p) => p.sku === sku)
      return {
        id: product?.id ?? sku,
        model: product ? `${product.brand} ${product.model}` : sku,
        size: product?.size ?? '',
        units,
      }
    })

  /* ---- Low stock ------------------------------------------------ */

  // Price-on-application lines are built to order and sit at zero by design,
  // so they would only bury the stocked lines that genuinely need a re-order.
  const lowStock = products
    .filter((product) => product.price != null && product.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock)
    .map((product) => ({
      id: product.id,
      model: `${product.brand} ${product.model}`,
      size: product.size,
      stock: product.stock,
    }))

  ok(res, {
    revenue,
    orderCount,
    unitsSold,
    averageOrderValue: orderCount ? round2(revenue / orderCount) : 0,
    lowStock,
    revenueByDay,
    topProducts,
  })
})
