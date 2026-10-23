/**
 * Thin typed client over the `/api/*` serverless functions.
 *
 * Every call degrades gracefully: the marketing site and the shop stay fully
 * browsable from bundled data even when the API is unreachable, so a cold
 * function or a missing environment variable can never produce a blank page.
 */

import type { Order, Product } from '@/data/types'
import type { StaffRole } from '@/lib/admin-roles'
import type { LeadPlan, LeadPlanInput } from '@/lib/lead-plans'

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

/* ------------------------------------------------------------------ *
 * Admin: the AI assistant (what the server answers; see
 * api/_lib/handlers/admin-ai-*.ts). No addresses or hashes in any of it.
 * ------------------------------------------------------------------ */

export type AiMode = 'real' | 'practice' | 'off' | 'not_configured'

export interface AiSettingsView {
  enabled: boolean
  voiceEnabled: boolean
  dailyLimitUsd: number
  monthlyLimitUsd: number
}

export interface AiStatus {
  chat: { mode: AiMode; reason: string; model: string | null }
  voice: {
    mode: AiMode
    reason: string
    model: string | null
    /** The length calls really get here (fitted to the server's time limit), and the length that is set. */
    callSeconds: number
    configuredSeconds: number
    /** The smallest daily limit, in dollars, that lets a call start (null for practice calls). */
    minDailyUsd: number | null
  }
  limits: {
    dailyUsd: number
    monthlyUsd: number
    savedDailyUsd: number
    savedMonthlyUsd: number
    dailyCapUsd: number | null
    monthlyCapUsd: number | null
  }
  spend: { todayUsd: number; monthUsd: number; day: string }
  database: { connected: boolean }
  disabledByEnv: boolean
  settings: AiSettingsView
  warnings: string[]
}

export type AiConversationFilter = 'all' | 'chat' | 'call' | 'person'

export interface AiConversationRow {
  id: string
  startedAt: string
  lastAt: string
  messages: number
  hasCall: boolean
  hasChat: boolean
  askedForPerson: boolean
  cardsShown: number
  cardsAdded: number
  cardsSent: number
  orderRef: string | null
  preview: string
}

export type AiCardOutcome = 'added' | 'sent' | 'dismissed' | 'failed' | 'none'

export interface AiCardView {
  id: string
  kind: 'cart' | 'quote' | 'handover'
  summary: string
  outcome: AiCardOutcome
}

export type AiTranscriptEntry =
  | {
      kind: 'message'
      id: number
      role: 'customer' | 'assistant'
      text: string
      at: string
      onCall: boolean
      did: string[]
      pages: Array<{ to: string; note: string }>
      cards: AiCardView[]
      buttons: boolean
      emergency: boolean
      fallback: string | null
    }
  | { kind: 'event'; id: number; text: string; at: string }
  | {
      kind: 'call'
      id: string
      at: string
      endedAt: string | null
      status: string
      seconds: number
      endReason: string
      lines: number
      practice: boolean
    }

export interface AiConversationDetail {
  id: string
  startedAt: string
  lastAt: string
  orderRef: string | null
  askedForPerson: boolean
  entries: AiTranscriptEntry[]
  truncated: boolean
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
    /** The assistant chat that filled the cart, so staff see it with the order. */
    conversationId?: string
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

  lookupOrder: (reference: string, email: string) =>
    request<{ order: Order }>(
      `/api/orders?reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(email)}`,
    ),

  /* -------------------------------------------------------------- *
   * Admin — all calls carry the bearer token from the admin store.
   * -------------------------------------------------------------- */

  admin: {
    /** No email: the owner password. With an email: that staff member's own password. */
    login: (password: string, email?: string) =>
      request<{ token: string; expiresAt: string; user: AdminUser }>(
        '/api/admin/login',
        json(email ? { email, password } : { password }),
      ),

    me: (token: string) =>
      request<{ user: AdminUser }>('/api/admin/me', { headers: auth(token) }),

    inventory: (token: string) =>
      request<{
        items: InventoryItem[]
        moves: StockMove[]
        totalMoves: number
        defaultReorderLevel: number
        reasons: string[]
      }>('/api/admin/inventory', { headers: auth(token) }),

    inventoryAction: (token: string, body: InventoryAction) =>
      request<{ item: InventoryItem; move?: StockMove; expenseId?: string | null }>(
        '/api/admin/inventory',
        { ...json(body), headers: auth(token) },
      ),

    staff: (token: string) =>
      request<{ staff: StaffMember[]; timesheets: Timesheet[]; canManageAccounts: boolean }>(
        '/api/admin/staff',
        { headers: auth(token) },
      ),

    createStaff: (token: string, member: StaffInput) =>
      request<{ member: StaffMember }>('/api/admin/staff', {
        ...json(member),
        headers: auth(token),
      }),

    updateStaff: (
      token: string,
      id: string,
      changes: Partial<StaffInput> & { active?: boolean; removeLogin?: boolean },
    ) =>
      request<{ member: StaffMember }>('/api/admin/staff', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...changes }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),

    deleteStaff: (token: string, id: string) =>
      request<{ ok: true }>(`/api/admin/staff?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth(token),
      }),

    logHours: (
      token: string,
      entry: { staffId: string; date: string; hours: number; note?: string; rate?: number },
    ) =>
      request<{ entry: Timesheet }>('/api/admin/timesheets', {
        ...json(entry),
        headers: auth(token),
      }),

    payHours: (token: string, ids: string[], date: string, method: string) =>
      request<{ entries: Timesheet[]; expense: LedgerEntry }>('/api/admin/timesheets', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'pay', ids, date, method }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),

    deleteHours: (token: string, id: string) =>
      request<{ ok: true }>(`/api/admin/timesheets?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth(token),
      }),

    ledger: (token: string) =>
      request<LedgerResponse>('/api/admin/ledger', { headers: auth(token) }),

    createLedgerEntry: (token: string, entry: LedgerInput & { markOrderPaid?: boolean }) =>
      request<{ entry: LedgerEntry; orderMarkedPaid: boolean }>('/api/admin/ledger', {
        ...json(entry),
        headers: auth(token),
      }),

    updateLedgerEntry: (token: string, id: string, entry: LedgerInput) =>
      request<{ entry: LedgerEntry; orderMarkedPaid: boolean }>('/api/admin/ledger', {
        method: 'PATCH',
        body: JSON.stringify({ id, ...entry }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),

    deleteLedgerEntry: (token: string, id: string) =>
      request<{ ok: true; unpaid: number }>(`/api/admin/ledger?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth(token),
      }),

    saveFinanceSettings: (
      token: string,
      settings: Partial<Pick<FinanceSettings, 'openingBalance' | 'openingDate' | 'gstRegistered'>>,
    ) =>
      request<{ settings: FinanceSettings }>('/api/admin/ledger', {
        method: 'PATCH',
        body: JSON.stringify({ settings }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),

    customers: (token: string) =>
      request<{ customers: Customer[] }>('/api/admin/customers', { headers: auth(token) }),

    /** The counter till: GET views (see api/_lib/handlers/admin-pos.ts). */
    pos: <T,>(token: string, params: Record<string, string>) =>
      request<T>(`/api/admin/pos?${new URLSearchParams(params).toString()}`, {
        headers: auth(token),
        timeoutMs: 30000,
      }),

    posAction: <T,>(token: string, body: Record<string, unknown>) =>
      request<T>('/api/admin/pos', { ...json(body), headers: auth(token), timeoutMs: 30000 }),

    /** The Square account: GET views (see api/_lib/handlers/admin-square.ts). */
    square: <T,>(token: string, params: Record<string, string>) =>
      request<T>(`/api/admin/square?${new URLSearchParams(params).toString()}`, {
        headers: auth(token),
        timeoutMs: 45000,
      }),

    squareAction: <T,>(token: string, body: Record<string, unknown>) =>
      request<T>('/api/admin/square', { ...json(body), headers: auth(token), timeoutMs: 30000 }),

    activity: (token: string) =>
      request<{ entries: ActivityEntry[]; total: number }>('/api/admin/activity', {
        headers: auth(token),
      }),

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
        /** The team's day plans, earliest day first. */
        plans: LeadPlan[]
        /** Active staff names, suggested for who does a day. */
        people: string[]
      }>('/api/admin/leads', { headers: auth(token), timeoutMs: 45000 }),

    /** Makes a day plan, or changes one when `id` is given. */
    saveLeadPlan: (token: string, plan: LeadPlanInput & { id?: string }) =>
      request<{ plan: LeadPlan }>('/api/admin/leads', {
        method: plan.id ? 'PUT' : 'POST',
        body: JSON.stringify(plan),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
        // The server reads the whole lead list to check the towns.
        timeoutMs: 30000,
      }),

    deleteLeadPlan: (token: string, id: string) =>
      request<{ ok: true }>(`/api/admin/leads?plan=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth(token),
        timeoutMs: 30000,
      }),

    updateLead: (
      token: string,
      key: string,
      patch: LeadStatusPatch,
    ) =>
      request<{ key: string; status: LeadStatus }>('/api/admin/leads', {
        method: 'PATCH',
        body: JSON.stringify({ key, ...patch }),
        headers: { ...auth(token), 'Content-Type': 'application/json' },
      }),
    aiStatus: (token: string) =>
      request<AiStatus>('/api/admin/ai-status', { headers: auth(token) }),

    aiSettings: (token: string) =>
      request<{ settings: AiSettingsView; disabledByEnv: boolean }>(
        '/api/admin/ai-settings',
        { headers: auth(token) },
      ),

    saveAiSettings: (token: string, patch: Partial<AiSettingsView>) =>
      request<{ settings: AiSettingsView; disabledByEnv: boolean }>(
        '/api/admin/ai-settings',
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
          headers: { ...auth(token), 'Content-Type': 'application/json' },
        },
      ),

    aiConversations: (
      token: string,
      params: { filter: AiConversationFilter; q: string; cursor?: string },
    ) => {
      const query = new URLSearchParams({ filter: params.filter })
      if (params.q) query.set('q', params.q)
      if (params.cursor) query.set('cursor', params.cursor)
      return request<{
        conversations: AiConversationRow[]
        next: string | null
        total: number
      }>(`/api/admin/ai-conversations?${query.toString()}`, { headers: auth(token) })
    },

    aiConversation: (token: string, id: string) =>
      request<{ conversation: AiConversationDetail }>(
        `/api/admin/ai-conversation?id=${encodeURIComponent(id)}`,
        { headers: auth(token) },
      ),
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
  /** Hours spent researching this company. Absent when not recorded. */
  researchHours?: number
  updatedAt: string
}

export type LeadStatusPatch = Partial<Pick<LeadStatus, 'status' | 'notes'>> & {
  /** null clears it. */
  researchHours?: number | null
}

/* ------------------------------------------------------------------ *
 * Admin: staff, inventory, money (see api/_lib/handlers/admin-*.ts)
 * ------------------------------------------------------------------ */

export interface AdminUser {
  /** `owner` for the deployment's owner password. */
  id: string
  name: string
  role: StaffRole
  email: string
}

export interface StaffMember {
  id: string
  name: string
  email: string
  phone: string
  role: StaffRole
  position: string
  payRate: number | null
  startDate: string
  notes: string
  active: boolean
  /** True when they have a password and can sign in. */
  hasLogin: boolean
  createdAt: string
  updatedAt: string
}

export interface StaffInput {
  name: string
  email: string
  phone: string
  role: StaffRole
  position: string
  payRate: number | null
  startDate: string
  notes: string
  /** Sets or replaces their password. Omit to leave it alone. */
  password?: string
}

export interface Timesheet {
  id: string
  staffId: string
  date: string
  hours: number
  rate: number
  note: string
  paid: boolean
  paidAt?: string
  expenseId?: string
  createdAt: string
  createdBy: string
}

export interface StockSettings {
  reorderLevel: number | null
  costPrice: number | null
  location: string
  supplier: string
  updatedAt: string
}

export interface InventoryItem {
  product: Product
  settings: StockSettings | null
}

export interface StockMove {
  id: string
  productId: string
  sku: string
  type: 'receive' | 'adjust' | 'sale' | 'count'
  change: number
  before: number
  after: number
  reason: string
  note: string
  unitCost?: number
  supplier?: string
  reference?: string
  at: string
  by: string
}

export type InventoryAction =
  | {
      action: 'receive'
      productId: string
      quantity: number
      unitCost?: number
      supplier?: string
      reference?: string
      note?: string
      recordExpense?: boolean
    }
  | {
      action: 'adjust'
      productId: string
      mode: 'add' | 'remove' | 'set'
      quantity: number
      reason: string
      note?: string
    }
  | {
      action: 'settings'
      productId: string
      reorderLevel?: number | null
      costPrice?: number | null
      location?: string
      supplier?: string
    }

export type LedgerType = 'payment' | 'refund' | 'expense'

export interface LedgerEntry {
  id: string
  type: LedgerType
  date: string
  amount: number
  gst: number
  category: string
  method: string
  description: string
  reference: string
  counterparty: string
  orderId?: string
  source: 'manual' | 'stock' | 'wages' | 'pos'
  createdAt: string
  createdBy: string
}

export interface LedgerInput {
  type: LedgerType
  date: string
  amount: number
  gst: number
  category: string
  method: string
  description: string
  reference: string
  counterparty: string
  orderId?: string
}

/** A card payment taken by the website checkout, read from its order. */
export interface OnlinePayment {
  id: string
  reference: string
  date: string
  createdAt: string
  amount: number
  gst: number
  customer: string
  email: string
  status: Order['status']
  paymentId: string
  /** False for cancelled orders: the money went back through Square. */
  counted: boolean
}

export interface UnpaidOrder {
  id: string
  reference: string
  date: string
  total: number
  customer: string
  paidSoFar: number
}

export interface FinanceSettings {
  openingBalance: number
  openingDate: string
  gstRegistered: boolean
  updatedAt: string
}

export interface LedgerResponse {
  entries: LedgerEntry[]
  online: OnlinePayment[]
  unpaidOrders: UnpaidOrder[]
  settings: FinanceSettings
  /** Today in Sydney, YYYY-MM-DD. */
  today: string
}

export interface Customer {
  email: string
  name: string
  phone: string
  company: string
  suburb: string
  orders: number
  tyres: number
  spent: number
  firstOrder: string
  lastOrder: string
  references: string[]
  subscribed: boolean
}

/* ---- Counter till (POS) ------------------------------------------ */

export type PosLineSource = 'tyre' | 'service' | 'square' | 'custom'

export interface PosItem {
  key: string
  source: 'tyre' | 'service' | 'square'
  itemId: string
  name: string
  variation: string
  /** GST included; null means "enter the price when selling". */
  price: number | null
  /** Tyres only. */
  stock: number | null
  sku: string
  squareItemId?: string
  singlePrice?: boolean
}

export interface PosLine {
  source: PosLineSource
  itemId: string
  name: string
  variation: string
  qty: number
  price: number
  total?: number
}

export interface PosCustomer {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  notes: string
  termsDays: number
  createdAt: string
  updatedAt: string
  balance?: PosBalance
}

export interface PosBalance {
  due: number
  overdue: number
  count: number
}

export type PosTicketStatus = 'open' | 'paid' | 'account' | 'void'

export interface PosTicket {
  ref: string
  status: PosTicketStatus
  customerId: string | null
  customer: PosCustomer | null
  lines: PosLine[]
  subtotal: number
  discount: number
  total: number
  amountPaid: number
  note: string
  payment: 'card' | 'cash' | 'other' | 'account' | null
  paymentMethod: string
  dueDate: string | null
  history: Array<{ at: string; by: string; what: string }>
  createdBy: string
  createdAt: string
  updatedAt: string
  paidAt: string | null
}

export interface PosAccountPayment {
  ref: string
  customerId: string
  amount: number
  method: 'card' | 'cash' | 'other'
  methodLabel: string
  status: 'pending' | 'paid'
  allocations: Array<{ ticketRef: string; amount: number; settles: boolean }>
  createdAt: string
  paidAt: string | null
}

export interface AccountPreview {
  owed: number
  left: number
  tickets: Array<{ ref: string; dueDate: string | null; total: number; owing: number }>
  allocations: Array<{ ticketRef: string; amount: number; settles: boolean }>
}

export interface TerminalCheckout {
  id: string
  purpose: 'ticket' | 'account' | 'custom'
  ref: string
  amount: number
  note: string
  status: string
  detail: string
  createdAt: string
}

export interface TerminalDevice {
  id: string
  name: string
  pairedAt: string
}

export interface ActivityEntry {
  id: string
  at: string
  actorId: string
  actorName: string
  action: string
  detail: string
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}
