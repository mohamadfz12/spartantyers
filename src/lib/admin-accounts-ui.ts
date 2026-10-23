/**
 * Pure helpers for the customer account screens in the admin: filters, sorting, wording, price rows
 * and the sales-by-type numbers. No React and no network, so each one is unit-tested.
 */

import { accountUnitPrice, round2, saleChannel, type AccountLevel } from '@/lib/account-pricing'
import { effectivePrice } from '@/data/products'
import type { Product } from '@/data/types'
import type { SaleChannelKey, SalesByChannel, SalesPart, StaffAccount } from '@/lib/admin-accounts-api'

/* ------------------------------------------------------------------ *
 * Wording
 * ------------------------------------------------------------------ */

export const LEVEL_LABELS: Record<AccountLevel, string> = {
  customer: 'Customer',
  bulk: 'Bulk',
  wholesaler: 'Wholesaler',
}

export const LEVEL_HELP: Record<AccountLevel, string> = {
  customer: 'Retail customer. Opens straight away.',
  bulk: 'Trade buyer. Works exactly like Wholesaler.',
  wholesaler: 'Wholesale buyer with agreed prices.',
}

export const CHANNEL_LABELS: Record<SaleChannelKey, string> = {
  retail: 'Retail',
  bulk: 'Bulk',
  wholesale: 'Wholesale',
}

export const CHANNEL_KEYS: SaleChannelKey[] = ['retail', 'bulk', 'wholesale']

/** The name staff know the business by: company over person. */
export function businessName(a: Pick<StaffAccount, 'company' | 'name' | 'email'>): string {
  return a.company.trim() || a.name.trim() || a.email
}

/** Terms as words: "Due on the day", "7 days", "30 days". */
export function termsLabel(days: number): string {
  if (days <= 0) return 'Due on the day'
  return days === 1 ? '1 day' : `${days} days`
}

/** Money as `$1,234.56`. */
export function dollars(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  const abs = Math.abs(safe).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${safe < 0 ? '-' : ''}$${abs}`
}

/** A percentage with no trailing zeros: 15 -> "15%", 7.5 -> "7.5%". */
export function percentLabel(value: number): string {
  return `${Number.isInteger(value) ? value : round2(value)}%`
}

/* ------------------------------------------------------------------ *
 * Credit
 * ------------------------------------------------------------------ */

/** What is left of the credit limit (never below zero). */
export function availableCredit(a: Pick<StaffAccount, 'creditLimit' | 'outstanding'>): number {
  return Math.max(0, round2(a.creditLimit - a.outstanding))
}

/** "30 days, $5,000.00" or "Off". */
export function payLaterLabel(a: Pick<StaffAccount, 'payLater' | 'termsDays' | 'creditLimit'>): string {
  return a.payLater ? `${termsLabel(a.termsDays)}, ${dollars(a.creditLimit)}` : 'Off'
}

/** Parses typed dollars ("5,000", "$1,234.5"). Null when blank, negative or not a number. */
export function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return round2(n)
}

/** Parses a typed whole number of days from 0 to 120. Null otherwise. */
export function parseTermsDays(raw: string): number | null {
  const cleaned = raw.trim()
  if (!/^\d{1,3}$/.test(cleaned)) return null
  const n = Number(cleaned)
  return n >= 0 && n <= 120 ? n : null
}

/** Parses an agreed percentage from 0 to 60. Blank counts as 0. Null when out of range. */
export function parsePercent(raw: string): number | null {
  const cleaned = raw.replace(/%/g, '').trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0 || n > 60) return null
  return round2(n)
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

export type AccountFilter = 'all' | 'pending' | 'customer' | 'bulk' | 'wholesaler' | 'suspended'

export const FILTER_LABELS: Record<AccountFilter, string> = {
  all: 'All',
  pending: 'Waiting for approval',
  customer: 'Customer',
  bulk: 'Bulk',
  wholesaler: 'Wholesaler',
  suspended: 'Suspended',
}

export const FILTER_KEYS = Object.keys(FILTER_LABELS) as AccountFilter[]

const digits = (value: string) => value.replace(/\D/g, '')

/** True when the account matches the typed search (name, company, email, phone, ABN). */
export function matchesSearch(a: StaffAccount, search: string): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  if ([a.name, a.company, a.email, a.phone, a.abn].join(' ').toLowerCase().includes(needle)) return true
  // Phone numbers and ABNs are typed with or without spaces.
  const wanted = digits(needle)
  return wanted.length >= 3 && (digits(a.phone).includes(wanted) || digits(a.abn).includes(wanted))
}

export function matchesFilter(a: StaffAccount, filter: AccountFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'pending':
      return a.requestedLevel !== null && a.requestedLevel !== a.level
    case 'suspended':
      return a.status === 'suspended'
    default:
      return a.level === filter
  }
}

export function filterAccounts(list: StaffAccount[], filter: AccountFilter, search: string): StaffAccount[] {
  return list.filter((a) => matchesFilter(a, filter) && matchesSearch(a, search))
}

/** How many accounts each filter would show (for the chips), counted from the loaded list. */
export function filterCounts(list: StaffAccount[]): Record<AccountFilter, number> {
  const counts = {} as Record<AccountFilter, number>
  for (const key of FILTER_KEYS) counts[key] = list.filter((a) => matchesFilter(a, key)).length
  return counts
}

export type AccountSortKey =
  | 'business'
  | 'email'
  | 'level'
  | 'requested'
  | 'discount'
  | 'payLater'
  | 'owing'
  | 'status'
  | 'lastLogin'

const LEVEL_ORDER: Record<AccountLevel, number> = { customer: 0, bulk: 1, wholesaler: 2 }

const SORTERS: Record<AccountSortKey, (a: StaffAccount, b: StaffAccount) => number> = {
  business: (a, b) => businessName(a).localeCompare(businessName(b), 'en-AU', { sensitivity: 'base' }),
  email: (a, b) => a.email.localeCompare(b.email),
  level: (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
  requested: (a, b) => (a.requestedLevel ?? '').localeCompare(b.requestedLevel ?? ''),
  discount: (a, b) => a.discountPct - b.discountPct,
  payLater: (a, b) => Number(a.payLater) - Number(b.payLater) || a.creditLimit - b.creditLimit,
  owing: (a, b) => a.outstanding - b.outstanding,
  status: (a, b) => a.status.localeCompare(b.status),
  lastLogin: (a, b) => (a.lastLoginAt ?? '').localeCompare(b.lastLoginAt ?? ''),
}

/** A sorted copy. Equal rows keep the business-name order so the list never jumps around. */
export function sortAccounts(list: StaffAccount[], key: AccountSortKey, direction: 'asc' | 'desc'): StaffAccount[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...list].sort((a, b) => sign * SORTERS[key](a, b) || SORTERS.business(a, b))
}

/* ------------------------------------------------------------------ *
 * Special prices
 * ------------------------------------------------------------------ */

export type PriceWinner = 'special' | 'percent' | 'retail'

export interface PriceRow {
  /** The normal price (after any shop discount), or null for price on application. */
  retail: number | null
  /** What the agreed % alone would give, or null when there is no % (or no RRP). */
  percentPrice: number | null
  /** The special price in force, or null. */
  special: number | null
  /** What this account pays per tyre before any volume break. Null: nothing beats retail. */
  accountPrice: number | null
  /** Which of the three the customer pays. */
  pays: PriceWinner
}

type PriceProduct = Pick<Product, 'id' | 'price' | 'discountPrice'>

/**
 * The three prices side by side for one tyre, using the same rule as the shop and the till: a special
 * price wins over the %, and the customer pays the lower of their account price and the normal price.
 * `special` is the draft or saved special price for this tyre (null for none).
 */
export function priceRow(product: PriceProduct, discountPct: number, special: number | null): PriceRow {
  const retail = effectivePrice(product as Product)
  const percentPrice = accountUnitPrice(product, { level: 'wholesaler', discountPct, special: {} })
  const withSpecial =
    special !== null && special > 0
      ? accountUnitPrice(product, { level: 'wholesaler', discountPct, special: { [product.id]: special } })
      : percentPrice
  // Never above retail: a special price over retail does nothing.
  const beats = withSpecial !== null && (retail === null || withSpecial < retail)
  const pays: PriceWinner = !beats ? 'retail' : special !== null && special > 0 ? 'special' : 'percent'
  return {
    retail,
    percentPrice,
    special,
    accountPrice: beats ? withSpecial : null,
    pays,
  }
}

export const WINNER_LABELS: Record<PriceWinner, string> = {
  special: 'Special price',
  percent: 'Agreed %',
  retail: 'Normal price',
}

/** Parses a typed price in dollars: more than $0 and at most $100,000. Null otherwise. */
export function parsePrice(raw: string): number | null {
  const n = parseDollars(raw)
  return n !== null && n > 0 && n <= 100000 ? n : null
}

export interface PriceDraft {
  [productId: string]: number | null
}

/** The changes to send: draft entries that differ from what is saved (null removes). */
export function priceChanges(
  saved: Array<{ productId: string; price: number }>,
  draft: PriceDraft,
): Array<{ productId: string; price: number | null }> {
  const current = new Map(saved.map((p) => [p.productId, p.price]))
  const out: Array<{ productId: string; price: number | null }> = []
  for (const [productId, price] of Object.entries(draft)) {
    const before = current.get(productId) ?? null
    if (price === before) continue
    out.push({ productId, price })
  }
  return out
}

/** Catalogue search by name, brand, size or SKU. Every typed word must match. */
export function searchProducts<T extends Pick<Product, 'id' | 'sku' | 'brand' | 'model' | 'size'>>(
  list: T[],
  search: string,
  limit = 8,
): T[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const out: T[] = []
  for (const p of list) {
    const hay = `${p.brand} ${p.model} ${p.size} ${p.sku} ${p.id}`.toLowerCase()
    const compact = hay.replace(/[\s/-]/g, '')
    if (words.every((w) => hay.includes(w) || compact.includes(w.replace(/[\s/-]/g, '')))) {
      out.push(p)
      if (out.length >= limit) break
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/** True when a YYYY-MM-DD due date is before `today` (also YYYY-MM-DD). */
export function isOverdue(due: string | null | undefined, today: string): boolean {
  return Boolean(due) && /^\d{4}-\d{2}-\d{2}$/.test(due!) && due! < today
}

/* ------------------------------------------------------------------ *
 * Sales by type
 * ------------------------------------------------------------------ */

export type SalesSource = 'all' | 'website' | 'till'

export interface ChannelRow {
  key: SaleChannelKey
  label: string
  count: number
  total: number
  average: number
  owing: number
  /** Share of all sales value, 0 to 100 (0 when there are no sales). */
  share: number
  /** Bar length relative to the biggest channel, 0 to 100. */
  bar: number
}

export function averageSale(part: Pick<SalesPart, 'count' | 'total'>): number {
  return part.count > 0 ? round2(part.total / part.count) : 0
}

/** One row per sale label for the chosen source, with average, share and bar length. */
export function channelRows(data: SalesByChannel, source: SalesSource): ChannelRow[] {
  const parts = CHANNEL_KEYS.map((key) => ({ key, part: data.channels[key][source] }))
  const sum = parts.reduce((s, p) => s + p.part.total, 0)
  const max = Math.max(0, ...parts.map((p) => p.part.total))
  return parts.map(({ key, part }) => ({
    key,
    label: CHANNEL_LABELS[key],
    count: part.count,
    total: part.total,
    average: averageSale(part),
    owing: part.owing,
    share: sum > 0 ? Math.round((part.total / sum) * 1000) / 10 : 0,
    bar: max > 0 ? Math.round((part.total / max) * 1000) / 10 : 0,
  }))
}

/**
 * The range to ask the server for. The server allows 400 days at most, so an open-ended period
 * ("All time") is cut to the last 400 days; `clamped` says so, to tell the person.
 */
export function salesRange(
  range: { from: string; to: string },
  today: string,
): { from: string; to: string; clamped: boolean } {
  const to = range.to || today
  const earliest = addDays(to, -399)
  if (!range.from || range.from < earliest) return { from: earliest, to, clamped: true }
  return { from: range.from, to, clamped: false }
}

/** Adds days to a YYYY-MM-DD, on the calendar with no time zone shift. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d! + days))
  return date.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ *
 * Sale labels for old records
 * ------------------------------------------------------------------ */

/** The label of a website order: the stored one, else the same tyre-count rule the server uses. */
export function orderChannelOf(order: { channel?: SaleChannelKey; lines: Array<{ quantity: number }> }): SaleChannelKey {
  return order.channel ?? saleChannel(null, order.lines.reduce((n, l) => n + l.quantity, 0))
}

/** The label of a till ticket: the stored one, else the tyre-count rule (tyre lines only). */
export function ticketChannelOf(ticket: { channel?: SaleChannelKey; lines: Array<{ source: string; qty: number }> }): SaleChannelKey {
  return ticket.channel ?? saleChannel(null, ticket.lines.filter((l) => l.source === 'tyre').reduce((n, l) => n + l.qty, 0))
}
