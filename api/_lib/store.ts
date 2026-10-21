/**
 * Persistence for orders, enquiries, subscribers and product overrides.
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
  updatedAt: string
}

const KEY_LEADS = 'spartan:leads'
const KEY_LEAD_STATUS = 'spartan:lead-status'
const KEY_META = 'spartan:meta'
const KEY_ORDERS = 'spartan:orders'
const KEY_ENQUIRIES = 'spartan:enquiries'
const KEY_SUBSCRIBERS = 'spartan:subscribers'
const KEY_OVERRIDES = 'spartan:overrides'
const KEY_SELFTEST = 'spartan:selftest'

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
  patch: Partial<Pick<StoredLeadStatus, 'status' | 'notes'>>,
): Promise<StoredLeadStatus> {
  const current = (await hashGet<StoredLeadStatus>(KEY_LEAD_STATUS, key)) ?? {
    status: 'New' as const,
    notes: '',
    updatedAt: '',
  }
  const next: StoredLeadStatus = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await hashSet(KEY_LEAD_STATUS, key, next)
  return next
}

/** Small bookkeeping values, e.g. when the leads were last imported. */
export async function getMeta<T>(field: string): Promise<T | null> {
  return hashGet<T>(KEY_META, field)
}
