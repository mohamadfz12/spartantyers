/**
 * Customer accounts at the till and in the books: the till prices a linked customer at the account's
 * prices and sells on account against the credit limit; payments bring `outstanding` down and mark a
 * pay-later order paid; ordinary counter customers behave exactly as before; the Payments and Orders
 * pages cannot settle such an order by themselves; `outstanding` can always be recomputed; the
 * Retail / Bulk / Wholesale report. In-memory Postgres and store, no network.
 *   npx tsx --test tests/accounts-till.test.ts
 */
import assert from 'node:assert/strict'
import { after, beforeEach, describe, test } from 'node:test'
import { sydneyDate } from '../api/_lib/audit.js'
import { addDays } from '../api/_lib/square-api.js'
import { effectivePrice } from '../src/data/products.js'
import {
  P1,
  P2,
  account,
  adminCall,
  answered,
  checkout,
  clearStore,
  money,
  placeOrder,
  repo,
  reset,
  shutdown,
  signUp,
  stockUp,
  staffToken,
  store,
  totalFor,
  trade,
  useFakeSquare,
  dbm,
  type Json,
} from './accounts-kit.js'

beforeEach(async () => {
  await reset()
  clearStore()
  await stockUp()
})
after(shutdown)

const retail = (p: typeof P1) => effectivePrice(p)!
const SPECIAL_1 = money(P1.price! * 0.6)

const pos = (body: Json, token?: string) => adminCall('pos', { method: 'POST', body, ...(token ? { token } : {}) })
const posGet = (query: Record<string, string>) => adminCall('pos', { method: 'GET', query })
const tyre = (p: typeof P1, qty: number, price = retail(p)) => ({ source: 'tyre', itemId: p.id, name: `${p.brand} ${p.model}`, variation: p.size, qty, price })
const outstandingOf = async (id: string) => (await repo.getAccount(id))!.outstanding
const balanceDue = async (posCustomerId: string) => (await import('../api/_lib/pos.js')).balanceOf(posCustomerId, await store.listPosTickets()).due

/** A saved, open ticket for a customer (or a walk-in). */
async function openTicket(customerId: string | null, lines: Json[]) {
  const r = await pos({ action: 'ticket-save', customerId, lines })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return r.json.ticket as Json
}

async function payer(over: Parameters<typeof trade>[0] = {}) {
  return trade({ prices: { [P1.id]: SPECIAL_1 }, payLater: true, creditLimit: 5000, termsDays: 30, ...over })
}

/** `outstanding` equals what the till says the customer owes. */
async function assertInSync(t: { id: string; posCustomerId: string }, note: string) {
  assert.equal(await outstandingOf(t.id), await balanceDue(t.posCustomerId), note)
}

/* ============================================================ the till's view */

describe('the till and a linked account', () => {
  test('account-items: the customer\'s account and its unit price per tyre, only where it beats the shop price', async () => {
    const t = await payer({ discountPct: 10 })
    const r = await posGet({ view: 'account-items', customerId: t.posCustomerId })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(r.json.account, {
      id: t.id,
      level: 'wholesaler',
      status: 'active',
      discountPct: 10,
      payLater: true,
      termsDays: 30,
      creditLimit: 5000,
      outstanding: 0,
      available: 5000,
      creditSet: true,
      refusal: null,
    })
    assert.deepEqual(r.json.prices[P1.id], { unit: SPECIAL_1, basis: 'account' })
    assert.equal(r.json.prices[P2.id].unit, money(P2.price! * 0.9))
    assert.equal(r.headers['cache-control'], 'private, no-store')
  })

  test('another customer\'s account never shows these prices; an ordinary customer has none', async () => {
    const a = await payer({ prices: { [P1.id]: 77.77 } })
    const b = await payer({ prices: {} })
    const rb = await posGet({ view: 'account-items', customerId: b.posCustomerId })
    assert.equal(rb.json.prices[P1.id], undefined)
    assert.equal(JSON.stringify(rb.json).includes('77.77'), false)
    const ra = await posGet({ view: 'account-items', customerId: a.posCustomerId })
    assert.equal(ra.json.prices[P1.id].unit, 77.77)

    const plain = (await pos({ action: 'customer-save', customer: { name: 'Walk In Person' } })).json.customer
    const rp = await posGet({ view: 'account-items', customerId: plain.id })
    assert.deepEqual(rp.json, { account: null, prices: {} })
    assert.equal((await posGet({ view: 'account-items', customerId: 'nope' })).status, 404)
  })

  test('a suspended account gets no agreed prices at the till, and the reason', async () => {
    const t = await payer({ discountPct: 10 })
    await adminCall('account-status', { body: { id: t.id, status: 'suspended' } })
    const r = await posGet({ view: 'account-items', customerId: t.posCustomerId })
    assert.deepEqual(r.json.prices, {})
    assert.equal(r.json.account.status, 'suspended')
    assert.equal(r.json.account.refusal, 'their website account is suspended.')
  })

  test('an account whose till customer link is one-sided is treated as an ordinary customer (no prices leak)', async () => {
    const t = await payer()
    const c = (await store.getPosCustomer(t.posCustomerId))!
    const { accountId: _drop, ...broken } = c
    await store.savePosCustomer({ ...broken, accountId: 'ca_someoneelsesaccount' })
    assert.deepEqual((await posGet({ view: 'account-items', customerId: t.posCustomerId })).json, { account: null, prices: {} })
  })

  test('the customers and customer views carry the account summary for linked customers only', async () => {
    const t = await payer()
    await pos({ action: 'customer-save', customer: { name: 'Counter Only' } })
    const list = (await posGet({ view: 'customers' })).json.customers as Json[]
    const linked = list.find((c) => c.id === t.posCustomerId)!
    assert.equal(linked.account.level, 'wholesaler')
    assert.equal(linked.account.available, 5000)
    assert.equal(list.find((c) => c.name === 'Counter Only')!.account, null)
    const one = (await posGet({ view: 'customer', id: t.posCustomerId })).json
    assert.equal(one.account.id, t.id)
    assert.equal(JSON.stringify(list).includes('"special"'), false, 'no price list in the customer list')
  })
})

/* ============================================================== sale labels */

describe('tickets carry a sale label', () => {
  test('walk-in: Retail below 20 tyres, Bulk from 20', async () => {
    const small = await openTicket(null, [tyre(P1, 19)])
    const big = await openTicket(null, [tyre(P1, 12), tyre(P2, 8)])
    assert.equal(small.channel, 'retail')
    assert.equal(big.channel, 'bulk')
    assert.equal(small.accountId, undefined)
    // Services and typed lines are not tyres.
    const mixed = await openTicket(null, [tyre(P1, 5), { source: 'service', itemId: 'fitting', name: 'Fitting', qty: 30, price: 70 }])
    assert.equal(mixed.channel, 'retail')
  })

  test('a linked customer is labelled by the account level, with the account on the ticket', async () => {
    const w = await payer()
    const b = await payer({ level: 'bulk' })
    const c = await payer({ level: 'customer' })
    assert.equal((await openTicket(w.posCustomerId, [tyre(P1, 1)])).channel, 'wholesale')
    assert.equal((await openTicket(w.posCustomerId, [tyre(P1, 30)])).channel, 'wholesale', 'size never relabels a wholesaler')
    const tb = await openTicket(b.posCustomerId, [tyre(P1, 1)])
    assert.equal(tb.channel, 'bulk')
    assert.equal(tb.accountId, b.id)
    assert.equal((await openTicket(c.posCustomerId, [tyre(P1, 1)])).channel, 'retail')
    assert.equal((await openTicket(c.posCustomerId, [tyre(P1, 20)])).channel, 'bulk')
    // Switching the customer on an open ticket re-labels it.
    const t = await openTicket(w.posCustomerId, [tyre(P1, 1)])
    const moved = await pos({ action: 'ticket-save', ref: t.ref, customerId: null, lines: [tyre(P1, 1)] })
    assert.equal(moved.json.ticket.channel, 'retail')
    assert.equal(moved.json.ticket.accountId, undefined)
  })

  test('an account\'s level change shows on the next ticket', async () => {
    const t = await payer({ level: 'bulk' })
    await adminCall('account-level', { body: { id: t.id, level: 'wholesaler', discountPct: 0 } })
    assert.equal((await openTicket(t.posCustomerId, [tyre(P1, 1)])).channel, 'wholesale')
  })
})

/* ================================================================ on account */

describe('selling on account at the till', () => {
  test('takes credit, and the ticket owes the total', async () => {
    const t = await payer()
    const ticket = await openTicket(t.posCustomerId, [tyre(P1, 2, SPECIAL_1)])
    const r = await pos({ action: 'ticket-account', ref: ticket.ref, dueDays: 10 })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.json.ticket.status, 'account')
    assert.equal(r.json.ticket.channel, 'wholesale')
    assert.equal(r.json.dueDate, addDays(sydneyDate(), 10))
    assert.equal(await outstandingOf(t.id), money(SPECIAL_1 * 2))
    await assertInSync(t, 'after the sale')
  })

  test('over the credit limit: refused, the ticket stays open, nothing taken', async () => {
    const t = await payer({ creditLimit: 100 })
    const ticket = await openTicket(t.posCustomerId, [tyre(P1, 1, 250)])
    const r = await pos({ action: 'ticket-account', ref: ticket.ref })
    assert.equal(r.status, 409)
    assert.match(r.json.error, /over .*credit limit: \$100\.00 available/)
    assert.equal((await store.getPosTicket(ticket.ref))!.status, 'open')
    assert.equal(await outstandingOf(t.id), 0)
    // Within the limit it works on the same ticket.
    await pos({ action: 'ticket-save', ref: ticket.ref, customerId: t.posCustomerId, lines: [tyre(P1, 1, 100)] })
    assert.equal((await pos({ action: 'ticket-account', ref: ticket.ref })).status, 200)
    assert.equal(await outstandingOf(t.id), 100)
  })

  test('refused when pay later is off, the account is suspended, or the link is broken', async () => {
    const off = await trade({ prices: {}, payLater: false })
    const ticketOff = await openTicket(off.posCustomerId, [tyre(P1, 1)])
    const a = await pos({ action: 'ticket-account', ref: ticketOff.ref })
    assert.equal(a.status, 409)
    assert.match(a.json.error, /cannot buy on account: pay later is switched off on their website account\. An owner or manager can change it in Customer accounts\./)

    const sus = await payer()
    const ticketSus = await openTicket(sus.posCustomerId, [tyre(P1, 1)])
    await adminCall('account-status', { body: { id: sus.id, status: 'suspended' } })
    const b = await pos({ action: 'ticket-account', ref: ticketSus.ref })
    assert.equal(b.status, 409)
    assert.match(b.json.error, /cannot buy on account: their website account is suspended/)

    const broken = await payer()
    const ticketBroken = await openTicket(broken.posCustomerId, [tyre(P1, 1)])
    await repo.updateAccount(broken.id, { posCustomerId: 'some-other-customer' })
    const c = await pos({ action: 'ticket-account', ref: ticketBroken.ref })
    assert.equal(c.status, 409)
    assert.match(c.json.error, /not linked to their website account properly/)

    for (const x of [ticketOff, ticketSus, ticketBroken]) assert.equal((await store.getPosTicket(x.ref))!.status, 'open')
    for (const x of [off, sus, broken]) assert.equal(await outstandingOf(x.id), 0)
  })

  test('until an owner or manager sets pay later, a linked customer buys on account at the till exactly as before', async () => {
    // A counter customer who already buys on account, linked by staff: nobody has set pay later yet.
    const now = new Date().toISOString()
    await store.savePosCustomer({ id: 'till-old', name: 'Smith', company: 'Smith Haulage', email: 'smith@buyer.example.test', phone: '', address: '', notes: '', termsDays: 30, createdAt: now, updatedAt: now, createdBy: 'Sam' })
    const made = await adminCall('account-create', { body: { email: 'smith@buyer.example.test', name: 'Smith', level: 'customer' } })
    assert.equal(made.status, 200, JSON.stringify(made.json))
    const id = made.json.account.id as string
    const items = await adminCall('pos', { method: 'GET', query: { view: 'account-items', customerId: 'till-old' } })
    assert.equal(items.json.account.creditSet, false)
    assert.equal(items.json.account.refusal, null, 'the till may still put sales on account')
    const ticket = await openTicket('till-old', [tyre(P1, 1, 2400)])
    const r = await pos({ action: 'ticket-account', ref: ticket.ref })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(await outstandingOf(id), 2400, 'what they owe is still kept in step, with no limit applied')
    // Once a manager decides, the rules apply.
    await adminCall('account-credit', { body: { id, payLater: false, termsDays: 30, creditLimit: 0 } })
    const next = await openTicket('till-old', [tyre(P1, 1, 100)])
    const refused = await pos({ action: 'ticket-account', ref: next.ref })
    assert.equal(refused.status, 409)
    assert.match(refused.json.error, /An owner or manager can change it in Customer accounts/)
  })

  test('if the sale fails after the credit was taken, the credit is given back', async () => {
    const t = await payer()
    const ticket = await openTicket(t.posCustomerId, [tyre(P1, 1, 120)])
    // Someone settled this ticket a moment ago: the sale loses the race AFTER the credit was reserved.
    assert.equal(await store.claimOnce(`pos-paid:${ticket.ref}`), true)
    const r = await pos({ action: 'ticket-account', ref: ticket.ref })
    assert.equal(r.status, 409)
    assert.match(r.json.error, /settled meanwhile/)
    assert.equal(await outstandingOf(t.id), 0, 'given back')
    assert.equal((await repo.getAccount(t.id))!.creditLimit - (await outstandingOf(t.id)), 5000)
  })

  test('a double click on one ticket takes the credit once', async () => {
    const t = await payer()
    const ticket = await openTicket(t.posCustomerId, [tyre(P1, 1, 120)])
    const results = await Promise.all([pos({ action: 'ticket-account', ref: ticket.ref }), pos({ action: 'ticket-account', ref: ticket.ref })])
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
    assert.equal(await outstandingOf(t.id), 120)
    await assertInSync(t, 'one sale')
  })

  test('the till and the website share one limit: parallel sales from both cannot exceed it', async () => {
    const t = await payer({ creditLimit: 0 })
    const web = await totalFor(t.id, [{ id: P1.id, quantity: 1 }])
    const limit = money(web.total + 300) // room for one web order and one 300 till sale, not two of either
    await adminCall('account-credit', { body: { id: t.id, payLater: true, termsDays: 30, creditLimit: limit } })
    const tickets = await Promise.all([1, 2, 3].map(() => openTicket(t.posCustomerId, [tyre(P2, 1, 300)])))
    const results = await Promise.all([
      placeOrder(t.cookie, [{ id: P1.id, quantity: 1 }], web.total),
      placeOrder(t.cookie, [{ id: P1.id, quantity: 1 }], web.total),
      ...tickets.map((x) => pos({ action: 'ticket-account', ref: x.ref })),
    ])
    const out = await outstandingOf(t.id)
    assert.ok(out <= limit, `${out} is within ${limit}`)
    assert.equal(results.filter((r) => r.status === 200).length >= 2, true)
    await assertInSync(t, 'whatever got through is what is owed')
  })
})

describe('an ordinary counter customer is sold to exactly as before', () => {
  test('sale on account, part payment, full payment and labels, with the accounts database unreachable', async () => {
    // On Vercel with no Postgres URL, any touch of the accounts database throws. None may happen here.
    const was = process.env.VERCEL
    process.env.VERCEL = '1'
    try {
      assert.equal((await import('../api/_lib/db.js')).dbConfigured(), false)
      const c = (await pos({ action: 'customer-save', customer: { name: 'Dave Driver', company: 'ABC Haulage', email: 'dave@abc.example.test', termsDays: 30 } })).json.customer
      const ticket = await openTicket(c.id, [tyre(P1, 2, 500), { source: 'custom', name: 'Labour', qty: 1, price: 100 }])
      assert.equal(ticket.channel, 'retail')
      assert.equal(ticket.accountId, undefined)
      const acct = await pos({ action: 'ticket-account', ref: ticket.ref })
      assert.equal(acct.status, 200, JSON.stringify(acct.json))
      assert.equal(acct.json.ticket.status, 'account')
      assert.equal(acct.json.ticket.total, 1100)
      assert.equal(acct.json.dueDate, addDays(sydneyDate(), 30))
      // No credit limit applies: a big second sale goes through.
      const big = await openTicket(c.id, [{ source: 'custom', name: 'Big job', qty: 1, price: 250000 / 5 }])
      assert.equal((await pos({ action: 'ticket-account', ref: big.ref })).status, 200)
      const cash = await pos({ action: 'account-cash', customerId: c.id, amount: 300 })
      assert.equal(cash.status, 200, JSON.stringify(cash.json))
      const other = await pos({ action: 'account-other', customerId: c.id, amount: 50800, method: 'Bank transfer' })
      assert.equal(other.status, 200, JSON.stringify(other.json))
      const view = (await posGet({ view: 'customer', id: c.id })).json
      assert.equal(view.balance.due, 0)
      assert.equal(view.account, null)
      assert.equal(view.tickets.every((x: Json) => x.status === 'paid'), true)
      // A cash ticket and a 20-tyre walk-in ticket.
      const walk = await openTicket(null, [tyre(P1, 20)])
      assert.equal(walk.channel, 'bulk')
      assert.equal((await pos({ action: 'ticket-cash', ref: walk.ref })).status, 200)
      assert.equal((await pos({ action: 'ticket-account', ref: (await openTicket(null, [tyre(P1, 1)])).ref })).status, 400, 'a walk-in still cannot go on account')
    } finally {
      if (was === undefined) delete process.env.VERCEL
      else process.env.VERCEL = was
    }
  })

  test('a customer with no account has no summary in the till lists', async () => {
    await pos({ action: 'customer-save', customer: { name: 'Plain Customer' } })
    const list = (await posGet({ view: 'customers' })).json.customers as Json[]
    assert.deepEqual(list.map((c) => c.account), [null])
  })
})

/* ================================================================== payments */

describe('payments bring what the account owes back down', () => {
  test('sale, part payment, full payment: outstanding always equals the till balance, and the order is paid at the end', async () => {
    const t = await payer()
    const total = (await totalFor(t.id, [{ id: P1.id, quantity: 2 }])).total
    const web = await placeOrder(t.cookie, [{ id: P1.id, quantity: 2 }], total)
    assert.equal(web.status, 200)
    const ticket = await openTicket(t.posCustomerId, [tyre(P2, 1, 300)])
    await pos({ action: 'ticket-account', ref: ticket.ref, dueDays: 90 })
    const owed = money(total + 300)
    assert.equal(await outstandingOf(t.id), owed)
    await assertInSync(t, 'two sales')

    // A part payment: oldest due first, so the website order (30 days) before the ticket (90 days).
    const part = money(total / 2)
    assert.equal((await pos({ action: 'account-cash', customerId: t.posCustomerId, amount: part })).status, 200)
    assert.equal(await outstandingOf(t.id), money(owed - part))
    await assertInSync(t, 'after the part payment')
    let order = (await store.listOrders())[0]!
    assert.equal(order.status, 'account', 'part-paid is still owing')
    assert.equal(order.accountPaidAt, undefined)

    // The rest of the website order.
    assert.equal((await pos({ action: 'account-other', customerId: t.posCustomerId, amount: money(total - part), method: 'Bank transfer' })).status, 200)
    assert.equal(await outstandingOf(t.id), 300)
    await assertInSync(t, 'website order paid off')
    order = (await store.getOrder(order.id))!
    assert.equal(order.status, 'paid', 'paid off at the till, so the order is paid')
    assert.ok(order.accountPaidAt)

    // Everything else.
    assert.equal((await pos({ action: 'account-cash', customerId: t.posCustomerId, amount: 300 })).status, 200)
    assert.equal(await outstandingOf(t.id), 0)
    await assertInSync(t, 'all paid')
    assert.equal((await repo.getAccount(t.id))!.outstanding, 0)
  })

  test('paying more than is owed is refused and changes nothing', async () => {
    const t = await payer()
    const ticket = await openTicket(t.posCustomerId, [tyre(P2, 1, 300)])
    await pos({ action: 'ticket-account', ref: ticket.ref })
    const r = await pos({ action: 'account-cash', customerId: t.posCustomerId, amount: 300.01 })
    assert.equal(r.status, 400)
    assert.equal(await outstandingOf(t.id), 300)
  })

  test('an order that already left the warehouse keeps its status when it is paid off', async () => {
    const t = await payer()
    const total = (await totalFor(t.id, [{ id: P1.id, quantity: 1 }])).total
    await placeOrder(t.cookie, [{ id: P1.id, quantity: 1 }], total)
    const [order] = await store.listOrders()
    assert.equal((await adminCall('orders', { method: 'PATCH', body: { id: order!.id, status: 'packing' } })).status, 200)
    await pos({ action: 'account-cash', customerId: t.posCustomerId, amount: total })
    const done = (await store.getOrder(order!.id))!
    assert.equal(done.status, 'packing', 'fulfilment is not undone by a payment')
    assert.ok(done.accountPaidAt, 'but the order knows it is paid')
  })

  test('an account payment is recorded once even if the till reports it twice', async () => {
    const t = await payer()
    const ticket = await openTicket(t.posCustomerId, [tyre(P2, 1, 300)])
    await pos({ action: 'ticket-account', ref: ticket.ref })
    const { startAccountPayment, recordAccountPayment } = await import('../api/_lib/pos.js')
    const p = await startAccountPayment(t.posCustomerId, 100, 'cash', '', 'Test')
    await recordAccountPayment(p.ref, null, 'Test')
    await recordAccountPayment(p.ref, null, 'Test')
    assert.equal(await outstandingOf(t.id), 200)
    await assertInSync(t, 'applied once')
  })
})

/* ====================================================== the Payments and Orders pages */

describe('a pay-later order is never settled from the Payments or Orders page', () => {
  async function placed() {
    const t = await payer()
    const total = (await totalFor(t.id, [{ id: P1.id, quantity: 2 }])).total
    await placeOrder(t.cookie, [{ id: P1.id, quantity: 2 }], total)
    return { t, total, order: (await store.listOrders())[0]! }
  }

  test('it is not on the list of unpaid orders, and a payment cannot be typed against it', async () => {
    const { total, order } = await placed()
    const ledger = await adminCall('ledger', { method: 'GET' })
    assert.deepEqual(ledger.json.unpaidOrders, [], 'status "account" is not "pending"')
    assert.deepEqual(ledger.json.online, [], 'no card payment, so no online income yet')
    const r = await adminCall('ledger', {
      method: 'POST',
      body: { type: 'payment', date: sydneyDate(), amount: total, category: 'Online sales', method: 'Bank transfer', orderId: order.id, markOrderPaid: true },
    })
    assert.equal(r.status, 409)
    assert.equal(r.json.error, "This order is on the customer's account. Take the payment in the till's customer account, so the balance stays right.")
    assert.equal((await store.listLedger()).length, 0)
    assert.equal((await store.getOrder(order.id))!.status, 'account')
  })

  test('the Orders page cannot mark it paid or pending, and says where to take the payment', async () => {
    const { order, t } = await placed()
    for (const status of ['paid', 'pending', 'account']) {
      const r = await adminCall('orders', { method: 'PATCH', body: { id: order.id, status } })
      assert.equal(r.status, 409, status)
      assert.match(r.json.error, /Take the payment in the till's customer account/)
    }
    assert.equal((await store.getOrder(order.id))!.status, 'account')
    assert.equal((await adminCall('orders', { method: 'PATCH', body: { id: order.id, status: 'packing' } })).status, 200, 'it can go out like any order')
    await assertInSync(t, 'untouched')
  })

  test('cancelling it cancels its ticket and gives the credit back', async () => {
    const { order, t } = await placed()
    assert.ok((await outstandingOf(t.id)) > 0)
    const r = await adminCall('orders', { method: 'PATCH', body: { id: order.id, status: 'cancelled' } })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal((await store.getPosTicket(order.posTicketRef!))!.status, 'void')
    assert.equal(await outstandingOf(t.id), 0)
    await assertInSync(t, 'nothing owed')
    // Cancelling twice does not give the credit back twice.
    await adminCall('account-credit', { body: { id: t.id, payLater: true, termsDays: 30, creditLimit: 5000 } })
    const other = await openTicket(t.posCustomerId, [tyre(P2, 1, 300)])
    await pos({ action: 'ticket-account', ref: other.ref })
    await adminCall('orders', { method: 'PATCH', body: { id: order.id, status: 'cancelled' } })
    assert.equal(await outstandingOf(t.id), 300)
  })

  test('a cancelled order on account cannot be brought back to be packed or sent', async () => {
    const { order } = await placed()
    assert.equal((await adminCall('orders', { method: 'PATCH', body: { id: order.id, status: 'cancelled' } })).status, 200)
    for (const status of ['packing', 'dispatched', 'collected', 'paid']) {
      const r = await adminCall('orders', { method: 'PATCH', body: { id: order.id, status } })
      assert.equal(r.status, 409, status)
    }
    assert.equal((await store.getOrder(order.id))!.status, 'cancelled')
  })

  test('once some of it has been paid it cannot be cancelled here, and nothing changes', async () => {
    const { order, t, total } = await placed()
    await pos({ action: 'account-cash', customerId: t.posCustomerId, amount: 10 })
    const r = await adminCall('orders', { method: 'PATCH', body: { id: order.id, status: 'cancelled' } })
    assert.equal(r.status, 409)
    assert.match(r.json.error, /already been paid/)
    assert.equal((await store.getOrder(order.id))!.status, 'account')
    assert.equal((await store.getPosTicket(order.posTicketRef!))!.status, 'account')
    assert.equal(await outstandingOf(t.id), money(total - 10))
  })

  test('card orders and every other order keep working as before', async () => {
    const square = useFakeSquare()
    try {
      const r = await checkout({ lines: [{ id: P1.id, quantity: 1 }], expectedTotal: retail(P1) })
      assert.equal(r.status, 200)
      const [order] = await store.listOrders()
      assert.equal((await adminCall('orders', { method: 'PATCH', body: { id: order!.id, status: 'packing' } })).status, 200)
      assert.equal((await adminCall('orders', { method: 'PATCH', body: { id: order!.id, status: 'cancelled' } })).status, 200)
      const ledger = await adminCall('ledger', { method: 'GET' })
      assert.equal(ledger.json.online.length, 1)
      assert.equal(ledger.json.online[0].counted, false)
    } finally {
      square.restore()
    }
  })
})

/* ================================================================== reconcile */

describe('outstanding can always be recomputed from the till', () => {
  async function owing() {
    const t = await payer()
    const total = (await totalFor(t.id, [{ id: P1.id, quantity: 2 }])).total
    await placeOrder(t.cookie, [{ id: P1.id, quantity: 2 }], total)
    return { t, total }
  }
  const settleWindowPassed = async (id: string) => (await dbm.getDb((await import('../api/_lib/accounts/schema.js')).ACCOUNTS_SCHEMA)).query(`UPDATE customer_accounts SET last_reserved_at = now() - interval '1 hour' WHERE id = $1::text`, [id])
  const corrupt = async (id: string, to: number) => (await dbm.getDb((await import('../api/_lib/accounts/schema.js')).ACCOUNTS_SCHEMA)).query(`UPDATE customer_accounts SET outstanding = $2::numeric WHERE id = $1::text`, [id, to])

  test('account-reconcile fixes a wrong figure and says what it found', async () => {
    const { t, total } = await owing()
    await corrupt(t.id, 5)
    await settleWindowPassed(t.id)
    const r = await adminCall('account-reconcile', { body: { id: t.id } })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.deepEqual(r.json.reconciled, { balance: total, outstanding: total, fixed: true, deferred: false })
    assert.equal(r.json.account.outstanding, total)
    assert.equal(r.json.creditAvailable, money(5000 - total))
    const log = (await store.listAudit()).find((e) => e.action === 'account.reconcile')!
    assert.match(log.detail, /corrected from \$5\.00 to \$/)
    // Already right: nothing to fix, nothing logged.
    const again = await adminCall('account-reconcile', { body: { id: t.id } })
    assert.deepEqual(again.json.reconciled, { balance: total, outstanding: total, fixed: false, deferred: false })
    assert.equal((await store.listAudit()).filter((e) => e.action === 'account.reconcile').length, 1)
  })

  test('a repair that runs while a till payment is being applied waits, so the balance is never taken off twice', async () => {
    const t = await payer()
    const ticket = await openTicket(t.posCustomerId, [tyre(P2, 1, 100)])
    await pos({ action: 'ticket-account', ref: ticket.ref })
    const { reconcileOutstanding } = await import('../api/_lib/accounts/credit.js')
    assert.equal((await reconcileOutstanding(t.id, { settleSeconds: 0 }))!.outstanding, 100)
    const { startAccountPayment, recordAccountPayment } = await import('../api/_lib/pos.js')
    const p = await startAccountPayment(t.posCustomerId, 50, 'cash', '', 'Test')
    // Mid-payment: the flow has said "credit is moving" and written the ticket, but not yet given the credit back.
    await repo.markCreditMoving(t.id)
    const paidTicket = (await store.getPosTicket(ticket.ref))!
    await store.savePosTicket({ ...paidTicket, amountPaid: 50 })
    const during = await reconcileOutstanding(t.id)
    assert.equal(during!.deferred, true, 'the repair waits')
    assert.equal(await outstandingOf(t.id), 100)
    await store.savePosTicket(paidTicket)
    await recordAccountPayment(p.ref, null, 'Test')
    assert.equal(await outstandingOf(t.id), 50, 'owes 50, not 0')
    assert.equal((await reconcileOutstanding(t.id))!.outstanding, 50, 'and the till agrees')
    // The payment flow marks the move itself (before it writes the tickets).
    const db = await (await import('../api/_lib/accounts/schema.js')).getAccountsDb()
    await db.query(`UPDATE customer_accounts SET last_reserved_at = now() - interval '1 hour' WHERE id = $1`, [t.id])
    const p2 = await startAccountPayment(t.posCustomerId, 10, 'cash', '', 'Test')
    await recordAccountPayment(p2.ref, null, 'Test')
    const [row] = await db.query<{ recent: boolean }>(`SELECT last_reserved_at > now() - interval '1 minute' AS recent FROM customer_accounts WHERE id = $1`, [t.id])
    assert.equal(row!.recent, true)
  })

  test('a sale that was only just recorded is left alone (its ticket may not exist yet)', async () => {
    const t = await payer()
    assert.notEqual(await repo.reserveCredit(t.id, 50), null)
    const { reconcileOutstanding } = await import('../api/_lib/accounts/credit.js')
    const quick = await reconcileOutstanding(t.id)
    assert.deepEqual(quick, { balance: 0, outstanding: 50, fixed: false, deferred: true })
    assert.equal(await outstandingOf(t.id), 50, 'the reservation survives')
    const forced = await reconcileOutstanding(t.id, { settleSeconds: 0 })
    assert.equal(forced!.fixed, true)
    assert.equal(await outstandingOf(t.id), 0)
  })

  test('opening the account in the admin repairs it, and shows the credit still available', async () => {
    const { t, total } = await owing()
    await corrupt(t.id, 1)
    await settleWindowPassed(t.id)
    const r = await adminCall('account', { method: 'GET', query: { id: t.id } })
    assert.equal(r.json.account.outstanding, total)
    assert.equal(r.json.creditAvailable, money(5000 - total))
    assert.equal(r.json.posCustomer.balance.due, total)
  })

  test('only staff with trade can reconcile; an unknown account is a 404', async () => {
    const { t } = await owing()
    for (const [role, want] of [['owner', 200], ['manager', 200], ['sales', 200], ['staff', 403]] as const) {
      assert.equal((await adminCall('account-reconcile', { body: { id: t.id }, token: await staffToken(role) })).status, want, role)
    }
    assert.equal((await adminCall('account-reconcile', { body: { id: 'ca_nothing' } })).status, 404)
    assert.equal((await adminCall('account-reconcile', { body: { id: t.id }, token: null })).status, 401)
  })

  test('an account with no till customer is returned as it is', async () => {
    await store.savePosCustomer({ id: 'till-3', name: 'Existing', company: '', email: 'third@existing.example.test', phone: '', address: '', notes: '', termsDays: 14, createdAt: '', updatedAt: '', createdBy: 'x' })
    const s = await signUp({ email: 'third@existing.example.test' })
    const r = await adminCall('account-reconcile', { body: { id: s.id } })
    assert.deepEqual(r.json.reconciled, { balance: 0, outstanding: 0, fixed: false, deferred: false })
  })

  test('taking over a till customer who already owes money starts the account at the real figure', async () => {
    const c = (await pos({ action: 'customer-save', customer: { name: 'Old Customer', company: 'Old Co', email: 'old@haulage.example.test', termsDays: 14 } })).json.customer
    const ticket = await openTicket(c.id, [{ source: 'custom', name: 'Earlier job', qty: 1, price: 480 }])
    await pos({ action: 'ticket-account', ref: ticket.ref })
    // Staff open the account for that email: the till customer is linked, and its balance is what the account owes.
    const created = await adminCall('account-create', { body: { email: 'old@haulage.example.test', name: 'Old Customer', level: 'wholesaler' } })
    assert.equal(created.status, 200, JSON.stringify(created.json))
    assert.equal(created.json.account.posCustomerId, c.id)
    assert.equal(created.json.account.outstanding, 480)

    // The same when staff link a sign-up that had been held back.
    const c2 = (await pos({ action: 'customer-save', customer: { name: 'Other', email: 'other@haulage.example.test' } })).json.customer
    const t2 = await openTicket(c2.id, [{ source: 'custom', name: 'Job', qty: 1, price: 125.5 }])
    await pos({ action: 'ticket-account', ref: t2.ref })
    const s = await signUp({ email: 'other@haulage.example.test' })
    assert.equal((await repo.getAccount(s.id))!.posCustomerId, null)
    const linked = await adminCall('account-link-pos', { body: { id: s.id } })
    assert.equal(linked.status, 200)
    assert.equal(linked.json.account.outstanding, 125.5)
  })
})

/* ================================================================== reports */

describe('GET /api/admin/sales-by-channel', () => {
  const today = () => sydneyDate()
  const report = (query: Record<string, string> = { from: today(), to: today() }, token?: string | null) =>
    adminCall('sales-by-channel', { method: 'GET', query, ...(token !== undefined ? { token } : {}) })

  test('sorts website orders and till tickets into Retail, Bulk and Wholesale, paid and on account', async () => {
    const square = useFakeSquare()
    try {
      const w = await payer()
      const wholesale = await trade({ level: 'wholesaler', prices: { [P1.id]: SPECIAL_1 }, payLater: false })

      // Website: a guest, a 20-tyre guest, a wholesaler on card, a wholesaler on account.
      const g1 = await checkout({ lines: [{ id: P2.id, quantity: 1 }], expectedTotal: retail(P2) })
      const guest20Total = (await import('../src/lib/account-pricing.js')).priceCart([{ product: P2, quantity: 20 }], { fulfilment: 'pickup', fittingTyres: 0 }).total
      const g2 = await checkout({ lines: [{ id: P2.id, quantity: 20 }], expectedTotal: guest20Total })
      const wTotal = (await totalFor(wholesale.id, [{ id: P1.id, quantity: 3 }])).total
      const w1 = await checkout({ cookie: wholesale.cookie, lines: [{ id: P1.id, quantity: 3 }], expectedTotal: wTotal })
      const payLaterTotal = (await totalFor(w.id, [{ id: P1.id, quantity: 2 }])).total
      const w2 = await placeOrder(w.cookie, [{ id: P1.id, quantity: 2 }], payLaterTotal)
      for (const r of [g1, g2, w1, w2]) assert.equal(r.status, 200, JSON.stringify(r.json))

      // A cancelled pay-later order is not a sale.
      const cancelledTotal = (await totalFor(w.id, [{ id: P1.id, quantity: 1 }])).total
      await placeOrder(w.cookie, [{ id: P1.id, quantity: 1 }], cancelledTotal)
      const cancelled = (await store.listOrders()).find((o) => o.total === cancelledTotal && o.payment === 'account')!
      await adminCall('orders', { method: 'PATCH', body: { id: cancelled.id, status: 'cancelled' } })

      // Till: a cash sale, a 20-tyre cash sale, and the wholesaler on account.
      const cash = await openTicket(null, [{ source: 'custom', name: 'Odd job', qty: 1, price: 33 }])
      await pos({ action: 'ticket-cash', ref: cash.ref })
      const cash20 = await openTicket(null, [tyre(P1, 20)])
      await pos({ action: 'ticket-cash', ref: cash20.ref })
      const onAcct = await openTicket(w.posCustomerId, [tyre(P2, 1, 400)])
      await pos({ action: 'ticket-account', ref: onAcct.ref })
      // An unfinished ticket and a cancelled one are not sales.
      await openTicket(null, [tyre(P1, 1)])
      const voided = await openTicket(null, [tyre(P1, 1)])
      await pos({ action: 'ticket-void', ref: voided.ref })

      const r = await report()
      assert.equal(r.status, 200, JSON.stringify(r.json))
      assert.equal(r.headers['cache-control'], 'private, no-store')
      assert.equal(r.json.from, today())
      assert.equal(r.json.to, today())
      const c = r.json.channels

      assert.deepEqual(c.retail.website, { count: 1, total: retail(P2), paid: retail(P2), owing: 0, onAccount: { count: 0, total: 0 } })
      assert.deepEqual(c.bulk.website, { count: 1, total: guest20Total, paid: guest20Total, owing: 0, onAccount: { count: 0, total: 0 } })
      assert.equal(c.wholesale.website.count, 2)
      assert.equal(c.wholesale.website.total, money(wTotal + payLaterTotal))
      assert.equal(c.wholesale.website.paid, wTotal, 'the card order is paid, the pay-later one is not')
      assert.equal(c.wholesale.website.owing, payLaterTotal)
      assert.deepEqual(c.wholesale.website.onAccount, { count: 1, total: payLaterTotal })

      assert.deepEqual(c.retail.till, { count: 1, total: 33, paid: 33, owing: 0, onAccount: { count: 0, total: 0 } })
      const bulkTill = (await store.getPosTicket(cash20.ref))!.total
      assert.deepEqual(c.bulk.till, { count: 1, total: bulkTill, paid: bulkTill, owing: 0, onAccount: { count: 0, total: 0 } })
      assert.deepEqual(c.wholesale.till, { count: 1, total: 400, paid: 0, owing: 400, onAccount: { count: 1, total: 400 } }, "the pay-later order's own ticket is the order, not a second sale")

      assert.equal(c.wholesale.all.count, 3)
      assert.equal(c.wholesale.all.owing, money(payLaterTotal + 400))
      const everything = r.json.total.all
      assert.equal(everything.count, 1 + 1 + 3 + 1 + 1)
      assert.equal(everything.total, money(c.retail.all.total + c.bulk.all.total + c.wholesale.all.total))

      // Paying the pay-later order off at the till moves it from owing to paid.
      await pos({ action: 'account-cash', customerId: w.posCustomerId, amount: payLaterTotal })
      const after = (await report()).json.channels
      assert.equal(after.wholesale.website.paid, money(wTotal + payLaterTotal))
      assert.equal(after.wholesale.website.owing, 0)
      assert.equal(after.wholesale.website.onAccount.count, 1, 'it was still an on-account sale')
    } finally {
      square.restore()
    }
  })

  test('only the days asked for', async () => {
    await openTicket(null, [{ source: 'custom', name: 'Job', qty: 1, price: 10 }]).then((t) => pos({ action: 'ticket-cash', ref: t.ref }))
    const yesterday = addDays(today(), -1)
    const none = (await report({ from: yesterday, to: yesterday })).json
    assert.equal(none.total.all.count, 0)
    const week = (await report({ from: addDays(today(), -6), to: today() })).json
    assert.equal(week.total.all.count, 1)
    const dflt = (await report({})).json
    assert.equal(dflt.to, today())
    assert.equal(dflt.from, addDays(today(), -29))
    assert.equal(dflt.total.all.count, 1)
  })

  test('records from before labels existed are labelled by the tyre count', async () => {
    const base = {
      id: 'old-1', reference: 'SPT-OLD1-OLD1', createdAt: new Date().toISOString(), status: 'paid' as const, fulfilment: 'pickup' as const,
      customer: { name: 'Old', email: 'o@x.example.test', phone: '' }, fittingTyres: 0, subtotal: 100, fittingTotal: 0, discount: 0, total: 100, paymentId: 'p1',
    }
    await store.saveOrder({ ...base, lines: [{ sku: 'a', name: 'A', size: 's', quantity: 20, unitPrice: 5 }] })
    await store.saveOrder({ ...base, id: 'old-2', reference: 'SPT-OLD2-OLD2', lines: [{ sku: 'a', name: 'A', size: 's', quantity: 2, unitPrice: 50 }] })
    const c = (await report()).json.channels
    assert.equal(c.bulk.website.count, 1)
    assert.equal(c.retail.website.count, 1)
  })

  test('money and a bad request: who may ask and what is refused', async () => {
    for (const [role, want] of [['owner', 200], ['manager', 200], ['sales', 403], ['staff', 403]] as const) {
      assert.equal((await report({}, await staffToken(role))).status, want, role)
    }
    assert.equal((await report({}, null)).status, 401)
    const bad: Array<Record<string, string>> = [
      { from: 'yesterday', to: today() },
      { from: today(), to: '2026-02-31' },
      { from: addDays(today(), 1), to: today() },
      { from: addDays(today(), -401), to: today() },
    ]
    for (const q of bad) assert.equal((await report(q)).status, 400, JSON.stringify(q))
    assert.equal((await adminCall('sales-by-channel', { method: 'POST', body: {} })).status, 405)
  })

  test('nothing secret in any answer of this file', () => {
    const everything = answered.join('\n')
    assert.equal(/password_?hash|tokenVersion|scrypt|spt_session=/i.test(everything), false)
  })
})
