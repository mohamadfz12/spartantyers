/**
 * Pure helpers behind the customer account screens in the admin.
 *   npx tsx --test tests/admin-accounts-ui.test.ts
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { products } from '../src/data/products.js'
import type { SalesByChannel, SalesPart, StaffAccount } from '../src/lib/admin-accounts-api.js'
import {
  addDays,
  availableCredit,
  businessName,
  channelRows,
  dollars,
  filterAccounts,
  filterCounts,
  isOverdue,
  orderChannelOf,
  parseDollars,
  parsePercent,
  parsePrice,
  parseTermsDays,
  payLaterLabel,
  percentLabel,
  priceChanges,
  priceRow,
  salesRange,
  searchProducts,
  sortAccounts,
  termsLabel,
  ticketChannelOf,
} from '../src/lib/admin-accounts-ui.js'

const account = (over: Partial<StaffAccount> = {}): StaffAccount => ({
  id: 'ca_1',
  email: 'buyer@example.test',
  name: 'Sam Buyer',
  company: 'Example Haulage',
  phone: '0400 000 000',
  abn: '12 345 678 901',
  address: '',
  level: 'customer',
  requestedLevel: null,
  status: 'active',
  emailVerified: true,
  discountPct: 0,
  payLater: false,
  termsDays: 30,
  creditLimit: 0,
  outstanding: 0,
  posCustomerId: null,
  notes: '',
  createdBy: '',
  approvedBy: null,
  approvedAt: null,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  hasPassword: true,
  ...over,
})

const part = (count: number, total: number, owing = 0): SalesPart => ({
  count,
  total,
  paid: total - owing,
  owing,
  onAccount: { count: 0, total: 0 },
})

describe('wording and money', () => {
  test('business name puts the company first', () => {
    assert.equal(businessName(account()), 'Example Haulage')
    assert.equal(businessName(account({ company: '' })), 'Sam Buyer')
    assert.equal(businessName(account({ company: '', name: '' })), 'buyer@example.test')
  })
  test('money and percent formats', () => {
    assert.equal(dollars(1234.5), '$1,234.50')
    assert.equal(dollars(0), '$0.00')
    assert.equal(percentLabel(15), '15%')
    assert.equal(percentLabel(7.5), '7.5%')
    assert.equal(termsLabel(0), 'Due on the day')
    assert.equal(termsLabel(30), '30 days')
  })
  test('pay later and available credit', () => {
    assert.equal(payLaterLabel(account()), 'Off')
    assert.equal(payLaterLabel(account({ payLater: true, termsDays: 30, creditLimit: 5000 })), '30 days, $5,000.00')
    assert.equal(availableCredit({ creditLimit: 5000, outstanding: 1200.25 }), 3799.75)
    assert.equal(availableCredit({ creditLimit: 100, outstanding: 250 }), 0)
  })
  test('typed numbers are parsed strictly', () => {
    assert.equal(parseDollars('$5,000'), 5000)
    assert.equal(parseDollars(''), null)
    assert.equal(parseDollars('-1'), null)
    assert.equal(parseDollars('abc'), null)
    assert.equal(parseTermsDays('30'), 30)
    assert.equal(parseTermsDays('121'), null)
    assert.equal(parseTermsDays('1.5'), null)
    assert.equal(parsePercent(''), 0)
    assert.equal(parsePercent('15%'), 15)
    assert.equal(parsePercent('61'), null)
    assert.equal(parsePrice('0'), null)
    assert.equal(parsePrice('100001'), null)
    assert.equal(parsePrice('199.999'), 200)
  })
})

describe('the list', () => {
  const list = [
    account({ id: 'a', company: 'Alpha Tyres', email: 'a@example.test', level: 'wholesaler' }),
    account({ id: 'b', company: 'Beta Fleet', email: 'b@example.test', level: 'bulk', requestedLevel: 'wholesaler', outstanding: 500 }),
    account({ id: 'c', company: '', name: 'Cara', email: 'c@example.test', status: 'suspended', phone: '0411 222 333', abn: '' }),
    account({ id: 'd', company: 'Delta', email: 'd@example.test', requestedLevel: 'bulk' }),
  ]
  test('filters', () => {
    assert.deepEqual(filterAccounts(list, 'pending', '').map((a) => a.id), ['b', 'd'])
    assert.deepEqual(filterAccounts(list, 'wholesaler', '').map((a) => a.id), ['a'])
    assert.deepEqual(filterAccounts(list, 'suspended', '').map((a) => a.id), ['c'])
    assert.equal(filterAccounts(list, 'all', '').length, 4)
  })
  test('a request for the level already held is not waiting', () => {
    assert.equal(filterAccounts([account({ level: 'bulk', requestedLevel: 'bulk' as never })], 'pending', '').length, 0)
  })
  test('search covers name, company, email, phone and ABN, with or without spaces', () => {
    assert.deepEqual(filterAccounts(list, 'all', 'beta').map((a) => a.id), ['b'])
    assert.deepEqual(filterAccounts(list, 'all', 'CARA').map((a) => a.id), ['c'])
    assert.deepEqual(filterAccounts(list, 'all', 'd@example').map((a) => a.id), ['d'])
    assert.deepEqual(filterAccounts(list, 'all', '0411222333').map((a) => a.id), ['c'])
    assert.deepEqual(filterAccounts(list, 'all', '12345678901').map((a) => a.id), ['a', 'b', 'd'])
    assert.equal(filterAccounts(list, 'all', 'zzz').length, 0)
  })
  test('counts per filter', () => {
    const c = filterCounts(list)
    assert.equal(c.all, 4)
    assert.equal(c.pending, 2)
    assert.equal(c.suspended, 1)
    assert.equal(c.bulk, 1)
  })
  test('sorting is stable and respects direction', () => {
    assert.deepEqual(sortAccounts(list, 'business', 'asc').map((a) => a.id), ['a', 'b', 'c', 'd'])
    assert.equal(sortAccounts(list, 'owing', 'desc')[0]!.id, 'b')
    assert.equal(sortAccounts(list, 'level', 'desc')[0]!.id, 'a')
    assert.equal(list[0]!.id, 'a')
  })
})

describe('special prices', () => {
  const tyre = products.find((p) => p.price != null && p.discountPrice == null) ?? products.find((p) => p.price != null)!
  const retail = tyre.discountPrice ?? tyre.price!

  test('the agreed % alone', () => {
    const row = priceRow(tyre, 10, null)
    assert.equal(row.retail, retail)
    assert.equal(row.pays, 'percent')
    assert.ok(row.accountPrice !== null && row.accountPrice < retail)
  })
  test('a special price wins over the %', () => {
    const special = Math.round(retail * 0.5 * 100) / 100
    const row = priceRow(tyre, 10, special)
    assert.equal(row.pays, 'special')
    assert.equal(row.accountPrice, special)
  })
  test('a special price above retail is not used', () => {
    const row = priceRow(tyre, 0, retail + 50)
    assert.equal(row.pays, 'retail')
    assert.equal(row.accountPrice, null)
  })
  test('no % and no special price means the normal price', () => {
    assert.equal(priceRow(tyre, 0, null).pays, 'retail')
  })
  test('only real changes are sent', () => {
    const saved = [
      { productId: 'a', price: 100 },
      { productId: 'b', price: 200 },
    ]
    assert.deepEqual(priceChanges(saved, { a: 100, b: null, c: 50 }), [
      { productId: 'b', price: null },
      { productId: 'c', price: 50 },
    ])
    assert.deepEqual(priceChanges(saved, { a: 100, b: 200 }), [])
  })
  test('catalogue search needs every word and caps results', () => {
    const first = products[0]!
    const hits = searchProducts(products, `${first.brand} ${first.size}`, 5)
    assert.ok(hits.length >= 1 && hits.length <= 5)
    assert.deepEqual(searchProducts(products, '   ', 5), [])
    assert.deepEqual(searchProducts(products, 'qqqqzzzz', 5), [])
  })
})

describe('dates and sale labels', () => {
  test('overdue compares calendar days', () => {
    assert.equal(isOverdue('2026-10-01', '2026-10-23'), true)
    assert.equal(isOverdue('2026-10-23', '2026-10-23'), false)
    assert.equal(isOverdue(null, '2026-10-23'), false)
  })
  test('adding days crosses months and years', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01')
    assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  })
  test('old records are labelled by the tyre count', () => {
    assert.equal(orderChannelOf({ lines: [{ quantity: 4 }] }), 'retail')
    assert.equal(orderChannelOf({ lines: [{ quantity: 12 }, { quantity: 10 }] }), 'bulk')
    assert.equal(orderChannelOf({ channel: 'wholesale', lines: [{ quantity: 1 }] }), 'wholesale')
    assert.equal(ticketChannelOf({ lines: [{ source: 'tyre', qty: 25 }, { source: 'service', qty: 40 }] }), 'bulk')
    assert.equal(ticketChannelOf({ lines: [{ source: 'service', qty: 40 }] }), 'retail')
    assert.equal(ticketChannelOf({ channel: 'wholesale', lines: [] }), 'wholesale')
  })
})

describe('sales by type', () => {
  const blank = () => ({ website: part(0, 0), till: part(0, 0), all: part(0, 0) })
  const data: SalesByChannel = {
    from: '2026-10-01',
    to: '2026-10-23',
    channels: {
      retail: { website: part(2, 600), till: part(2, 400), all: part(4, 1000) },
      bulk: { website: part(1, 250), till: part(0, 0), all: part(1, 250) },
      wholesale: { website: part(1, 250, 100), till: part(0, 0), all: part(1, 250, 100) },
    },
    total: blank(),
  }
  test('rows carry average, share and bar length', () => {
    const rows = channelRows(data, 'all')
    assert.deepEqual(rows.map((r) => r.label), ['Retail', 'Bulk', 'Wholesale'])
    assert.equal(rows[0]!.average, 250)
    assert.equal(rows[0]!.share, 66.7)
    assert.equal(rows[0]!.bar, 100)
    assert.equal(rows[1]!.bar, 25)
    assert.equal(rows[2]!.owing, 100)
  })
  test('a source with no sales has empty bars, not NaN', () => {
    const rows = channelRows(data, 'till')
    assert.equal(rows[1]!.share, 0)
    assert.equal(rows[1]!.bar, 0)
    assert.equal(rows[1]!.average, 0)
    assert.equal(channelRows({ ...data, channels: { retail: blank(), bulk: blank(), wholesale: blank() } }, 'all')[0]!.bar, 0)
  })
  test('the range is cut to what the server allows', () => {
    assert.deepEqual(salesRange({ from: '2026-10-01', to: '2026-10-23' }, '2026-10-23'), { from: '2026-10-01', to: '2026-10-23', clamped: false })
    const open = salesRange({ from: '', to: '' }, '2026-10-23')
    assert.equal(open.to, '2026-10-23')
    assert.equal(open.clamped, true)
    assert.equal(open.from, addDays('2026-10-23', -399))
  })
})
