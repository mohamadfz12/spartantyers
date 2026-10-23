/**
 * The one pricing rule for customer accounts (src/lib/account-pricing.ts) and the server's use of it
 * (priceOrder): retail, volume, account %, special prices, the lower of the two per line, price on
 * application, promo codes, rounding, GST, fitting, mixed carts, the sale labels, and that a guest is
 * priced exactly as the website always has.
 *
 * Every price here is a made-up test value (the catalogue's own public prices are only used to build
 * carts); nothing is a real agreed price.
 *   npx tsx --test tests/account-pricing.test.ts
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { priceOrder } from '../api/_lib/pricing.js'
import { resolvePromo } from '../api/_lib/promos.js'
import { site } from '../src/config/site.js'
import { accountPriceList, accountUnitPrice, bandUnitPrice, priceCart, round2, saleChannel, type AccountPricing, type PricingProduct } from '../src/lib/account-pricing.js'
import { effectivePrice, getProduct, PRICE_BREAKS, priceBreakFor, pricedProducts, products } from '../src/data/products.js'
import { cartTotals } from '../src/store/cart.js'

const A: PricingProduct = { id: 'a', price: 200 }
const C: PricingProduct = { id: 'c', price: 100 }
const SALE: PricingProduct = { id: 'b', price: 100, discountPrice: 90 }
const POA: PricingProduct = { id: 'p', price: null }

const acct = (over: Partial<AccountPricing> = {}): AccountPricing => ({ level: 'wholesaler', discountPct: 0, special: {}, ...over })
const cart = (items: Array<[PricingProduct, number]>, account: AccountPricing | null = null, extra: { promo?: number; pickup?: boolean; fitting?: number } = {}) =>
  priceCart(items.map(([product, quantity]) => ({ product, quantity })), {
    account,
    fulfilment: extra.pickup ? 'pickup' : 'delivery',
    fittingTyres: extra.fitting ?? 0,
    promoPercentOff: extra.promo ?? 0,
  })

/* ================================================================ the rule */

describe('the rule: one line at a time', () => {
  test('retail: a guest pays the shelf price', () => {
    const r = cart([[A, 1]])
    assert.deepEqual(r.lines[0], { id: 'a', quantity: 1, unit: 200, retailUnit: 200, basis: 'retail', lineTotal: 200, accountSaving: 0 })
    assert.equal(r.total, 200)
    assert.equal(r.channel, 'retail')
  })

  test('the shelf price is the sale price when there is one', () => {
    assert.equal(cart([[SALE, 1]]).total, 90)
  })

  test('volume: the break applies to the whole order and the line says so', () => {
    const r = cart([[A, 4]])
    assert.equal(r.volumeDiscountRate, 0.03)
    assert.equal(r.subtotal, 800)
    assert.equal(r.volumeDiscount, 24)
    assert.equal(r.total, 776)
    assert.equal(r.lines[0]!.basis, 'volume')
    assert.equal(r.volumeLabel, '4+ tyres')
  })

  test('account %: the agreed percentage comes off the RRP', () => {
    const r = cart([[A, 1]], acct({ discountPct: 10 }))
    assert.equal(r.lines[0]!.unit, 180)
    assert.equal(r.lines[0]!.basis, 'account')
    assert.equal(r.lines[0]!.accountSaving, 20)
    assert.equal(r.accountSaving, 20)
    assert.equal(r.total, 180)
  })

  test('a special price wins over the %', () => {
    const r = cart([[A, 1]], acct({ discountPct: 10, special: { a: 150 } }))
    assert.equal(r.lines[0]!.unit, 150)
    assert.equal(r.total, 150)
    // ...even when the special price is worse than the % would have been.
    assert.equal(cart([[A, 1]], acct({ discountPct: 30, special: { a: 190 } })).total, 190)
  })

  test('special vs volume: the lower wins, per line, and never both', () => {
    // 40 tyres: the 11% break makes the shelf price 178.
    const worse = cart([[A, 40]], acct({ special: { a: 180 } }))
    assert.equal(worse.lines[0]!.basis, 'volume', 'the break is cheaper than 180')
    assert.equal(worse.total, 7120)
    assert.equal(worse.accountSaving, 0)

    const better = cart([[A, 40]], acct({ special: { a: 170 } }))
    assert.equal(better.lines[0]!.basis, 'account')
    assert.equal(better.lines[0]!.unit, 170)
    assert.equal(better.volumeDiscount, 0, 'no volume break on top of the account price')
    assert.equal(better.total, 6800)
    assert.equal(better.accountSaving, 1200)

    // Exactly equal is the normal price (the account adds nothing).
    assert.equal(cart([[A, 40]], acct({ special: { a: 178 } })).lines[0]!.basis, 'volume')
  })

  test('mixed cart: one line at its account price, the other at retail with the break', () => {
    const r = cart([[A, 2], [C, 2]], acct({ special: { a: 150 } }))
    assert.deepEqual(r.lines.map((l) => l.basis), ['account', 'volume'])
    assert.equal(r.subtotal, 500, '2 x 150 + 2 x 100')
    assert.equal(r.volumeDiscount, 6, '3% of the 200 left at the normal price only')
    assert.equal(r.total, 494)
    assert.equal(r.channel, 'wholesale')
  })

  test('an account price is never above the shelf price', () => {
    assert.equal(accountUnitPrice(A, acct({ special: { a: 500 } })), 200)
    const r = cart([[A, 1]], acct({ special: { a: 500 } }))
    assert.equal(r.lines[0]!.basis, 'retail')
    assert.equal(r.total, 200)
  })

  test('the % is taken off the RRP, but never ends above a sale price', () => {
    assert.equal(accountUnitPrice(SALE, acct({ discountPct: 5 })), 90, '95 is capped at the sale price')
    assert.equal(cart([[SALE, 1]], acct({ discountPct: 5 })).lines[0]!.basis, 'retail')
    assert.equal(accountUnitPrice(SALE, acct({ discountPct: 20 })), 80)
    assert.equal(cart([[SALE, 1]], acct({ discountPct: 20 })).total, 80)
  })

  test('rounding: half a cent goes up, in whole cents, whatever the float says', () => {
    assert.equal(accountUnitPrice({ id: 'x', price: 100.1 }, acct({ discountPct: 5 })), 95.1, '95.095')
    assert.equal(accountUnitPrice({ id: 'x', price: 33.33 }, acct({ discountPct: 12.5 })), 29.16, '29.16375')
    assert.equal(bandUnitPrice(33.33, 0.03), 32.33)
  })

  test('GST is the total over 11', () => {
    const r = cart([[A, 4]])
    assert.equal(r.gst, round2(776 - 776 / 1.1))
    assert.equal(r.gst, 70.55)
    assert.equal(site.commerce.gstRate, 0.1)
  })

  test('fitting is pickup only and not discounted', () => {
    assert.equal(cart([[A, 1]], null, { pickup: true, fitting: 1 }).total, 270)
    assert.equal(cart([[A, 1]], acct({ discountPct: 10 }), { pickup: true, fitting: 1 }).total, 250)
    assert.equal(cart([[A, 1]], null, { pickup: false, fitting: 2 }).fittingTotal, 0)
  })

  test('promo codes touch only lines at the normal price, after the volume break', () => {
    // One line at an account price, one at retail, 2 tyres, 10% code.
    const r = cart([[A, 1], [C, 1]], acct({ special: { a: 150 } }), { promo: 0.1 })
    assert.equal(r.promoDiscount, 10, '10% of the 100 line only')
    assert.equal(r.total, 240)
    // Every line at an account price: nothing for the code to touch.
    const all = cart([[A, 1]], acct({ special: { a: 150 } }), { promo: 0.1 })
    assert.equal(all.promoDiscount, 0)
    assert.equal(all.total, 150)
    // A guest's code is on the amount after the volume break, as always.
    const guest = cart([[A, 4]], null, { promo: 0.1 })
    assert.equal(guest.promoDiscount, round2((800 - 24) * 0.1))
    assert.equal(guest.total, round2(776 - 77.6))
  })

  test('price on application stays quote-only, except at an account special price', () => {
    assert.throws(() => cart([[POA, 1]]), /has no price/)
    assert.throws(() => cart([[POA, 1]], acct({ discountPct: 10 })), /has no price/, 'a % cannot price a tyre that has no price')
    const r = cart([[POA, 3]], acct({ special: { p: 321.5 } }))
    assert.equal(r.lines[0]!.unit, 321.5)
    assert.equal(r.lines[0]!.retailUnit, null)
    assert.equal(r.lines[0]!.basis, 'account')
    assert.equal(r.total, 964.5)
    assert.equal(r.volumeDiscount, 0)
  })

  test('only the account\'s own product ids count (nothing inherited)', () => {
    const own = acct({ special: { a: 150 } })
    assert.equal(accountUnitPrice(C, own), null)
    assert.equal(accountUnitPrice({ id: 'constructor', price: 100 }, own), null)
    assert.equal(accountUnitPrice({ id: '__proto__', price: 100 }, own), null)
    assert.equal(accountUnitPrice(A, null), null)
    assert.equal(accountUnitPrice(A, acct({ special: { a: -5 } })), null, 'a bad stored price is ignored')
  })
})

describe('the price list for an account', () => {
  test('lists only where the account beats the shelf price, and POA tyres it can buy', () => {
    const list = accountPriceList([A, C, SALE, POA], acct({ discountPct: 10, special: { p: 400 } }))
    assert.deepEqual(list, {
      a: { unit: 180, basis: 'account' },
      c: { unit: 90, basis: 'account' },
      p: { unit: 400, basis: 'account' },
    })
    // SALE: 10% off 100 is 90, which is the sale price itself, so it does not beat it.
    assert.equal('b' in list, false)
    assert.deepEqual(accountPriceList([A], null), {})
    assert.deepEqual(accountPriceList([A, C], acct()), {})
  })
})

describe('sale labels', () => {
  test('Wholesaler is wholesale, Bulk is bulk, 20 or more tyres is bulk, the rest is retail', () => {
    assert.equal(site.commerce.bulkThreshold, 20)
    assert.equal(saleChannel(null, 1), 'retail')
    assert.equal(saleChannel(null, 19), 'retail')
    assert.equal(saleChannel(null, 20), 'bulk')
    assert.equal(saleChannel('customer', 1), 'retail')
    assert.equal(saleChannel('customer', 20), 'bulk')
    assert.equal(saleChannel('bulk', 1), 'bulk')
    assert.equal(saleChannel('wholesaler', 1), 'wholesale')
    assert.equal(saleChannel('wholesaler', 500), 'wholesale', 'a wholesaler is never relabelled by the size of the order')
    assert.equal(cart([[A, 19]]).channel, 'retail')
    assert.equal(cart([[A, 20]]).channel, 'bulk')
    assert.equal(cart([[A, 1]], acct({ level: 'bulk' })).channel, 'bulk')
  })
})

/* ============================================ the server: priceOrder, guests */

const STOCKED = Object.fromEntries(products.map((p) => [p.id, { stock: 10_000 }]))

/** The website's arithmetic exactly as it was before accounts, kept here as the yardstick. */
function legacy(lines: Array<{ unit: number; qty: number }>, promoFraction: number, pickup: boolean, fittingTyres: number) {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const itemCount = lines.reduce((s, l) => s + l.qty, 0)
  const subtotal = r2(lines.reduce((s, l) => s + l.unit * l.qty, 0))
  const rate = priceBreakFor(itemCount)?.discount ?? 0
  const volume = r2(subtotal * rate)
  const afterVolume = subtotal - volume
  const promo = promoFraction ? r2(afterVolume * promoFraction) : 0
  const fitting = pickup ? r2(Math.min(fittingTyres, itemCount) * site.commerce.fittingFeePerTyre) : 0
  const total = r2(afterVolume - promo + fitting)
  return { itemCount, subtotal, volume, promo, fitting, total, gst: r2(total - total / (1 + site.commerce.gstRate)) }
}

/** A small seeded generator, so a failure is the same failure next time. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function randomCart(next: () => number) {
  const k = 1 + Math.floor(next() * 5)
  const picked = new Set<number>()
  while (picked.size < k) picked.add(Math.floor(next() * pricedProducts.length))
  const quantities = [1, 2, 3, 4, 7, 8, 9, 19, 20, 21, 39, 40, 41]
  const lines = [...picked].map((i) => ({ id: pricedProducts[i]!.id, quantity: next() < 0.5 ? quantities[Math.floor(next() * quantities.length)]! : 1 + Math.floor(next() * 30) }))
  const code = ['', '', 'FLEET10', 'WELCOME5', 'BULK15'][Math.floor(next() * 5)]!
  const pickup = next() < 0.5
  return { lines, code, pickup, fitting: Math.floor(next() * 12) }
}

describe('priceOrder: a guest is priced exactly as before', () => {
  test('250 random carts match the long-standing arithmetic to the cent, line by line', () => {
    const next = rng(20261023)
    for (let n = 0; n < 250; n++) {
      const c = randomCart(next)
      const got = priceOrder({ lines: c.lines, fulfilment: c.pickup ? 'pickup' : 'delivery', fittingTyres: c.fitting, promoCode: c.code }, STOCKED)
      assert.deepEqual(got.errors, [], JSON.stringify(c))
      const itemCount = c.lines.reduce((s, l) => s + l.quantity, 0)
      const promo = c.code ? resolvePromo(c.code, itemCount) : { valid: false }
      const want = legacy(
        c.lines.map((l) => ({ unit: effectivePrice(getProduct(l.id)!)!, qty: l.quantity })),
        promo.valid ? promo.percentOff ?? 0 : 0,
        c.pickup,
        c.fitting,
      )
      assert.equal(got.itemCount, want.itemCount, JSON.stringify(c))
      assert.equal(got.subtotal, want.subtotal, JSON.stringify(c))
      assert.equal(got.volumeDiscount, want.volume, JSON.stringify(c))
      assert.equal(got.promoDiscount, want.promo, JSON.stringify(c))
      assert.equal(got.fittingTotal, want.fitting, JSON.stringify(c))
      assert.equal(got.total, want.total, JSON.stringify(c))
      assert.equal(got.gst, want.gst, JSON.stringify(c))
      for (const [i, line] of got.lines.entries()) {
        assert.equal(line.unitPrice, effectivePrice(getProduct(c.lines[i]!.id)!), 'a guest pays the shelf price per line')
        assert.equal(line.lineTotal, round2(line.unitPrice * line.quantity))
        assert.equal(line.accountSaving, 0)
        assert.equal(line.basis, got.volumeDiscountRate > 0 ? 'volume' : 'retail')
      }
      assert.equal(got.channel, itemCount >= 20 ? 'bulk' : 'retail')
      assert.equal(got.accountSaving, 0)
    }
  })

  test('the browser cart and the server agree for a guest', () => {
    const next = rng(77)
    for (let n = 0; n < 120; n++) {
      const c = randomCart(next)
      const server = priceOrder({ lines: c.lines, fulfilment: c.pickup ? 'pickup' : 'delivery', fittingTyres: c.fitting, promoCode: c.code }, STOCKED)
      const itemCount = c.lines.reduce((s, l) => s + l.quantity, 0)
      const promo = c.code ? resolvePromo(c.code, itemCount) : { valid: false }
      const browser = cartTotals({
        lines: c.lines.map((l) => {
          const p = getProduct(l.id)!
          return { id: p.id, sku: p.sku, brand: p.brand, model: p.model, size: p.size, price: effectivePrice(p)!, tread: p.tread, quantity: l.quantity }
        }),
        fulfilment: c.pickup ? 'pickup' : 'delivery',
        fittingTyres: server.fittingTyres,
        promo: promo.valid ? { code: c.code, percentOff: promo.percentOff ?? 0, description: '' } : null,
      })
      assert.equal(browser.total, server.total, JSON.stringify(c))
      assert.equal(browser.subtotal, server.subtotal)
      assert.equal(browser.volumeDiscount, server.volumeDiscount)
      assert.equal(browser.promoDiscount, server.promoDiscount)
      assert.equal(browser.gst, server.gst)
    }
  })

  test('an account with no discount and no special prices is priced exactly like a guest', () => {
    const next = rng(5)
    for (let n = 0; n < 60; n++) {
      const c = randomCart(next)
      const input = { lines: c.lines, fulfilment: c.pickup ? 'pickup' : 'delivery', fittingTyres: c.fitting, promoCode: c.code }
      const guest = priceOrder(input, STOCKED)
      const plain = priceOrder(input, STOCKED, { level: 'customer', discountPct: 0, special: {} })
      assert.deepEqual(plain, guest)
    }
  })

  test('the existing guest rules still hold: POA, stock, duplicates, bad fitting, empty cart', () => {
    const poa = products.find((p) => p.price == null)!
    const priced = pricedProducts[0]!
    const r = priceOrder({ lines: [{ id: poa.id, quantity: 1 }], fulfilment: 'delivery' }, STOCKED)
    assert.match(r.errors.join(' '), /price on application/)
    assert.match(priceOrder({ lines: [], fulfilment: 'delivery' }, STOCKED).errors.join(' '), /cart is empty/)
    assert.match(priceOrder({ lines: [{ id: priced.id, quantity: 1 }, { id: priced.id, quantity: 1 }], fulfilment: 'delivery' }, STOCKED).errors.join(' '), /more than once/)
    assert.match(priceOrder({ lines: [{ id: priced.id, quantity: 11 }], fulfilment: 'delivery' }, { [priced.id]: { stock: 10 } }).errors.join(' '), /Only 10/)
    assert.match(priceOrder({ lines: [{ id: priced.id, quantity: 1 }], fulfilment: 'pickup', fittingTyres: 1.5 }, STOCKED).errors.join(' '), /Fitting tyre count/)
    assert.match(priceOrder({ lines: [{ id: priced.id, quantity: 1 }], fulfilment: 'sideways' }, STOCKED).errors.join(' '), /either "delivery" or "pickup"/)
  })
})

/* ============================================ the server: priceOrder, accounts */

/** The same rule written out again in whole cents, as an independent check of the shared module. */
function reference(
  items: Array<{ id: string; qty: number }>,
  account: AccountPricing | null,
  promo: number,
  pickup: boolean,
  fittingTyres: number,
) {
  const n = items.reduce((s, i) => s + i.qty, 0)
  const bp = Math.round((priceBreakFor(n)?.discount ?? 0) * 10000)
  const rows = items.map(({ id, qty }) => {
    const p = getProduct(id)!
    const retail = Math.round(effectivePrice(p)! * 100)
    const band = Math.round((retail * (10000 - bp)) / 10000)
    let own: number | null = null
    if (account) {
      if (Object.prototype.hasOwnProperty.call(account.special, id)) own = Math.round(account.special[id]! * 100)
      else if (account.discountPct > 0) own = Math.round((Math.round(p.price! * 100) * (10000 - Math.round(account.discountPct * 100))) / 10000)
      if (own !== null && own > retail) own = retail
    }
    const useOwn = own !== null && own < band
    return { qty, unit: useOwn ? own! : retail, pool: !useOwn }
  })
  const sub = rows.reduce((s, r) => s + r.unit * r.qty, 0)
  const pool = rows.filter((r) => r.pool).reduce((s, r) => s + r.unit * r.qty, 0)
  // The pool's volume and promo use the website's own float rounding, left alone on purpose.
  const vol = Math.round((pool / 100) * (bp / 10000) * 100)
  const promoC = promo ? Math.round(((pool / 100 - vol / 100) * promo) * 100) : 0
  const fit = pickup ? Math.min(fittingTyres, n) * site.commerce.fittingFeePerTyre * 100 : 0
  return { sub, vol, promo: promoC, fit, total: sub - vol - promoC + fit, channel: saleChannel(account?.level, n) }
}

function randomAccount(next: () => number): AccountPricing {
  const levels = ['customer', 'bulk', 'wholesaler'] as const
  const special: Record<string, number> = {}
  for (const p of pricedProducts) {
    if (next() < 0.3) special[p.id] = Math.round(p.price! * (0.5 + next() * 0.7) * 100) / 100
  }
  return { level: levels[Math.floor(next() * 3)]!, discountPct: [0, 5, 7.5, 12.5, 20, 33.33, 60][Math.floor(next() * 7)]!, special }
}

describe('priceOrder: customer accounts', () => {
  test('300 random carts at random accounts match an independent whole-cents calculation', () => {
    const next = rng(424242)
    let accountLines = 0
    let mixed = 0
    for (let n = 0; n < 300; n++) {
      const c = randomCart(next)
      const account = randomAccount(next)
      const got = priceOrder({ lines: c.lines, fulfilment: c.pickup ? 'pickup' : 'delivery', fittingTyres: c.fitting, promoCode: c.code }, STOCKED, account)
      assert.deepEqual(got.errors, [])
      const itemCount = c.lines.reduce((s, l) => s + l.quantity, 0)
      const promo = c.code ? resolvePromo(c.code, itemCount) : { valid: false }
      const want = reference(c.lines.map((l) => ({ id: l.id, qty: l.quantity })), account, promo.valid ? promo.percentOff ?? 0 : 0, c.pickup, c.fitting)
      const ctx = JSON.stringify({ c, account })
      assert.equal(Math.round(got.subtotal * 100), want.sub, ctx)
      assert.equal(Math.round(got.volumeDiscount * 100), want.vol, ctx)
      assert.equal(Math.round(got.promoDiscount * 100), want.promo, ctx)
      assert.equal(Math.round(got.fittingTotal * 100), want.fit, ctx)
      assert.equal(Math.round(got.total * 100), want.total, ctx)
      assert.equal(got.channel, want.channel, ctx)
      // The customer never pays more than a guest would for the same cart.
      const guest = priceOrder({ lines: c.lines, fulfilment: c.pickup ? 'pickup' : 'delivery', fittingTyres: c.fitting, promoCode: c.code }, STOCKED)
      assert.ok(got.total <= guest.total + 0.005 || got.promoDiscount < guest.promoDiscount, `an account paid more than a guest: ${ctx}`)
      const own = got.lines.filter((l) => l.basis === 'account').length
      accountLines += own
      if (own && own < got.lines.length) mixed++
      for (const l of got.lines) {
        if (l.basis === 'account') assert.ok(l.retailUnitPrice === null || l.unitPrice < l.retailUnitPrice, 'an account price beats the shelf price')
        else assert.equal(l.accountSaving, 0)
      }
    }
    assert.ok(accountLines > 100, `the run must exercise account lines (${accountLines})`)
    assert.ok(mixed > 20, `and mixed carts (${mixed})`)
  })

  test('a concrete wholesale order, line by line', () => {
    const [p1, p2] = pricedProducts.filter((p) => p.discountPrice === undefined) as [(typeof pricedProducts)[0], (typeof pricedProducts)[0]]
    const account: AccountPricing = { level: 'wholesaler', discountPct: 10, special: { [p2.id]: 1.11 } }
    const r = priceOrder({ lines: [{ id: p1.id, quantity: 2 }, { id: p2.id, quantity: 3 }], fulfilment: 'delivery' }, STOCKED, account)
    assert.deepEqual(r.errors, [])
    const unit1 = Math.round(p1.price! * 90) / 100
    assert.equal(r.lines[0]!.unitPrice, unit1)
    assert.equal(r.lines[0]!.basis, 'account')
    assert.equal(r.lines[1]!.unitPrice, 1.11)
    assert.equal(r.lines[1]!.basis, 'account')
    assert.equal(r.lines[1]!.retailUnitPrice, effectivePrice(p2))
    assert.equal(r.channel, 'wholesale')
    assert.equal(r.total, round2(r.lines.reduce((s, l) => s + l.lineTotal, 0) - r.volumeDiscount))
    assert.equal(r.accountSaving, round2(r.lines.reduce((s, l) => s + l.accountSaving, 0)))
  })

  test('price on application: buyable only at the account special price, by that account', () => {
    const poa = products.find((p) => p.price == null)!
    const item = { lines: [{ id: poa.id, quantity: 2 }], fulfilment: 'delivery' }
    assert.match(priceOrder(item, STOCKED).errors.join(' '), /price on application/)
    assert.match(priceOrder(item, STOCKED, { level: 'wholesaler', discountPct: 30, special: {} }).errors.join(' '), /price on application/, 'a % never prices a POA tyre')
    assert.match(priceOrder(item, STOCKED, { level: 'wholesaler', discountPct: 0, special: { 'some-other-tyre': 5 } }).errors.join(' '), /price on application/, 'another tyre\'s price does not unlock it')
    const r = priceOrder(item, STOCKED, { level: 'bulk', discountPct: 0, special: { [poa.id]: 250.5 } })
    assert.deepEqual(r.errors, [])
    assert.equal(r.lines[0]!.unitPrice, 250.5)
    assert.equal(r.lines[0]!.basis, 'account')
    assert.equal(r.total, 501)
  })

  test('a promo code on an order with only account lines is dropped with a clear note', () => {
    const p = pricedProducts[0]!
    const account: AccountPricing = { level: 'bulk', discountPct: 0, special: { [p.id]: 1.5 } }
    const r = priceOrder({ lines: [{ id: p.id, quantity: 1 }], fulfilment: 'delivery', promoCode: 'FLEET10' }, STOCKED, account)
    assert.equal(r.promoCode, undefined)
    assert.equal(r.promoDiscount, 0)
    assert.equal(r.total, 1.5)
    assert.ok(r.warnings.includes('Promo codes do not apply to your account prices.'))
  })

  test('a promo code on a mixed order discounts only the lines at the normal price', () => {
    const [p1, p2] = pricedProducts as [(typeof pricedProducts)[0], (typeof pricedProducts)[0]]
    const account: AccountPricing = { level: 'bulk', discountPct: 0, special: { [p1.id]: 1.5 } }
    const r = priceOrder({ lines: [{ id: p1.id, quantity: 1 }, { id: p2.id, quantity: 1 }], fulfilment: 'delivery', promoCode: 'FLEET10' }, STOCKED, account)
    assert.equal(r.promoCode, 'FLEET10')
    assert.equal(r.promoDiscount, round2(effectivePrice(p2)! * 0.1))
    assert.equal(r.total, round2(1.5 + effectivePrice(p2)! - r.promoDiscount))
  })

  test('breaks table sanity: the labels the rule relies on', () => {
    assert.deepEqual(PRICE_BREAKS.map((b) => [b.min, b.discount]), [[4, 0.03], [8, 0.05], [20, 0.08], [40, 0.11]])
  })
})
