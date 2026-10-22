/**
 * Square, for the counter: a generic API call, the read-only views behind the
 * admin's Square page, and the Square Terminal (pair one, send it a charge,
 * follow the charge until it is paid).
 *
 * Plain REST over fetch, like square.ts. Credentials are the same
 * SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID / SQUARE_ENVIRONMENT the website
 * checkout uses; SQUARE_APPLICATION_ID is only needed by the browser card form,
 * so the counter works without it.
 *
 * Terminal charges are followed by polling (the admin window asks every two
 * seconds, and the POS re-checks any charge still open when its ticket list
 * loads), so no webhook endpoint is needed. Recording a payment is claimed
 * once through `claimOnce`, so two tabs polling the same charge cannot record
 * it twice.
 */

import { randomUUID } from 'node:crypto'
import { squareBaseUrl, squareEnvironment } from './square.js'
import { sydneyDate } from './audit.js'
import {
  claimOnce,
  getMeta,
  getTerminalCheckout,
  listOrders,
  listTerminalCheckouts,
  saveTerminalCheckout,
  setMeta,
  type StoredTerminalCheckout,
  type TerminalPurpose,
} from './store.js'

const API_VERSION = '2025-01-23'

const clean = (name: string) =>
  String(process.env[name] ?? '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim()
const token = () => clean('SQUARE_ACCESS_TOKEN').replace(/^Bearer\s+/i, '')
export const squareLocationId = () => clean('SQUARE_LOCATION_ID')

/** True when the counter can talk to Square (token and location set). */
export function squareReady(): boolean {
  return Boolean(token() && squareLocationId())
}

export class SquareApiError extends Error {
  status: number
  codes: string[]
  constructor(message: string, status: number, codes: string[] = []) {
    super(message)
    this.status = status
    this.codes = codes
  }
}

type Json = Record<string, any>

/** One request to Square. Throws SquareApiError with Square's own message. */
export async function squareApi<T = Json>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  if (!squareReady()) {
    throw new SquareApiError(
      'Square is not set up on this server. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in Vercel.',
      503,
    )
  }
  const res = await fetch(`${squareBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Square-Version': API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: Json = {}
  try {
    data = (await res.json()) as Json
  } catch {
    // An empty body is fine.
  }
  if (!res.ok || data.errors?.length) {
    const errors = (data.errors ?? []) as Array<{ detail?: string; code?: string }>
    const message = errors.map((e) => e.detail || e.code).join('; ') || `Square returned ${res.status}`
    throw new SquareApiError(explain(message, res.status, errors.map((e) => e.code ?? '')), res.status, errors.map((e) => e.code ?? ''))
  }
  return data as T
}

/** Square's message plus the usual cause, for staff. */
function explain(message: string, status: number, codes: string[]): string {
  if (status === 401 || codes.includes('UNAUTHORIZED')) {
    return `${message}. The access token was refused: check it was copied whole and matches SQUARE_ENVIRONMENT (${squareEnvironment()}).`
  }
  if (status === 404 && codes.includes('NOT_FOUND') && /location/i.test(message)) {
    return `${message}. Check SQUARE_LOCATION_ID is from the same (sandbox or production) account as the token.`
  }
  return message
}

/** The HTTP status to pass on for a Square failure: never 401/403, which mean the admin's own session. */
export function squareStatus(status: number): number {
  if (status === 401 || status === 403) return 502
  return status >= 400 && status < 600 ? status : 502
}

const AUD = (amount: number) => ({ amount, currency: 'AUD' })
const cents = (n: number) => Math.round(Number(n) * 100)
const dollars = (m: { amount?: number | string } | undefined) => Math.round(Number(m?.amount ?? 0)) / 100
const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100

/* ------------------------------------------------------------------ *
 * Sydney days
 * ------------------------------------------------------------------ */

/** Midnight at the start of a Sydney day, as an ISO instant (daylight saving aware). */
export function sydneyMidnight(day: string): string {
  for (const offset of ['+11:00', '+10:00']) {
    const at = new Date(`${day}T00:00:00${offset}`)
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Australia/Sydney',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at)
    if (sydneyDate(at) === day && local === '00:00') return at.toISOString()
  }
  return new Date(`${day}T00:00:00+10:00`).toISOString()
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ *
 * Reading: totals, payments, refunds, payouts, items, devices
 * ------------------------------------------------------------------ */

const TTL_MS = 60_000
const cache = new Map<string, { at: number; data: Json }>()

async function cachedGet(path: string, fresh = false): Promise<Json> {
  const hit = cache.get(path)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.data
  const data = await squareApi(path)
  cache.set(path, { at: Date.now(), data })
  if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  return data
}

/** Payment ids taken by this site, with what they were for. */
async function knownPayments(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const order of await listOrders()) if (order.paymentId) out[order.paymentId] = `Website ${order.reference}`
  return out
}

function methodOf(p: Json): string {
  if (p.source_type === 'CASH') return 'Cash'
  if (p.source_type === 'EXTERNAL') return 'Other'
  if (p.wallet_details?.brand) return String(p.wallet_details.brand).replace(/_/g, ' ')
  const card = p.card_details?.card
  if (card) return `${String(card.card_brand || 'Card').replace(/_/g, ' ')}${card.last_4 ? ` ·${card.last_4}` : ''}`
  return String(p.source_type || 'Payment').replace(/_/g, ' ').toLowerCase()
}

function sourceOf(p: Json, known: Record<string, string>): string {
  if (known[p.id]) return 'Website'
  if (String(p.reference_id || '').startsWith('spt-')) return 'Counter (POS)'
  const product = String(p.application_details?.square_product || '')
  if (/INVOICE/.test(product)) return 'Square invoice'
  if (/ONLINE_STORE|ECOMMERCE/.test(product)) return 'Online'
  if (/VIRTUAL_TERMINAL/.test(product)) return 'Virtual terminal'
  if (/TERMINAL|POS|REGISTER|KIOSK/.test(product) || p.source_type === 'CASH') return 'Counter'
  if (p.card_details?.entry_method === 'EMV' || p.card_details?.entry_method === 'CONTACTLESS') return 'Counter'
  return product ? product.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'Other'
}

export interface SquarePaymentView {
  id: string
  at: string
  status: string
  amount: number
  tip: number
  refunded: number
  fee: number
  method: string
  source: string
  /** Website order or POS ticket this payment was for, when known. */
  forRef: string | null
  note: string
  receiptNumber: string
  receiptUrl: string | null
}

function paymentView(p: Json, known: Record<string, string>): SquarePaymentView {
  const fee = ((p.processing_fee ?? []) as Json[]).reduce((sum, f) => sum + dollars(f.amount_money), 0)
  const ref = String(p.reference_id || '')
  return {
    id: p.id,
    at: p.created_at,
    status: p.status,
    amount: dollars(p.total_money || p.amount_money),
    tip: dollars(p.tip_money),
    refunded: dollars(p.refunded_money),
    fee: round2(fee),
    method: methodOf(p),
    source: sourceOf(p, known),
    forRef: known[p.id] ?? (ref.startsWith('spt-') ? ref.replace(/^spt-[a-z]+-/, '') : null),
    note: p.note || '',
    receiptNumber: p.receipt_number || '',
    receiptUrl: p.receipt_url || null,
  }
}

async function allPayments(begin: string, end: string, fresh: boolean): Promise<Json[]> {
  const out: Json[] = []
  let cursor = ''
  for (let i = 0; i < 20; i++) {
    const params = new URLSearchParams({ begin_time: begin, end_time: end, sort_order: 'DESC', location_id: squareLocationId(), limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const data = await cachedGet(`/v2/payments?${params}`, fresh)
    out.push(...((data.payments ?? []) as Json[]))
    cursor = data.cursor
    if (!cursor) break
  }
  return out
}

export async function squareSummary(fresh = false) {
  const today = sydneyDate()
  const monthStart = `${today.slice(0, 7)}-01`
  const chartStart = addDays(today, -13)
  const from = monthStart < chartStart ? monthStart : chartStart
  const [payments, refundsData, merchant, location, known] = await Promise.all([
    allPayments(sydneyMidnight(from), new Date().toISOString(), fresh),
    cachedGet(`/v2/refunds?${new URLSearchParams({ begin_time: sydneyMidnight(monthStart), sort_order: 'DESC', location_id: squareLocationId(), limit: '100' })}`, fresh),
    cachedGet('/v2/merchants/me', fresh).catch(() => ({}) as Json),
    cachedGet(`/v2/locations/${encodeURIComponent(squareLocationId())}`, fresh).catch(() => ({}) as Json),
    knownPayments(),
  ])
  const done = payments
    .filter((p) => p.status === 'COMPLETED')
    .map((p) => ({ ...paymentView(p, known), day: sydneyDate(p.created_at) }))

  const period = (startDay: string) => {
    const list = done.filter((p) => p.day >= startDay)
    const gross = round2(list.reduce((a, p) => a + p.amount, 0))
    const fees = round2(list.reduce((a, p) => a + p.fee, 0))
    const refunded = round2(list.reduce((a, p) => a + p.refunded, 0))
    return { count: list.length, gross, fees, refunded, net: round2(gross - fees - refunded), average: list.length ? round2(gross / list.length) : 0 }
  }
  const bySource: Record<string, { count: number; total: number }> = {}
  for (const p of done.filter((x) => x.day >= monthStart)) {
    const row = (bySource[p.source] ??= { count: 0, total: 0 })
    row.count += 1
    row.total = round2(row.total + p.amount)
  }
  const days: Array<{ day: string; total: number; count: number }> = []
  for (let d = chartStart; d <= today; d = addDays(d, 1)) {
    const list = done.filter((p) => p.day === d)
    days.push({ day: d, total: round2(list.reduce((a, p) => a + p.amount, 0)), count: list.length })
  }
  const refunds = ((refundsData.refunds ?? []) as Json[]).filter((r) => r.status === 'COMPLETED' || r.status === 'PENDING')
  const m = (merchant as Json).merchant ?? {}
  const loc = (location as Json).location ?? {}
  return {
    business: m.business_name || loc.business_name || '',
    location: {
      name: loc.name || '',
      status: loc.status || '',
      currency: loc.currency || m.currency || 'AUD',
      address: [loc.address?.address_line_1, loc.address?.locality].filter(Boolean).join(', '),
    },
    environment: squareEnvironment(),
    asAt: new Date().toISOString(),
    today: period(today),
    week: period(addDays(today, -6)),
    month: period(monthStart),
    monthRefunds: { count: refunds.length, total: round2(refunds.reduce((a, r) => a + dollars(r.amount_money), 0)) },
    bySource,
    days,
    capped: payments.length >= 2000,
  }
}

const PAGE = 25
const RANGES: Record<string, number | 'month'> = { today: 0, week: 6, month: 'month', '90': 89 }

function rangeStart(range: string): string {
  const today = sydneyDate()
  const r = RANGES[range] ?? 89
  return sydneyMidnight(r === 'month' ? `${today.slice(0, 7)}-01` : addDays(today, -r))
}

export async function listSquarePayments(range = '90', cursor = '', fresh = false) {
  const params = new URLSearchParams({ begin_time: rangeStart(range), sort_order: 'DESC', location_id: squareLocationId(), limit: String(PAGE) })
  if (cursor) params.set('cursor', cursor)
  const [data, known] = await Promise.all([cachedGet(`/v2/payments?${params}`, fresh), knownPayments()])
  return { items: ((data.payments ?? []) as Json[]).map((p) => paymentView(p, known)), cursor: (data.cursor as string) || null }
}

export async function listSquareRefunds(cursor = '', fresh = false) {
  const params = new URLSearchParams({ begin_time: rangeStart('90'), sort_order: 'DESC', location_id: squareLocationId(), limit: String(PAGE) })
  if (cursor) params.set('cursor', cursor)
  const data = await cachedGet(`/v2/refunds?${params}`, fresh)
  return {
    items: ((data.refunds ?? []) as Json[]).map((r) => ({
      id: r.id as string,
      at: r.created_at as string,
      status: r.status as string,
      amount: dollars(r.amount_money),
      reason: (r.reason as string) || '',
    })),
    cursor: (data.cursor as string) || null,
  }
}

export async function listSquarePayouts(cursor = '', fresh = false) {
  const params = new URLSearchParams({ location_id: squareLocationId(), sort_order: 'DESC', limit: String(PAGE) })
  if (cursor) params.set('cursor', cursor)
  const data = await cachedGet(`/v2/payouts?${params}`, fresh)
  return {
    items: ((data.payouts ?? []) as Json[]).map((p) => ({
      id: p.id as string,
      status: p.status as string,
      amount: dollars(p.amount_money),
      arrivalDate: (p.arrival_date as string) || null,
      createdAt: p.created_at as string,
      destination: p.destination?.type === 'BANK_ACCOUNT' ? 'Bank account' : p.destination?.type === 'SQUARE_BALANCE' ? 'Square balance' : p.destination?.type || '',
      type: p.type === 'BATCH' ? 'Standard' : p.type === 'SIMPLE' ? 'Instant' : p.type || '',
    })),
    cursor: (data.cursor as string) || null,
  }
}

export interface SquareItem {
  id: string
  name: string
  description: string
  variations: Array<{ id: string; name: string; sku: string; price: number | null }>
}

export async function listSquareItems(cursor = '', fresh = false) {
  const params = new URLSearchParams({ types: 'ITEM' })
  if (cursor) params.set('cursor', cursor)
  const data = await cachedGet(`/v2/catalog/list?${params}`, fresh)
  return {
    items: ((data.objects ?? []) as Json[])
      .filter((o) => !o.is_deleted)
      .map(
        (o): SquareItem => ({
          id: o.id,
          name: o.item_data?.name || '(no name)',
          description: o.item_data?.description_plaintext || '',
          variations: ((o.item_data?.variations ?? []) as Json[]).map((v) => ({
            id: v.id,
            name: v.item_variation_data?.name || '',
            sku: v.item_variation_data?.sku || '',
            price: v.item_variation_data?.price_money ? dollars(v.item_variation_data.price_money) : null,
          })),
        }),
      ),
    cursor: (data.cursor as string) || null,
  }
}

/** Every item in the library (up to 1,000), for the POS item picker. */
export async function allSquareItems(fresh = false): Promise<SquareItem[]> {
  const out: SquareItem[] = []
  let cursor = ''
  for (let i = 0; i < 10; i++) {
    const page = await listSquareItems(cursor, fresh)
    out.push(...page.items)
    if (!page.cursor) break
    cursor = page.cursor
  }
  return out
}

/** Add an item to the Square library, or rename / reprice a single-price one. */
export async function saveSquareItem(input: { id?: string; name: string; price: number | null; description?: string }) {
  const name = input.name.trim().slice(0, 255)
  if (!name) throw new SquareApiError('Enter a name', 400)
  const amount = input.price === null ? null : cents(input.price)
  if (amount !== null && !(amount >= 0 && amount <= 10_000_000)) throw new SquareApiError('Enter a price between $0 and $100,000', 400)
  const priceData = amount === null ? { pricing_type: 'VARIABLE_PRICING' } : { pricing_type: 'FIXED_PRICING', price_money: AUD(amount) }
  let object: Json
  if (input.id) {
    const { object: existing } = await squareApi<{ object?: Json }>(`/v2/catalog/object/${encodeURIComponent(input.id)}`)
    if (!existing) throw new SquareApiError('Item not found in Square', 404)
    const vars = (existing.item_data?.variations ?? []) as Json[]
    if (vars.length > 1) throw new SquareApiError('This item has several prices: change them in the Square Dashboard', 400)
    object = {
      ...existing,
      item_data: {
        ...existing.item_data,
        name,
        variations: vars.map((v, i) =>
          i === 0
            ? { ...v, item_variation_data: { ...v.item_variation_data, ...priceData, ...(amount === null ? { price_money: undefined } : {}) } }
            : v,
        ),
      },
    }
  } else {
    object = {
      type: 'ITEM',
      id: '#item',
      present_at_all_locations: true,
      item_data: {
        name,
        description: input.description?.trim().slice(0, 4000) || undefined,
        variations: [{ type: 'ITEM_VARIATION', id: '#variation', present_at_all_locations: true, item_variation_data: { name: 'Regular', ...priceData } }],
      },
    }
  }
  const data = await squareApi<{ catalog_object?: Json }>('/v2/catalog/object', {
    method: 'POST',
    body: { idempotency_key: randomUUID(), object },
  })
  cache.clear()
  return { id: data.catalog_object?.id as string, name, price: amount === null ? null : amount / 100 }
}

export async function listSquareDevices(fresh = false) {
  const data = await cachedGet(`/v2/devices?${new URLSearchParams({ location_id: squareLocationId() })}`, fresh)
  return {
    items: ((data.devices ?? []) as Json[]).map((d) => {
      const comp = (type: string) => ((d.components ?? []) as Json[]).find((c) => c.type === type) ?? {}
      const battery = comp('BATTERY').battery_details
      const wifi = comp('WIFI').wifi_details
      return {
        id: d.id as string,
        name: (d.attributes?.name as string) || '',
        model: [d.attributes?.manufacturer, d.attributes?.model].filter(Boolean).join(' ') || d.attributes?.type || '',
        serial: (d.attributes?.manufacturers_id as string) || '',
        status: (d.status?.category as string) || '',
        battery: battery ? { percent: (battery.visible_percent as number) ?? null, charging: battery.external_power === 'AVAILABLE_CHARGING' } : null,
        wifi: wifi ? { active: Boolean(wifi.active), network: (wifi.ssid as string) || '' } : null,
        updatedAt: (d.attributes?.updated_at as string) || null,
      }
    }),
  }
}

/* ------------------------------------------------------------------ *
 * Recording a counter sale in Square
 * ------------------------------------------------------------------ */

/** POS payments carry this reference, so the Square page knows they came from the counter. */
export const squareReference = (kind: string, ref: string) => `spt-${kind}-${ref}`.slice(0, 40)

export interface ChargeLine {
  name: string
  qty: number
  /** The line's total, GST included. */
  amount: number
}

/**
 * The Square order behind a charge, so the receipt lists what was paid for.
 * Returns null if Square will not take it (the charge then goes ahead for the
 * plain amount).
 */
export async function createSquareOrder(reference: string, amount: number, note: string, lines: ChargeLine[]): Promise<string | null> {
  const total = cents(amount)
  const items = (lines.length ? lines : [{ name: note || 'Payment', qty: 1, amount }]).map((l) => ({
    name: String(l.name || 'Item').slice(0, 500),
    quantity: '1',
    note: l.qty !== 1 ? `${l.qty} ×` : undefined,
    base_price_money: AUD(cents(l.amount)),
  }))
  const itemsTotal = items.reduce((a, l) => a + l.base_price_money.amount, 0)
  if (itemsTotal < total) items.push({ name: 'Other', quantity: '1', note: undefined, base_price_money: AUD(total - itemsTotal) })
  const discounts = itemsTotal > total ? [{ uid: 'discount', name: 'Discount', scope: 'ORDER', amount_money: AUD(itemsTotal - total) }] : undefined
  try {
    const { order } = await squareApi<{ order?: Json }>('/v2/orders', {
      method: 'POST',
      body: { idempotency_key: randomUUID(), order: { location_id: squareLocationId(), reference_id: reference, line_items: items, discounts } },
    })
    return (order?.id as string) || null
  } catch (error) {
    console.error('[square] order not created, charging the plain amount:', (error as Error).message)
    return null
  }
}

/** Record a cash sale in Square, so Square's totals include it. Returns the payment id. */
export async function recordCashInSquare(reference: string, amount: number, tendered: number, note: string, lines: ChargeLine[]) {
  const orderId = await createSquareOrder(reference, amount, note, lines)
  const { payment } = await squareApi<{ payment?: Json }>('/v2/payments', {
    method: 'POST',
    body: {
      idempotency_key: `cash-${reference}`.slice(0, 45),
      source_id: 'CASH',
      amount_money: AUD(cents(amount)),
      cash_details: { buyer_supplied_money: AUD(cents(tendered)) },
      location_id: squareLocationId(),
      reference_id: reference,
      note: note.slice(0, 500),
      ...(orderId ? { order_id: orderId } : {}),
    },
  })
  cache.clear()
  return { orderId, paymentId: (payment?.id as string) || null }
}

/* ------------------------------------------------------------------ *
 * Square Terminal
 * ------------------------------------------------------------------ */

interface TerminalState {
  devices: Array<{ id: string; name: string; pairedAt: string }>
  code: { id: string; code: string; name: string; pairBy: string | null } | null
}

async function readState(): Promise<TerminalState> {
  return { devices: [], code: null, ...((await getMeta<TerminalState>('square-terminal')) ?? {}) }
}
const writeState = async (state: TerminalState) => {
  await setMeta('square-terminal', state)
  return state
}

/** Ask Square for a code to type into the Terminal. */
export async function startPairing(name = 'Front counter') {
  const { device_code: dc } = await squareApi<{ device_code: Json }>('/v2/devices/codes', {
    method: 'POST',
    body: { idempotency_key: randomUUID(), device_code: { product_type: 'TERMINAL_API', location_id: squareLocationId(), name: name.slice(0, 100) } },
  })
  const state = await readState()
  state.code = { id: dc.id, code: dc.code, name: dc.name, pairBy: dc.pair_by ?? null }
  await writeState(state)
  return state.code
}

/** Paired Terminals and the code waiting to be entered (checked with Square while it waits). */
export async function terminalStatus() {
  let state = await readState()
  if (state.code?.id) {
    try {
      const { device_code: dc } = await squareApi<{ device_code?: Json }>(`/v2/devices/codes/${encodeURIComponent(state.code.id)}`)
      if (dc?.status === 'PAIRED' && dc.device_id) {
        if (!state.devices.some((d) => d.id === dc.device_id)) {
          state.devices.push({ id: dc.device_id, name: dc.name || 'Square Terminal', pairedAt: dc.paired_at || new Date().toISOString() })
        }
        state.code = null
        state = await writeState(state)
      } else if (dc?.status === 'EXPIRED' || (state.code.pairBy && new Date(state.code.pairBy) < new Date())) {
        state = await writeState({ ...state, code: null })
      }
    } catch {
      // Square unreachable: show what we have.
    }
  }
  return state
}

export async function forgetTerminal(deviceId: string) {
  const state = await readState()
  state.devices = state.devices.filter((d) => d.id !== deviceId)
  if (deviceId === 'code') state.code = null
  return writeState(state)
}

/** Send a charge to a Terminal. */
export async function sendToTerminal(input: {
  purpose: TerminalPurpose
  ref: string
  amount: number
  note: string
  lines: ChargeLine[]
  deviceId?: string
  by: string
}): Promise<StoredTerminalCheckout> {
  const total = cents(input.amount)
  if (!(total > 0)) throw new SquareApiError('Enter an amount above $0', 400)
  const state = await readState()
  const device = input.deviceId ? state.devices.find((d) => d.id === input.deviceId) : state.devices[0]
  if (!device) throw new SquareApiError('No Square Terminal is paired. Pair one on the Square page first.', 409)
  const reference = squareReference(input.purpose, input.ref)
  const squareOrderId = await createSquareOrder(reference, input.amount, input.note, input.lines)
  const { checkout } = await squareApi<{ checkout: Json }>('/v2/terminals/checkouts', {
    method: 'POST',
    body: {
      idempotency_key: randomUUID(),
      checkout: {
        amount_money: AUD(total),
        reference_id: reference,
        note: input.note.slice(0, 250) || 'Payment',
        ...(squareOrderId ? { order_id: squareOrderId } : {}),
        deadline_duration: 'PT5M',
        device_options: { device_id: device.id, skip_receipt_screen: false, tip_settings: { allow_tipping: false } },
      },
    },
  })
  const row: StoredTerminalCheckout = {
    id: checkout.id,
    purpose: input.purpose,
    ref: input.ref,
    amount: round2(input.amount),
    note: input.note,
    deviceId: device.id,
    squareOrderId,
    paymentId: null,
    status: checkout.status || 'PENDING',
    detail: '',
    createdBy: input.by,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await saveTerminalCheckout(row)
  return row
}

export async function cancelTerminalCheckout(id: string) {
  const row = await getTerminalCheckout(id)
  if (!row) throw new SquareApiError('Charge not found', 404)
  const { checkout } = await squareApi<{ checkout?: Json }>(`/v2/terminals/checkouts/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  const next = { ...row, status: (checkout?.status as string) || 'CANCEL_REQUESTED', updatedAt: new Date().toISOString() }
  await saveTerminalCheckout(next)
  return next
}

/** What to do once a charge is paid, by purpose. Registered by pos.ts. */
type Recorder = (checkout: StoredTerminalCheckout, paymentId: string | null) => Promise<string>
const recorders: Partial<Record<TerminalPurpose, Recorder>> = {}
export function onTerminalPaid(purpose: TerminalPurpose, recorder: Recorder) {
  recorders[purpose] = recorder
}

const FINAL = new Set(['COMPLETED', 'CANCELED'])

/**
 * Bring a charge up to date with Square and, once it is paid, record it (once:
 * the first caller to claim it does the work).
 */
export async function settleTerminalCheckout(id: string): Promise<StoredTerminalCheckout | null> {
  const row = await getTerminalCheckout(id)
  if (!row) return null
  if (FINAL.has(row.status) && (row.status !== 'COMPLETED' || row.detail)) return row
  const { checkout } = await squareApi<{ checkout?: Json }>(`/v2/terminals/checkouts/${encodeURIComponent(id)}`)
  if (!checkout) return row
  const paymentId = ((checkout.payment_ids ?? []) as string[])[0] ?? null
  let next: StoredTerminalCheckout = { ...row, status: checkout.status, paymentId: paymentId ?? row.paymentId, updatedAt: new Date().toISOString() }
  await saveTerminalCheckout(next)
  if (checkout.status !== 'COMPLETED') return next
  if (!(await claimOnce(`terminal:${id}`))) return (await getTerminalCheckout(id)) ?? next

  let detail = 'Paid'
  try {
    const recorder = recorders[row.purpose]
    if (recorder) detail = await recorder(next, paymentId)
  } catch (error) {
    detail = `Paid, but recording it failed: ${(error as Error).message}`
    console.error('[terminal] settle failed', id, (error as Error).message)
  }
  next = { ...next, detail: detail.slice(0, 500), updatedAt: new Date().toISOString() }
  await saveTerminalCheckout(next)
  cache.clear()
  return next
}

/** Re-check charges still open from the last day (a window closed mid-charge). */
export async function settleOpenCheckouts(): Promise<void> {
  const since = Date.now() - 24 * 60 * 60 * 1000
  const open = (await listTerminalCheckouts()).filter(
    (c) => !FINAL.has(c.status) && Date.parse(c.createdAt) > since,
  )
  for (const c of open.slice(0, 10)) {
    try {
      await settleTerminalCheckout(c.id)
    } catch {
      // Try again next time.
    }
  }
}
