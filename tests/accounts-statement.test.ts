/**
 * GET /api/account/orders and /api/account/statement: a customer reads their own orders and their own
 * till customer's balance, and never anyone else's.
 *   npx tsx --test tests/accounts-statement.test.ts
 */
import assert from 'node:assert/strict'
import { after, afterEach, beforeEach, describe, test } from 'node:test'
import { addDays } from '../api/_lib/square-api.js'
import { sydneyDate } from '../api/_lib/audit.js'
import { effectivePrice } from '../src/data/products.js'
import {
  OWNER,
  P1,
  P2,
  account,
  adminCall,
  checkout,
  clearStore,
  money,
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
} from './accounts-kit.js'

beforeEach(async () => {
  await reset()
  clearStore()
  await stockUp()
})
after(shutdown)

const SPECIAL = money(P1.price! * 0.6)
const payer = (over: Parameters<typeof trade>[0] = {}) => trade({ prices: { [P1.id]: SPECIAL }, payLater: true, creditLimit: 5000, termsDays: 14, ...over })
const get = (action: 'orders' | 'statement', cookie?: string, extra: Record<string, unknown> = {}) => account(action, { method: 'GET', ...(cookie ? { cookie } : {}), ...extra })

async function orderFor(t: { id: string; cookie: string }, quantity = 2) {
  const lines = [{ id: P1.id, quantity }]
  const r = await placeOrder(t.cookie, lines, (await totalFor(t.id, lines)).total)
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return r.json
}

describe('GET /api/account/orders', () => {
  let square: ReturnType<typeof useFakeSquare>
  beforeEach(() => {
    square = useFakeSquare()
  })
  afterEach(() => square.restore())

  test('lists the customer\'s own orders, newest first, card and on account, without internal ids', async () => {
    const t = await payer()
    const lines = [{ id: P2.id, quantity: 1 }]
    const card = await checkout({ cookie: t.cookie, lines, expectedTotal: (await totalFor(t.id, lines)).total })
    assert.equal(card.status, 200)
    const later = await orderFor(t)
    const r = await get('orders', t.cookie)
    assert.equal(r.status, 200)
    assert.equal(r.headers['cache-control'], 'private, no-store')
    assert.deepEqual(r.json.orders.map((o: any) => o.reference), [later.reference, card.json.reference])
    const [acct, cardOrder] = r.json.orders
    assert.equal(acct.payment, 'account')
    assert.equal(acct.dueDate, addDays(sydneyDate(), 14))
    assert.equal(acct.paid, false)
    assert.equal(acct.overdue, false)
    assert.equal(acct.channel, 'wholesale')
    assert.equal(acct.status, 'account')
    assert.deepEqual(acct.lines, [{ name: acct.lines[0].name, size: P1.size, quantity: 2, unitPrice: SPECIAL, basis: 'account' }])
    assert.equal(cardOrder.payment, 'card')
    assert.equal('dueDate' in cardOrder, false)
    const text = JSON.stringify(r.json)
    for (const hidden of ['accountId', 'posTicketRef', 'paymentId', '"id"', 'orderId']) assert.equal(text.includes(hidden), false, hidden)
  })

  test('one account never sees another\'s orders, nor a guest\'s, nor a look-alike email\'s', async () => {
    const a = await payer()
    const b = await payer()
    const ra = await orderFor(a)
    const rb = await orderFor(b)
    const guestLines = [{ id: P2.id, quantity: 1 }]
    const guest = await checkout({ lines: guestLines, expectedTotal: effectivePrice(P2)! })
    const seenA = (await get('orders', a.cookie)).json.orders.map((o: any) => o.reference)
    const seenB = (await get('orders', b.cookie)).json.orders.map((o: any) => o.reference)
    assert.deepEqual(seenA, [ra.reference])
    assert.deepEqual(seenB, [rb.reference])
    assert.equal(seenA.includes(guest.json.reference) || seenB.includes(guest.json.reference), false)
  })

  test('an overdue pay-later order says so; a paid one says paid', async () => {
    const t = await payer({ termsDays: 0 })
    await orderFor(t)
    const [o] = await store.listOrders()
    await store.saveOrder({ ...o!, dueDate: addDays(sydneyDate(), -3) })
    assert.equal((await get('orders', t.cookie)).json.orders[0].overdue, true)
    await adminCall('pos', { method: 'POST', body: { action: 'account-cash', customerId: t.posCustomerId, amount: o!.total } })
    const after = (await get('orders', t.cookie)).json.orders[0]
    assert.equal(after.paid, true)
    assert.equal(after.overdue, false)
  })

  test('guests, staff tokens and bad cookies get 401', async () => {
    assert.equal((await get('orders')).status, 401)
    assert.equal((await get('orders', undefined, { headers: { authorization: `Bearer ${OWNER()}` } })).status, 401)
    assert.equal((await get('orders', 'spt_session=junk')).status, 401)
    assert.equal((await get('orders')).headers['cache-control'], 'private, no-store')
  })
})

describe('GET /api/account/statement', () => {
  test('a linked account sees its own open items with due dates, payments and balance', async () => {
    const t = await payer()
    const placed = await orderFor(t)
    const tk = (await adminCall('pos', { method: 'POST', body: { action: 'ticket-save', customerId: t.posCustomerId, lines: [{ source: 'custom', name: 'Counter job', qty: 1, price: 250 }] } })).json.ticket
    await adminCall('pos', { method: 'POST', body: { action: 'ticket-account', ref: tk.ref, dueDays: 0 } })
    await adminCall('pos', { method: 'POST', body: { action: 'account-cash', customerId: t.posCustomerId, amount: 100 } })
    const r = await get('statement', t.cookie)
    assert.equal(r.status, 200, JSON.stringify(r.json))
    assert.equal(r.headers['cache-control'], 'private, no-store')
    assert.equal(r.json.linked, true)
    assert.equal(r.json.balance.due, money(placed.total + 250 - 100))
    assert.equal(r.json.balance.count, 2)
    // Oldest due first: the counter job (due today) then the website order; its reference is the order's.
    assert.deepEqual(r.json.open.map((x: any) => x.reference), [tk.ref, placed.reference])
    assert.equal(r.json.open[0].paid, 100)
    assert.equal(r.json.open[0].owing, 150)
    assert.equal(r.json.open[1].dueDate, placed.dueDate)
    assert.equal(r.json.payments.length, 1)
    assert.equal(r.json.payments[0].amount, 100)
    assert.equal(r.json.payments[0].method, 'Cash')
    assert.deepEqual(r.json.payments[0].allocations, [{ ticketRef: tk.ref, amount: 100 }])
  })

  test('overdue items are flagged and counted', async () => {
    const t = await payer()
    const tk = (await adminCall('pos', { method: 'POST', body: { action: 'ticket-save', customerId: t.posCustomerId, lines: [{ source: 'custom', name: 'Old job', qty: 1, price: 80 }] } })).json.ticket
    await adminCall('pos', { method: 'POST', body: { action: 'ticket-account', ref: tk.ref } })
    await store.savePosTicket({ ...(await store.getPosTicket(tk.ref))!, dueDate: addDays(sydneyDate(), -5) })
    const r = (await get('statement', t.cookie)).json
    assert.equal(r.open[0].overdue, true)
    assert.equal(r.balance.overdue, 80)
  })

  test('never another customer\'s tickets or payments, even in the same business name', async () => {
    const a = await payer()
    const b = await payer()
    for (const [t, price] of [[a, 111], [b, 222]] as const) {
      const tk = (await adminCall('pos', { method: 'POST', body: { action: 'ticket-save', customerId: t.posCustomerId, lines: [{ source: 'custom', name: 'Job', qty: 1, price }] } })).json.ticket
      await adminCall('pos', { method: 'POST', body: { action: 'ticket-account', ref: tk.ref } })
      await adminCall('pos', { method: 'POST', body: { action: 'account-cash', customerId: t.posCustomerId, amount: 11 } })
    }
    const ra = (await get('statement', a.cookie)).json
    const rb = (await get('statement', b.cookie)).json
    assert.equal(ra.balance.due, 100)
    assert.equal(rb.balance.due, 211)
    assert.deepEqual(ra.open.map((x: any) => x.total), [111])
    assert.deepEqual(rb.open.map((x: any) => x.total), [222])
    assert.equal(ra.payments.length, 1)
    assert.equal(ra.payments[0].ref === rb.payments[0].ref, false)
    assert.equal(JSON.stringify(ra).includes('222'), false)
  })

  test('an unlinked account gets its website on-account orders only, and no till data', async () => {
    // A till customer with this email already owes money; the sign-up is held back from it.
    await store.savePosCustomer({ id: 'till-x', name: 'Existing', company: 'Existing Co', email: 'owes@existing.example.test', phone: '', address: '', notes: '', termsDays: 14, createdAt: '', updatedAt: '', createdBy: 'x' })
    const tk = (await adminCall('pos', { method: 'POST', body: { action: 'ticket-save', customerId: 'till-x', lines: [{ source: 'custom', name: 'Secret till job', qty: 1, price: 999 }] } })).json.ticket
    await adminCall('pos', { method: 'POST', body: { action: 'ticket-account', ref: tk.ref } })
    const s = await signUp({ email: 'owes@existing.example.test' })
    assert.equal((await repo.getAccount(s.id))!.posCustomerId, null)
    const r = await get('statement', s.cookie)
    assert.equal(r.status, 200)
    assert.deepEqual(r.json, { linked: false, balance: { due: 0, overdue: 0, count: 0 }, open: [], payments: [] })
    assert.equal(JSON.stringify(r.json).includes(tk.ref), false)
    assert.deepEqual((await get('orders', s.cookie)).json.orders, [])
  })

  test('an unlinked account that somehow has an on-account order sees just that order', async () => {
    const s = await signUp()
    await store.saveOrder({
      id: 'o-1', reference: 'SPT-TEST-0001', createdAt: new Date().toISOString(), status: 'account', fulfilment: 'pickup', customer: { name: 'x', email: s.email, phone: '' },
      lines: [], fittingTyres: 0, subtotal: 300, fittingTotal: 0, discount: 0, total: 300, accountId: s.id, payment: 'account', dueDate: addDays(sydneyDate(), -1), channel: 'retail',
    })
    // Break the link both ways, as for an account that matched a till customer.
    await repo.updateAccount(s.id, { posCustomerId: null })
    const r = (await get('statement', s.cookie)).json
    assert.equal(r.linked, false)
    assert.deepEqual(r.open.map((x: any) => [x.kind, x.reference, x.owing, x.overdue]), [['order', 'SPT-TEST-0001', 300, true]])
    assert.deepEqual(r.balance, { due: 300, overdue: 300, count: 1 })
    assert.deepEqual(r.payments, [])
  })

  test('a link that is only one way shows no till data', async () => {
    const a = await payer()
    const other = await payer()
    const tk = (await adminCall('pos', { method: 'POST', body: { action: 'ticket-save', customerId: other.posCustomerId, lines: [{ source: 'custom', name: 'Other job', qty: 1, price: 333 }] } })).json.ticket
    await adminCall('pos', { method: 'POST', body: { action: 'ticket-account', ref: tk.ref } })
    // Point account A at B's till customer: B's customer does not point back at A.
    await repo.updateAccount(a.id, { posCustomerId: other.posCustomerId })
    const r = (await get('statement', a.cookie)).json
    assert.equal(r.linked, false)
    assert.equal(JSON.stringify(r).includes('333'), false)
  })

  test('guests and staff tokens get 401, and the answer is never cached', async () => {
    assert.equal((await get('statement')).status, 401)
    assert.equal((await get('statement', undefined, { headers: { authorization: `Bearer ${OWNER()}` } })).status, 401)
    assert.equal((await get('statement')).headers['cache-control'], 'private, no-store')
  })
})
