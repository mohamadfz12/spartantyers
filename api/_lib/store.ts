/**
 * Persistence for orders, enquiries, subscribers and product overrides.
 *
 * TWO BACKENDS, CHOSEN AT RUNTIME
 *
 * 1. Vercel KV / Upstash Redis, when both `KV_REST_API_URL` and
 *    `KV_REST_API_TOKEN` are present. Talked to over its REST API with plain
 *    `fetch` so no SDK dependency is introduced. Every collection is a Redis
 *    HASH keyed by id, which gives us cheap single-field updates (an order
 *    status change rewrites one field, not the whole collection) and a single
 *    `HGETALL` for listing.
 *
 * 2. An in-memory fallback cached on `globalThis`.
 *
 *    !! DEVELOPMENT ONLY !!
 *    Serverless filesystems and process memory are ephemeral: the fallback
 *    survives only while a single lambda instance stays warm, is NOT shared
 *    between concurrent instances, and is wiped on every cold start and every
 *    new deployment. It exists so `vercel dev` and preview builds work without
 *    provisioning a database — never rely on it for real orders. Provision KV
 *    before taking payments.
 */

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

const KEY_ORDERS = 'spartan:orders'
const KEY_ENQUIRIES = 'spartan:enquiries'
const KEY_SUBSCRIBERS = 'spartan:subscribers'
const KEY_OVERRIDES = 'spartan:overrides'

/* ------------------------------------------------------------------ *
 * Backend selection
 * ------------------------------------------------------------------ */

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

export function isPersistent(): boolean {
  return kvConfig() !== null
}

/** Human-readable backend name, for the admin UI / health checks. */
export function storeBackend(): 'kv' | 'memory' {
  return isPersistent() ? 'kv' : 'memory'
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
 * In-memory fallback (development only — see file header)
 * ------------------------------------------------------------------ */

interface MemoryStore {
  orders: Record<string, StoredOrder>
  enquiries: Record<string, StoredEnquiry>
  subscribers: Record<string, StoredSubscriber>
  overrides: Record<string, StoredOverride>
}

const MEMORY_KEY = '__spartanMemoryStore__'

function memory(): MemoryStore {
  const g = globalThis as typeof globalThis & {
    [MEMORY_KEY]?: MemoryStore
  }
  if (!g[MEMORY_KEY]) {
    g[MEMORY_KEY] = {
      orders: {},
      enquiries: {},
      subscribers: {},
      overrides: {},
    }
  }
  return g[MEMORY_KEY]
}

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

export async function listOrders(): Promise<StoredOrder[]> {
  const map = isPersistent()
    ? await kvHashAll<StoredOrder>(KEY_ORDERS)
    : memory().orders

  return Object.values(map).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}

export async function getOrder(id: string): Promise<StoredOrder | null> {
  if (!id) return null
  if (isPersistent()) return kvHashGet<StoredOrder>(KEY_ORDERS, id)
  return memory().orders[id] ?? null
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
  if (isPersistent()) {
    await kvHashSet(KEY_ORDERS, order.id, order)
  } else {
    memory().orders[order.id] = order
  }
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
  const map = isPersistent()
    ? await kvHashAll<StoredEnquiry>(KEY_ENQUIRIES)
    : memory().enquiries

  return Object.values(map).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}

export async function saveEnquiry(
  enquiry: StoredEnquiry,
): Promise<StoredEnquiry> {
  if (isPersistent()) {
    await kvHashSet(KEY_ENQUIRIES, enquiry.id, enquiry)
  } else {
    memory().enquiries[enquiry.id] = enquiry
  }
  return enquiry
}

/* ------------------------------------------------------------------ *
 * Newsletter subscribers
 * ------------------------------------------------------------------ */

export async function listSubscribers(): Promise<StoredSubscriber[]> {
  const map = isPersistent()
    ? await kvHashAll<StoredSubscriber>(KEY_SUBSCRIBERS)
    : memory().subscribers

  return Object.values(map).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
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

  const existing = isPersistent()
    ? await kvHashGet<StoredSubscriber>(KEY_SUBSCRIBERS, key)
    : (memory().subscribers[key] ?? null)

  if (existing) return { subscriber: existing, alreadySubscribed: true }

  const subscriber: StoredSubscriber = {
    email: key,
    createdAt: new Date().toISOString(),
  }

  if (isPersistent()) {
    await kvHashSet(KEY_SUBSCRIBERS, key, subscriber)
  } else {
    memory().subscribers[key] = subscriber
  }

  return { subscriber, alreadySubscribed: false }
}

/* ------------------------------------------------------------------ *
 * Product overrides (price / discount / stock)
 * ------------------------------------------------------------------ */

export async function getOverrides(): Promise<Record<string, StoredOverride>> {
  if (isPersistent()) return kvHashAll<StoredOverride>(KEY_OVERRIDES)
  return { ...memory().overrides }
}

export async function setOverride(
  id: string,
  patch: StoredOverride,
): Promise<StoredOverride> {
  const current = isPersistent()
    ? ((await kvHashGet<StoredOverride>(KEY_OVERRIDES, id)) ?? {})
    : (memory().overrides[id] ?? {})

  const next: StoredOverride = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  if (isPersistent()) {
    await kvHashSet(KEY_OVERRIDES, id, next)
  } else {
    memory().overrides[id] = next
  }

  return next
}
