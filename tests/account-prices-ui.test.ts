/**
 * Account prices in the browser: which price a screen shows, that a signed-in cart totals to exactly what the
 * server charges, that a guest's totals did not move, the account price store, and the pay-on-account helpers.
 *
 * Every account price here is made up for the test; the catalogue's own public shelf prices only build the carts.
 * No network and no real model: `fetch` is a stub where a call is needed.
 *   npx tsx --test tests/account-prices-ui.test.ts
 */
import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import { priceOrder } from '../api/_lib/pricing.js'
import { site } from '../src/config/site.js'
import { accountPriceList, type AccountPricing } from '../src/lib/account-pricing.js'
import { accountLine, isBuyable, priceView, volumeUnit } from '../src/lib/account-price-display.js'
import {
  AccountOrderError,
  accountOrderBody,
  addDaysIso,
  canPayOnAccount,
  creditView,
  dueDateFor,
  formatDueDate,
  placeAccountOrder,
  sydneyToday,
} from '../src/lib/account-checkout.js'
import { parseAuAddress } from '../src/lib/account-address.js'
import { effectivePrice, hasPrice, priceBreakFor, PRICE_BREAKS, productById, products } from '../src/data/products.js'
import type { CartLine, Product } from '../src/data/types.js'
import { dropUnbuyableLines, cartTotals, useCart, type CartTotals } from '../src/store/cart.js'
import { parsePricesReply, useAccountPrices } from '../src/store/account-prices.js'
import { useAccount } from '../src/store/account.js'

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const cents = (n: number) => Math.round(n * 100)

/** A small deterministic random source, so a failure can be reproduced. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const lineFor = (product: Product, quantity: number): CartLine => ({
  id: product.id,
  sku: product.sku,
  brand: product.brand,
  model: product.model,
  size: product.size,
  price: effectivePrice(product) ?? 0,
  tread: product.tread,
  quantity,
})

type State = Parameters<typeof cartTotals>[0]

/** The guest cart arithmetic exactly as src/store/cart.ts had it before customer accounts (a verbatim copy). */
function legacyCartTotals(state: State) {
  const round = (value: number) => Math.round(value * 100) / 100
  const itemCount = state.lines.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = state.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  const band = priceBreakFor(itemCount)
  const volumeDiscountRate = band?.discount ?? 0
  const volumeDiscount = round(subtotal * volumeDiscountRate)
  const afterVolume = subtotal - volumeDiscount
  const promoDiscount = state.promo ? round(afterVolume * state.promo.percentOff) : 0
  const fittingTotal = state.fulfilment === 'pickup' ? state.fittingTyres * site.commerce.fittingFeePerTyre : 0
  const total = round(afterVolume - promoDiscount + fittingTotal)
  const nextBreak = PRICE_BREAKS.find((b) => itemCount < b.min) ?? null
  return {
    itemCount,
    lineCount: state.lines.length,
    subtotal: round(subtotal),
    volumeDiscount,
    volumeDiscountRate,
    volumeLabel: band?.label ?? null,
    promoDiscount,
    fittingTotal,
    total,
    gst: round(total - total / (1 + site.commerce.gstRate)),
    nextBreak: nextBreak ? { ...nextBreak } : null,
    tyresToNextBreak: nextBreak ? nextBreak.min - itemCount : 0,
  }
}

const PROMOS = [
  null,
  { code: 'FLEET10', percentOff: 0.1, description: '10% off for fleet operators' },
  { code: 'WELCOME5', percentOff: 0.05, description: '5% off your first order' },
] as const

/** A random cart of 1 to 6 different tyres, quantities the server will accept (never above stock). */
function randomCart(next: () => number, pool: Product[]) {
  const count = 1 + Math.floor(next() * 6)
  const chosen = new Map<string, Product>()
  while (chosen.size < count) {
    const p = pool[Math.floor(next() * pool.length)]!
    chosen.set(p.id, p)
  }
  const lines = [...chosen.values()].map((p) => {
    const limit = p.stock > 0 ? Math.min(p.stock, 45) : 45
    return lineFor(p, 1 + Math.floor(next() * limit))
  })
  const total = lines.reduce((sum, l) => sum + l.quantity, 0)
  const fulfilment = next() < 0.5 ? ('pickup' as const) : ('delivery' as const)
  const fittingTyres = fulfilment === 'pickup' ? Math.floor(next() * (total + 1)) : 0
  const promo = PROMOS[Math.floor(next() * PROMOS.length)] ?? null
  return { lines, fulfilment, fittingTyres, promo: promo ? { ...promo } : null }
}

const priced = products.filter(hasPrice)
const quoteOnly = products.filter((p) => !hasPrice(p))

/** A made-up account context: some % and a few special prices (below, near and above the shelf price). */
function randomAccount(next: () => number): AccountPricing {
  const level = (['customer', 'bulk', 'wholesaler'] as const)[Math.floor(next() * 3)]!
  const discountPct = next() < 0.3 ? 0 : Math.round(next() * 40 * 100) / 100
  const special: Record<string, number> = {}
  for (let i = 0; i < 6; i++) {
    const p = products[Math.floor(next() * products.length)]!
    const base = p.price ?? 500
    special[p.id] = Math.round(base * (0.5 + next() * 0.6) * 100) / 100 // 50% to 110% of the shelf price
  }
  return { level, discountPct, special }
}

/** What the browser is told: the server's list for the account, parsed the way the store parses it. */
function browserContext(account: AccountPricing): AccountPricing {
  const list = accountPriceList(products, account)
  const reply = JSON.parse(JSON.stringify({ prices: list, discountPct: account.discountPct, level: account.level }))
  const parsed = parsePricesReply(reply)
  assert.ok(parsed, 'the reply parses')
  return parsed.pricing
}

/* ================================================================ display */

describe('which price a screen shows', () => {
  const tyre = priced.find((p) => p.discountPrice == null)!
  const shelf = effectivePrice(tyre)

  test('a guest sees exactly the shelf price', () => {
    for (const prices of [null, undefined, {}]) {
      const v = priceView(tyre, prices)
      assert.deepEqual(v, { current: shelf, retail: shelf, yours: false, buyable: true })
    }
  })

  test('an account price below the shelf price leads, with the usual price kept for the strike-through', () => {
    const v = priceView(tyre, { [tyre.id]: { unit: shelf - 10, basis: 'account' } })
    assert.deepEqual(v, { current: shelf - 10, retail: shelf, yours: true, buyable: true })
  })

  test('a price that does not beat the shelf price changes nothing', () => {
    for (const unit of [shelf, shelf + 5]) {
      const v = priceView(tyre, { [tyre.id]: { unit, basis: 'account' } })
      assert.equal(v.yours, false)
      assert.equal(v.current, shelf)
    }
  })

  test('the usual price is the sale price when the tyre is on sale', () => {
    const sale = priced.find((p) => p.discountPrice != null)
    if (!sale) return
    const retail = effectivePrice(sale)
    const v = priceView(sale, { [sale.id]: { unit: retail - 1, basis: 'account' } })
    assert.equal(v.retail, retail)
    assert.equal(v.yours, true)
  })

  test('another tyre\'s price never leaks onto this one', () => {
    const other = priced.find((p) => p.id !== tyre.id)!
    const v = priceView(tyre, { [other.id]: { unit: 1, basis: 'account' } })
    assert.equal(v.yours, false)
  })

  test('nonsense prices are ignored, including ids that are object keys', () => {
    for (const unit of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, '12' as unknown as number]) {
      assert.equal(priceView(tyre, { [tyre.id]: { unit, basis: 'account' } }).yours, false)
    }
    const odd = { id: 'toString', price: 100 } as Product
    assert.equal(priceView(odd, {}).yours, false)
    assert.equal(isBuyable({ id: 'constructor', price: null }, {}), false)
  })

  test('a quote-only tyre becomes buyable only with the account\'s own price for it', () => {
    const poa = quoteOnly[0]
    assert.ok(poa, 'the catalogue has a price-on-application tyre')
    assert.deepEqual(priceView(poa, null), { current: null, retail: null, yours: false, buyable: false })
    assert.equal(isBuyable(poa, {}), false)
    const mine = priceView(poa, { [poa.id]: { unit: 321.5, basis: 'account' } })
    assert.deepEqual(mine, { current: 321.5, retail: null, yours: true, buyable: true })
    assert.equal(isBuyable(poa, { [poa.id]: { unit: 321.5 } }), true)
    // Another tyre's price does not unlock it.
    assert.equal(isBuyable(poa, { [tyre.id]: { unit: 10 } }), false)
  })

  test('the volume ladder: a guest keeps price x (1 - rate); an account gets the lower of its price and the band price', () => {
    const guest = priceView(tyre, null)
    for (const b of PRICE_BREAKS) assert.equal(volumeUnit(guest, b.discount), shelf * (1 - b.discount))

    const mine = priceView(tyre, { [tyre.id]: { unit: shelf * 0.9, basis: 'account' } })
    for (const b of PRICE_BREAKS) {
      const band = Math.round(shelf * (1 - b.discount) * 100) / 100
      assert.equal(volumeUnit(mine, b.discount), Math.min(shelf * 0.9, band))
    }
    // A quote-only tyre has no volume break to apply: it is the account price at every band.
    const poa = quoteOnly[0]!
    const poaMine = priceView(poa, { [poa.id]: { unit: 400, basis: 'account' } })
    assert.equal(volumeUnit(poaMine, 0.1), 400)
    assert.equal(volumeUnit(priceView(poa, null), 0.1), null)
  })

  test('a cart line shows the account price only when the account won that line', () => {
    const totals = {
      lineUnits: {
        a: { unit: 90, retailUnit: 100, basis: 'account' },
        b: { unit: 100, retailUnit: 100, basis: 'volume' },
        c: { unit: 80, retailUnit: null, basis: 'account' },
      },
    }
    assert.deepEqual(accountLine(totals, 'a'), { unit: 90, retail: 100 })
    assert.equal(accountLine(totals, 'b'), null)
    assert.deepEqual(accountLine(totals, 'c'), { unit: 80, retail: null })
    assert.equal(accountLine(totals, 'zzz'), null)
    assert.equal(accountLine(totals, 'toString'), null)
    assert.equal(accountLine({ lineUnits: {} }, 'a'), null)
  })
})

/* ================================================================ the store's reply parser */

describe('reading the prices reply', () => {
  test('a good reply becomes the price map and the pricing context', () => {
    const parsed = parsePricesReply({ prices: { a: { unit: 90, basis: 'account' }, b: { unit: 45.5, basis: 'account' } }, discountPct: 12.5, level: 'wholesaler' })
    assert.ok(parsed)
    // The agreed % is already inside the unit prices; the context never carries it (see parsePricesReply).
    assert.deepEqual(parsed.pricing, { level: 'wholesaler', discountPct: 0, special: { a: 90, b: 45.5 } })
    assert.equal(parsed.prices.a?.unit, 90)
  })

  test('anything unexpected is refused, never guessed', () => {
    for (const bad of [null, 'x', 5, {}, { prices: {}, level: 'admin' }, { prices: null, level: 'customer' }, { level: 'customer' }]) {
      assert.equal(parsePricesReply(bad), null)
    }
  })

  test('bad entries are skipped', () => {
    const parsed = parsePricesReply({ prices: { a: { unit: -1 }, b: { unit: 'x' }, c: null, d: { unit: 10 } }, level: 'customer' })
    assert.ok(parsed)
    assert.deepEqual(Object.keys(parsed.prices), ['d'])
    assert.equal(parsed.pricing.discountPct, 0)
  })
})

/* ================================================================ totals */

describe('guest cart totals did not move', () => {
  test('600 random carts: every field equals the pre-accounts arithmetic, with and without an empty account context', () => {
    const next = rng(20261023)
    for (let i = 0; i < 600; i++) {
      const state = randomCart(next, priced)
      const was = legacyCartTotals(state)
      const now = cartTotals(state)
      const { accountSaving, lineUnits, ...rest } = now
      assert.deepEqual(rest, was, `cart ${i}`)
      assert.equal(accountSaving, 0)
      assert.deepEqual(lineUnits, {})
      assert.deepEqual(cartTotals(state, null), now)
    }
  })

  test('an empty cart', () => {
    const state: State = { lines: [], fulfilment: 'delivery', fittingTyres: 0, promo: null }
    const { accountSaving, lineUnits, ...rest } = cartTotals(state)
    assert.deepEqual(rest, legacyCartTotals(state))
    assert.equal(accountSaving, 0)
    assert.deepEqual(lineUnits, {})
  })
})

describe('a signed-in cart totals to exactly what the server charges', () => {
  test('800 random carts and accounts: every money figure equals priceOrder with the full account context', () => {
    const next = rng(77123)
    let compared = 0
    let atAccountPrice = 0
    for (let i = 0; i < 800; i++) {
      // Mostly shelf-priced tyres; every so often a quote-only tyre the account has its own price for.
      const pool = i % 5 === 0 ? [...priced, ...quoteOnly] : priced
      const account = randomAccount(next)
      const state = randomCart(next, pool)
      // A quote-only tyre is only in the cart when the account has a price for it, as in the shop.
      state.lines = state.lines.filter((l) => hasPrice(productById.get(l.id)!) || account.special[l.id] != null)
      if (!state.lines.length) continue
      const total = state.lines.reduce((s, l) => s + l.quantity, 0)
      state.fittingTyres = Math.min(state.fittingTyres, total)

      const server = priceOrder(
        {
          lines: state.lines.map((l) => ({ id: l.id, quantity: l.quantity })),
          fulfilment: state.fulfilment,
          fittingTyres: state.fittingTyres,
          promoCode: state.promo?.code,
        },
        {},
        account,
      )
      if (server.errors.length) continue

      const browser = cartTotals(state, browserContext(account))
      assert.equal(cents(browser.total), cents(server.total), `cart ${i}: total`)
      assert.equal(cents(browser.subtotal), cents(server.subtotal), `cart ${i}: subtotal`)
      assert.equal(cents(browser.volumeDiscount), cents(server.volumeDiscount), `cart ${i}: volume`)
      assert.equal(cents(browser.fittingTotal), cents(server.fittingTotal), `cart ${i}: fitting`)
      assert.equal(cents(browser.gst), cents(server.gst), `cart ${i}: gst`)
      assert.equal(cents(browser.accountSaving), cents(server.accountSaving), `cart ${i}: saving`)
      // The promo only counts when the server also applied it (it drops it when no line is at the normal price).
      if (server.promoCode) assert.equal(cents(browser.promoDiscount), cents(server.promoDiscount), `cart ${i}: promo`)
      else assert.equal(browser.promoDiscount, 0)
      for (const line of server.lines) {
        const mine = browser.lineUnits[line.id]!
        assert.equal(mine.basis, line.basis, `cart ${i}: basis of ${line.id}`)
        assert.equal(cents(mine.unit), cents(line.unitPrice), `cart ${i}: unit of ${line.id}`)
      }
      compared++
      if (server.lines.some((l) => l.basis === 'account')) atAccountPrice++
    }
    assert.ok(compared > 500, `compared ${compared} carts`)
    assert.ok(atAccountPrice > 150, `${atAccountPrice} carts had an account-priced line`)
  })

  test('an account with nothing better than the shelf price is charged the guest total', () => {
    const next = rng(9)
    const account: AccountPricing = { level: 'customer', discountPct: 0, special: {} }
    for (let i = 0; i < 100; i++) {
      const state = randomCart(next, priced)
      const mine = cartTotals(state, browserContext(account))
      assert.equal(cents(mine.total), cents(legacyCartTotals(state).total))
      assert.equal(mine.accountSaving, 0)
    }
  })

  test('a small worked example, by hand', () => {
    const tyre = priced.find((p) => p.discountPrice == null && (p.price ?? 0) >= 100)!
    const shelf = tyre.price!
    const account: AccountPricing = { level: 'wholesaler', discountPct: 0, special: { [tyre.id]: Math.round(shelf * 0.8 * 100) / 100 } }
    const state: State = { lines: [lineFor(tyre, 2)], fulfilment: 'delivery', fittingTyres: 0, promo: null }
    const t = cartTotals(state, browserContext(account))
    const unit = Math.round(shelf * 0.8 * 100) / 100
    assert.equal(t.lineUnits[tyre.id]?.unit, unit)
    assert.equal(t.total, Math.round(unit * 2 * 100) / 100)
    assert.equal(t.accountSaving, Math.round((shelf - unit) * 2 * 100) / 100)
    assert.equal(t.volumeDiscount, 0)
  })
})

/* ================================================================ the cart store and the prices store */

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  useCart.setState({ lines: [], fulfilment: 'delivery', fittingTyres: 0, promo: null })
  useAccountPrices.setState({ status: 'idle', prices: {}, pricing: null })
  useAccount.setState({ me: null, ready: false })
})

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

const ME = {
  id: 'acct_test',
  email: 'test@example.invalid',
  name: 'Test Customer',
  company: 'Test Co',
  phone: '0400000000',
  abn: '',
  address: '',
  level: 'wholesaler' as const,
  requestedLevel: null,
  status: 'active' as const,
  discountPct: 10,
  payLater: true,
  termsDays: 30,
  creditLimit: 5000,
  outstanding: 1200,
  emailVerified: true,
  payLaterReady: true,
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('the prices store follows the sign-in', () => {
  test('signing in loads the prices; signing out clears them and keeps nothing', async () => {
    const tyre = priced[0]!
    const calls: string[] = []
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)} ${init?.credentials}`)
      return json(200, { prices: { [tyre.id]: { unit: 12.34, basis: 'account' } }, discountPct: 10, level: 'wholesaler' })
    }) as typeof fetch

    useAccount.setState({ me: ME, ready: true })
    assert.equal(useAccountPrices.getState().status, 'loading')
    await tick()
    const loaded = useAccountPrices.getState()
    assert.equal(loaded.status, 'ready')
    assert.equal(loaded.prices[tyre.id]?.unit, 12.34)
    assert.deepEqual(loaded.pricing, { level: 'wholesaler', discountPct: 0, special: { [tyre.id]: 12.34 } })
    assert.deepEqual(calls, ['GET /api/account/prices same-origin'])

    useAccount.setState({ me: null, ready: true })
    assert.deepEqual(useAccountPrices.getState().prices, {})
    assert.equal(useAccountPrices.getState().pricing, null)
    assert.equal(useAccountPrices.getState().status, 'idle')
  })

  test('a failed load leaves no prices (never stale ones) and says so', async () => {
    globalThis.fetch = (async () => json(500, { error: 'down' })) as typeof fetch
    useAccount.setState({ me: ME, ready: true })
    await tick()
    const s = useAccountPrices.getState()
    assert.equal(s.status, 'error')
    assert.deepEqual(s.prices, {})
    assert.equal(s.pricing, null)
  })

  test('nothing is persisted: the store does not touch localStorage', async () => {
    const touched: string[] = []
    const store = { setItem: (k: string) => touched.push(k), getItem: () => null, removeItem: () => undefined }
    ;(globalThis as { localStorage?: unknown }).localStorage = store
    globalThis.fetch = (async () => json(200, { prices: {}, discountPct: 0, level: 'customer' })) as typeof fetch
    useAccount.setState({ me: { ...ME, id: 'acct_other' }, ready: true })
    await tick()
    delete (globalThis as { localStorage?: unknown }).localStorage
    assert.equal(touched.some((k) => /price/i.test(k)), false)
  })
})

describe('the cart and quote-only tyres', () => {
  const poa = quoteOnly[0]!

  test('a quote-only tyre cannot be added by a guest, and can by an account that has a price for it', () => {
    useCart.getState().add(poa, 2)
    assert.equal(useCart.getState().lines.length, 0)

    useAccountPrices.setState({ status: 'ready', prices: { [poa.id]: { unit: 250, basis: 'account' } } })
    useCart.getState().add(poa, 2)
    const lines = useCart.getState().lines
    assert.equal(lines.length, 1)
    assert.equal(lines[0]!.price, 250)
    assert.equal(lines[0]!.quantity, 2)
  })

  test('signing out (or a price taken away) removes the quote-only line, and leaves normal lines alone', () => {
    const normal = priced[0]!
    useAccountPrices.setState({ status: 'ready', prices: { [poa.id]: { unit: 250, basis: 'account' } } })
    useCart.getState().add(normal, 3)
    useCart.getState().add(poa, 2)
    assert.equal(useCart.getState().lines.length, 2)

    // Signed out and the sign-in check finished: no one has a price for the quote-only tyre.
    useAccountPrices.setState({ status: 'idle', prices: {}, pricing: null })
    useAccount.setState({ me: null, ready: true })
    dropUnbuyableLines()
    const kept = useCart.getState().lines
    assert.deepEqual(kept.map((l) => l.id), [normal.id])
    assert.equal(kept[0]!.quantity, 3)
  })

  test('while the sign-in check is still running nothing is dropped', () => {
    useAccountPrices.setState({ status: 'ready', prices: { [poa.id]: { unit: 250, basis: 'account' } } })
    useCart.getState().add(poa, 1)
    useAccountPrices.setState({ status: 'idle', prices: {}, pricing: null })
    useAccount.setState({ me: null, ready: false })
    dropUnbuyableLines()
    assert.equal(useCart.getState().lines.length, 1)
  })
})

/* ================================================================ pay on account */

describe('dates for the due date', () => {
  test('adding days rolls over months, years and leap days', () => {
    assert.equal(addDaysIso('2026-10-23', 30), '2026-11-22')
    assert.equal(addDaysIso('2026-12-20', 30), '2027-01-19')
    assert.equal(addDaysIso('2028-02-20', 10), '2028-03-01')
    assert.equal(addDaysIso('2027-02-20', 10), '2027-03-02')
    assert.equal(addDaysIso('2026-10-23', 0), '2026-10-23')
  })

  test('today is the Sydney day, not the UTC day', () => {
    // 14:30 UTC on 23 Oct is 01:30 on 24 Oct in Sydney (daylight saving, UTC+11).
    assert.equal(sydneyToday(new Date('2026-10-23T14:30:00Z')), '2026-10-24')
    assert.equal(sydneyToday(new Date('2026-10-23T12:30:00Z')), '2026-10-23')
    // Winter, UTC+10.
    assert.equal(sydneyToday(new Date('2026-07-01T14:30:00Z')), '2026-07-02')
  })

  test('the due date is today plus the terms; a bad term is today', () => {
    const now = new Date('2026-10-23T14:30:00Z')
    assert.equal(dueDateFor(30, now), '2026-11-23')
    assert.equal(dueDateFor(0, now), '2026-10-24')
    assert.equal(dueDateFor(-5, now), '2026-10-24')
    assert.equal(dueDateFor(Number.NaN, now), '2026-10-24')
  })

  test('the date reads in plain Australian English', () => {
    assert.equal(formatDueDate('2026-11-23'), 'Monday 23 November 2026')
    assert.equal(formatDueDate('nonsense'), 'nonsense')
  })
})

describe('credit and the request', () => {
  test('credit left is the limit less what is owed, in whole cents', () => {
    assert.deepEqual(creditView(5000, 1200, 800), { available: 3800, afterOrder: 3000, overLimit: false })
    assert.deepEqual(creditView(5000, 1200, 3800), { available: 3800, afterOrder: 0, overLimit: false })
    assert.deepEqual(creditView(5000, 1200, 3800.01), { available: 3800, afterOrder: 0, overLimit: true })
    assert.deepEqual(creditView(100, 250, 10), { available: 0, afterOrder: 0, overLimit: true })
    assert.deepEqual(creditView(0.3, 0.1, 0.2), { available: 0.2, afterOrder: 0, overLimit: false })
  })

  test('pay on account is offered only to an active account with pay later on', () => {
    assert.equal(canPayOnAccount(null), false)
    assert.equal(canPayOnAccount({ payLater: false, status: 'active' }), false)
    assert.equal(canPayOnAccount({ payLater: true, status: 'suspended' }), false)
    assert.equal(canPayOnAccount({ payLater: true, status: 'active' }), false, 'not ready (unlinked) until the server says so')
    assert.equal(canPayOnAccount({ payLater: true, status: 'active', payLaterReady: false }), false)
    assert.equal(canPayOnAccount({ payLater: true, status: 'active', payLaterReady: true }), true)
  })

  test('the order body: fitting only for pickup, address only for delivery', () => {
    const base = { idempotencyKey: 'abcdefgh-1234', lines: [{ id: 'x', quantity: 2 }], expectedTotal: 99.5 }
    const address = { line1: '1 Test St', suburb: 'Yennora', state: 'NSW', postcode: '2161' }
    assert.deepEqual(accountOrderBody({ ...base, fulfilment: 'delivery', fittingTyres: 3, address, notes: 'n' }), {
      idempotencyKey: 'abcdefgh-1234',
      lines: [{ id: 'x', quantity: 2 }],
      fulfilment: 'delivery',
      fittingTyres: 0,
      address,
      notes: 'n',
      expectedTotal: 99.5,
    })
    const pickup = accountOrderBody({ ...base, fulfilment: 'pickup', fittingTyres: 2, address })
    assert.equal(pickup.fittingTyres, 2)
    assert.equal('address' in pickup, false)
    assert.equal('notes' in pickup, false)
    assert.equal('promoCode' in pickup, false)
    assert.equal(accountOrderBody({ ...base, fulfilment: 'pickup', fittingTyres: 0, promoCode: 'WELCOME5' }).promoCode, 'WELCOME5', 'the promo in the cart goes with the order')
  })

  test('placing an order sends the cookie, the key and the shown total, and reads the reply', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      seen = { url: String(url), init: init! }
      return json(200, { ok: true, reference: 'SPT-TEST1', orderId: 'ord_1', total: 99.5, dueDate: '2026-11-23', outstanding: 1299.5, creditAvailable: 3700.5 })
    }) as typeof fetch
    const result = await placeAccountOrder({
      idempotencyKey: 'abcdefgh-1234',
      lines: [{ id: 'x', quantity: 2 }],
      fulfilment: 'pickup',
      fittingTyres: 0,
      expectedTotal: 99.5,
    })
    assert.deepEqual(result, { reference: 'SPT-TEST1', orderId: 'ord_1', total: 99.5, dueDate: '2026-11-23', outstanding: 1299.5, creditAvailable: 3700.5 })
    assert.equal(seen!.url, '/api/account/order')
    assert.equal(seen!.init.method, 'POST')
    assert.equal(seen!.init.credentials, 'same-origin')
    const body = JSON.parse(String(seen!.init.body))
    assert.equal(body.idempotencyKey, 'abcdefgh-1234')
    assert.equal(body.expectedTotal, 99.5)
  })

  test('the server\'s plain-words refusals reach the customer unchanged', async () => {
    const input = { idempotencyKey: 'abcdefgh-1234', lines: [{ id: 'x', quantity: 1 }], fulfilment: 'pickup' as const, fittingTyres: 0, expectedTotal: 10 }
    for (const message of [
      'This order is over your credit limit: $20.00 available.',
      'This order comes to $12.00 rather than the $10.00 shown, so nothing has been ordered. Review your cart.',
    ]) {
      globalThis.fetch = (async () => json(409, { error: message })) as typeof fetch
      await assert.rejects(
        placeAccountOrder(input),
        (error: unknown) => error instanceof AccountOrderError && error.message === message && error.status === 409,
      )
    }
    globalThis.fetch = (async () => json(502, null)) as typeof fetch
    await assert.rejects(placeAccountOrder(input), /Nothing has been charged/)
    globalThis.fetch = (async () => {
      throw new Error('offline')
    }) as typeof fetch
    await assert.rejects(placeAccountOrder(input), /could not reach the server/)
    globalThis.fetch = (async () => json(200, { ok: true })) as typeof fetch
    await assert.rejects(placeAccountOrder(input), /not understood/)
  })
})

describe('the address on an account', () => {
  test('a clear one-line address is split; anything else is left to be typed', () => {
    assert.deepEqual(parseAuAddress('12 Example Rd, Yennora NSW 2161'), { line1: '12 Example Rd', suburb: 'Yennora', state: 'NSW', postcode: '2161' })
    assert.deepEqual(parseAuAddress('Unit 3, 5 Test St, St Marys vic 3000'), { line1: 'Unit 3, 5 Test St', suburb: 'St Marys', state: 'VIC', postcode: '3000' })
    for (const bad of ['', '   ', 'Yennora', '12 Example Rd Yennora NSW 2161', '12 Example Rd, Yennora 2161', '12 Example Rd, Yennora XX 2161', null, undefined]) {
      assert.equal(parseAuAddress(bad), null)
    }
  })
})

/** Compile-time check that the totals type carries what the screens read. */
const _typeCheck = (t: CartTotals) => [t.accountSaving, t.lineUnits]
void _typeCheck
