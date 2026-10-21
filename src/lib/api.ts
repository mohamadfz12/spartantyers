/**
 * Thin typed client over the `/api/*` serverless functions.
 *
 * Every call degrades gracefully: the marketing site and the shop stay fully
 * browsable from bundled data even when the API is unreachable, so a cold
 * function or a missing environment variable can never produce a blank page.
 */

import type { Order, Product } from '@/data/types'

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15000, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(path, {
      ...rest,
      signal: controller.signal,
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...rest.headers,
      },
    })

    const text = await response.text()
    const payload = text ? safeParse(text) : null

    if (!response.ok) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : null) ?? `Request failed with status ${response.status}`
      throw new ApiError(message, response.status, payload)
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('The request timed out. Please try again.', 408)
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      0,
    )
  } finally {
    clearTimeout(timer)
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 500) }
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(body),
})

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

export interface InventoryResponse {
  products: Product[]
  updatedAt: string
}

export const api = {
  /** Live stock levels and pricing. Callers fall back to bundled data. */
  inventory: () => request<InventoryResponse>('/api/inventory'),

  /* -------------------------------------------------------------- *
   * Square payments
   * -------------------------------------------------------------- */

  squareConfig: () =>
    request<{
      applicationId: string
      locationId: string
      environment: 'sandbox' | 'production'
      afterpayEnabled: boolean
      afterpayMaxOrder: number
    }>('/api/square/config'),

  createPayment: (body: {
    sourceId: string
    verificationToken?: string
    idempotencyKey: string
    fulfilment: 'delivery' | 'pickup'
    fittingTyres: number
    promoCode?: string
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
    lines: Array<{ id: string; quantity: number }>
    notes?: string
    /** The total the customer was shown. Compared, never used to price. */
    expectedTotal?: number
  }) =>
    request<{
      ok: true
      reference: string
      orderId: string
      paymentId: string
      total: number
      receiptUrl?: string
    }>('/api/square/create-payment', { ...json(body), timeoutMs: 30000 }),

  /* -------------------------------------------------------------- *
   * Storefront actions
   * -------------------------------------------------------------- */

  validatePromo: (code: string) =>
    request<{
      valid: boolean
      code?: string
      percentOff?: number
      description?: string
      reason?: string
    }>('/api/promo/validate', json({ code })),

  quoteFitting: (tyres: number) =>
    request<{ tyres: number; perTyre: number; total: number }>(
      '/api/services/fitting',
      json({ tyres }),
    ),

  contact: (body: {
    name: string
    email: string
    phone?: string
    company?: string
    enquiryType: string
    message: string
  }) => request<{ ok: true }>('/api/contact', json(body)),

  newsletter: (email: string) =>
    request<{ ok: true; alreadySubscribed?: boolean }>(
      '/api/newsletter',
      json({ email }),
    ),

  chat: (body: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }) => request<{ reply: string }>('/api/chat', { ...json(body), timeoutMs: 30000 }),

  lookupOrder: (reference: string, email: string) =>
    request<{ order: Order }>(
      `/api/orders?reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(email)}`,
    ),

  /* -------------------------------------------------------------- *
   * Admin — all calls carry the bearer token from the admin store.
   * -------------------------------------------------------------- */

  admin: {
    login: (password: string) =>
      request<{ token: string; expiresAt: string }>(
        '/api/admin/login',
        json({ password }),
      ),

    stats: (token: string) =>
      request<{
        revenue: number
        orderCount: number
        unitsSold: number
        averageOrderValue: number
        lowStock: Array<{ id: string; model: string; size: string; stock: number }>
        revenueByDay: Array<{ date: string; revenue: number }>
        topProducts: Array<{ id: string; model: string; size: string; units: number }>
        /** Live database state: 'memory' means nothing is being kept. */
        storage: 'connected' | 'memory'
      }>('/api/admin/stats', { headers: auth(token) }),

    products: (token: string) =>
      request<{ products: Product[] }>('/api/admin/products', {
        headers: auth(token),
      }),

    updateProduct: (
      token: string,
      id: string,
      patch: Partial<Pick<Product, 'price' | 'discount' | 'stock'>>,
    ) =>
      request<{ product: Product }>('/api/admin/products', {
        method: 'PATCH',
        body: JSON.stringify({ id, patch }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),

    orders: (token: string) =>
      request<{ orders: Order[] }>('/api/admin/orders', { headers: auth(token) }),

    updateOrder: (token: string, id: string, status: Order['status']) =>
      request<{ order: Order }>('/api/admin/orders', {
        method: 'PATCH',
        body: JSON.stringify({ id, status }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),

    enquiries: (token: string) =>
      request<{
        enquiries: Array<{
          id: string
          createdAt: string
          name: string
          email: string
          phone?: string
          company?: string
          enquiryType: string
          message: string
          handled: boolean
        }>
        subscribers: Array<{ email: string; createdAt: string }>
      }>('/api/admin/enquiries', { headers: auth(token) }),

    leads: (token: string) =>
      request<{
        leads: Lead[]
        statuses: Record<string, LeadStatus>
        importedAt: string | null
        statusOptions: LeadStatusValue[]
      }>('/api/admin/leads', { headers: auth(token), timeoutMs: 45000 }),

    updateLead: (
      token: string,
      key: string,
      patch: Partial<Pick<LeadStatus, 'status' | 'notes'>>,
    ) =>
      request<{ key: string; status: LeadStatus }>('/api/admin/leads', {
        method: 'PATCH',
        body: JSON.stringify({ key, ...patch }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),
  },
}

/* ------------------------------------------------------------------ *
 * Leads (admin only — never bundled into the public site)
 * ------------------------------------------------------------------ */

export type LeadRegion = 'Metro' | 'N NSW' | 'W NSW' | 'S NSW'
export type LeadCategory = 'Transport' | 'Truck Tyre Reseller'

export interface Lead {
  /** Stable across re-imports; statuses and notes are stored against it. */
  key: string
  name: string
  category: LeadCategory
  subtype: string
  website: string
  description: string
  region: LeadRegion
  area: string
  city: string
  address: string
  phones: string[]
  emails: string[]
  contact_page: string
  other_contacts: string
  /** Potential as a truck-tyre customer. */
  size: 'Large' | 'Medium' | 'Small' | ''
  /** '<10' | '10–30' | '30–50' | '50+' */
  employees: string
  fleet: string
  size_basis: string
  source: string
  reach: string
  priority: 'A' | 'B' | 'C'
}

export type LeadStatusValue =
  | 'New'
  | 'Called'
  | 'Interested'
  | 'Quote sent'
  | 'Customer'
  | 'Not interested'
  | 'Wrong number'

export interface LeadStatus {
  status: LeadStatusValue
  notes: string
  updatedAt: string
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}
