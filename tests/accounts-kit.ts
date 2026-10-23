/**
 * Shared setup for the customer account tests (tests/accounts-*.test.ts): an in-memory Postgres, the
 * in-memory store, no real email (the dev outbox, or a fake fetch), and helpers that call the
 * customer function and the admin router the way Vercel would. Nothing here touches a network.
 *
 * Import this FIRST in a test file: it sets the environment before any api/ module is loaded.
 */
import { randomUUID } from 'node:crypto'

Object.assign(process.env, {
  AI_DB_MEMORY: '1',
  ADMIN_PASSWORD: 'test-admin-password',
  ADMIN_SESSION_SECRET: 'test-secret-test-secret-test-secret',
  PUBLIC_SITE_URL: 'https://shop.example.test',
})
for (const name of [
  'DATABASE_URL',
  'POSTGRES_URL',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RESEND_API_KEY',
  'MAIL_FROM',
  'MAIL_OUTBOX_FILES',
]) {
  delete process.env[name]
}

export const dbm = await import('../api/_lib/db.js')
export const repo = await import('../api/_lib/accounts/repo.js')
export const session = await import('../api/_lib/accounts/session.js')
export const store = await import('../api/_lib/store.js')
export const auth = await import('../api/_lib/auth.js')
export const mailer = await import('../api/_lib/email.js')
const { default: accountFn } = await import('../api/account/[action].js')
const { default: adminFn } = await import('../api/admin/[action].js')

export type Json = Record<string, any>

export class FakeRes {
  code = 200
  headers: Record<string, string> = {}
  body: unknown = undefined
  status(code: number) {
    this.code = code
    return this
  }
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v
  }
  json(b: unknown) {
    this.body = b
  }
  end() {}
}

export const SITE = 'https://shop.example.test'
const LOCAL_ORIGIN = 'http://localhost:5173'
let ipCounter = 0
/** A fresh visitor address each call, so one test's rate limit never touches another's. */
export const newIp = () => `10.${Math.floor(++ipCounter / 250) % 250}.${ipCounter % 250}.9`

/** Everything either API ever answered or emailed, to prove no hash or token leaks into a response. */
export const answered: string[] = []

export interface CallOptions {
  method?: string
  query?: Record<string, string>
  body?: unknown
  cookie?: string
  origin?: string | null
  host?: string
  ip?: string
  contentType?: string | null
  headers?: Record<string, string>
}

/** One call to /api/account/<action>. Defaults to a POST from the allowed local origin. */
export async function account(action: string, o: CallOptions = {}) {
  const res = new FakeRes()
  const method = o.method ?? (action === 'me' || action === 'dev-outbox' ? 'GET' : 'POST')
  const headers: Record<string, string> = { 'x-forwarded-for': o.ip ?? newIp(), host: o.host ?? 'localhost:5173', ...(o.headers ?? {}) }
  if (o.origin !== null) headers.origin = o.origin ?? LOCAL_ORIGIN
  if (o.contentType !== null && method !== 'GET') headers['content-type'] = o.contentType ?? 'application/json'
  if (o.cookie) headers.cookie = o.cookie
  await accountFn({ method, query: { action, ...(o.query ?? {}) }, body: o.body, headers }, res as never)
  answered.push(JSON.stringify(res.body ?? null))
  return { status: res.code, json: (res.body ?? {}) as Json, headers: res.headers }
}

/** `spt_session=<token>` from a Set-Cookie header, or '' when it clears the cookie / sets nothing. */
export function cookieFrom(r: { headers: Record<string, string> }): string {
  const set = r.headers['set-cookie'] ?? ''
  const m = /^spt_session=([^;]*)/.exec(set)
  return m && m[1] ? `spt_session=${m[1]}` : ''
}

export async function adminCall(action: string, o: { method?: string; query?: Record<string, string>; body?: unknown; token?: string | null } = {}) {
  const res = new FakeRes()
  const headers: Record<string, string> = {}
  const token = o.token === undefined ? auth.issueToken()!.token : o.token
  if (token) headers.authorization = `Bearer ${token}`
  const method = o.method ?? (action === 'accounts' || action === 'account' ? 'GET' : 'POST')
  await adminFn({ method, query: { action, ...(o.query ?? {}) }, body: o.body, headers }, res as never)
  answered.push(JSON.stringify(res.body ?? null))
  return { status: res.code, json: (res.body ?? {}) as Json, headers: res.headers }
}

/** A signed-in staff member with the given role; returns their token. */
export async function staffToken(role: 'owner' | 'manager' | 'sales' | 'staff'): Promise<string> {
  const now = new Date().toISOString()
  const member = await store.saveStaff({
    id: randomUUID(),
    name: `Test ${role}`,
    email: `${role}-${randomUUID().slice(0, 8)}@staff.example.test`,
    phone: '',
    role,
    position: '',
    payRate: null,
    startDate: '',
    notes: '',
    active: true,
    passwordHash: await auth.hashStaffPassword('staff-password-123'),
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  })
  return auth.issueToken(Date.now(), member)!.token
}

export const OWNER = () => auth.issueToken()!.token

/* ------------------------------------------------------------------ *
 * Email
 * ------------------------------------------------------------------ */

export interface SentMail {
  url: string
  headers: Record<string, string>
  body: Json
}

/** Turns Resend on with a fake fetch; returns the mails it was given. `restore()` puts everything back. */
export function useFakeMail(status = 200) {
  const sent: SentMail[] = []
  const realFetch = globalThis.fetch
  process.env.RESEND_API_KEY = 're_test_key_not_real'
  process.env.MAIL_FROM = 'Spartan Tyres <accounts@mail.example.test>'
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    sent.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(status === 200 ? '{"id":"x"}' : '{"message":"no"}', { status })
  }) as typeof fetch
  return {
    sent,
    restore() {
      globalThis.fetch = realFetch
      delete process.env.RESEND_API_KEY
      delete process.env.MAIL_FROM
    },
  }
}

/** The set-password token inside the newest dev-outbox email (or the given text). */
export function tokenFrom(text: string): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(text)
  if (!m) throw new Error('no link in that email')
  return m[1]!
}

export const outboxTo = (to: string) => mailer.devOutbox().filter((e) => e.to === to)
export const lastMailTo = (to: string) => outboxTo(to).at(-1)

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

export const PASSWORD = 'correct-horse-battery'

let emailCounter = 0
export const newEmail = (tag = 'cust') => `${tag}${++emailCounter}-${randomUUID().slice(0, 6)}@buyer.example.test`

/** A signed-up customer: returns its email, id and session cookie. */
export async function signUp(extra: Json = {}) {
  const email = (extra.email as string) ?? newEmail()
  const r = await account('signup', {
    body: { name: 'Pat Buyer', company: 'Buyer Haulage', email, phone: '0400 000 000', abn: '', address: '1 Test St', requestedLevel: 'customer', password: PASSWORD, ...extra },
  })
  if (r.status !== 200) throw new Error(`signup failed: ${r.status} ${JSON.stringify(r.json)}`)
  return { email, id: r.json.account.id as string, cookie: cookieFrom(r), res: r }
}

/** Empties the accounts tables, counters, outbox and the till's customers (the in-memory store). */
export async function reset() {
  const db = await (await import('../api/_lib/accounts/schema.js')).getAccountsDb()
  await (await import('../api/_lib/rate.js')).rateLimited('kit:init', 100, 1) // makes sure the counter table exists
  await db.query(`TRUNCATE customer_accounts CASCADE`)
  await db.query(`TRUNCATE ai_rate`)
  mailer.clearDevOutbox()
  for (const c of await store.listPosCustomers()) await store.deletePosCustomer(c.id)
  answered.length = 0
}

/**
 * Empties the in-memory store (orders, till tickets and payments, stock overrides, claims, the ledger),
 * for the tests that sell things. `reset()` alone leaves them.
 */
export function clearStore() {
  delete (globalThis as Record<string, unknown>).__spartanMemoryStore__
}

export async function shutdown() {
  await dbm.closeDb()
}

/* ------------------------------------------------------------------ *
 * Trade accounts, selling and the fake Square (AC2)
 * ------------------------------------------------------------------ */

const { pricedProducts } = await import('../src/data/products.js')
const pricing = await import('../api/_lib/pricing.js')
const { default: squareFn } = await import('../api/square/[action].js')

/** Three ordinary priced tyres (no sale price), and the ids of the rest. Prices are the public catalogue's. */
export const PLAIN = pricedProducts.filter((p) => p.discountPrice === undefined)
export const P1 = PLAIN[0]!
export const P2 = PLAIN[1]!
export const P3 = PLAIN[2]!
export const money = (n: number) => Math.round(n * 100) / 100

/** Puts plenty of every tyre in stock, so orders are never limited by the catalogue's own counts. */
export async function stockUp(each = 1000) {
  for (const p of (await import('../src/data/products.js')).products) await store.setOverride(p.id, { stock: each })
}

export interface TradeOptions {
  level?: 'customer' | 'bulk' | 'wholesaler'
  discountPct?: number
  /** Made-up special prices by product id. */
  prices?: Record<string, number>
  payLater?: boolean
  creditLimit?: number
  termsDays?: number
  email?: string
}

/**
 * A signed-up customer whom staff have made Bulk / Wholesaler with the given prices and credit.
 * Returns the sign-up (email, id, cookie) and the account record's till customer id.
 */
export async function trade(o: TradeOptions = {}) {
  const s = await signUp(o.email ? { email: o.email } : {})
  const level = await adminCall('account-level', { body: { id: s.id, level: o.level ?? 'wholesaler', discountPct: o.discountPct ?? 0 } })
  if (level.status !== 200) throw new Error(`level: ${JSON.stringify(level.json)}`)
  if (o.prices && Object.keys(o.prices).length) {
    const r = await adminCall('account-prices', { body: { id: s.id, prices: Object.entries(o.prices).map(([productId, price]) => ({ productId, price })) } })
    if (r.status !== 200) throw new Error(`prices: ${JSON.stringify(r.json)}`)
  }
  if (o.payLater !== undefined) {
    const r = await adminCall('account-credit', { body: { id: s.id, payLater: o.payLater, termsDays: o.termsDays ?? 14, creditLimit: o.creditLimit ?? 0 } })
    if (r.status !== 200) throw new Error(`credit: ${JSON.stringify(r.json)}`)
  }
  const record = (await repo.getAccount(s.id))!
  return { ...s, posCustomerId: record.posCustomerId! }
}

let keyCounter = 0
export const newKey = () => `test-key-${++keyCounter}-${randomUUID().slice(0, 8)}`

export interface OrderLine {
  id: string
  quantity: number
}

/** `POST /api/account/order` as a signed-in customer. The expected total is what the caller says it was shown. */
export function placeOrder(cookie: string, lines: OrderLine[], expectedTotal: number, extra: Json = {}) {
  return account('order', { cookie, body: { idempotencyKey: newKey(), fulfilment: 'pickup', fittingTyres: 0, lines, expectedTotal, ...extra } })
}

/** What the server says this cart costs for an account (the number a browser would have shown). */
export async function totalFor(accountId: string, lines: OrderLine[], extra: { fulfilment?: 'pickup' | 'delivery'; fittingTyres?: number; promoCode?: string } = {}) {
  const a = (await repo.getAccount(accountId))!
  const { pricingContext } = await import('../api/_lib/accounts/pricing.js')
  const r = pricing.priceOrder({ lines, fulfilment: extra.fulfilment ?? 'pickup', fittingTyres: extra.fittingTyres ?? 0, promoCode: extra.promoCode }, await store.getOverrides(), await pricingContext(a))
  if (r.errors.length) throw new Error(r.errors.join(' '))
  return r
}

/** Card checkout against a fake Square. Every charge it was asked to make is in `charges`. */
export function useFakeSquare() {
  const charges: Array<{ amount: number; key: string }> = []
  const realFetch = globalThis.fetch
  const saved = { t: process.env.SQUARE_ACCESS_TOKEN, l: process.env.SQUARE_LOCATION_ID, a: process.env.SQUARE_APPLICATION_ID }
  process.env.SQUARE_ACCESS_TOKEN = 'sq-test-token-not-real'
  process.env.SQUARE_LOCATION_ID = 'L-TEST'
  process.env.SQUARE_APPLICATION_ID = 'sq-app-test'
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (!String(url).includes('squareupsandbox.com')) return realFetch(url as never, init)
    const body = JSON.parse(String(init?.body ?? '{}'))
    charges.push({ amount: body.amount_money.amount, key: body.idempotency_key })
    return new Response(JSON.stringify({ payment: { id: `pay_${charges.length}`, status: 'COMPLETED' } }), { status: 200 })
  }) as typeof fetch
  return {
    charges,
    restore() {
      globalThis.fetch = realFetch
      for (const [k, v] of [['SQUARE_ACCESS_TOKEN', saved.t], ['SQUARE_LOCATION_ID', saved.l], ['SQUARE_APPLICATION_ID', saved.a]] as const) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    },
  }
}

/** One call to `POST /api/square/create-payment`. */
export async function checkout(o: { cookie?: string; lines: OrderLine[]; expectedTotal: number; fulfilment?: 'pickup' | 'delivery'; extra?: Json }) {
  const res = new FakeRes()
  await squareFn(
    {
      method: 'POST',
      query: { action: 'create-payment' },
      headers: { 'x-forwarded-for': newIp(), host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json', ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: {
        sourceId: 'cnon:card-nonce-ok',
        idempotencyKey: newKey().slice(0, 40),
        fulfilment: o.fulfilment ?? 'pickup',
        fittingTyres: 0,
        customer: { name: 'Pat Buyer', email: 'pat@buyer.example.test', phone: '0400 000 000' },
        lines: o.lines,
        expectedTotal: o.expectedTotal,
        ...(o.extra ?? {}),
      },
    },
    res as never,
  )
  return { status: res.code, json: (res.body ?? {}) as Json }
}
