/**
 * Customer accounts at the website: the prices endpoint (and its privacy), card checkout at an
 * account's prices, and pay-later orders (credit reserved in one guarded update, over-limit refused,
 * parallel orders cannot exceed the limit, failures release, a double click is one order, the ticket
 * and stock). In-memory Postgres and store, a fake Square, no network.
 *   npx tsx --test tests/accounts-orders.test.ts
 */
import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, describe, test } from 'node:test'
import { addDays } from '../api/_lib/square-api.js'
import { sydneyDate } from '../api/_lib/audit.js'
import { priceCart } from '../src/lib/account-pricing.js'
import { effectivePrice } from '../src/data/products.js'
import {
  OWNER,
  P1,
  P2,
  P3,
  account,
  adminCall,
  answered,
  checkout,
  clearStore,
  money,
  newKey,
  placeOrder,
  repo,
  reset,
  shutdown,
  signUp,
  stockUp,
  store,
  totalFor,
  trade,
  useFakeSquare,
  type Json,
} from './accounts-kit.js'

beforeEach(async () => {
  await reset()
  clearStore()
  await stockUp()
})
after(shutdown)

const retail = (p: typeof P1) => effectivePrice(p)!
/** Made-up special prices, a clear step below the shelf price. */
const SPECIAL_1 = money(P1.price! * 0.6)
const SPECIAL_2 = money(P2.price! * 0.7)

const outstandingOf = async (id: string) => (await repo.getAccount(id))!.outstanding
const orders = async () => store.listOrders()
const tickets = async () => store.listPosTickets()

/* ================================================================== prices */

describe('GET /api/account/prices', () => {
  test('a signed-in account sees its own prices, only where they beat the shop price', async () => {
    const t = await trade({ discountPct: 10, prices: { [P1.id]: SPECIAL_1 } })
    const r = await account('prices', { method: 'GET', cookie: t.cookie })
    assert.equal(r.status, 200)
    assert.equal(r.json.level, 'wholesaler')
    assert.equal(r.json.discountPct, 10)
    assert.deepEqual(r.json.prices[P1.id], { unit: SPECIAL_1, basis: 'account' })
    assert.equal(r.json.prices[P2.id].unit, money(P2.price! * 0.9), 'the agreed % off the RRP')
    for (const [id, p] of Object.entries(r.json.prices as Record<string, { unit: number; basis: string }>)) {
      assert.equal(p.basis, 'account')
      const product = (await import('../src/data/products.js')).getProduct(id)!
      assert.ok(product.price == null || p.unit < effectivePrice(product)!, `${id} is listed only when it beats retail`)
    }
  })

  test('an account with nothing agreed gets an empty list', async () => {
    const s = await signUp()
    const r = await account('prices', { method: 'GET', cookie: s.cookie })
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, { prices: {}, discountPct: 0, level: 'customer' })
  })

  test('another account never sees these prices, and a guest and a staff token get 401', async () => {
    const SECRET = 77.77
    assert.ok(SECRET < retail(P1), 'the made-up price must beat the shop price to be listed')
    const a = await trade({ prices: { [P1.id]: SECRET } })
    const other = await trade({ prices: { [P2.id]: SPECIAL_2 } })
    assert.equal((await account('prices', { method: 'GET', cookie: a.cookie })).json.prices[P1.id].unit, SECRET)
    const b = await account('prices', { method: 'GET', cookie: other.cookie })
    assert.equal(b.json.prices[P1.id], undefined)
    assert.equal(JSON.stringify(b.json).includes(String(SECRET)), false)
    assert.equal(b.json.prices[P2.id].unit, SPECIAL_2)

    assert.equal((await account('prices', { method: 'GET' })).status, 401)
    const staff = await account('prices', { method: 'GET', headers: { authorization: `Bearer ${OWNER()}` } })
    assert.equal(staff.status, 401, 'a staff token never works on a customer route')
    assert.equal((await account('prices', { method: 'GET', cookie: 'spt_session=not-a-token' })).status, 401)
  })

  test('private, no-store, and a suspended account is turned away', async () => {
    const t = await trade({ prices: { [P1.id]: SPECIAL_1 } })
    const ok = await account('prices', { method: 'GET', cookie: t.cookie })
    assert.equal(ok.headers['cache-control'], 'private, no-store')
    assert.equal((await account('prices', { method: 'GET' })).headers['cache-control'], 'private, no-store')
    await adminCall('account-status', { body: { id: t.id, status: 'suspended' } })
    assert.equal((await account('prices', { method: 'GET', cookie: t.cookie })).status, 401)
  })

  test('the prices follow the live catalogue: a sale price makes the agreed % stop at it', async () => {
    const t = await trade({ discountPct: 5 })
    const before = (await account('prices', { method: 'GET', cookie: t.cookie })).json.prices[P1.id]
    assert.equal(before.unit, money(P1.price! * 0.95))
    // A 10% sale makes the shelf price lower than 5% off the RRP: the account price is no longer better.
    await store.setOverride(P1.id, { discount: 10 })
    assert.equal((await account('prices', { method: 'GET', cookie: t.cookie })).json.prices[P1.id], undefined)
  })

  test('the public catalogue never carries any account price', async () => {
    const SECRET = 77.77
    await trade({ discountPct: 20, prices: { [P1.id]: SECRET } })
    const { default: inventory } = await import('../api/inventory.js')
    const { FakeRes } = await import('./accounts-kit.js')
    const res = new FakeRes()
    await inventory({ method: 'GET', query: {}, headers: {} } as never, res as never)
    const text = JSON.stringify(res.body)
    assert.equal(text.includes(String(SECRET)), false)
    const listed = (res.body as { products: Array<{ id: string; price: number }> }).products.find((p) => p.id === P1.id)!
    assert.equal(listed.price, P1.price, 'the shop price is the shop price')
    assert.match(String(res.headers['cache-control']), /public/, 'and that endpoint is the cached one, which is why no account price may be in it')
  })
})

/* ============================================================== card checkout */

describe('card checkout at an account\'s prices', () => {
  let square: ReturnType<typeof useFakeSquare>
  beforeEach(() => {
    square = useFakeSquare()
  })
  afterEach(() => square.restore())

  const lines = [
    { id: P1.id, quantity: 2 },
    { id: P2.id, quantity: 1 },
  ]
  const guestTotal = () => priceCart([{ product: P1, quantity: 2 }, { product: P2, quantity: 1 }], { fulfilment: 'pickup', fittingTyres: 0 }).total

  test('a guest is charged the shop price, exactly as before', async () => {
    const r = await checkout({ lines, expectedTotal: guestTotal() })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.total, guestTotal())
    assert.equal(square.charges.at(-1)!.amount, Math.round(guestTotal() * 100))
    const order = (await orders())[0]!
    assert.equal(order.accountId, undefined)
    assert.equal(order.channel, 'retail')
    assert.equal(order.status, 'paid')
    assert.deepEqual(order.lines.map((l) => l.basis), ['retail', 'retail'])
    assert.equal(order.lines[0]!.unitPrice, retail(P1))
  })

  test('a signed-in account is charged its own total, and the order records the account, the label and the basis', async () => {
    const t = await trade({ prices: { [P1.id]: SPECIAL_1 } })
    const want = (await totalFor(t.id, lines)).total
    assert.ok(want < guestTotal())
    // The browser's rule gives the same number the server charges.
    const browser = priceCart([{ product: P1, quantity: 2 }, { product: P2, quantity: 1 }], {
      account: { level: 'wholesaler', discountPct: 0, special: { [P1.id]: SPECIAL_1 } },
      fulfilment: 'pickup',
      fittingTyres: 0,
    })
    assert.equal(browser.total, want)
    const r = await checkout({ cookie: t.cookie, lines, expectedTotal: want })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.total, want)
    assert.equal(square.charges.at(-1)!.amount, Math.round(want * 100))
    const order = (await orders())[0]!
    assert.equal(order.accountId, t.id)
    assert.equal(order.channel, 'wholesale')
    assert.deepEqual(order.lines.map((l) => [l.unitPrice, l.basis]), [[SPECIAL_1, 'account'], [retail(P2), 'retail']])
    assert.equal(order.total, want)
    assert.ok(order.paymentId, 'a card order is paid')
  })

  test('the total the customer was shown must match, or nothing is charged', async () => {
    const t = await trade({ prices: { [P1.id]: SPECIAL_1 } })
    const r = await checkout({ cookie: t.cookie, lines, expectedTotal: guestTotal() })
    assert.equal(r.status, 409)
    assert.match(r.json.error, /nothing has been charged/)
    assert.equal(square.charges.length, 0)
    assert.equal((await orders()).length, 0)
  })

  test('a guest who is shown the account total is refused too: the discount is not for the cookie-less', async () => {
    const t = await trade({ prices: { [P1.id]: SPECIAL_1 } })
    const r = await checkout({ lines, expectedTotal: (await totalFor(t.id, lines)).total })
    assert.equal(r.status, 409)
    assert.equal(square.charges.length, 0)
  })

  test('a bad, expired or revoked session is a guest, never an error', async () => {
    const t = await trade({ prices: { [P1.id]: SPECIAL_1 } })
    for (const cookie of ['spt_session=garbage', 'spt_session=a.b', `${t.cookie}x`]) {
      const r = await checkout({ cookie, lines, expectedTotal: guestTotal() })
      assert.equal(r.status, 200, `${cookie}: ${JSON.stringify(r.json)}`)
    }
    await adminCall('account-status', { body: { id: t.id, status: 'suspended' } })
    const revoked = await checkout({ cookie: t.cookie, lines, expectedTotal: guestTotal() })
    assert.equal(revoked.status, 200, 'a suspended account pays the shop price')
    assert.equal((await orders()).every((o) => o.accountId === undefined), true)
  })

  test('20 tyres is a Bulk sale even for a guest; a Bulk account is Bulk at any size', async () => {
    const big = await checkout({ lines: [{ id: P1.id, quantity: 20 }], expectedTotal: priceCart([{ product: P1, quantity: 20 }], { fulfilment: 'pickup', fittingTyres: 0 }).total })
    assert.equal(big.status, 200)
    const t = await trade({ level: 'bulk' })
    const small = await checkout({ cookie: t.cookie, lines: [{ id: P3.id, quantity: 1 }], expectedTotal: retail(P3) })
    assert.equal(small.status, 200)
    const channels = (await orders()).map((o) => o.channel).sort()
    assert.deepEqual(channels, ['bulk', 'bulk'])
  })
})

/* ================================================================= pay later */

describe('POST /api/account/order (pay later)', () => {
  const lines = [{ id: P1.id, quantity: 2 }]
  const want = async (id: string, l = lines) => (await totalFor(id, l)).total

  async function payer(over: Parameters<typeof trade>[0] = {}) {
    return trade({ prices: { [P1.id]: SPECIAL_1 }, payLater: true, creditLimit: 5000, termsDays: 21, ...over })
  }

  test('places the order: credit taken, order unpaid on account, ticket linked, stock down, due date set', async () => {
    const t = await payer()
    const total = await want(t.id)
    assert.equal(total, money(SPECIAL_1 * 2))
    const stockBefore = (await store.getOverrides())[P1.id]!.stock!
    const r = await placeOrder(t.cookie, lines, total)
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(Object.keys(r.json).sort(), ['creditAvailable', 'dueDate', 'ok', 'orderId', 'outstanding', 'payment', 'reference', 'status', 'total'])
    assert.equal(r.json.total, total)
    assert.equal(r.json.status, 'account')
    assert.equal(r.json.payment, 'account')
    assert.equal(r.json.outstanding, total)
    assert.equal(r.json.creditAvailable, money(5000 - total))
    assert.equal(r.json.dueDate, addDays(sydneyDate(), 21))

    const [order] = await orders()
    assert.equal(order!.status, 'account', 'unpaid, and never "paid"')
    assert.equal(order!.payment, 'account')
    assert.equal(order!.paymentId, undefined, 'no card was charged')
    assert.equal(order!.accountId, t.id)
    assert.equal(order!.channel, 'wholesale')
    assert.equal(order!.dueDate, addDays(sydneyDate(), 21))
    assert.deepEqual(order!.lines.map((l) => [l.unitPrice, l.basis]), [[SPECIAL_1, 'account']])
    assert.equal(order!.customer.email, t.email)

    const [ticket] = await tickets()
    assert.equal(ticket!.status, 'account')
    assert.equal(ticket!.payment, 'account')
    assert.equal(ticket!.customerId, t.posCustomerId)
    assert.equal(ticket!.orderId, order!.id)
    assert.equal(ticket!.accountId, t.id)
    assert.equal(ticket!.channel, 'wholesale')
    assert.equal(ticket!.total, total)
    assert.equal(ticket!.amountPaid, 0)
    assert.equal(ticket!.dueDate, order!.dueDate)
    assert.equal(order!.posTicketRef, ticket!.ref)
    assert.deepEqual(ticket!.lines.map((l) => [l.source, l.itemId, l.qty, l.price]), [['tyre', P1.id, 2, SPECIAL_1]])

    const { balanceOf } = await import('../api/_lib/pos.js')
    assert.deepEqual(balanceOf(t.posCustomerId, await tickets()), { due: total, overdue: 0, count: 1 })
    assert.equal(await outstandingOf(t.id), total)

    assert.equal((await store.getOverrides())[P1.id]!.stock, stockBefore - 2, 'stock comes off like a card sale')
    const moves = (await store.listStockMoves()).filter((m) => m.reference === order!.reference)
    assert.equal(moves.length, 1)
    assert.equal(moves[0]!.change, -2)
  })

  test('a mixed cart with a volume break and fitting: the ticket owes exactly the order total', async () => {
    const t = await payer({ discountPct: 0, prices: { [P1.id]: SPECIAL_1 } })
    const mixed = [{ id: P1.id, quantity: 3 }, { id: P2.id, quantity: 2 }]
    const priced = await totalFor(t.id, mixed, { fittingTyres: 2 })
    assert.equal(priced.volumeDiscount > 0, true, 'five tyres earn the 3% break on the tyre at the normal price')
    const r = await placeOrder(t.cookie, mixed, priced.total, { fittingTyres: 2 })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    const [order] = await orders()
    const [ticket] = await tickets()
    assert.equal(order!.total, priced.total)
    assert.equal(ticket!.total, priced.total)
    assert.equal(order!.fittingTotal, 140)
    assert.equal(ticket!.lines.at(-1)!.itemId, 'fitting')
    assert.equal(await outstandingOf(t.id), priced.total)
  })

  test('a promo code in the cart is priced on account too (normal-price lines only), so the shown total is accepted', async () => {
    const t = await payer({ discountPct: 0, prices: { [P1.id]: SPECIAL_1 } })
    const mixed = [{ id: P1.id, quantity: 1 }, { id: P2.id, quantity: 1 }]
    const withPromo = await totalFor(t.id, mixed, { promoCode: 'WELCOME5' })
    const without = await totalFor(t.id, mixed)
    assert.equal(withPromo.promoDiscount > 0, true, 'the normal-price tyre takes the promo')
    assert.equal(withPromo.total < without.total, true)
    const r = await placeOrder(t.cookie, mixed, withPromo.total, { promoCode: 'WELCOME5' })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.total, withPromo.total)
    const [order] = await orders()
    const [ticket] = await tickets()
    assert.equal(order!.promoCode, 'WELCOME5')
    assert.equal(ticket!.total, withPromo.total, 'the ticket owes the promo total')
    assert.equal(await outstandingOf(t.id), withPromo.total)
  })

  test('a delivery order needs a valid address; a good one is kept', async () => {
    const t = await payer()
    const total = await want(t.id)
    const missing = await placeOrder(t.cookie, lines, total, { fulfilment: 'delivery' })
    assert.equal(missing.status, 400)
    assert.equal(missing.json.field, 'address')
    assert.equal(await outstandingOf(t.id), 0)
    const ok = await placeOrder(t.cookie, lines, total, { fulfilment: 'delivery', address: { line1: '1 Test St', suburb: 'Yennora', state: 'nsw', postcode: '2161' }, notes: 'Leave at gate' })
    assert.equal(ok.status, 200, JSON.stringify(ok.json))
    const [order] = await orders()
    assert.deepEqual(order!.address, { line1: '1 Test St', suburb: 'Yennora', state: 'NSW', postcode: '2161' })
    assert.equal(order!.notes, 'Leave at gate')
  })

  test('the total must match what the customer was shown: otherwise nothing is ordered or reserved', async () => {
    const t = await payer()
    const total = await want(t.id)
    const r = await placeOrder(t.cookie, lines, total + 5)
    assert.equal(r.status, 409)
    assert.match(r.json.error, /nothing has been ordered/)
    assert.equal(await outstandingOf(t.id), 0)
    assert.equal((await orders()).length, 0)
    assert.equal((await tickets()).length, 0)
    for (const bad of [undefined, null, '', 'abc']) {
      const x = await account('order', { cookie: t.cookie, body: { idempotencyKey: newKey(), fulfilment: 'pickup', lines, expectedTotal: bad } })
      assert.equal(x.status, 400, String(bad))
      assert.equal(x.json.field, 'expectedTotal')
    }
  })

  test('over the credit limit: refused with the amount still available, nothing created', async () => {
    const t = await payer({ creditLimit: 150 })
    const total = await want(t.id)
    assert.ok(total > 150)
    const r = await placeOrder(t.cookie, lines, total)
    assert.equal(r.status, 409)
    assert.equal(r.json.error, 'This order is over your credit limit: $150.00 available.')
    assert.equal(await outstandingOf(t.id), 0)
    assert.equal((await orders()).length, 0)
    assert.equal((await tickets()).length, 0)
    assert.equal((await store.getOverrides())[P1.id]!.stock, 1000, 'no stock taken')
  })

  test('exactly the limit is allowed, one cent over is not', async () => {
    const t = await payer({ creditLimit: 0 })
    const total = await want(t.id)
    await adminCall('account-credit', { body: { id: t.id, payLater: true, termsDays: 14, creditLimit: total - 0.01 } })
    assert.equal((await placeOrder(t.cookie, lines, total)).status, 409)
    await adminCall('account-credit', { body: { id: t.id, payLater: true, termsDays: 14, creditLimit: total } })
    const ok = await placeOrder(t.cookie, lines, total)
    assert.equal(ok.status, 200, JSON.stringify(ok.json))
    assert.equal(ok.json.creditAvailable, 0)
    // Now there is no credit left, even for one cent more.
    const again = await placeOrder(t.cookie, [{ id: P3.id, quantity: 1 }], retail(P3))
    assert.equal(again.status, 409)
    assert.equal(again.json.error, 'This order is over your credit limit: $0.00 available.')
  })

  test('parallel orders cannot exceed the limit', async () => {
    const t = await payer({ creditLimit: 0 })
    const total = await want(t.id)
    const limit = money(total * 3 + total / 2)
    await adminCall('account-credit', { body: { id: t.id, payLater: true, termsDays: 14, creditLimit: limit } })
    const results = await Promise.all(Array.from({ length: 10 }, () => placeOrder(t.cookie, lines, total)))
    const placed = results.filter((r) => r.status === 200)
    const refused = results.filter((r) => r.status === 409)
    assert.equal(placed.length, 3, `three fit under ${limit}: ${results.map((r) => r.status).join(',')}`)
    assert.equal(refused.length, 7)
    assert.ok(refused.every((r) => /over your credit limit/.test(r.json.error)))
    const out = await outstandingOf(t.id)
    assert.equal(out, money(total * 3))
    assert.ok(out <= limit)
    assert.equal((await orders()).length, 3)
    assert.equal((await tickets()).length, 3)
    assert.equal((await tickets()).reduce((s, x) => s + x.total, 0), out, 'what is owed is exactly the tickets')
  })

  test('a double click is one order, answered the same both times', async () => {
    const t = await payer()
    const total = await want(t.id)
    const key = newKey()
    const body = { idempotencyKey: key, fulfilment: 'pickup', fittingTyres: 0, lines, expectedTotal: total }
    const first = await account('order', { cookie: t.cookie, body })
    const second = await account('order', { cookie: t.cookie, body })
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(second.json.reference, first.json.reference)
    assert.equal(second.json.orderId, first.json.orderId)
    assert.equal(second.json.repeated, true)
    assert.equal((await orders()).length, 1)
    assert.equal((await tickets()).length, 1)
    assert.equal(await outstandingOf(t.id), total, 'reserved once')
    assert.equal((await store.getOverrides())[P1.id]!.stock, 998, 'stock taken once')
  })

  test('two clicks at the same moment are one order too', async () => {
    const t = await payer()
    const total = await want(t.id)
    const body = { idempotencyKey: newKey(), fulfilment: 'pickup', fittingTyres: 0, lines, expectedTotal: total }
    const [a, b] = await Promise.all([account('order', { cookie: t.cookie, body }), account('order', { cookie: t.cookie, body })])
    assert.ok([a.status, b.status].includes(200), 'one of them places it')
    assert.ok([a.status, b.status].every((x) => x === 200 || x === 409), 'the other repeats it or is told to wait')
    assert.equal((await orders()).length, 1)
    assert.equal(await outstandingOf(t.id), total)
  })

  test('a key from another account is its own attempt', async () => {
    const one = await payer()
    const two = await payer()
    const key = newKey()
    const mk = (t: { id: string }) => ({ idempotencyKey: key, fulfilment: 'pickup', fittingTyres: 0, lines, expectedTotal: money(SPECIAL_1 * 2), t })
    assert.equal((await account('order', { cookie: one.cookie, body: mk(one) })).status, 200)
    assert.equal((await account('order', { cookie: two.cookie, body: mk(two) })).status, 200)
    assert.equal((await orders()).length, 2)
  })

  test('a failure after the credit is taken gives it back, cancels the ticket and lets the customer try again', async () => {
    const t = await payer()
    const total = await want(t.id)
    // The order cannot be written: the orders bucket refuses.
    const mem = (globalThis as Record<string, any>).__spartanMemoryStore__
    const real = mem['spartan:orders'] ?? {}
    mem['spartan:orders'] = new Proxy(real, {
      set() {
        throw new Error('disk full')
      },
    })
    const key = newKey()
    const body = { idempotencyKey: key, fulfilment: 'pickup', fittingTyres: 0, lines, expectedTotal: total }
    const failed = await account('order', { cookie: t.cookie, body })
    assert.equal(failed.status, 500)
    assert.equal(JSON.stringify(failed.json).includes('disk full'), false, 'the cause is not shown to the customer')
    assert.equal(await outstandingOf(t.id), 0, 'the credit is back')
    const [ticket] = await tickets()
    assert.equal(ticket!.status, 'void', 'the ticket is cancelled, so nothing is owed')
    const { balanceOf } = await import('../api/_lib/pos.js')
    assert.equal(balanceOf(t.posCustomerId, await tickets()).due, 0)
    assert.equal((await store.getOverrides())[P1.id]!.stock, 1000)
    // ...and the same attempt can be made again once the fault is gone.
    mem['spartan:orders'] = real
    const retry = await account('order', { cookie: t.cookie, body })
    assert.equal(retry.status, 200, JSON.stringify(retry.json))
    assert.equal(await outstandingOf(t.id), total)
    assert.equal((await orders()).length, 1)
  })

  test('refused when pay later is off, the account is suspended or has no till customer', async () => {
    const off = await trade({ prices: { [P1.id]: SPECIAL_1 } })
    const total = await want(off.id)
    const a = await placeOrder(off.cookie, lines, total)
    assert.equal(a.status, 409)
    assert.match(a.json.error, /Pay later is not set up/)

    const on = await payer()
    await adminCall('account-status', { body: { id: on.id, status: 'suspended' } })
    assert.equal((await placeOrder(on.cookie, lines, total)).status, 401, 'a suspended account is signed out')

    // An account with no till customer (a sign-up that matched one) cannot pay later, even if the flag were set.
    await store.savePosCustomer({ id: 'till-1', name: 'Existing', company: 'Existing Co', email: 'owner@existing.example.test', phone: '', address: '', notes: '', termsDays: 14, createdAt: '', updatedAt: '', createdBy: 'x' })
    const unlinked = await signUp({ email: 'owner@existing.example.test' })
    const record = (await repo.getAccount(unlinked.id))!
    assert.equal(record.posCustomerId, null)
    await repo.updateAccount(unlinked.id, { payLater: true, creditLimit: 9999 })
    const u = await placeOrder(unlinked.cookie, lines, retail(P1) * 2)
    assert.equal(u.status, 409)
    assert.match(u.json.error, /not available on this account yet/)
    assert.equal(await outstandingOf(unlinked.id), 0)
    // The guard is in the update itself too, not only in the checks before it.
    assert.equal(await repo.reserveCredit(unlinked.id, 1), null)

    assert.equal((await orders()).length, 0)
  })

  test('staff cannot switch pay later on for an account with no till customer; switching it off is always fine', async () => {
    await store.savePosCustomer({ id: 'till-2', name: 'Existing', company: '', email: 'second@existing.example.test', phone: '', address: '', notes: '', termsDays: 14, createdAt: '', updatedAt: '', createdBy: 'x' })
    const s = await signUp({ email: 'second@existing.example.test' })
    const on = await adminCall('account-credit', { body: { id: s.id, payLater: true, termsDays: 30, creditLimit: 1000 } })
    assert.equal(on.status, 409)
    assert.equal(on.json.error, 'Link this account to its till customer first.')
    assert.equal((await repo.getAccount(s.id))!.payLater, false)
    const off = await adminCall('account-credit', { body: { id: s.id, payLater: false, termsDays: 30, creditLimit: 1000 } })
    assert.equal(off.status, 200)
    // Once staff link it, pay later can be turned on.
    assert.equal((await adminCall('account-link-pos', { body: { id: s.id } })).status, 200)
    assert.equal((await adminCall('account-credit', { body: { id: s.id, payLater: true, termsDays: 30, creditLimit: 1000 } })).status, 200)
  })

  test('card checkout still works for an account that cannot pay later', async () => {
    const square = useFakeSquare()
    try {
      const s = await signUp()
      const r = await checkout({ cookie: s.cookie, lines: [{ id: P3.id, quantity: 1 }], expectedTotal: retail(P3) })
      assert.equal(r.status, 200)
    } finally {
      square.restore()
    }
  })

  test('the route is guarded like every customer route', async () => {
    const t = await payer()
    const total = await want(t.id)
    const body = { idempotencyKey: newKey(), fulfilment: 'pickup', fittingTyres: 0, lines, expectedTotal: total }
    assert.equal((await account('order', { body })).status, 401, 'guests')
    assert.equal((await account('order', { cookie: t.cookie, body, origin: 'https://evil.example.test' })).status, 403)
    assert.equal((await account('order', { cookie: t.cookie, body: JSON.stringify(body), contentType: 'text/plain' })).status, 415)
    assert.equal((await account('order', { method: 'GET', cookie: t.cookie })).status, 405)
    const noKey = await account('order', { cookie: t.cookie, body: { ...body, idempotencyKey: 'x' } })
    assert.equal(noKey.status, 400)
    assert.equal(noKey.json.field, 'idempotencyKey')
    assert.equal(noKey.headers['cache-control'], 'private, no-store')
    assert.equal(await outstandingOf(t.id), 0)
  })

  test('a price-on-application tyre can be ordered at an agreed price, by that account only', async () => {
    const poa = (await import('../src/data/products.js')).products.find((p) => p.price == null)!
    const t = await payer({ prices: { [poa.id]: 400 } })
    const other = await payer({ prices: {} })
    const poaLines = [{ id: poa.id, quantity: 2 }]
    const r = await placeOrder(t.cookie, poaLines, 800)
    assert.equal(r.status, 200, JSON.stringify(r.json))
    const no = await placeOrder(other.cookie, poaLines, 800)
    assert.equal(no.status, 400)
    assert.match(no.json.error, /price on application/)
  })

  test('no password hash, token or secret appears in anything an order answered', async () => {
    const t = await payer()
    await placeOrder(t.cookie, lines, await want(t.id))
    const everything = answered.join('\n')
    assert.equal(/password_?hash|tokenVersion|scrypt/i.test(everything), false)
  })
})

/* ============================================================ the sign-in cookie */

describe('the cookie is the only way in', () => {
  test('order ignores an Authorization header, staff or otherwise', async () => {
    const t = await trade({ payLater: true, creditLimit: 1000 })
    const r = await account('order', {
      headers: { authorization: `Bearer ${OWNER()}` },
      body: { idempotencyKey: newKey(), fulfilment: 'pickup', lines: [{ id: P1.id, quantity: 1 }], expectedTotal: 1 },
    })
    assert.equal(r.status, 401)
    assert.equal(await outstandingOf(t.id), 0)
  })
})
