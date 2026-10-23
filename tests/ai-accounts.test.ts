/**
 * The assistant and customer accounts: it is anonymous, so no account price, discount or credit can
 * ever reach its tools or its instructions, and it may tell customers they can open an account and
 * sign in. No model and no network: the tools are run directly.
 *   npx tsx --test tests/ai-accounts.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { after, beforeEach, describe, test } from 'node:test'
import { P1, P2, clearStore, money, placeOrder, reset, shutdown, stockUp, totalFor, trade } from './accounts-kit.js'

const tools = await import('../api/_lib/ai/tools.js')
const rules = await import('../api/_lib/ai/rules.js')
const { site } = await import('../src/config/site.js')
const { effectivePrice } = await import('../src/data/products.js')

type Event = import('../src/lib/ai/protocol.js').ChatEvent

beforeEach(async () => {
  await reset()
  clearStore()
  await stockUp()
})
after(shutdown)

let seq = 0
async function run(name: string, args: unknown) {
  const events: Event[] = []
  const turn = tools.newTurn('2026-10-21', '/', (e) => events.push(e), `visitor-acct-${++seq}`)
  const result = (await tools.runTool({ id: 'call_1', name, arguments: JSON.stringify(args) }, turn)) as Record<string, any>
  return { result, events }
}

/** Every number under a key that names a price, a total or a cost, however deep. */
function moneyValues(value: unknown, key = ''): number[] {
  if (typeof value === 'number') return /price|total|each|aud|cost|discount|saving/i.test(key) ? [value] : []
  if (Array.isArray(value)) return value.flatMap((v) => moneyValues(v, key))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => moneyValues(v, k))
  return []
}

describe('no account price ever reaches the assistant\'s tools', () => {
  // Made-up agreed prices, far from the shop price so they cannot be mistaken for it.
  const SPECIAL = money(P1.price! * 0.41)
  const PERCENT_UNIT = money(P2.price! * 0.6)

  test('with a wholesale account that has a special price and a 40% discount, the tools still quote the shop price', async () => {
    const t = await trade({ discountPct: 40, prices: { [P1.id]: SPECIAL }, payLater: true, creditLimit: 777777 })
    assert.ok(SPECIAL < effectivePrice(P1)!)
    const seen: string[] = []

    const search = await run('search_tyres', { size: P1.size, limit: 8 })
    seen.push(JSON.stringify(search.result))
    const hit = search.result.results.find((r: any) => r.id === P1.id)
    assert.equal(hit.price_each_aud, effectivePrice(P1))

    const details = await run('tyre_details', { product_id: P1.id })
    seen.push(JSON.stringify(details.result))
    assert.equal(details.result.price_each_aud, effectivePrice(P1))

    const other = await run('tyre_details', { product_id: P2.id })
    seen.push(JSON.stringify(other.result))
    assert.equal(other.result.price_each_aud, effectivePrice(P2))

    const cart = await run('propose_add_to_cart', { product_id: P1.id, quantity: 2 })
    seen.push(JSON.stringify(cart.result), JSON.stringify(cart.events))
    const card = cart.events.flatMap((e) => (e.type === 'card' && e.card.kind === 'cart' ? [e.card] : []))[0]!
    assert.equal(card.unitPrice, effectivePrice(P1))
    assert.equal(card.total, money(effectivePrice(P1)! * 2))

    // Nothing the model could read holds an agreed price, the discount, the credit limit or the account.
    const all = seen.join(' | ')
    for (const secret of ['777777', t.email, t.id, 'discountPct', 'creditLimit', 'outstanding', 'payLater']) {
      assert.equal(all.includes(secret), false, `leaked ${secret}`)
    }
    const amounts = seen.flatMap((text) => moneyValues(JSON.parse(text)))
    assert.ok(amounts.length >= 6 && amounts.includes(effectivePrice(P1)!) && amounts.includes(effectivePrice(P2)!), 'the check looked at the real shop prices')
    for (const agreed of [SPECIAL, PERCENT_UNIT]) assert.equal(amounts.includes(agreed), false, `the agreed price ${agreed} reached a tool`)
  })

  test('order lookup never reveals pay later, the account or its prices', async () => {
    const t = await trade({ prices: { [P1.id]: money(P1.price! * 0.41) }, payLater: true, creditLimit: 5000 })
    const total = (await totalFor(t.id, [{ id: P1.id, quantity: 1 }])).total
    const placed = await placeOrder(t.cookie, [{ id: P1.id, quantity: 1 }], total)
    assert.equal(placed.status, 200)
    const found = await run('order_status', { reference: placed.json.reference, email: t.email })
    const text = JSON.stringify(found.result)
    assert.equal(found.result.found, true)
    assert.match(found.result.status, /placed and waiting to be packed/)
    for (const hidden of ['accountId', 'posTicketRef', 'pay later', 'credit', 'outstanding', 'discount', 'wholesale', 'basis']) {
      assert.equal(text.toLowerCase().includes(hidden.toLowerCase()), false, `the order lookup mentions ${hidden}`)
    }
  })

  test('the assistant cannot be signed in: no tool or prompt file touches accounts or the account rule', () => {
    const dir = join(process.cwd(), 'api', '_lib', 'ai')
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && statSync(join(dir, f)).isFile())
    assert.ok(files.length > 10)
    for (const f of files) {
      const source = readFileSync(join(dir, f), 'utf8')
      assert.equal(/accounts\/|account-pricing|pricingContext|customer_prices|spt_session/.test(source), false, `${f} reaches into customer accounts`)
    }
  })
})

describe('what the assistant may say about accounts', () => {
  test('it may say customers can open an account and sign in at /account, and that shops and fleets can apply for a trade account', () => {
    const text = rules.instructions('2026-10-21', '/')
    assert.match(rules.ACCOUNT_RULES, /open a customer account/)
    assert.match(rules.ACCOUNT_RULES, /sign in at \/account to see their own prices/)
    assert.match(rules.ACCOUNT_RULES, /Tyre shops, fleets and wholesalers/)
    assert.match(rules.ACCOUNT_RULES, /bulk or wholesale trade account/)
    assert.ok(text.includes(rules.ACCOUNT_RULES), 'it is part of every chat')
    assert.ok(rules.RULES.includes(rules.ACCOUNT_RULES))
  })

  test('it is told never to state or hint at a trade price, a discount, pay later terms or a credit limit, and not to ask for a password', () => {
    assert.match(rules.ACCOUNT_RULES, /Never state, estimate, guess or hint at a trade price, an account discount or percentage, pay later terms, a credit limit/)
    assert.match(rules.ACCOUNT_RULES, /never ask for a password/)
    assert.ok(rules.ACCOUNT_RULES.includes(site.phone.display), 'and where to send a trade question')
    // The rule itself holds no price, percentage or amount that could be quoted back.
    assert.equal(/[$%]|\d/.test(rules.ACCOUNT_RULES.replace(site.phone.display, '')), false)
  })

  test('"customer accounts or logins" and invoices in My account are no longer forbidden; the claims that are still untrue are', () => {
    assert.equal(/customer accounts or logins/.test(rules.DO_NOT_SAY_RULES), false)
    // My account now has orders, the statement and tax invoices, so the assistant may point to them.
    assert.equal(/invoices from an account/.test(rules.DO_NOT_SAY_RULES), false)
    assert.equal(rules.FORBIDDEN_CLAIMS.test('You can open a customer account and sign in to see your prices.'), false)
    assert.equal(rules.FORBIDDEN_CLAIMS.test('Your orders, statement and tax invoices are in My account.'), false)
    assert.equal(rules.FORBIDDEN_CLAIMS.test('You can view and print your tax invoice in My account.'), false)
    // Still not true: bank transfer at checkout, tracking numbers, price matching.
    assert.equal(rules.FORBIDDEN_CLAIMS.test('Pay by bank transfer at checkout.'), true)
    assert.equal(rules.FORBIDDEN_CLAIMS.test('We email you a tracking number.'), true)
    assert.equal(rules.FORBIDDEN_CLAIMS.test('We offer price matching.'), true)
    assert.match(rules.DO_NOT_SAY_RULES, /tracking numbers/)
  })

  test('it may point a customer to My account for their orders, statement and invoices, but cannot show any of it', () => {
    const text = rules.instructions('2026-10-21', '/')
    assert.match(rules.ACCOUNT_RULES, /orders, their statement and their tax invoices/)
    assert.match(rules.ACCOUNT_RULES, /My account at \/account/)
    assert.match(rules.ACCOUNT_RULES, /never say you can show, send or look up any of it yourself/)
    assert.ok(text.includes('My account at /account'), 'it is part of every chat')
    // Pointing to My account never means quoting from it: the ban on account details stays in the same section.
    assert.match(rules.ACCOUNT_RULES, /anything about a customer's own account/)
    assert.match(rules.ACCOUNT_RULES, /You cannot see, open or change any account/)
  })

  test('the tax invoice FAQ is now part of the facts, and says only what is true', () => {
    assert.equal(rules.FAQ_LEFT_OUT.includes('Are your prices GST inclusive, and will I get a tax invoice?'), false)
    const facts = rules.buildFacts()
    assert.ok(facts.includes('Are your prices GST inclusive, and will I get a tax invoice?'))
    assert.match(facts, /view and print their tax invoices in My account/)
    assert.equal(rules.FORBIDDEN_CLAIMS.test(facts), false)
  })

  test('the FAQ entries that promise things that do not exist stay out of the facts', () => {
    const facts = rules.buildFacts()
    assert.ok(rules.FAQ_LEFT_OUT.includes('Can I pay by bank transfer or set up an account?'))
    assert.ok(rules.FAQ_LEFT_OUT.includes('Can I track my order?'))
    assert.equal(/bank transfer|tracking number/i.test(facts), false)
  })

  test('no agreed price or discount is anywhere in the instructions', async () => {
    await trade({ discountPct: 33, prices: { [P1.id]: money(P1.price! * 0.41) } })
    const text = rules.instructions('2026-10-21', '/')
    assert.equal(text.includes(String(money(P1.price! * 0.41))), false)
    assert.equal(/33%/.test(text), false)
  })
})
