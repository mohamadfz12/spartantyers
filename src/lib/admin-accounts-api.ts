/**
 * Admin client for customer accounts (the `accounts`, `account` and `account-*` actions of
 * /api/admin/[action], served by api/_lib/handlers/admin-accounts.ts) and for the sales-by-type report.
 *
 * Kept in its own file so the shared client in api.ts stays as it is. Every call carries the staff
 * bearer token; failures are thrown as `ApiError`, so `handleAdminError` and `useAdminAction` treat them
 * like any other admin call (a dead session signs out, the server's own message becomes the toast).
 */

import { ApiError } from '@/lib/api'
import type { AccountLevel } from '@/lib/account-pricing'

export type { AccountLevel }
export type AccountStatus = 'active' | 'suspended'
export type RequestedLevel = 'bulk' | 'wholesaler'

/** An account as the admin sees it: everything except the password hash and token version. */
export interface StaffAccount {
  id: string
  email: string
  name: string
  company: string
  phone: string
  abn: string
  address: string
  level: AccountLevel
  requestedLevel: RequestedLevel | null
  status: AccountStatus
  emailVerified: boolean
  discountPct: number
  payLater: boolean
  termsDays: number
  creditLimit: number
  outstanding: number
  posCustomerId: string | null
  notes: string
  createdBy: string
  approvedBy: string | null
  approvedAt: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  hasPassword: boolean
}

export interface AccountCounts {
  all: number
  pending: number
  suspended: number
}

export interface SpecialPrice {
  productId: string
  price: number
  updatedBy: string
  updatedAt: string
}

export interface PosCustomerSummary {
  id: string
  name: string
  company: string
  email: string
  phone: string
  address: string
  termsDays: number
  balance: { due: number; overdue: number; count: number }
}

export interface AccountDetail {
  account: StaffAccount
  prices: SpecialPrice[]
  posCustomer: PosCustomerSummary | null
  /** A till customer that already uses this account's email while the account is not linked. */
  posMatch: { id: string; name: string; company: string; email: string } | null
  creditAvailable: number
  canEditCredit: boolean
}

export interface InviteResult {
  account: StaffAccount
  emailSent: boolean
  /** Present only when email is not set up: the link staff must pass on themselves. */
  inviteLink?: string
}

export interface NewAccountInput {
  email: string
  name: string
  level: AccountLevel
  company?: string
  phone?: string
  abn?: string
  address?: string
  discountPct?: number
  notes?: string
}

export interface AccountPatch {
  email?: string
  name?: string
  company?: string
  phone?: string
  abn?: string
  address?: string
  notes?: string
}

export interface ReconcileResult {
  account: StaffAccount
  reconciled: { balance: number; outstanding: number; fixed: boolean; deferred: boolean } | null
  creditAvailable: number
}

/* ---- Sales by type ---------------------------------------------- */

export interface SalesPart {
  count: number
  total: number
  paid: number
  owing: number
  onAccount: { count: number; total: number }
}

export interface SalesChannel {
  website: SalesPart
  till: SalesPart
  all: SalesPart
}

export type SaleChannelKey = 'retail' | 'bulk' | 'wholesale'

export interface SalesByChannel {
  from: string
  to: string
  channels: Record<SaleChannelKey, SalesChannel>
  total: SalesChannel
}

/* ---- Transport -------------------------------------------------- */

async function call<T>(
  token: string,
  action: string,
  options: { query?: Record<string, string>; body?: Record<string, unknown> } = {},
): Promise<T> {
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : ''
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`/api/admin/${action}${query}`, {
      method: options.body ? 'POST' : 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    })
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { error: text.slice(0, 300) }
      }
    }
    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `Request failed with status ${response.status}`
      throw new ApiError(message, response.status, payload)
    }
    return payload as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('The request timed out. Please try again.', 408)
    }
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed', 0)
  } finally {
    clearTimeout(timer)
  }
}

/** The form field a server validation error names, if any. */
export function errorField(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const details = error.details
  if (details && typeof details === 'object' && 'field' in details) {
    const field = (details as { field: unknown }).field
    return typeof field === 'string' ? field : null
  }
  return null
}

export const accountsApi = {
  list: (token: string) =>
    call<{ accounts: StaffAccount[]; counts: AccountCounts }>(token, 'accounts'),

  get: (token: string, id: string) => call<AccountDetail>(token, 'account', { query: { id } }),

  create: (token: string, input: NewAccountInput) =>
    call<InviteResult>(token, 'account-create', { body: { ...input } }),

  update: (token: string, id: string, patch: AccountPatch) =>
    call<{ account: StaffAccount }>(token, 'account-update', { body: { id, ...patch } }),

  setLevel: (token: string, id: string, level: AccountLevel, discountPct: number) =>
    call<{ account: StaffAccount }>(token, 'account-level', { body: { id, level, discountPct } }),

  decide: (token: string, id: string, decision: 'approve' | 'reject') =>
    call<{ account: StaffAccount }>(token, 'account-request', { body: { id, decision } }),

  setPrices: (token: string, id: string, prices: Array<{ productId: string; price: number | null }>) =>
    call<{ prices: SpecialPrice[] }>(token, 'account-prices', { body: { id, prices } }),

  setCredit: (
    token: string,
    id: string,
    credit: { payLater: boolean; termsDays: number; creditLimit: number },
  ) => call<{ account: StaffAccount }>(token, 'account-credit', { body: { id, ...credit } }),

  invite: (token: string, id: string) => call<InviteResult>(token, 'account-invite', { body: { id } }),

  setStatus: (token: string, id: string, status: AccountStatus) =>
    call<{ account: StaffAccount }>(token, 'account-status', { body: { id, status } }),

  linkPos: (token: string, id: string) =>
    call<{ account: StaffAccount }>(token, 'account-link-pos', { body: { id } }),

  reconcile: (token: string, id: string) =>
    call<ReconcileResult>(token, 'account-reconcile', { body: { id } }),

  salesByChannel: (token: string, from: string, to: string) =>
    call<SalesByChannel>(token, 'sales-by-channel', { query: { from, to } }),
}
