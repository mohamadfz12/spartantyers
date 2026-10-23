/**
 * Persistence for orders, enquiries, subscribers, product overrides, leads,
 * staff, timesheets, stock movements, the money ledger and the activity log.
 *
 * THREE BACKENDS, CHOSEN AT RUNTIME, ONE SHAPE
 *
 * Every collection is a set of records keyed by id ("bucket" → "field" →
 * JSON value). Only four operations exist — read all, read one, write one,
 * delete one — so the order, enquiry and admin logic below never knows which
 * database it is talking to.
 *
 * 1. Upstash / Vercel KV Redis, when REST credentials are present
 *    (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, or Upstash's own
 *    `UPSTASH_REDIS_REST_*` names). Plain `fetch`, no SDK. A bucket is a HASH.
 *
 * 2. Neon Postgres, when `DATABASE_URL` or `POSTGRES_URL` is present — what
 *    Vercel's Neon integration injects. Uses Neon's serverless driver over
 *    HTTPS, which suits short-lived functions: no connection pool to exhaust.
 *    One table, `spartan_store (bucket, field, value jsonb)`, created on first
 *    use, so nothing has to be run by hand.
 *
 * 3. An in-memory fallback cached on `globalThis`.
 *
 *    !! DEVELOPMENT ONLY !!
 *    Serverless filesystems and process memory are ephemeral: the fallback
 *    survives only while a single lambda instance stays warm, is NOT shared
 *    between concurrent instances, and is wiped on every cold start and every
 *    new deployment. It exists so local development works without a
 *    database — never rely on it for real orders. The admin dashboard says
 *    plainly when it is in use.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export interface StoredOrder {
  id: string
  reference: string
  createdAt: string
  status:
    | 'pending'
    | 'paid'
    | 'packing'
    | 'dispatched'
    | 'collected'
    | 'cancelled'
  fulfilment: 'delivery' | 'pickup'
  customer: {
    name: string
    email: string
    phone: string
    company?: string
  }
  address?: {
    line1: string
    suburb: string
    state: string
    postcode: string
  }
  lines: Array<{
    sku: string
    name: string
    size: string
    quantity: number
    unitPrice: number
  }>
  fittingTyres: number
  subtotal: number
  fittingTotal: number
  discount: number
  total: number
  promoCode?: string
  paymentId?: string
  notes?: string
}

export interface StoredEnquiry {
  id: string
  createdAt: string
  name: string
  email: string
  phone?: string
  company?: string
  enquiryType: string
  message: string
  handled: boolean
}

export interface StoredSubscriber {
  email: string
  createdAt: string
}

export interface StoredOverride {
  price?: number
  discount?: number | null
  stock?: number
  updatedAt?: string
}

/**
 * A prospect from the NSW lead research. Imported in bulk with
 * `npm run import:leads`; never shipped in the site bundle or the repo.
 */
export interface StoredLead {
  /** Stable across re-imports, so a lead keeps its status and notes. */
  key: string
  name: string
  category: 'Transport' | 'Truck Tyre Reseller'
  subtype: string
  website: string
  description: string
  region: 'Metro' | 'N NSW' | 'W NSW' | 'S NSW'
  area: string
  city: string
  address: string
  phones: string[]
  emails: string[]
  contact_page: string
  other_contacts: string
  size: 'Large' | 'Medium' | 'Small' | ''
  employees: string
  fleet: string
  size_basis: string
  source: string
  reach: string
  priority: 'A' | 'B' | 'C'
}

export const LEAD_STATUSES = [
  'New',
  'Called',
  'Interested',
  'Quote sent',
  'Customer',
  'Not interested',
  'Wrong number',
] as const

export type LeadStatusValue = (typeof LEAD_STATUSES)[number]

/** Sales progress on a lead — kept apart from the lead so re-imports never wipe it. */
export interface StoredLeadStatus {
  status: LeadStatusValue
  notes: string
  /** Hours spent researching this company, entered by hand. Absent when not recorded. */
  researchHours?: number
  updatedAt: string
}

/**
 * A day plan: the towns the team works on one day (see src/lib/lead-plans.ts).
 * It names whole towns, never single leads, so it is untouched by re-imports.
 */
export interface StoredLeadPlan {
  id: string
  /** YYYY-MM-DD, Sydney calendar. */
  date: string
  towns: string[]
  who: string
  note: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

const KEY_LEADS = 'spartan:leads'
const KEY_LEAD_STATUS = 'spartan:lead-status'
const KEY_LEAD_PLANS = 'spartan:lead-plans'
const KEY_META = 'spartan:meta'
const KEY_ORDERS = 'spartan:orders'
const KEY_ENQUIRIES = 'spartan:enquiries'
const KEY_SUBSCRIBERS = 'spartan:subscribers'
const KEY_OVERRIDES = 'spartan:overrides'
const KEY_SELFTEST = 'spartan:selftest'
const KEY_STAFF = 'spartan:staff'
const KEY_TIMESHEETS = 'spartan:timesheets'
const KEY_STOCK_SETTINGS = 'spartan:stock-settings'
const KEY_STOCK_MOVES = 'spartan:stock-moves'
const KEY_LEDGER = 'spartan:ledger'
const KEY_AUDIT = 'spartan:audit'
const KEY_POS_CUSTOMERS = 'spartan:pos-customers'
const KEY_POS_TICKETS = 'spartan:pos-tickets'
const KEY_POS_ACCOUNT_PAYMENTS = 'spartan:pos-account-payments'
const KEY_TERMINAL_CHECKOUTS = 'spartan:terminal-checkouts'
const KEY_CLAIMS = 'spartan:claims'

/* ------------------------------------------------------------------ *
 * Backend selection
 * ------------------------------------------------------------------ */

/**
 * Redis-over-REST credentials, under either naming scheme.
 *
 * Vercel's storage integration injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`;
 * connecting Upstash directly injects `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN`. They are the same service, so either works.
 */
function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

/**
 * Postgres connection string. Vercel's Neon integration injects several; the
 * pooled `DATABASE_URL` is preferred and `POSTGRES_URL` is the same database.
 */
function postgresUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null
}

export type StoreBackend = 'redis' | 'postgres' | 'memory'

/**
 * Redis wins when both are configured, purely so the choice is deterministic.
 * Missing both is not an error — it silently selects the in-memory fallback,
 * which is exactly why `storeHealth()` below reports which one is live.
 */
export function storeBackend(): StoreBackend {
  if (kvConfig()) return 'redis'
  if (postgresUrl()) return 'postgres'
  return 'memory'
}

export function isPersistent(): boolean {
  return storeBackend() !== 'memory'
}

export type StoreHealth =
  /** Credentials present and the database answered. */
  | 'connected'
  /** Credentials present but the database did not answer — wrong credentials, paused or deleted database. */
  | 'error'
  /** No credentials: data lives in temporary memory and is lost on restart. */
  | 'memory'

/**
 * Proves the database is reachable rather than merely configured: a typo in a
 * credential looks identical to a working setup until the first write is lost.
 * For Postgres it also creates the table if needed, so a database without
 * write permission fails here, on the dashboard, rather than at checkout.
 */
export async function storeHealth(): Promise<StoreHealth> {
  const backend = storeBackend()
  if (backend === 'memory') return 'memory'
  try {
    if (backend === 'redis') {
      const reply = await kvCommand<string>(['PING'])
      return reply === 'PONG' ? 'connected' : 'error'
    }
    await pgReady()
    const rows = await pg().query('SELECT 1 AS ok')
    return rows[0]?.ok === 1 ? 'connected' : 'error'
  } catch {
    return 'error'
  }
}

/**
 * Writes, reads back and deletes a throwaway record in its own bucket. Used by
 * `npm run check:api -- --live` to prove a real database round-trips without
 * touching orders, enquiries or stock.
 */
export async function storeSelfTest(): Promise<{
  backend: StoreBackend
  readBack: boolean
  removed: boolean
}> {
  const backend = storeBackend()
  const field = `selftest-${Date.now()}`
  const value = { ok: true, at: new Date().toISOString() }
  await hashSet(KEY_SELFTEST, field, value)
  const back = await hashGet<typeof value>(KEY_SELFTEST, field)
  await hashDelete(KEY_SELFTEST, field)
  const after = await hashGet<typeof value>(KEY_SELFTEST, field)
  return { backend, readBack: back?.at === value.at, removed: after === null }
}

/* ------------------------------------------------------------------ *
 * The four operations every collection is built from
 * ------------------------------------------------------------------ */

async function hashAll<T>(bucket: string): Promise<Record<string, T>> {
  switch (storeBackend()) {
    case 'redis':
      return kvHashAll<T>(bucket)
    case 'postgres':
      return pgHashAll<T>(bucket)
    default:
      return { ...(memoryBucket(bucket) as Record<string, T>) }
  }
}

async function hashGet<T>(bucket: string, field: string): Promise<T | null> {
  switch (storeBackend()) {
    case 'redis':
      return kvHashGet<T>(bucket, field)
    case 'postgres':
      return pgHashGet<T>(bucket, field)
    default:
      return (memoryBucket(bucket)[field] as T | undefined) ?? null
  }
}

async function hashSet(bucket: string, field: string, value: unknown): Promise<void> {
  switch (storeBackend()) {
    case 'redis':
      return kvHashSet(bucket, field, value)
    case 'postgres':
      return pgHashSet(bucket, field, value)
    default:
      memoryBucket(bucket)[field] = value
  }
}

async function hashDelete(bucket: string, field: string): Promise<void> {
  switch (storeBackend()) {
    case 'redis':
      await kvCommand(['HDEL', bucket, field])
      return
    case 'postgres':
      await pgReady()
      await pg().query('DELETE FROM spartan_store WHERE bucket = $1 AND field = $2', [
        bucket,
        field,
      ])
      return
    default:
      delete memoryBucket(bucket)[field]
  }
}

/* ------------------------------------------------------------------ *
 * Upstash / Vercel KV over REST
 * ------------------------------------------------------------------ */

async function kvCommand<T>(command: unknown[]): Promise<T | null> {
  const config = kvConfig()
  if (!config) return null

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })

  if (!response.ok) {
    // Deliberately opaque: the body can echo the command (and therefore
    // customer data), and the token lives in the request headers.
    throw new Error(`KV command ${String(command[0])} failed (${response.status})`)
  }

  const payload = (await response.json()) as { result?: unknown; error?: string }
  if (payload.error) throw new Error(`KV command ${String(command[0])} failed`)
  return (payload.result ?? null) as T | null
}

/** HGETALL returns a flat [field, value, field, value, ...] array. */
async function kvHashAll<T>(key: string): Promise<Record<string, T>> {
  const flat = await kvCommand<unknown>(['HGETALL', key])
  const out: Record<string, T> = {}

  if (Array.isArray(flat)) {
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const field = String(flat[i])
      const parsed = parseJson<T>(flat[i + 1])
      if (parsed !== null) out[field] = parsed
    }
  } else if (flat && typeof flat === 'object') {
    for (const [field, value] of Object.entries(flat as Record<string, unknown>)) {
      const parsed = parseJson<T>(value)
      if (parsed !== null) out[field] = parsed
    }
  }

  return out
}

async function kvHashGet<T>(key: string, field: string): Promise<T | null> {
  const value = await kvCommand<unknown>(['HGET', key, field])
  return parseJson<T>(value)
}

async function kvHashSet(key: string, field: string, value: unknown): Promise<void> {
  await kvCommand(['HSET', key, field, JSON.stringify(value)])
}

function parseJson<T>(value: unknown): T | null {
  if (value == null) return null
  if (typeof value === 'object') return value as T
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Neon Postgres over HTTPS
 * ------------------------------------------------------------------ */

let pgClient: { url: string; sql: NeonQueryFunction<false, false> } | null = null

function pg(): NeonQueryFunction<false, false> {
  const url = postgresUrl()
  if (!url) throw new Error('Postgres is not configured')
  // Rebuilt only if the URL changes, which happens between test cases.
  if (!pgClient || pgClient.url !== url) pgClient = { url, sql: neon(url) }
  return pgClient.sql
}

/** Per-instance memo, so the table check costs one round trip per cold start. */
let pgSchema: { url: string; ready: Promise<void> } | null = null

function pgReady(): Promise<void> {
  const url = postgresUrl() ?? ''
  if (!pgSchema || pgSchema.url !== url) {
    const ready = pg()
      .query(
        `CREATE TABLE IF NOT EXISTS spartan_store (
           bucket     text        NOT NULL,
           field      text        NOT NULL,
           value      jsonb       NOT NULL,
           updated_at timestamptz NOT NULL DEFAULT now(),
           PRIMARY KEY (bucket, field)
         )`,
      )
      .then(() => undefined)
    // A failed attempt must not be cached, or one network blip would poison
    // this instance until its next cold start.
    ready.catch(() => {
      if (pgSchema?.ready === ready) pgSchema = null
    })
    pgSchema = { url, ready }
  }
  return pgSchema.ready
}

async function pgHashAll<T>(bucket: string): Promise<Record<string, T>> {
  await pgReady()
  const rows = await pg().query('SELECT field, value FROM spartan_store WHERE bucket = $1', [
    bucket,
  ])
  const out: Record<string, T> = {}
  for (const row of rows) {
    const parsed = parseJson<T>(row.value)
    if (parsed !== null) out[String(row.field)] = parsed
  }
  return out
}

async function pgHashGet<T>(bucket: string, field: string): Promise<T | null> {
  await pgReady()
  const rows = await pg().query(
    'SELECT value FROM spartan_store WHERE bucket = $1 AND field = $2',
    [bucket, field],
  )
  return rows.length ? parseJson<T>(rows[0].value) : null
}

async function pgHashSet(bucket: string, field: string, value: unknown): Promise<void> {
  await pgReady()
  await pg().query(
    `INSERT INTO spartan_store (bucket, field, value, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (bucket, field)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [bucket, field, JSON.stringify(value)],
  )
}

/* ------------------------------------------------------------------ *
 * In-memory fallback (development only — see file header)
 * ------------------------------------------------------------------ */

const MEMORY_KEY = '__spartanMemoryStore__'

function memoryBucket(bucket: string): Record<string, unknown> {
  const g = globalThis as typeof globalThis & {
    [MEMORY_KEY]?: Record<string, Record<string, unknown>>
  }
  const store = (g[MEMORY_KEY] ??= {})
  return (store[bucket] ??= {})
}

const newestFirst = <T extends { createdAt: string }>(map: Record<string, T>): T[] =>
  Object.values(map).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export async function listOrders(): Promise<StoredOrder[]> {
  return newestFirst(await hashAll<StoredOrder>(KEY_ORDERS))
}

export async function getOrder(id: string): Promise<StoredOrder | null> {
  if (!id) return null
  return hashGet<StoredOrder>(KEY_ORDERS, id)
}

/**
 * Customer-facing lookup: reference plus email, both case-insensitive, so a
 * reference pasted in lower case or an email typed with different casing still
 * resolves. Requiring both fields keeps the endpoint from being an order
 * enumeration oracle.
 */
export async function findOrder(
  reference: string,
  email: string,
): Promise<StoredOrder | null> {
  const ref = reference.trim().toLowerCase()
  const mail = email.trim().toLowerCase()
  if (!ref || !mail) return null

  const orders = await listOrders()
  return (
    orders.find(
      (order) =>
        order.reference.toLowerCase() === ref &&
        order.customer.email.toLowerCase() === mail,
    ) ?? null
  )
}

export async function saveOrder(order: StoredOrder): Promise<StoredOrder> {
  await hashSet(KEY_ORDERS, order.id, order)
  return order
}

export async function updateOrderStatus(
  id: string,
  status: StoredOrder['status'],
): Promise<StoredOrder | null> {
  const existing = await getOrder(id)
  if (!existing) return null
  const next: StoredOrder = { ...existing, status }
  await saveOrder(next)
  return next
}

/* ------------------------------------------------------------------ *
 * Enquiries
 * ------------------------------------------------------------------ */

export async function listEnquiries(): Promise<StoredEnquiry[]> {
  return newestFirst(await hashAll<StoredEnquiry>(KEY_ENQUIRIES))
}

export async function saveEnquiry(enquiry: StoredEnquiry): Promise<StoredEnquiry> {
  await hashSet(KEY_ENQUIRIES, enquiry.id, enquiry)
  return enquiry
}

/* ------------------------------------------------------------------ *
 * Newsletter subscribers
 * ------------------------------------------------------------------ */

export async function listSubscribers(): Promise<StoredSubscriber[]> {
  return newestFirst(await hashAll<StoredSubscriber>(KEY_SUBSCRIBERS))
}

/**
 * Keyed by lower-cased email so re-subscribing is idempotent. Returns
 * `alreadySubscribed` so the endpoint can give honest feedback instead of
 * pretending every submission was new.
 */
export async function saveSubscriber(
  email: string,
): Promise<{ subscriber: StoredSubscriber; alreadySubscribed: boolean }> {
  const key = email.trim().toLowerCase()

  const existing = await hashGet<StoredSubscriber>(KEY_SUBSCRIBERS, key)
  if (existing) return { subscriber: existing, alreadySubscribed: true }

  const subscriber: StoredSubscriber = {
    email: key,
    createdAt: new Date().toISOString(),
  }
  await hashSet(KEY_SUBSCRIBERS, key, subscriber)

  return { subscriber, alreadySubscribed: false }
}

/* ------------------------------------------------------------------ *
 * Product overrides (price / discount / stock)
 * ------------------------------------------------------------------ */

export async function getOverrides(): Promise<Record<string, StoredOverride>> {
  return hashAll<StoredOverride>(KEY_OVERRIDES)
}

export async function setOverride(
  id: string,
  patch: StoredOverride,
): Promise<StoredOverride> {
  const current = (await hashGet<StoredOverride>(KEY_OVERRIDES, id)) ?? {}

  const next: StoredOverride = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await hashSet(KEY_OVERRIDES, id, next)

  return next
}

/* ------------------------------------------------------------------ *
 * Leads (sales prospects) and their status
 * ------------------------------------------------------------------ */

export async function listLeads(): Promise<StoredLead[]> {
  return Object.values(await hashAll<StoredLead>(KEY_LEADS))
}

export async function getLead(key: string): Promise<StoredLead | null> {
  if (!key) return null
  return hashGet<StoredLead>(KEY_LEADS, key)
}

export async function getLeadStatuses(): Promise<Record<string, StoredLeadStatus>> {
  return hashAll<StoredLeadStatus>(KEY_LEAD_STATUS)
}

export async function setLeadStatus(
  key: string,
  patch: Partial<Pick<StoredLeadStatus, 'status' | 'notes'>> & { researchHours?: number | null },
): Promise<StoredLeadStatus> {
  const current = (await hashGet<StoredLeadStatus>(KEY_LEAD_STATUS, key)) ?? {
    status: 'New' as const,
    notes: '',
    updatedAt: '',
  }
  const { researchHours, ...rest } = patch
  const next: StoredLeadStatus = {
    ...current,
    ...rest,
    updatedAt: new Date().toISOString(),
  }
  // null clears the figure; undefined leaves it alone.
  if (researchHours === null) delete next.researchHours
  else if (researchHours !== undefined) next.researchHours = researchHours
  await hashSet(KEY_LEAD_STATUS, key, next)
  return next
}

/** Every day plan, earliest day first. */
export async function listLeadPlans(): Promise<StoredLeadPlan[]> {
  return Object.values(await hashAll<StoredLeadPlan>(KEY_LEAD_PLANS)).sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  )
}

export async function getLeadPlan(id: string): Promise<StoredLeadPlan | null> {
  if (!id) return null
  return hashGet<StoredLeadPlan>(KEY_LEAD_PLANS, id)
}

export async function saveLeadPlan(plan: StoredLeadPlan): Promise<StoredLeadPlan> {
  await hashSet(KEY_LEAD_PLANS, plan.id, plan)
  return plan
}

export async function deleteLeadPlan(id: string): Promise<void> {
  await hashDelete(KEY_LEAD_PLANS, id)
}

/** Small bookkeeping values, e.g. when the leads were last imported. */
export async function getMeta<T>(field: string): Promise<T | null> {
  return hashGet<T>(KEY_META, field)
}

/* ------------------------------------------------------------------ *
 * Staff accounts
 * ------------------------------------------------------------------ */

export type StaffRoleValue = 'owner' | 'manager' | 'staff'

export interface StoredStaff {
  id: string
  name: string
  /** Lower-cased; the sign-in name. Unique among staff. */
  email: string
  phone: string
  role: StaffRoleValue
  /** Job title, e.g. "Tyre fitter" — free text, for people, not permissions. */
  position: string
  /** Dollars per hour, used to price timesheets. Null when not paid hourly. */
  payRate: number | null
  /** YYYY-MM-DD, or '' when unknown. */
  startDate: string
  notes: string
  active: boolean
  /** scrypt hash (see auth.ts). Absent for people who never sign in, e.g. a fitter on the floor. */
  passwordHash?: string
  /**
   * Stamped into every token issued to this person. Bumped on a password
   * change, a role change or deactivation, which ends every session they hold.
   */
  tokenVersion: number
  createdAt: string
  updatedAt: string
}

export async function listStaff(): Promise<StoredStaff[]> {
  return Object.values(await hashAll<StoredStaff>(KEY_STAFF)).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

export async function getStaff(id: string): Promise<StoredStaff | null> {
  if (!id) return null
  return hashGet<StoredStaff>(KEY_STAFF, id)
}

export async function findStaffByEmail(email: string): Promise<StoredStaff | null> {
  const needle = email.trim().toLowerCase()
  if (!needle) return null
  return (await listStaff()).find((member) => member.email === needle) ?? null
}

export async function saveStaff(member: StoredStaff): Promise<StoredStaff> {
  await hashSet(KEY_STAFF, member.id, member)
  return member
}

export async function deleteStaff(id: string): Promise<void> {
  await hashDelete(KEY_STAFF, id)
}

/* ------------------------------------------------------------------ *
 * Timesheets (hours worked, priced at the rate on the day)
 * ------------------------------------------------------------------ */

export interface StoredTimesheet {
  id: string
  staffId: string
  /** YYYY-MM-DD */
  date: string
  hours: number
  /** The pay rate when the hours were logged, so a later pay rise never reprices old weeks. */
  rate: number
  note: string
  paid: boolean
  paidAt?: string
  /** The wages expense the payment was recorded as. */
  expenseId?: string
  createdAt: string
  createdBy: string
}

export async function listTimesheets(): Promise<StoredTimesheet[]> {
  return Object.values(await hashAll<StoredTimesheet>(KEY_TIMESHEETS)).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
}

export async function getTimesheet(id: string): Promise<StoredTimesheet | null> {
  if (!id) return null
  return hashGet<StoredTimesheet>(KEY_TIMESHEETS, id)
}

export async function saveTimesheet(entry: StoredTimesheet): Promise<StoredTimesheet> {
  await hashSet(KEY_TIMESHEETS, entry.id, entry)
  return entry
}

export async function deleteTimesheet(id: string): Promise<void> {
  await hashDelete(KEY_TIMESHEETS, id)
}

/* ------------------------------------------------------------------ *
 * Inventory: per-product stock settings and the movement log
 *
 * The on-hand count itself stays in the product override (`stock`), because
 * that is what the storefront and checkout already read. These records add
 * what a stockroom needs on top: reorder points, cost, bin location, supplier,
 * and a history of every change with who made it and why.
 * ------------------------------------------------------------------ */

export interface StoredStockSettings {
  /** Alert when stock is at or below this. Null uses the shop-wide default. */
  reorderLevel: number | null
  /** Average cost per tyre, inc. GST. Null when never entered. */
  costPrice: number | null
  location: string
  supplier: string
  updatedAt: string
}

export type StockMoveType = 'receive' | 'adjust' | 'sale' | 'count'

export interface StoredStockMove {
  id: string
  productId: string
  sku: string
  type: StockMoveType
  /** Signed change: +4 received, -2 sold. */
  change: number
  before: number
  after: number
  reason: string
  note: string
  unitCost?: number
  supplier?: string
  /** Invoice number, order reference, etc. */
  reference?: string
  at: string
  by: string
}

export async function getStockSettings(): Promise<Record<string, StoredStockSettings>> {
  return hashAll<StoredStockSettings>(KEY_STOCK_SETTINGS)
}

export async function setStockSettings(
  productId: string,
  patch: Partial<Omit<StoredStockSettings, 'updatedAt'>>,
): Promise<StoredStockSettings> {
  const current = (await hashGet<StoredStockSettings>(KEY_STOCK_SETTINGS, productId)) ?? {
    reorderLevel: null,
    costPrice: null,
    location: '',
    supplier: '',
    updatedAt: '',
  }
  const next: StoredStockSettings = { ...current, ...patch, updatedAt: new Date().toISOString() }
  await hashSet(KEY_STOCK_SETTINGS, productId, next)
  return next
}

export async function listStockMoves(): Promise<StoredStockMove[]> {
  return Object.values(await hashAll<StoredStockMove>(KEY_STOCK_MOVES)).sort((a, b) =>
    b.at.localeCompare(a.at),
  )
}

export async function saveStockMove(move: StoredStockMove): Promise<StoredStockMove> {
  await hashSet(KEY_STOCK_MOVES, move.id, move)
  return move
}

/* ------------------------------------------------------------------ *
 * Ledger: money in and out that did not come through the online checkout
 *
 * Card payments taken by the website are NOT copied in here; they are read
 * straight from the orders, so the two can never disagree. This holds
 * everything else: bank transfers, cash, refunds and every expense.
 * ------------------------------------------------------------------ */

export type LedgerType = 'payment' | 'refund' | 'expense'

export interface StoredLedgerEntry {
  id: string
  type: LedgerType
  /** YYYY-MM-DD, the day the money moved. */
  date: string
  /** Always positive, GST-inclusive. `type` gives the direction. */
  amount: number
  /** The GST inside `amount` (0 for GST-free). */
  gst: number
  category: string
  method: string
  description: string
  /** Order reference, invoice or receipt number. */
  reference: string
  /** Customer, supplier or staff member. */
  counterparty: string
  orderId?: string
  /** What created it: typed in, a stock delivery, a wages run, or a sale at the counter (POS). */
  source: 'manual' | 'stock' | 'wages' | 'pos'
  createdAt: string
  createdBy: string
}

export async function listLedger(): Promise<StoredLedgerEntry[]> {
  return Object.values(await hashAll<StoredLedgerEntry>(KEY_LEDGER)).sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )
}

export async function getLedgerEntry(id: string): Promise<StoredLedgerEntry | null> {
  if (!id) return null
  return hashGet<StoredLedgerEntry>(KEY_LEDGER, id)
}

export async function saveLedgerEntry(entry: StoredLedgerEntry): Promise<StoredLedgerEntry> {
  await hashSet(KEY_LEDGER, entry.id, entry)
  return entry
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  await hashDelete(KEY_LEDGER, id)
}

export interface StoredFinanceSettings {
  /** Money in the business account on `openingDate`, before anything in the ledger. */
  openingBalance: number
  /** YYYY-MM-DD. Only money from this day on counts toward the running balance. */
  openingDate: string
  gstRegistered: boolean
  updatedAt: string
}

export async function getFinanceSettings(): Promise<StoredFinanceSettings> {
  return (
    (await hashGet<StoredFinanceSettings>(KEY_META, 'finance')) ?? {
      openingBalance: 0,
      openingDate: '',
      gstRegistered: true,
      updatedAt: '',
    }
  )
}

export async function setFinanceSettings(
  patch: Partial<Omit<StoredFinanceSettings, 'updatedAt'>>,
): Promise<StoredFinanceSettings> {
  const next: StoredFinanceSettings = {
    ...(await getFinanceSettings()),
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await hashSet(KEY_META, 'finance', next)
  return next
}

/* ------------------------------------------------------------------ *
 * Activity log — who changed what, newest first
 * ------------------------------------------------------------------ */

export interface StoredAuditEntry {
  id: string
  at: string
  actorId: string
  actorName: string
  /** Short verb, e.g. "stock.receive", "staff.create". */
  action: string
  /** One human sentence. Never a password, token or card detail. */
  detail: string
}

export async function listAudit(): Promise<StoredAuditEntry[]> {
  return Object.values(await hashAll<StoredAuditEntry>(KEY_AUDIT)).sort((a, b) =>
    b.at.localeCompare(a.at),
  )
}

export async function saveAudit(entry: StoredAuditEntry): Promise<void> {
  await hashSet(KEY_AUDIT, entry.id, entry)
}

/* ------------------------------------------------------------------ *
 * Claims: "do this only once", safe across concurrent requests
 * ------------------------------------------------------------------ */

/**
 * True for the first caller with this key, false for every later one. Atomic
 * on every backend (Redis HSETNX, a Postgres insert that ignores conflicts),
 * so two tabs polling the same Terminal charge cannot both record it.
 */
export async function claimOnce(key: string): Promise<boolean> {
  const at = JSON.stringify(new Date().toISOString())
  switch (storeBackend()) {
    case 'redis':
      return (await kvCommand<number>(['HSETNX', KEY_CLAIMS, key, at])) === 1
    case 'postgres': {
      await pgReady()
      const rows = await pg().query(
        `INSERT INTO spartan_store (bucket, field, value) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (bucket, field) DO NOTHING RETURNING field`,
        [KEY_CLAIMS, key, at],
      )
      return rows.length === 1
    }
    default: {
      const bucket = memoryBucket(KEY_CLAIMS)
      if (key in bucket) return false
      bucket[key] = at
      return true
    }
  }
}

export async function setMeta(field: string, value: unknown): Promise<void> {
  await hashSet(KEY_META, field, value)
}

/* ------------------------------------------------------------------ *
 * POS: counter customers, tickets, account payments, Terminal charges
 * ------------------------------------------------------------------ */

export interface StoredPosCustomer {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  notes: string
  /** Days to pay a sale on account, unless changed at the counter. */
  termsDays: number
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type PosLineSource = 'tyre' | 'service' | 'square' | 'custom'

export interface StoredPosLine {
  source: PosLineSource
  /** Product id, Square variation id, or '' for a typed line. */
  itemId: string
  name: string
  variation: string
  qty: number
  /** Per item, GST included. */
  price: number
  total: number
}

export type PosTicketStatus = 'open' | 'paid' | 'account' | 'void'
export type PosPayment = 'card' | 'cash' | 'other' | 'account'

export interface StoredPosTicket {
  ref: string
  status: PosTicketStatus
  customerId: string | null
  lines: StoredPosLine[]
  subtotal: number
  discount: number
  total: number
  /** Paid so far: the whole total once paid; part of it for a sale on account. */
  amountPaid: number
  note: string
  payment: PosPayment | null
  /** For 'other': how it was paid (bank transfer, card on another machine…). */
  paymentMethod: string
  squareOrderId: string | null
  squarePaymentId: string | null
  /** YYYY-MM-DD, for a sale on account. */
  dueDate: string | null
  stockApplied: boolean
  history: Array<{ at: string; by: string; what: string }>
  createdBy: string
  createdAt: string
  updatedAt: string
  paidAt: string | null
}

export interface StoredAccountPayment {
  ref: string
  customerId: string
  amount: number
  method: 'card' | 'cash' | 'other'
  methodLabel: string
  status: 'pending' | 'paid'
  /** Which account tickets it pays, oldest due first. */
  allocations: Array<{ ticketRef: string; amount: number; settles: boolean }>
  squarePaymentId: string | null
  createdBy: string
  createdAt: string
  paidAt: string | null
}

export type TerminalPurpose = 'ticket' | 'account' | 'custom'

export interface StoredTerminalCheckout {
  id: string
  purpose: TerminalPurpose
  /** Ticket or account-payment ref; '' for a custom amount. */
  ref: string
  amount: number
  note: string
  deviceId: string
  squareOrderId: string | null
  paymentId: string | null
  /** Square's status: PENDING, IN_PROGRESS, CANCEL_REQUESTED, CANCELED, COMPLETED. */
  status: string
  detail: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export async function listPosCustomers(): Promise<StoredPosCustomer[]> {
  return Object.values(await hashAll<StoredPosCustomer>(KEY_POS_CUSTOMERS)).sort((a, b) =>
    (a.company || a.name).localeCompare(b.company || b.name),
  )
}
export async function getPosCustomer(id: string): Promise<StoredPosCustomer | null> {
  return id ? hashGet<StoredPosCustomer>(KEY_POS_CUSTOMERS, id) : null
}
export async function savePosCustomer(c: StoredPosCustomer): Promise<StoredPosCustomer> {
  await hashSet(KEY_POS_CUSTOMERS, c.id, c)
  return c
}
export async function deletePosCustomer(id: string): Promise<void> {
  await hashDelete(KEY_POS_CUSTOMERS, id)
}

export async function listPosTickets(): Promise<StoredPosTicket[]> {
  return Object.values(await hashAll<StoredPosTicket>(KEY_POS_TICKETS)).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
}
export async function getPosTicket(ref: string): Promise<StoredPosTicket | null> {
  return ref ? hashGet<StoredPosTicket>(KEY_POS_TICKETS, ref) : null
}
export async function savePosTicket(t: StoredPosTicket): Promise<StoredPosTicket> {
  await hashSet(KEY_POS_TICKETS, t.ref, t)
  return t
}

export async function listAccountPayments(): Promise<StoredAccountPayment[]> {
  return Object.values(await hashAll<StoredAccountPayment>(KEY_POS_ACCOUNT_PAYMENTS)).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}
export async function getAccountPayment(ref: string): Promise<StoredAccountPayment | null> {
  return ref ? hashGet<StoredAccountPayment>(KEY_POS_ACCOUNT_PAYMENTS, ref) : null
}
export async function saveAccountPayment(p: StoredAccountPayment): Promise<StoredAccountPayment> {
  await hashSet(KEY_POS_ACCOUNT_PAYMENTS, p.ref, p)
  return p
}

export async function listTerminalCheckouts(): Promise<StoredTerminalCheckout[]> {
  return Object.values(await hashAll<StoredTerminalCheckout>(KEY_TERMINAL_CHECKOUTS)).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}
export async function getTerminalCheckout(id: string): Promise<StoredTerminalCheckout | null> {
  return id ? hashGet<StoredTerminalCheckout>(KEY_TERMINAL_CHECKOUTS, id) : null
}
export async function saveTerminalCheckout(c: StoredTerminalCheckout): Promise<StoredTerminalCheckout> {
  await hashSet(KEY_TERMINAL_CHECKOUTS, c.id, c)
  return c
}
