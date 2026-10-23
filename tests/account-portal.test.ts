/**
 * Customer portal helpers that need no browser: the safe "go back to" path, available credit,
 * password rules and level names.
 *   npx tsx --test tests/account-portal.test.ts
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  availableCredit,
  levelFromParam,
  loginPathFor,
  passwordAcceptable,
  passwordChecks,
  safeNext,
  shortName,
  termsText,
} from '../src/lib/account-portal.js'
import { formatDay, gstIncluded, orderStatusLabel, payState, planReorder } from '../src/lib/account-orders.js'
import { invoiceHtml, statementHtml } from '../src/lib/account-print.js'
import { site } from '../src/config/site.js'
import type { AccountOrder, AccountStatement } from '../src/lib/account-client.js'

const BS = String.fromCharCode(92)

describe('safeNext', () => {
  test('keeps same-site account paths and the home page', () => {
    assert.equal(safeNext('/account'), '/account')
    assert.equal(safeNext('/account/details'), '/account/details')
    assert.equal(safeNext('/account/details?tab=1#x'), '/account/details?tab=1#x')
    assert.equal(safeNext('/', '/account'), '/')
  })
  test('keeps the shopping pages a customer logs in from to see their prices', () => {
    for (const good of ['/cart', '/checkout', '/shop', '/shop?size=11R22.5', '/products', '/compare', '/deals', '/product/abc-123_X']) {
      assert.equal(safeNext(good), good, good)
    }
  })
  test('falls back for anything else', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'account',
      'https://evil.com',
      'http://evil.com/account',
      '//evil.com',
      '//evil.com/account',
      '/' + BS + 'evil.com',
      '/account' + BS + 'x',
      '/%2F%2Fevil.com',
      '/%2f%2fevil.com',
      '/%5Cevil.com',
      '/%255Cevil.com',
      '/%252F%252Fevil.com',
      'javascript:alert(1)',
      '/shopping',
      '/admin',
      '/admin/accounts',
      '/product/',
      '/product/a/b',
      '/cart/../admin',
      '/accountant',
      '/account/../shop',
      '/account/%2e%2e/shop',
      '/account%00',
      '/account\n',
      '/%E0%A4%A',
      '/account/' + 'a'.repeat(400),
    ]) {
      assert.equal(safeNext(bad as string | null | undefined), '/account', String(bad))
    }
    assert.equal(safeNext('//evil.com', '/'), '/')
  })
})

describe('loginPathFor', () => {
  test('carries the page to come back to', () => {
    assert.equal(loginPathFor('/account/details'), '/account/login?next=%2Faccount%2Fdetails')
    assert.equal(loginPathFor('/account'), '/account/login')
    assert.equal(loginPathFor('https://evil.com'), '/account/login')
  })
})

describe('availableCredit', () => {
  test('limit minus owing, in whole cents, never below zero', () => {
    assert.equal(availableCredit(5000, 1250.5), 3749.5)
    assert.equal(availableCredit(0.3, 0.1), 0.2)
    assert.equal(availableCredit(1000, 1000), 0)
    assert.equal(availableCredit(1000, 1500), 0)
  })
})

describe('labels and rules', () => {
  test('level from the query string', () => {
    assert.equal(levelFromParam('wholesaler'), 'wholesaler')
    assert.equal(levelFromParam('bulk'), 'bulk')
    assert.equal(levelFromParam('admin'), 'customer')
    assert.equal(levelFromParam(null), 'customer')
  })
  test('password rules', () => {
    assert.equal(passwordAcceptable('short'), false)
    assert.equal(passwordAcceptable('long enough pass'), true)
    assert.equal(passwordAcceptable('me@example.com', 'ME@example.com'), false)
    assert.ok(passwordChecks('').every((c) => !c.ok))
  })
  test('short name and terms text', () => {
    assert.equal(shortName({ name: 'Sam Lee', company: 'X', email: 'a@b.c' }), 'Sam')
    assert.equal(shortName({ name: '', company: 'Acme Tyres', email: 'a@b.c' }), 'Acme Tyres')
    assert.equal(shortName({ name: '', company: '', email: 'sam@b.c' }), 'sam')
    assert.equal(termsText(30), '30 days from the invoice')
    assert.equal(termsText(0), 'Payment on delivery')
  })
})

const ORDER: AccountOrder = {
  reference: 'ST-TEST-1',
  createdAt: '2026-10-01T02:00:00.000Z',
  status: 'account',
  fulfilment: 'delivery',
  lines: [{ name: 'Brand <b>X</b>', size: '11R22.5', quantity: 4, unitPrice: 300 }],
  fittingTyres: 0,
  subtotal: 1200,
  discount: 0,
  fittingTotal: 0,
  total: 1200,
  channel: 'retail',
  payment: 'account',
  dueDate: '2026-10-31',
  paid: false,
  overdue: false,
}

describe('orders helpers', () => {
  test('GST and dates', () => {
    assert.equal(gstIncluded(1100), 100)
    assert.equal(gstIncluded(1200), 109.09)
    assert.equal(formatDay('2026-10-31'), '31 October 2026')
    assert.equal(formatDay(null), '')
    assert.equal(formatDay('nonsense'), '')
  })
  test('payment state', () => {
    assert.equal(payState({ ...ORDER }).label, 'Due 31 October 2026')
    assert.equal(payState({ ...ORDER, overdue: true }).tone, 'destructive')
    assert.equal(payState({ ...ORDER, paid: true }).label, 'Paid')
    assert.equal(payState({ ...ORDER, payment: 'card' }).label, 'Paid by card')
    assert.equal(payState({ ...ORDER, status: 'cancelled' }).label, 'Cancelled')
    assert.equal(orderStatusLabel('packing'), 'Being packed')
  })
  test('reorder reports what is unavailable', () => {
    const stock: Record<string, number> = { A: 10, B: 2, C: 0 }
    const find = (name: string) => (name in stock ? { id: name, available: stock[name]! } : null)
    const plan = planReorder(
      [
        { name: 'A', size: 's', quantity: 4 },
        { name: 'B', size: 's', quantity: 5 },
        { name: 'C', size: 's', quantity: 1 },
        { name: 'D', size: 's', quantity: 1 },
      ],
      find,
    )
    assert.deepEqual(plan.add, [
      { id: 'A', quantity: 4 },
      { id: 'B', quantity: 2 },
    ])
    assert.equal(plan.notes.length, 3)
  })
})

describe('printable documents', () => {
  const me = { name: 'Sam <script>', company: 'Acme & Co', email: 'sam@example.test', phone: '', abn: '', address: '1 Test St' }
  test('tax invoice escapes text, shows GST and the due date, and leaves the ABN out while it is empty', () => {
    const html = invoiceHtml(ORDER, me)
    assert.ok(html.includes('Tax invoice'))
    assert.ok(html.includes('ST-TEST-1'))
    assert.ok(html.includes('Brand &lt;b&gt;X&lt;/b&gt;'))
    assert.ok(!html.includes('<script>alert'))
    assert.ok(html.includes('Acme &amp; Co'))
    assert.ok(html.includes('$109.09'))
    assert.ok(html.includes('by 31 October 2026'))
    assert.ok(html.includes(site.legalName))
    if (!site.abn) assert.ok(!html.includes('ABN'))
    const body = html.replace(/<style>[\s\S]*?<\/style>/, '')
    assert.ok(!body.includes(String.fromCharCode(0x2013)) && !body.includes(String.fromCharCode(0x2014)))
  })
  test('statement lists open items, overdue marks and payments', () => {
    const statement: AccountStatement = {
      linked: true,
      balance: { due: 500, overdue: 200, count: 2 },
      open: [
        { kind: 'ticket', reference: 'T-1', date: '2026-09-01T00:00:00Z', dueDate: '2026-09-30', total: 200, paid: 0, owing: 200, overdue: true },
        { kind: 'order', reference: 'ST-2', date: '2026-10-01T00:00:00Z', dueDate: '2026-10-31', total: 300, paid: 0, owing: 300, overdue: false },
      ],
      payments: [{ ref: 'PAY-1', date: '2026-10-02T00:00:00Z', amount: 50, method: 'cash', allocations: [{ ticketRef: 'T-1', amount: 50 }] }],
    }
    const html = statementHtml(statement, me, new Date('2026-10-23T00:00:00Z'))
    assert.ok(html.includes('(overdue)'))
    assert.ok(html.includes('$500.00'))
    assert.ok(html.includes('PAY-1'))
    assert.ok(html.includes('23 October 2026'))
  })
})
