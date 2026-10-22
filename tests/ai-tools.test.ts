/**
 * The assistant's tools: search and details with the live catalogue, the Add to cart card priced
 * exactly like checkout, quote and message cards, page opening (and the claimed-page safety net),
 * the order lookup's privacy and rate limit, and the claimed-card nudge. The database is PGlite in
 * memory and the order/override store is the in-memory one; no network.
 *   npx tsx --test tests/ai-tools.test.ts
 */
import assert from 'node:assert/strict'
import { after, beforeEach, describe, test } from 'node:test'

Object.assign(process.env, {
  AI_DB_MEMORY: '1',
  ADMIN_SESSION_SECRET: 'test-secret-test-secret-test-secret',
  AI_API_URL: '',
  OPENAI_API_KEY: '',
  OPENAI_CHAT_MODEL: '',
})
for (const name of [
  'DATABASE_URL',
  'POSTGRES_URL',
  'VERCEL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]) {
  delete process.env[name]
}

const { closeAiDb, getAiDb } = await import('../api/_lib/ai/db.js')
const tools = await import('../api/_lib/ai/tools.js')
const { priceOrder } = await import('../api/_lib/pricing.js')
const { getOverrides, saveOrder, setOverride } = await import('../api/_lib/store.js')
const { mergeCatalogue } = await import('../api/_lib/catalogue.js')
const { products, allSizes, PRICE_BREAKS } = await import('../src/data/products.js')
const { blogPosts } = await import('../src/data/blog.js')
const { site } = await import('../src/config/site.js')
const { isCardId } = await import('../src/lib/ai/protocol.js')
const { sizeKey } = await import('../src/lib/size.js')

type Event = import('../src/lib/ai/protocol.js').ChatEvent
type Card = import('../src/lib/ai/protocol.js').Card

const EM_DASH = String.fromCharCode(0x2014)

// Tyres the tests rely on (see src/data/products.ts): a priced tyre in stock, a priced tyre at zero stock (pre-order), a POA tyre.
const IN_STOCK = 'lionshead-la301e-11r22-5' // 11R22.5, steer/drive/trailer, $220, 88 in stock
const PRE_ORDER = 'greforce-hd02-11r22-5' // 11R22.5 drive, $300, stock 0
const POA = 'greforce-gr622-11r22-5' // 11R22.5 drive, price on request

after(async () => {
  await closeAiDb()
})

let seq = 0
/** A turn with its own visitor, so one test's order lookups never count against another's. */
const newTurn = (page = '/') => {
  const events: Event[] = []
  const t = tools.newTurn('2026-10-21', page, (e) => events.push(e), `visitor-${++seq}`)
  return { t, events }
}

/** Runs one tool directly. */
async function call(name: string, args: unknown, turn: ReturnType<typeof newTurn> = newTurn()) {
  const result = (await tools.runTool({ id: 'call_1', name, arguments: JSON.stringify(args) }, turn.t)) as Record<string, any>
  return { result, ...turn }
}

beforeEach(async () => {
  const db = await getAiDb()
  await db.query(`TRUNCATE ai_rate CASCADE`)
  // Put every override back to the bundled values.
  for (const id of Object.keys(await getOverrides())) await setOverride(id, { price: undefined, discount: null, stock: undefined })
})

const cartCard = (events: Event[]) => events.flatMap((e) => (e.type === 'card' && e.card.kind === 'cart' ? [e.card] : []))[0]

/* ============================================================== schemas */

describe('tool list', () => {
  test('every tool has a name, a description and strict object parameters', () => {
    const names = tools.TOOLS.map((t) => t.function.name)
    assert.deepEqual(names, [
      'search_tyres',
      'tyre_details',
      'propose_add_to_cart',
      'open_page',
      'prepare_quote_request',
      'talk_to_person',
      'order_status',
      'show_contact_buttons',
    ])
    for (const t of tools.TOOLS) {
      assert.ok(t.function.description.length > 20)
      const p = t.function.parameters as { type: string; required: string[]; properties: Record<string, unknown>; additionalProperties: boolean }
      assert.equal(p.type, 'object')
      assert.equal(p.additionalProperties, false)
      for (const r of p.required) assert.ok(r in p.properties, `${t.function.name} requires ${r}`)
    }
    assert.equal(JSON.stringify(tools.TOOLS).includes(EM_DASH), false)
  })

  test('there is no tool that creates an order or takes a payment', () => {
    for (const t of tools.TOOLS) assert.doesNotMatch(t.function.name, /create|place|pay|checkout_order|submit/)
  })

  test('an unknown tool, bad JSON and a non-object are errors the model can read, never throws', async () => {
    assert.match((await call('make_coffee', {})).result.error, /no tool called make_coffee/)
    const t = newTurn()
    const bad = (await tools.runTool({ id: 'c', name: 'search_tyres', arguments: '{nope' }, t.t)) as { error: string }
    assert.match(bad.error, /not valid JSON/)
    const arr = (await tools.runTool({ id: 'c', name: 'search_tyres', arguments: '[1]' }, t.t)) as { total_matches: number }
    assert.ok(arr.total_matches > 0, 'a non-object argument is read as no arguments')
  })
})

/* ============================================================ search_tyres */

describe('search_tyres', () => {
  test('size matching is normalised like the shop: spacing, case and punctuation do not matter', async () => {
    const a = await call('search_tyres', { size: '11R22.5', limit: 8 })
    for (const spelling of ['11r22.5', '11 R 22.5', '11r225', ' 11R22.5 ']) {
      const b = await call('search_tyres', { size: spelling, limit: 8 })
      assert.deepEqual(
        b.result.results.map((r: any) => r.id),
        a.result.results.map((r: any) => r.id),
        spelling,
      )
    }
    const wide = await call('search_tyres', { size: '295 / 80 r 22.5' })
    assert.ok(wide.result.results.length > 0)
    for (const r of [...a.result.results, ...wide.result.results]) assert.equal(sizeKey(r.size) === sizeKey('11R22.5') || sizeKey(r.size) === sizeKey('295/80R22.5'), true)
    assert.equal(a.result.total_matches, products.filter((p) => p.size === '11R22.5').length)
  })

  test('priced in-stock tyres come first, then pre-orders, then price on request; cheapest first inside each', async () => {
    const { result } = await call('search_tyres', { size: '11R22.5', limit: 8 })
    const rank = (r: any) => (r.price_each_aud == null ? 2 : r.stock_status.startsWith('in stock') ? 0 : 1)
    const ranks = result.results.map(rank)
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b))
    assert.equal(rank(result.results[0]), 0)
    assert.equal(result.results[0].id, IN_STOCK, 'the cheapest tyre we hold')
    const inStock = result.results.filter((r: any) => rank(r) === 0).map((r: any) => r.price_each_aud)
    assert.deepEqual(inStock, [...inStock].sort((a: number, b: number) => a - b))
  })

  test('each row has the id, price, stock status, ratings and a link', async () => {
    const { result } = await call('search_tyres', { size: '11R22.5', brand: 'Lionshead', text: 'LA301E' })
    assert.equal(result.total_matches, 1)
    assert.equal(result.currency, 'AUD')
    const row = result.results[0]
    assert.equal(row.id, IN_STOCK)
    assert.equal(row.name, 'Lionshead LA301E')
    assert.equal(row.size, '11R22.5')
    assert.deepEqual(row.positions, ['steer', 'drive', 'trailer'])
    assert.equal(row.price_each_aud, 220)
    assert.equal(row.stock_status, 'in stock: 88')
    assert.ok(row.ply && 'load_index' in row && 'speed_rating' in row && 'tread_mm' in row && row.application)
    assert.equal(row.url, `/product/${IN_STOCK}`)
  })

  test('stock status: in stock with the count, pre-order at zero, price on request without a price', async () => {
    const { result } = await call('search_tyres', { size: '11R22.5', limit: 8 })
    const byId = new Map(result.results.map((r: any) => [r.id, r]))
    assert.equal((byId.get(IN_STOCK) as any).stock_status, 'in stock: 88')
    assert.equal((byId.get(PRE_ORDER) as any).stock_status, 'pre-order')
    assert.equal((byId.get(POA) as any).stock_status, 'price on request')
    assert.equal((byId.get(POA) as any).price_each_aud, null)
    assert.match(result.poa_note ?? '', /prepare_quote_request/)
  })

  test('position, brand, text and in_stock_only narrow the results', async () => {
    const steer = await call('search_tyres', { position: 'steer', limit: 8 })
    for (const r of steer.result.results) assert.ok(r.positions.includes('steer'))
    const lion = await call('search_tyres', { brand: 'lionshead', limit: 8 })
    assert.ok(lion.result.results.every((r: any) => r.name.startsWith('Lionshead')))
    const hd02 = await call('search_tyres', { text: 'hd02' })
    assert.deepEqual(hd02.result.results.map((r: any) => r.id), [PRE_ORDER])
    const held = await call('search_tyres', { size: '11R22.5', in_stock_only: true, limit: 8 })
    assert.ok(held.result.results.length > 0)
    for (const r of held.result.results) assert.match(r.stock_status, /^in stock: \d+$/)
  })

  test('the limit is 1 to 8 and says how many more there are', async () => {
    const one = await call('search_tyres', { limit: 1 })
    assert.equal(one.result.results.length, 1)
    assert.ok(one.result.total_matches > 1)
    assert.match(one.result.note, /Showing 1 of /)
    assert.equal((await call('search_tyres', {})).result.results.length, 5, 'default 5')
    assert.match((await call('search_tyres', { limit: 0 })).result.error, /1 to 8/)
    assert.match((await call('search_tyres', { limit: 9 })).result.error, /1 to 8/)
    assert.match((await call('search_tyres', { limit: 'lots' })).result.error, /1 to 8/)
  })

  test('search results tell the model to name two at most and to open the shop for the rest', async () => {
    const { result } = await call('search_tyres', { position: 'drive', in_stock_only: true })
    assert.ok(result.results.length <= 5, 'at most 5 rows by default')
    assert.match(result.how_to_answer, /at most two/)
    assert.match(result.how_to_answer, /plain sentences/)
    assert.match(result.how_to_answer, /open_page/)
    assert.match(result.how_to_answer, /instead of listing/)
    const open = tools.TOOLS.find((t) => t.function.name === 'open_page')!
    assert.match(open.function.description, /show me all drive tyres in stock/)
    assert.match(open.function.description, /instead of listing/)
    const search = tools.TOOLS.find((t) => t.function.name === 'search_tyres')!
    assert.match(search.function.description, /how_to_answer/)
    assert.equal(JSON.stringify(result).includes(String.fromCharCode(0x2014)), false)
  })

  test('bad arguments are errors, not guesses', async () => {
    assert.match((await call('search_tyres', { position: 'front' })).result.error, /steer, drive, trailer/)
    assert.match((await call('search_tyres', { in_stock_only: 'maybe' })).result.error, /true or false/)
  })

  test('nothing matches: the sizes we do stock come back so the assistant can suggest real ones', async () => {
    const { result } = await call('search_tyres', { size: '12R24.5' })
    assert.equal(result.total_matches, 0)
    assert.deepEqual(result.results, [])
    assert.deepEqual(
      result.sizes_we_stock.map((s: any) => s.size),
      allSizes,
    )
    for (const s of result.sizes_we_stock) assert.equal(s.lines, products.filter((p) => p.size === s.size).length)
    assert.match(result.note, /sourcing/)
  })

  test('a brand we do not stock points to the partner and a sourcing request', async () => {
    const { result } = await call('search_tyres', { brand: 'Michelin' })
    assert.equal(result.total_matches, 0)
    assert.match(result.note, /Michelin is not in our own stock/)
    assert.match(result.note, /1 Truck Stop/)
    assert.match(result.note, /sourcing/)
    assert.match((await call('search_tyres', { brand: 'Nokian' })).result.note, /only stock Greforce and Lionshead/)
  })

  test('live admin edits are applied: a new price, a new stock level, a POA tyre given a price', async () => {
    await setOverride(IN_STOCK, { price: 199.5, stock: 3 })
    await setOverride(PRE_ORDER, { stock: 12 })
    await setOverride(POA, { price: 410 })
    const { result } = await call('search_tyres', { size: '11R22.5', limit: 8 })
    const byId = new Map(result.results.map((r: any) => [r.id, r]))
    assert.equal((byId.get(IN_STOCK) as any).price_each_aud, 199.5)
    assert.equal((byId.get(IN_STOCK) as any).stock_status, 'in stock: 3')
    assert.equal((byId.get(PRE_ORDER) as any).stock_status, 'in stock: 12')
    assert.equal((byId.get(POA) as any).price_each_aud, 410)
    assert.equal((byId.get(POA) as any).stock_status, 'pre-order')
    // A discount shows as the price after it.
    await setOverride(IN_STOCK, { discount: 10 })
    const sale = await call('search_tyres', { text: 'LA301E' })
    assert.equal(sale.result.results[0].price_each_aud, 179.55)
    assert.equal(sale.result.results[0].discount_percent, 10)
  })

  test('the live catalogue is read once per message, so every tool in an answer agrees', async () => {
    const turn = newTurn()
    await call('search_tyres', { size: '11R22.5' }, turn)
    await setOverride(IN_STOCK, { price: 1 })
    const again = await call('search_tyres', { size: '11R22.5' }, turn)
    assert.equal(again.result.results[0].price_each_aud, 220, 'same turn, same prices')
    const next = await call('search_tyres', { size: '11R22.5' })
    assert.equal(next.result.results[0].price_each_aud, 1, 'next message sees the edit')
  })

  test('a search leaves a note staff can read', async () => {
    const { t } = await call('search_tyres', { size: '11R22.5', position: 'steer' })
    assert.match(t.notes[0], /Searched tyres \(11R22\.5, steer\): \d+ found, from A\$/)
  })
})

/* ============================================================ tyre_details */

describe('tyre_details', () => {
  test('gives the full spec, highlights, ratings, price, stock and link', async () => {
    const { result } = await call('tyre_details', { product_id: IN_STOCK })
    assert.equal(result.id, IN_STOCK)
    assert.equal(result.price_each_aud, 220)
    assert.equal(result.stock_status, 'in stock: 88')
    for (const key of ['ply', 'rim', 'tread_mm', 'load_index', 'max_load_kg', 'speed_rating', 'max_speed_kmh', 'rating', 'review_count', 'fuel_rating', 'noise_db', 'retreadable', 'three_peak_mountain_snowflake', 'headline', 'description', 'highlights', 'url', 'positions', 'application']) {
      assert.ok(key in result, `has ${key}`)
    }
    assert.ok(Array.isArray(result.highlights) && result.highlights.length > 0)
    assert.equal(result.url, `/product/${IN_STOCK}`)
    assert.equal(JSON.stringify(result).includes(EM_DASH), false)
  })

  test('applies live edits, finds a tyre by SKU, and rejects an unknown one', async () => {
    await setOverride(IN_STOCK, { price: 205, stock: 0 })
    const { result } = await call('tyre_details', { product_id: IN_STOCK })
    assert.equal(result.price_each_aud, 205)
    assert.equal(result.stock_status, 'pre-order')
    const bySku = await call('tyre_details', { product_id: products.find((p) => p.id === IN_STOCK)!.sku })
    assert.equal(bySku.result.id, IN_STOCK)
    assert.match((await call('tyre_details', { product_id: 'nope' })).result.error, /Unknown tyre/)
    assert.match((await call('tyre_details', {})).result.error, /Unknown tyre/)
  })

  test('a price on request tyre has a null price and says to quote', async () => {
    const { result } = await call('tyre_details', { product_id: POA })
    assert.equal(result.price_each_aud, null)
    assert.equal(result.stock_status, 'price on request')
    assert.match(result.note, /prepare_quote_request/)
  })
})

/* ======================================================= propose_add_to_cart */

describe('propose_add_to_cart', () => {
  test('shows a card whose figures are exactly what checkout will charge', async () => {
    const { result, events, t } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 4 })
    assert.equal(result.ok, true)
    const card = cartCard(events)
    assert.ok(card && isCardId(card.id))
    const expected = priceOrder({ lines: [{ id: IN_STOCK, quantity: 4 }], fulfilment: 'delivery', fittingTyres: 0 }, await getOverrides())
    assert.equal(card.kind, 'cart')
    assert.equal(card.productId, IN_STOCK)
    assert.equal(card.name, 'Lionshead LA301E')
    assert.equal(card.size, '11R22.5')
    assert.equal(card.quantity, 4)
    assert.equal(card.unitPrice, 220)
    assert.equal(card.lineTotal, 880)
    assert.equal(card.volumeDiscount, expected.volumeDiscount)
    assert.equal(card.volumeLabel, '4+ tyres')
    assert.equal(card.total, expected.total)
    assert.equal(card.total, 853.6, '880 less 3% for 4 tyres')
    assert.equal(card.fitting, false)
    assert.equal(card.fittingTotal, 0)
    assert.equal(card.preOrder, false)
    assert.equal(card.stock, 88)
    assert.equal(card.checkout, false)
    assert.ok(card.positionLabel)
    assert.ok(card.notes.some((n) => /Volume discounts apply to your whole cart at checkout/.test(n)))
    assert.match(result.shown, /4 x Lionshead LA301E 11R22\.5, A\$220\.00 each/)
    assert.match(result.shown, /total A\$853\.60 inc\. GST/)
    assert.match(result.next, /not in the cart yet/)
    assert.match(t.notes[0], /Showed an Add to cart card: 4 x Lionshead LA301E 11R22\.5, total A\$853\.60/)
  })

  test('every volume break is priced like checkout', async () => {
    for (const quantity of [1, 3, 4, 7, 8, 19, 20, 39, 40, 41]) {
      await setOverride(IN_STOCK, { stock: 500 })
      const { events } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity })
      const card = cartCard(events)
      const expected = priceOrder({ lines: [{ id: IN_STOCK, quantity }], fulfilment: 'delivery', fittingTyres: 0 }, await getOverrides())
      assert.equal(card.total, expected.total, `total for ${quantity}`)
      assert.equal(card.volumeDiscount, expected.volumeDiscount, `discount for ${quantity}`)
      const band = [...PRICE_BREAKS].reverse().find((b) => quantity >= b.min)
      assert.equal(card.volumeLabel, band?.label ?? null)
    }
  })

  test('fitting is $70 per tyre, at pickup, and the total includes it', async () => {
    const { events, result } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 4, fitting: true })
    const card = cartCard(events)
    assert.equal(card.fitting, true)
    assert.equal(card.fittingTotal, 280)
    assert.equal(card.fittingTotal, 4 * site.commerce.fittingFeePerTyre)
    const expected = priceOrder({ lines: [{ id: IN_STOCK, quantity: 4 }], fulfilment: 'pickup', fittingTyres: 4 }, await getOverrides())
    assert.equal(card.total, expected.total)
    assert.equal(card.total, 853.6 + 280)
    assert.match(result.shown, /fitting A\$280\.00/)
  })

  test('checkout asks for the "Add and check out" button', async () => {
    const { events } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 1, checkout: true })
    assert.equal(cartCard(events).checkout, true)
  })

  test('a pre-order is allowed and flagged, with the site\'s warning (no em dash)', async () => {
    const { events, result } = await call('propose_add_to_cart', { product_id: PRE_ORDER, quantity: 2 })
    const card = cartCard(events)
    assert.equal(card.preOrder, true)
    assert.equal(card.stock, 0)
    assert.ok(card.notes.some((n) => /back-order/.test(n)))
    for (const n of card.notes) assert.equal(n.includes(EM_DASH), false, n)
    assert.equal(result.pre_order, true)
  })

  test('price on request tyres are refused with a pointer to the quote tool, and nothing is shown', async () => {
    const { result, events, t } = await call('propose_add_to_cart', { product_id: POA, quantity: 2 })
    assert.equal(result.ok, false)
    assert.match(result.error, /price on request/)
    assert.match(result.error, /prepare_quote_request/)
    assert.equal(events.length, 0)
    assert.equal(t.cards.length, 0)
  })

  test('more than is in stock is refused with the real number', async () => {
    const { result, events } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 150 })
    assert.equal(result.ok, false)
    assert.ok(result.problems.some((p: string) => /Only 88/.test(p)))
    assert.equal(events.length, 0)
  })

  test('arguments are checked: quantity 1 to 200, a real tyre, true or false', async () => {
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 0 })).result.error, /1 to 200/)
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 201 })).result.error, /1 to 200/)
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 1.5 })).result.error, /1 to 200/)
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 'many' })).result.error, /1 to 200/)
    assert.match((await call('propose_add_to_cart', { product_id: 'nope', quantity: 1 })).result.error, /Unknown tyre/)
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 1, fitting: 'yes' })).result.error, /fitting must be true or false/)
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 1, checkout: 3 })).result.error, /checkout must be true or false/)
    assert.equal((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: '4' })).result.ok, true, 'a number written as text is read')
  })

  test('live prices and stock are used, not the bundled ones', async () => {
    await setOverride(IN_STOCK, { price: 150, stock: 6 })
    const { events } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 4 })
    const card = cartCard(events)
    assert.equal(card.unitPrice, 150)
    assert.equal(card.stock, 6)
    assert.equal(card.total, 582)
    assert.match((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 7 })).result.problems[0], /Only 6/)
  })

  test('orders of 20 or more say freight is arranged by the sales team', async () => {
    await setOverride(IN_STOCK, { stock: 100 })
    const { events } = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 24 })
    assert.ok(cartCard(events).notes.some((n) => /palletised/.test(n)))
  })

  test('one card per answer; the next message can show another', async () => {
    const turn = newTurn()
    assert.equal((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 1 }, turn)).result.ok, true)
    const second = await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 2 }, turn)
    assert.equal(second.result.ok, false)
    assert.match(second.result.error, /already shown/)
    assert.equal(turn.events.filter((e) => e.type === 'card').length, 1)
    assert.equal((await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 2 })).result.ok, true)
  })
})

/* ================================================= quote, handover and contact */

describe('prepare_quote_request', () => {
  test('shows a quote card the customer can edit and send', async () => {
    const { result, events, t } = await call('prepare_quote_request', {
      enquiry_type: 'fleet',
      product_id: POA,
      quantity: 40,
      message: 'We run 20 trucks and need drive tyres for the year.',
      name: 'Sam Driver',
      email: 'Sam@Example.com',
      phone: '0400 123 456',
      company: 'Driver Haulage',
    })
    assert.equal(result.ok, true)
    const card = events.find((e) => e.type === 'card')!.type === 'card' ? (events.find((e) => e.type === 'card') as Extract<Event, { type: 'card' }>).card : null
    assert.ok(card && card.kind === 'quote' && isCardId(card.id))
    assert.equal(card.enquiryType, 'fleet')
    assert.equal(card.productId, POA)
    assert.equal(card.size, '11R22.5', 'the size comes from the tyre')
    assert.equal(card.quantity, 40)
    assert.equal(card.email, 'sam@example.com')
    assert.equal(card.company, 'Driver Haulage')
    assert.match(t.notes[0], /Prepared a quote request: fleet, 40 x 11R22\.5/)
    assert.match(result.next, /Nothing is sent until they do/)
  })

  test('all four enquiry types are accepted; anything else is not', async () => {
    for (const type of ['quote', 'fleet', 'wholesale', 'sourcing']) {
      assert.equal((await call('prepare_quote_request', { enquiry_type: type, message: 'Please quote me for 11R22.5 tyres.' })).result.ok, true, type)
    }
    assert.match((await call('prepare_quote_request', { enquiry_type: 'complaint', message: 'Please quote me for 11R22.5 tyres.' })).result.error, /quote, fleet, wholesale, sourcing/)
  })

  test('the message needs at least 10 characters; fields are checked', async () => {
    assert.match((await call('prepare_quote_request', { enquiry_type: 'quote', message: 'short' })).result.error, /at least 10/)
    assert.match((await call('prepare_quote_request', { enquiry_type: 'quote', message: 'x'.repeat(4001) })).result.error, /too long/)
    assert.match((await call('prepare_quote_request', { enquiry_type: 'quote', message: 'A proper message here.', email: 'not-an-email' })).result.error, /email/)
    assert.match((await call('prepare_quote_request', { enquiry_type: 'quote', message: 'A proper message here.', quantity: 0 })).result.error, /quantity/)
    assert.match((await call('prepare_quote_request', { enquiry_type: 'quote', message: 'A proper message here.', product_id: 'nope' })).result.error, /Unknown tyre/)
    assert.match((await call('prepare_quote_request', { enquiry_type: 'quote', message: 'A proper message here.', phone: '1'.repeat(41) })).result.error, /phone/)
  })

  test('one quote card per answer', async () => {
    const turn = newTurn()
    const args = { enquiry_type: 'quote', message: 'A proper message here.' }
    assert.equal((await call('prepare_quote_request', args, turn)).result.ok, true)
    assert.equal((await call('prepare_quote_request', args, turn)).result.ok, false)
  })
})

describe('talk_to_person', () => {
  test('shows a handover card and the call and email buttons', async () => {
    const { result, events, t } = await call('talk_to_person', {
      reason: 'Wants a manager',
      message: 'The customer is unhappy with a late delivery and wants a call.',
      name: 'Jo',
      email: 'jo@example.com',
    })
    assert.equal(result.ok, true)
    const card = events.flatMap((e) => (e.type === 'card' ? [e.card] : []))[0]
    assert.ok(card && card.kind === 'handover')
    assert.equal(card.reason, 'Wants a manager')
    assert.equal(card.name, 'Jo')
    assert.equal(card.phone, undefined)
    const buttons = events.find((e) => e.type === 'buttons') as Extract<Event, { type: 'buttons' }>
    assert.deepEqual(
      buttons.actions.map((a) => a.kind),
      ['call', 'email'],
    )
    assert.equal(buttons.actions[0].href, site.phone.href)
    assert.equal(t.buttons, true)
  })

  test('name and email are optional on the card (the customer fills them in); a reason and message are not', async () => {
    assert.equal((await call('talk_to_person', { reason: 'Callback', message: 'Please call me back about my order.' })).result.ok, true)
    assert.match((await call('talk_to_person', { reason: '', message: 'Please call me back about my order.' })).result.error, /reason/)
    assert.match((await call('talk_to_person', { reason: 'Callback', message: 'hi' })).result.error, /at least 10/)
    assert.match((await call('talk_to_person', { reason: 'Callback', message: 'Please call me back about my order.', email: 'bad' })).result.error, /email/)
  })

  test('the buttons are shown once per answer, even with show_contact_buttons as well', async () => {
    const turn = newTurn()
    await call('talk_to_person', { reason: 'Callback', message: 'Please call me back about my order.' }, turn)
    const again = await call('show_contact_buttons', {}, turn)
    assert.equal(again.result.ok, true)
    assert.equal(turn.events.filter((e) => e.type === 'buttons').length, 1)
  })
})

describe('show_contact_buttons', () => {
  test('emits the call and email buttons once and records it', async () => {
    const turn = newTurn()
    assert.equal((await call('show_contact_buttons', {}, turn)).result.ok, true)
    await call('show_contact_buttons', {}, turn)
    assert.equal(turn.events.filter((e) => e.type === 'buttons').length, 1)
    assert.deepEqual(turn.t.notes, ['Showed the call and email buttons'])
  })
})

/* ================================================================ open_page */

describe('open_page', () => {
  const OPEN: Record<string, string> = {
    home: '/',
    shop: '/shop',
    finder: '/finder',
    wheel_lab: '/wheel-lab',
    deals: '/deals',
    brands: '/brands',
    range: '/products',
    fleet: '/fleet-solutions',
    wholesale: '/wholesale',
    guide: '/guide',
    faq: '/faq',
    shipping: '/shipping',
    returns: '/returns',
    contact: '/contact',
    about: '/about',
    blog: '/blog',
    cart: '/cart',
    checkout: '/checkout',
    order_lookup: '/order',
    compare: '/compare',
  }

  test('every page in the list opens its address, and a go event says so', async () => {
    assert.equal(tools.PAGES.length, 22)
    for (const [page, to] of Object.entries(OPEN)) {
      const { result, events } = await call('open_page', { page }, newTurn('/somewhere-else'))
      assert.equal(result.ok, true, page)
      assert.deepEqual(events, [{ type: 'go', to, note: result.opened }])
    }
  })

  test('product and blog_post need a real id or slug', async () => {
    const product = await call('open_page', { page: 'product', product_id: IN_STOCK })
    assert.deepEqual(product.events[0], { type: 'go', to: `/product/${IN_STOCK}`, note: 'Opened Lionshead LA301E 11R22.5' })
    assert.equal((await call('open_page', { page: 'product', product_id: 'nope' })).result.ok, false)
    assert.equal((await call('open_page', { page: 'product' })).result.ok, false)
    const post = blogPosts[0]
    const article = await call('open_page', { page: 'blog_post', slug: post.slug })
    assert.equal((article.events[0] as any).to, `/blog/${post.slug}`)
    const missing = await call('open_page', { page: 'blog_post', slug: 'nope' })
    assert.equal(missing.result.ok, false)
    assert.match(missing.result.error, new RegExp(post.slug))
  })

  test('shop filters become the URL parameters the shop already reads', async () => {
    const full = await call('open_page', { page: 'shop', query: 'long haul', brand: 'greforce', size: '295/80r22.5', position: 'Steer', in_stock: true })
    assert.equal((full.events[0] as any).to, '/shop?q=long+haul&brand=Greforce&size=295%2F80R22.5&position=steer&inStock=1')
    const url = new URL((full.events[0] as any).to, 'http://x')
    assert.equal(url.searchParams.get('size'), '295/80R22.5', 'the canonical size, as the shop lists it')
    assert.equal((await call('open_page', { page: 'shop', size: '11r225' })).events[0] && ((await call('open_page', { page: 'shop', size: '11r225' })).events[0] as any).to, '/shop?size=11R22.5')
    assert.equal(((await call('open_page', { page: 'shop', in_stock: false })).events[0] as any).to, '/shop')
    assert.match((await call('open_page', { page: 'shop', size: '99R99' })).result.error, /Unknown size/)
    assert.match((await call('open_page', { page: 'shop', brand: 'Michelin' })).result.error, /Greforce and Lionshead/)
    assert.match((await call('open_page', { page: 'shop', position: 'front' })).result.error, /steer, drive, trailer/)
    assert.match((await call('open_page', { page: 'shop', in_stock: 'sometimes' })).result.error, /true or false/)
  })

  test('the shop page can read what open_page builds (round trip through the shop\'s own parser)', async () => {
    let filtersFromParams: ((p: URLSearchParams) => any) | undefined
    try {
      filtersFromParams = (await import('../src/components/shop/Filters.js')).filtersFromParams
    } catch {
      // The component needs the browser build tools; the URL checks above already cover the contract.
    }
    if (!filtersFromParams) return
    const { events } = await call('open_page', { page: 'shop', query: 'x', brand: 'Lionshead', size: '11r225', position: 'drive', in_stock: true })
    const f = filtersFromParams(new URL((events[0] as any).to, 'http://x').searchParams)
    assert.equal(f.q, 'x')
    assert.deepEqual(f.brands, ['Lionshead'])
    assert.deepEqual(f.sizes, ['11R22.5'])
    assert.equal(f.position, 'drive')
    assert.equal(f.inStock, true)
  })

  test('never an admin address, whatever the model asks for', async () => {
    for (const page of ['admin', '/admin', 'admin/orders', '../admin', 'Admin', '']) {
      const { result, events } = await call('open_page', { page })
      assert.equal(result.ok, false, page)
      assert.equal(events.length, 0)
    }
    for (const p of tools.PAGES) {
      const target = tools.pageTarget(p, { product_id: IN_STOCK, slug: blogPosts[0].slug }, mergeCatalogue({}))
      assert.ok('to' in target && !target.to.startsWith('/admin'), p)
    }
    const catalogue = mergeCatalogue({})
    assert.ok('error' in tools.pageTarget('admin', {}, catalogue))
    assert.ok('error' in tools.pageTarget(undefined, {}, catalogue))
  })

  test('one page per answer, and never the page the customer is on', async () => {
    const turn = newTurn('/finder')
    const same = await call('open_page', { page: 'finder' }, turn)
    assert.equal(same.result.ok, false)
    assert.match(same.result.error, /already on that page/)
    assert.equal((await call('open_page', { page: 'shop' }, turn)).result.ok, true)
    const second = await call('open_page', { page: 'faq' }, turn)
    assert.equal(second.result.ok, false)
    assert.match(second.result.error, /Only one page/)
    assert.equal(turn.events.filter((e) => e.type === 'go').length, 1)
    assert.deepEqual(turn.t.went, [{ to: '/shop', note: 'Opened the shop' }])
  })
})

/* ======================================================= claimed-page net */

describe('claimed pages: the model says it opened a page without calling open_page', () => {
  const catalogue = mergeCatalogue({})
  const to = (text: string) => tools.claimedPage(text, catalogue)?.to ?? null

  test('the page it names is opened, by the same table as the tool', () => {
    assert.equal(to("I've opened the Tyre Finder for you."), '/finder')
    assert.equal(to("I've opened the Wheel Lab for you."), '/wheel-lab')
    assert.equal(to("I've pulled up the FAQ for you."), '/faq')
    assert.equal(to("I've opened the shipping page for you."), '/shipping')
    assert.equal(to("I have opened the fleet page for you."), '/fleet-solutions')
    assert.equal(to("I've opened the deals for you."), '/deals')
    assert.equal(to("I've brought up the cart for you."), '/cart')
    assert.equal(to("I've opened the blog for you."), '/blog')
    assert.equal(to('Sure. I just opened the contact page.'), '/contact')
  })

  test('a tyre, size, brand or position by name goes to that product or a filtered shop', () => {
    assert.equal(to("I've opened the Greforce HD02 for you."), `/product/${PRE_ORDER}`)
    assert.equal(to("I've opened the 11R22.5 tyres for you."), '/shop?size=11R22.5')
    assert.equal(to("I've opened the Lionshead range in the shop for you."), '/shop?brand=Lionshead')
    assert.equal(to("I've opened the steer tyres for you."), '/shop?position=steer')
    assert.equal(to("I've opened the LA301E for you."), `/product/${IN_STOCK}`)
    assert.equal(to("I've opened the shop for you."), '/shop')
  })

  test('an offer, a plan or a card is not a claim', () => {
    assert.equal(to('I can open the Tyre Finder for you if you like.'), null)
    assert.equal(to('Would you like me to open the FAQ?'), null)
    assert.equal(to("I've brought up the quote request for you."), null)
    assert.equal(to("I've opened a message for the sales team."), null)
    assert.equal(to("I've pulled up the details on the card."), null)
    assert.equal(to("I've opened a form for you."), null)
    assert.equal(to('Nothing was opened.'), null)
  })

  test('it never leads to /admin or a made-up page', () => {
    assert.equal(to("I've opened the admin panel for you."), null)
    assert.equal(to("I've opened the unicorn page for you."), null)
    assert.equal(tools.claimsPage("I've opened the admin panel for you."), true)
  })

  test('openClaimedPage opens it as the tool would, but not when a card or buttons are on screen or a page is already open', async () => {
    const a = newTurn()
    await tools.openClaimedPage("I've opened the Tyre Finder for you.", a.t)
    assert.deepEqual(a.events, [{ type: 'go', to: '/finder', note: 'Opened the Tyre Finder' }])

    const b = newTurn()
    await call('propose_add_to_cart', { product_id: IN_STOCK, quantity: 1 }, b)
    await tools.openClaimedPage("I've opened the Tyre Finder for you.", b.t)
    assert.equal(b.events.filter((e) => e.type === 'go').length, 0, 'a card is on screen')

    const c = newTurn()
    await call('open_page', { page: 'faq' }, c)
    await tools.openClaimedPage("I've opened the Tyre Finder for you.", c.t)
    assert.equal(c.events.filter((e) => e.type === 'go').length, 1, 'one page per answer')

    const d = newTurn('/finder')
    await tools.openClaimedPage("I've opened the Tyre Finder for you.", d.t)
    assert.equal(d.events.length, 0, 'not the page they are on')

    const e = newTurn()
    await tools.openClaimedPage('Here is some advice.', e.t)
    assert.equal(e.events.length, 0)
  })
})

/* ============================================================ order_status */

describe('order_status', () => {
  const ORDER = {
    id: 'order-1',
    reference: 'SPT-AB12-CD34',
    createdAt: '2026-10-19T02:30:00.000Z',
    status: 'dispatched' as const,
    fulfilment: 'delivery' as const,
    customer: { name: 'Pat Private', email: 'pat@example.com', phone: '0412 999 888', company: 'Private Haulage' },
    address: { line1: '99 Secret Street', suburb: 'Hiddenville', state: 'NSW', postcode: '2999' },
    lines: [{ sku: 'SKU-1', name: 'Lionshead LA301E', size: '11R22.5', quantity: 4, unitPrice: 220 }],
    fittingTyres: 0,
    subtotal: 880,
    fittingTotal: 0,
    discount: 26.4,
    total: 853.6,
    promoCode: 'SECRETCODE',
    paymentId: 'sq-payment-123',
    notes: 'Leave with the night guard',
  }

  beforeEach(async () => {
    await saveOrder(ORDER)
  })

  test('finds the order by reference and email (case does not matter) and returns only the safe facts', async () => {
    const { result } = await call('order_status', { reference: 'spt-ab12-cd34', email: 'PAT@example.com' })
    assert.deepEqual(result, {
      found: true,
      reference: 'SPT-AB12-CD34',
      status: 'dispatched',
      placed: '19 October 2026',
      fulfilment: 'delivery',
      items: [{ name: 'Lionshead LA301E', size: '11R22.5', quantity: 4 }],
      total_aud: 853.6,
      note: result.note,
    })
    const json = JSON.stringify(result)
    for (const secret of ['Secret Street', 'Hiddenville', '2999', '0412', 'Pat Private', 'Private Haulage', 'sq-payment', 'night guard', 'SECRETCODE', 'SKU-1', 'pat@example.com']) {
      assert.equal(json.includes(secret), false, `leaked ${secret}`)
    }
  })

  test('pickup orders say collection, and each status is in plain words', async () => {
    const words: Record<string, RegExp> = {
      pending: /waiting for payment/,
      paid: /paid and waiting to be packed/,
      packing: /being packed/,
      dispatched: /^dispatched$/,
      collected: /^collected$/,
      cancelled: /^cancelled$/,
    }
    for (const [status, rx] of Object.entries(words)) {
      await saveOrder({ ...ORDER, status: status as any, fulfilment: 'pickup' })
      const { result } = await call('order_status', { reference: ORDER.reference, email: ORDER.customer.email })
      assert.match(result.status, rx, status)
      assert.equal(result.fulfilment, 'collection from the warehouse')
    }
  })

  test('a wrong reference, a wrong email and a missing order all get the very same answer', async () => {
    const wrongRef = (await call('order_status', { reference: 'SPT-ZZZZ-ZZZZ', email: ORDER.customer.email })).result
    const wrongEmail = (await call('order_status', { reference: ORDER.reference, email: 'other@example.com' })).result
    const neither = (await call('order_status', { reference: 'SPT-NOPE-NOPE', email: 'nobody@example.com' })).result
    assert.equal(wrongRef.found, false)
    assert.deepEqual(wrongRef, wrongEmail)
    assert.deepEqual(wrongRef, neither)
    assert.match(wrongRef.message, /No order was found with that reference and email/)
    assert.ok(wrongRef.message.includes(site.phone.display))
    assert.equal(JSON.stringify(wrongRef).includes('SPT-'), false, 'nothing about the order it nearly matched')
  })

  test('both parts are needed', async () => {
    assert.match((await call('order_status', { email: ORDER.customer.email })).result.error, /reference is needed/)
    assert.match((await call('order_status', { reference: ORDER.reference })).result.error, /email is needed/)
    assert.match((await call('order_status', { reference: ORDER.reference, email: 'not an email' })).result.error, /email is needed/)
  })

  test('five lookups in ten minutes per visitor, then it stops, even for the right answer', async () => {
    const turn = newTurn()
    for (let i = 0; i < 5; i++) {
      const r = (await call('order_status', { reference: `SPT-AAAA-000${i}`, email: 'guess@example.com' }, turn)).result
      assert.equal(r.found, false, `try ${i + 1}`)
    }
    const sixth = (await call('order_status', { reference: ORDER.reference, email: ORDER.customer.email }, turn)).result
    assert.match(sixth.error, /Too many order lookups/)
    assert.equal(sixth.found, undefined)
    // Another visitor is not affected.
    assert.equal((await call('order_status', { reference: ORDER.reference, email: ORDER.customer.email })).result.found, true)
  })

  test('the window ends: after ten minutes the visitor can ask again', async () => {
    const turn = newTurn()
    for (let i = 0; i < 6; i++) await call('order_status', { reference: 'SPT-AAAA-0000', email: 'guess@example.com' }, turn)
    const db = await getAiDb()
    await db.query(`UPDATE ai_rate SET reset_at = now() - interval '1 second' WHERE key LIKE 'orderstatus:%'`)
    assert.equal((await call('order_status', { reference: ORDER.reference, email: ORDER.customer.email }, turn)).result.found, true)
  })

  test('the note for staff says what was asked, not the email', async () => {
    const hit = await call('order_status', { reference: ORDER.reference, email: ORDER.customer.email })
    assert.match(hit.t.notes[0], /Looked up order SPT-AB12-CD34: dispatched/)
    const miss = await call('order_status', { reference: 'SPT-NOPE-NOPE', email: 'nobody@example.com' })
    assert.deepEqual(miss.t.notes, ['Looked up an order: not found'])
    for (const n of [...hit.t.notes, ...miss.t.notes]) assert.equal(n.includes('@'), false)
  })
})

/* ====================================================== claimed-card nudge */

describe('claimed cards: words that say a card exists when it does not', () => {
  const noCards = { cards: [] as Card[] }
  const withCard = (kind: Card['kind']) => ({ cards: [{ id: 'k0000000000', kind } as Card] })

  test('"added to your cart", "tap Add to cart" and "confirm on screen" with no cart card are caught', () => {
    for (const text of [
      "I've added 4 Lionshead LA301E to your cart. Tap the button to continue.",
      "I have put those tyres in your cart for you.",
      'Tap Add to cart below to continue.',
      'Please tap "Add and check out" when you are ready.',
      'Just confirm on screen and you are done.',
      "I've shown a card for the tyres.",
    ]) {
      assert.equal(tools.unbackedClaim(text, noCards), 'cart', text)
    }
  })

  test('a real cart card makes the same words fine', () => {
    assert.equal(tools.unbackedClaim("I've added 4 tyres to your cart card. Tap Add to cart.", withCard('cart')), null)
    assert.equal(tools.unbackedClaim('Tap Add to cart below.', withCard('cart')), null)
  })

  test('a request or message that was "prepared" or "passed on" with no card is caught', () => {
    assert.equal(tools.unbackedClaim("I've prepared a quote request for you.", noCards), 'request')
    assert.equal(tools.unbackedClaim('Tap Send when you are ready.', noCards), 'request')
    assert.equal(tools.unbackedClaim("I've passed that on to the sales team.", noCards), 'handover')
    assert.equal(tools.unbackedClaim('Someone from the team will call you back shortly.', noCards), 'handover')
    assert.equal(tools.unbackedClaim('Tap Ask someone to get back to me below.', noCards), 'handover')
  })

  test('a quote card or a handover card satisfies either of those claims, a cart card does not', () => {
    for (const kind of ['quote', 'handover'] as const) {
      assert.equal(tools.unbackedClaim("I've prepared a quote request for you.", withCard(kind)), null)
      assert.equal(tools.unbackedClaim("I've passed that on to the sales team.", withCard(kind)), null)
    }
    assert.equal(tools.unbackedClaim("I've prepared a quote request for you.", withCard('cart')), 'request')
  })

  test('plain answers, offers and future tense are not claims', () => {
    for (const text of [
      'The Lionshead LA301E is A$220.00 each and we hold 88.',
      'I can add them to your cart if you tell me how many.',
      'Once you tap the card, the tyres go into your cart.',
      'The sales team can help on 1300 846 024.',
      'Would you like a quote?',
      '',
    ]) {
      assert.equal(tools.unbackedClaim(text, noCards), null, text)
    }
  })

  test('each claim has a nudge that names the right tool and forbids repeating', () => {
    assert.match(tools.NUDGES.cart, /propose_add_to_cart/)
    assert.match(tools.NUDGES.request, /prepare_quote_request/)
    assert.match(tools.NUDGES.handover, /talk_to_person/)
    for (const n of Object.values(tools.NUDGES)) {
      assert.match(n, /Do not repeat your previous message/)
      assert.equal(n.includes(EM_DASH), false)
    }
  })
})
