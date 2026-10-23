import { site } from '@/config/site'
import type { AccountLevel } from '@/lib/account-portal'

/* ------------------------------------------------------------------ *
 * Browser client for /api/account/*
 *
 * The session is an httpOnly cookie the browser sends by itself: nothing
 * about it is read or stored here. Errors come back as `{ error, field? }`;
 * network problems and non-JSON replies get a plain-English message.
 * ------------------------------------------------------------------ */

export interface CustomerAccount {
  id: string
  email: string
  name: string
  company: string
  phone: string
  abn: string
  address: string
  level: AccountLevel
  requestedLevel: 'bulk' | 'wholesaler' | null
  status: 'active' | 'suspended'
  discountPct: number
  payLater: boolean
  termsDays: number
  creditLimit: number
  outstanding: number
  emailVerified: boolean
  /** Pay later is on, the account is active and linked to its till customer: an order on account can go through. */
  payLaterReady: boolean
}

export class AccountApiError extends Error {
  readonly status: number
  readonly field?: string
  constructor(message: string, status: number, field?: string) {
    super(message)
    this.name = 'AccountApiError'
    this.status = status
    this.field = field
  }
}

const OFFLINE = 'We could not reach the server. Check your connection and try again.'
const UNAVAILABLE = `Accounts are not available right now. Please call us on ${site.phone.display}.`
const TIMEOUT_MS = 15000

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`/api/account/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })
  } catch {
    throw new AccountApiError(OFFLINE, 0)
  } finally {
    clearTimeout(timer)
  }

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const message = typeof record.error === 'string' && record.error ? record.error : response.status >= 500 || response.status === 404 ? UNAVAILABLE : 'Something went wrong. Please try again.'
    const field = typeof record.field === 'string' ? record.field : undefined
    throw new AccountApiError(message, response.status, field)
  }
  if (data === null || typeof data !== 'object') throw new AccountApiError(UNAVAILABLE, response.status)
  return data as T
}

export interface SignupInput {
  name: string
  email: string
  password: string
  requestedLevel: AccountLevel
  company?: string
  phone?: string
  abn?: string
  address?: string
  message?: string
}

export interface DetailsInput {
  name: string
  company: string
  phone: string
  abn: string
  address: string
}

export interface OrderLine {
  name: string
  size: string
  quantity: number
  unitPrice: number
  basis?: string
}

export interface AccountOrder {
  reference: string
  createdAt: string
  status: string
  fulfilment: 'pickup' | 'delivery'
  lines: OrderLine[]
  fittingTyres: number
  subtotal: number
  discount: number
  fittingTotal: number
  total: number
  channel: 'retail' | 'bulk' | 'wholesale'
  payment: 'card' | 'account'
  dueDate?: string | null
  paid?: boolean
  overdue?: boolean
}

export interface StatementItem {
  kind: 'ticket' | 'order'
  reference: string
  date: string
  dueDate: string | null
  total: number
  paid: number
  owing: number
  overdue: boolean
}

export interface StatementPayment {
  ref: string
  date: string
  amount: number
  method: string
  allocations: Array<{ ticketRef: string; amount: number }>
}

export interface AccountStatement {
  linked: boolean
  balance: { due: number; overdue: number; count: number }
  open: StatementItem[]
  payments: StatementPayment[]
}

type Reply = { account: CustomerAccount }

export const accountApi = {
  orders: async () => (await call<{ orders: AccountOrder[] }>('orders', 'GET')).orders,
  statement: async () => call<AccountStatement>('statement', 'GET'),
  /**
   * The signed-in account, or null when signed out. Uses `session`, which answers a signed-out visitor
   * with a normal 200 (no console error on every page). Other failures (offline, down) are thrown.
   */
  async me(): Promise<CustomerAccount | null> {
    try {
      return (await call<{ account: CustomerAccount | null }>('session', 'GET')).account
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) return null
      throw error
    }
  },
  signup: async (input: SignupInput) => (await call<Reply>('signup', 'POST', input)).account,
  login: async (email: string, password: string) => (await call<Reply>('login', 'POST', { email, password })).account,
  logout: async () => {
    await call<{ ok: true }>('logout', 'POST', {})
  },
  forgot: async (email: string) => {
    await call<{ ok: true }>('forgot', 'POST', { email })
  },
  setPassword: async (token: string, password: string) => (await call<Reply>('set-password', 'POST', { token, password })).account,
  saveDetails: async (input: DetailsInput) => (await call<Reply>('details', 'POST', input)).account,
  changePassword: async (current: string, next: string) => (await call<Reply>('password', 'POST', { current, next })).account,
}
