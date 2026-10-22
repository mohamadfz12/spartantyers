/**
 * POS: the counter's till.
 *
 * A ticket is a list of lines (the website's tyres, services, Square library
 * items, or typed lines) for a customer or a walk-in. It can be saved and
 * finished later, then settled:
 *
 *   card    – sent to the Square Terminal; paid when the Terminal says so
 *   cash    – change worked out; recorded in Square too when Square is set up
 *   other   – paid another way (bank transfer, another card machine…)
 *   account – the customer takes the goods and pays later, by a due date
 *
 * What a customer owes is the unpaid part of their account tickets. An account
 * payment of any amount is split across those tickets, most overdue first, and
 * a ticket is paid once its total is covered.
 *
 * Every payment becomes a "payment" in the ledger (source 'pos'), so the
 * Payments and Balance pages include counter sales. Tyres sold come off the
 * website's stock with a movement in the stock log. Payments are recorded
 * once, guarded by claimOnce, however many tabs are watching.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { gstInside } from '../../src/lib/admin-ledger.js'
import { site } from '../../src/config/site.js'
import { addDays, onTerminalPaid, recordCashInSquare, squareReady, squareReference, type ChargeLine } from './square-api.js'
import { sydneyDate } from './audit.js'
import { getProduct, mergeOverride } from './catalogue.js'
import {
  claimOnce,
  getAccountPayment,
  getOverrides,
  getPosCustomer,
  getPosTicket,
  listPosTickets,
  saveAccountPayment,
  saveLedgerEntry,
  savePosTicket,
  saveStockMove,
  setOverride,
  type PosLineSource,
  type StoredAccountPayment,
  type StoredPosCustomer,
  type StoredPosLine,
  type StoredPosTicket,
} from './store.js'

export class PosError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100
const cents = (n: number) => Math.round(Number(n) * 100)
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
function newRef(prefix: string): string {
  const bytes = randomBytes(6)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `${prefix}-${out}`
}

/* ------------------------------------------------------------------ *
 * Services sold at the counter
 * ------------------------------------------------------------------ */

/** The workshop's price list. Prices GST included; null means "enter the price when selling". */
export const POS_SERVICES: Array<{ id: string; name: string; price: number | null }> = [
  { id: 'fitting', name: 'Tyre fitting (per tyre)', price: site.commerce.fittingFeePerTyre },
  { id: 'balance', name: 'Wheel balancing (per wheel)', price: null },
  { id: 'puncture', name: 'Puncture repair', price: null },
  { id: 'disposal', name: 'Old tyre disposal (per tyre)', price: null },
  { id: 'valve', name: 'Valve replacement', price: null },
  { id: 'callout', name: 'Roadside call-out', price: null },
  { id: 'labour', name: 'Labour (per hour)', price: null },
]

/* ------------------------------------------------------------------ *
 * Customers
 * ------------------------------------------------------------------ */

export function cleanCustomer(input: Record<string, unknown>, existing: StoredPosCustomer | null, by: string): StoredPosCustomer {
  const c = {
    name: text(input.name, 120),
    company: text(input.company, 160),
    email: text(input.email, 200).toLowerCase(),
    phone: text(input.phone, 40),
    address: text(input.address, 300),
    notes: text(input.notes, 2000),
  }
  if (!c.name && !c.company) throw new PosError('Enter a name or a company')
  if (!c.name) c.name = c.company
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new PosError('That email address does not look right')
  const terms = input.termsDays === undefined ? existing?.termsDays ?? 14 : Math.round(Number(input.termsDays))
  if (!(terms >= 0 && terms <= 120)) throw new PosError('Payment terms must be 0 to 120 days')
  const now = new Date().toISOString()
  return {
    id: existing?.id ?? randomUUID(),
    ...c,
    termsDays: terms,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? by,
  }
}

export interface CustomerBalance {
  /** Still to pay across sales on account. */
  due: number
  /** The part of `due` past its due date. */
  overdue: number
  /** Account tickets with something still to pay. */
  count: number
}

export function balanceOf(customerId: string, tickets: StoredPosTicket[], today = sydneyDate()): CustomerBalance {
  let due = 0
  let overdue = 0
  let count = 0
  for (const t of tickets) {
    if (t.customerId !== customerId || t.status !== 'account') continue
    const left = round2(t.total - t.amountPaid)
    if (left <= 0) continue
    due += left
    count += 1
    if (t.dueDate && t.dueDate < today) overdue += left
  }
  return { due: round2(due), overdue: round2(overdue), count }
}

/* ------------------------------------------------------------------ *
 * Tickets
 * ------------------------------------------------------------------ */

/** Validate lines and work out the totals. Prices are what staff charge, GST included. */
export function priceTicket(lines: unknown, discount: unknown) {
  if (!Array.isArray(lines) || !lines.length) throw new PosError('Add at least one item')
  if (lines.length > 100) throw new PosError('A ticket can have at most 100 lines')
  const out: StoredPosLine[] = lines.map((raw, i) => {
    const l = (raw ?? {}) as Record<string, unknown>
    const qty = Math.round(Number(l.qty))
    const price = round2(Number(l.price))
    const name = text(l.name, 200)
    if (!name) throw new PosError(`Line ${i + 1} needs a name`)
    if (!(qty >= 1 && qty <= 999)) throw new PosError(`Line ${i + 1}: quantity must be 1 to 999`)
    if (!(price >= 0 && price <= 100000)) throw new PosError(`Line ${i + 1}: price must be $0 to $100,000`)
    const source = (['tyre', 'service', 'square', 'custom'] as PosLineSource[]).includes(l.source as PosLineSource)
      ? (l.source as PosLineSource)
      : 'custom'
    const itemId = text(l.itemId, 120)
    if (source === 'tyre' && !getProduct(itemId)) throw new PosError(`Line ${i + 1}: that tyre is no longer in the range`)
    return { source, itemId, name, variation: text(l.variation, 100), qty, price, total: round2(qty * price) }
  })
  const subtotal = round2(out.reduce((a, l) => a + l.total, 0))
  const d = round2(Number(discount) || 0)
  if (!(d >= 0 && d <= subtotal)) throw new PosError('The discount cannot be more than the ticket')
  return { lines: out, subtotal, discount: d, total: round2(subtotal - d) }
}

const step = (by: string, what: string) => ({ at: new Date().toISOString(), by, what })

export async function saveTicket(input: Record<string, unknown>, by: string): Promise<StoredPosTicket> {
  const priced = priceTicket(input.lines, input.discount)
  const customerId = input.customerId ? text(input.customerId, 120) : null
  if (customerId && !(await getPosCustomer(customerId))) throw new PosError('Customer not found', 404)
  const note = text(input.note, 500)
  const now = new Date().toISOString()

  if (input.ref) {
    const was = await getPosTicket(text(input.ref, 20))
    if (!was) throw new PosError('Ticket not found', 404)
    if (was.status !== 'open') throw new PosError(`This ticket is already ${statusWord(was.status)}`, 409)
    return savePosTicket({ ...was, ...priced, customerId, note, updatedAt: now })
  }

  return savePosTicket({
    ref: newRef('TK'),
    status: 'open',
    customerId,
    ...priced,
    amountPaid: 0,
    note,
    payment: null,
    paymentMethod: '',
    squareOrderId: null,
    squarePaymentId: null,
    dueDate: null,
    stockApplied: false,
    history: [step(by, 'Created')],
    createdBy: by,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
  })
}

const statusWord = (s: StoredPosTicket['status']) =>
  ({ open: 'open', paid: 'paid', account: 'on account', void: 'cancelled' })[s]

export async function voidTicket(ref: string, by: string) {
  const t = await getPosTicket(ref)
  if (!t || t.status !== 'open') throw new PosError('Only an open ticket can be cancelled', 409)
  return savePosTicket({ ...t, status: 'void', updatedAt: new Date().toISOString(), history: [...t.history, step(by, 'Cancelled')] })
}

export const ticketChargeLines = (t: StoredPosTicket): ChargeLine[] =>
  t.lines.map((l) => ({ name: `${l.name}${l.variation ? ` (${l.variation})` : ''}`, qty: l.qty, amount: l.total }))

/** Tyres sold come off the website's stock, once per ticket. */
async function takeStock(t: StoredPosTicket, by: string) {
  if (t.stockApplied || !(await claimOnce(`pos-stock:${t.ref}`))) return
  const tyres = t.lines.filter((l) => l.source === 'tyre')
  if (tyres.length) {
    const overrides = await getOverrides()
    for (const line of tyres) {
      const base = getProduct(line.itemId)
      if (!base) continue
      try {
        const before = mergeOverride(base, overrides[line.itemId]).stock
        const after = Math.max(0, before - line.qty)
        await setOverride(line.itemId, { stock: after })
        overrides[line.itemId] = { ...overrides[line.itemId], stock: after }
        await saveStockMove({
          id: randomUUID(),
          productId: line.itemId,
          sku: base.sku,
          type: 'sale',
          change: after - before,
          before,
          after,
          reason: 'Sold at the counter',
          note: '',
          reference: t.ref,
          at: new Date().toISOString(),
          by,
        })
      } catch (error) {
        console.error(`[pos] stock not taken for ${line.itemId}:`, (error as Error).message)
      }
    }
  }
  const fresh = await getPosTicket(t.ref)
  if (fresh) await savePosTicket({ ...fresh, stockApplied: true })
}

const METHOD_LABEL = { card: 'Card (in store)', cash: 'Cash' } as const

/** The payment in the ledger, so Payments and Balance include counter sales. Idempotent by id. */
async function ledgerPayment(id: string, amount: number, method: string, description: string, reference: string, counterparty: string, by: string) {
  if (!(amount > 0)) return
  await saveLedgerEntry({
    id,
    type: 'payment',
    date: sydneyDate(),
    amount: round2(amount),
    gst: gstInside(amount),
    category: 'In-store sales',
    method,
    description,
    reference,
    counterparty,
    source: 'pos',
    createdAt: new Date().toISOString(),
    createdBy: by,
  })
}

async function customerLabel(id: string | null) {
  if (!id) return 'Walk-in'
  const c = await getPosCustomer(id)
  return c ? c.company || c.name : 'Customer'
}

/**
 * A ticket was paid in full. Recorded once: only an open ticket moves to paid.
 * Returns a sentence for the counter.
 */
export async function recordTicketPayment(
  ref: string,
  payment: { kind: 'card' | 'cash' | 'other'; methodLabel?: string; squareOrderId?: string | null; squarePaymentId?: string | null },
  by: string,
): Promise<string> {
  if (!(await claimOnce(`pos-paid:${ref}`))) return 'The ticket was already settled'
  const t = await getPosTicket(ref)
  if (!t || t.status !== 'open') return 'The ticket was already settled'
  const method = payment.kind === 'other' ? payment.methodLabel || 'Other' : METHOD_LABEL[payment.kind]
  const now = new Date().toISOString()
  const paid = await savePosTicket({
    ...t,
    status: 'paid',
    amountPaid: t.total,
    payment: payment.kind,
    paymentMethod: method,
    squareOrderId: payment.squareOrderId ?? t.squareOrderId,
    squarePaymentId: payment.squarePaymentId ?? t.squarePaymentId,
    paidAt: now,
    updatedAt: now,
    history: [...t.history, step(by, `Paid: ${method}`)],
  })
  await ledgerPayment(`pos-${ref}`, paid.total, method, `Counter sale ${ref}`, ref, await customerLabel(paid.customerId), by)
  await takeStock(paid, by)
  return `Ticket ${ref} paid`
}

export async function payTicketCash(ref: string, tendered: unknown, by: string) {
  const t = await getPosTicket(ref)
  if (!t) throw new PosError('Ticket not found', 404)
  if (t.status !== 'open') throw new PosError(`This ticket is already ${statusWord(t.status)}`, 409)
  const given = tendered === undefined || tendered === '' || tendered === null ? t.total : round2(Number(tendered))
  if (!(given >= t.total)) throw new PosError('The cash given is less than the total')
  let squareOrderId: string | null = null
  let squarePaymentId: string | null = null
  let note = ''
  if (squareReady() && t.total > 0) {
    try {
      ;({ orderId: squareOrderId, paymentId: squarePaymentId } = await recordCashInSquare(
        squareReference('ticket', t.ref),
        t.total,
        given,
        `Ticket ${t.ref}`,
        ticketChargeLines(t),
      ))
    } catch (error) {
      note = ` (not recorded in Square: ${(error as Error).message})`
    }
  }
  const detail = await recordTicketPayment(t.ref, { kind: 'cash', squareOrderId, squarePaymentId }, by)
  return { ticket: await getPosTicket(t.ref), change: round2(given - t.total), detail: detail + note }
}

export async function payTicketOther(ref: string, methodLabel: string, by: string) {
  const t = await getPosTicket(ref)
  if (!t) throw new PosError('Ticket not found', 404)
  if (t.status !== 'open') throw new PosError(`This ticket is already ${statusWord(t.status)}`, 409)
  const detail = await recordTicketPayment(t.ref, { kind: 'other', methodLabel: methodLabel || 'Other' }, by)
  return { ticket: await getPosTicket(t.ref), detail }
}

/** Sell on account: the customer takes the goods now and pays by the due date. */
export async function chargeToAccount(ref: string, dueDays: unknown, by: string) {
  const t = await getPosTicket(ref)
  if (!t) throw new PosError('Ticket not found', 404)
  if (t.status !== 'open') throw new PosError(`This ticket is already ${statusWord(t.status)}`, 409)
  if (!t.customerId) throw new PosError('Choose a customer to put this on account')
  const customer = await getPosCustomer(t.customerId)
  if (!customer) throw new PosError('Customer not found', 404)
  const days = dueDays === undefined || dueDays === '' ? customer.termsDays : Math.max(0, Math.min(120, Math.round(Number(dueDays) || 0)))
  if (!(await claimOnce(`pos-paid:${ref}`))) throw new PosError('This ticket was settled meanwhile', 409)
  const dueDate = addDays(sydneyDate(), days)
  const now = new Date().toISOString()
  const saved = await savePosTicket({
    ...t,
    status: 'account',
    payment: 'account',
    paymentMethod: 'On account',
    dueDate,
    updatedAt: now,
    history: [...t.history, step(by, `On account, due ${dueDate}`)],
  })
  await takeStock(saved, by)
  return { ticket: await getPosTicket(ref), dueDate }
}

/* ------------------------------------------------------------------ *
 * Account payments: paying off what a customer owes
 * ------------------------------------------------------------------ */

/** Unpaid account tickets for a customer, most overdue first. */
export async function openAccountTickets(customerId: string, onlyTicket?: string) {
  return (await listPosTickets())
    .filter((t) => t.customerId === customerId && t.status === 'account' && round2(t.total - t.amountPaid) > 0)
    .filter((t) => !onlyTicket || t.ref === onlyTicket)
    .sort((a, b) => `${a.dueDate}|${a.createdAt}`.localeCompare(`${b.dueDate}|${b.createdAt}`))
}

export function allocate(tickets: StoredPosTicket[], amount: number) {
  let rest = cents(amount)
  const allocations: StoredAccountPayment['allocations'] = []
  for (const t of tickets) {
    if (rest <= 0) break
    const owing = cents(t.total - t.amountPaid)
    const take = Math.min(rest, owing)
    if (take <= 0) continue
    allocations.push({ ticketRef: t.ref, amount: take / 100, settles: take === owing })
    rest -= take
  }
  const owed = round2(tickets.reduce((a, t) => a + (t.total - t.amountPaid), 0))
  return { allocations, owed, left: round2(owed - amount) }
}

/** `onlyTicket` pays one account ticket rather than the oldest first. */
export async function previewAccountPayment(customerId: string, amount: unknown, onlyTicket?: string) {
  const customer = await getPosCustomer(customerId)
  if (!customer) throw new PosError('Customer not found', 404)
  const tickets = await openAccountTickets(customerId, onlyTicket)
  const owed = round2(tickets.reduce((a, t) => a + (t.total - t.amountPaid), 0))
  const amt = round2(Number(amount) || 0)
  const open = tickets.map((t) => ({ ref: t.ref, dueDate: t.dueDate, total: t.total, owing: round2(t.total - t.amountPaid) }))
  if (!(amt > 0)) return { customer, tickets: open, owed, allocations: [], left: owed }
  if (amt > owed) throw new PosError(`That is more than the customer owes ($${owed.toFixed(2)})`)
  return { customer, tickets: open, ...allocate(tickets, amt) }
}

export async function startAccountPayment(
  customerId: string,
  amount: unknown,
  method: StoredAccountPayment['method'],
  methodLabel: string,
  by: string,
  onlyTicket?: string,
) {
  const preview = await previewAccountPayment(customerId, amount, onlyTicket)
  if (!preview.allocations.length) throw new PosError('Enter an amount to pay')
  return saveAccountPayment({
    ref: newRef('CP'),
    customerId,
    amount: round2(Number(amount)),
    method,
    methodLabel: method === 'other' ? methodLabel || 'Other' : METHOD_LABEL[method],
    status: 'pending',
    allocations: preview.allocations,
    squarePaymentId: null,
    createdBy: by,
    createdAt: new Date().toISOString(),
    paidAt: null,
  })
}

export const accountChargeLines = (p: StoredAccountPayment): ChargeLine[] =>
  p.allocations.map((a) => ({ name: `Payment on ${a.ticketRef}${a.settles ? '' : ' (part)'}`, qty: 1, amount: a.amount }))

/** The money is in: apply it to the tickets and the ledger, once. */
export async function recordAccountPayment(ref: string, squarePaymentId: string | null, by: string): Promise<string> {
  if (!(await claimOnce(`pos-acct:${ref}`))) return 'Already recorded'
  const p = await getAccountPayment(ref)
  if (!p || p.status !== 'pending') return 'Already recorded'
  const now = new Date().toISOString()
  await saveAccountPayment({ ...p, status: 'paid', paidAt: now, squarePaymentId })
  for (const a of p.allocations) {
    const t = await getPosTicket(a.ticketRef)
    if (!t || t.status !== 'account') continue
    const amountPaid = round2(Math.min(t.total, t.amountPaid + a.amount))
    const settled = amountPaid >= t.total
    await savePosTicket({
      ...t,
      amountPaid,
      ...(settled ? { status: 'paid' as const, paidAt: now } : {}),
      updatedAt: now,
      history: [...t.history, step(by, `$${a.amount.toFixed(2)} paid (${p.methodLabel}, ${p.ref})${settled ? ': paid off' : ''}`)],
    })
  }
  await ledgerPayment(
    `pos-${ref}`,
    p.amount,
    p.methodLabel,
    `Account payment: ${p.allocations.map((a) => a.ticketRef).join(', ')}`.slice(0, 300),
    ref,
    await customerLabel(p.customerId),
    by,
  )
  return `$${p.amount.toFixed(2)} applied to ${p.allocations.map((a) => `${a.ticketRef}${a.settles ? ' (paid off)' : ''}`).join(', ')}`
}

export async function payAccountCash(customerId: string, amount: unknown, tendered: unknown, by: string, onlyTicket?: string) {
  const amt = round2(Number(amount))
  const given = tendered === undefined || tendered === '' || tendered === null ? amt : round2(Number(tendered))
  if (!(given >= amt)) throw new PosError('The cash given is less than the amount')
  const payment = await startAccountPayment(customerId, amt, 'cash', '', by, onlyTicket)
  let squarePaymentId: string | null = null
  if (squareReady()) {
    try {
      ;({ paymentId: squarePaymentId } = await recordCashInSquare(
        squareReference('acct', payment.ref),
        amt,
        given,
        `Account payment ${payment.ref}`,
        accountChargeLines(payment),
      ))
    } catch (error) {
      console.error('[pos] cash account payment not recorded in Square:', (error as Error).message)
    }
  }
  const detail = await recordAccountPayment(payment.ref, squarePaymentId, by)
  return { payment: await getAccountPayment(payment.ref), change: round2(given - amt), detail }
}

export async function payAccountOther(customerId: string, amount: unknown, methodLabel: string, by: string, onlyTicket?: string) {
  const payment = await startAccountPayment(customerId, amount, 'other', methodLabel, by, onlyTicket)
  const detail = await recordAccountPayment(payment.ref, null, by)
  return { payment: await getAccountPayment(payment.ref), detail }
}

/* ------------------------------------------------------------------ *
 * What a paid Terminal charge means, by purpose
 * ------------------------------------------------------------------ */

onTerminalPaid('ticket', (co, paymentId) =>
  recordTicketPayment(co.ref, { kind: 'card', squareOrderId: co.squareOrderId, squarePaymentId: paymentId }, co.createdBy || 'Square Terminal'),
)
onTerminalPaid('account', (co, paymentId) => recordAccountPayment(co.ref, paymentId, co.createdBy || 'Square Terminal'))
onTerminalPaid('custom', async (co) => {
  await ledgerPayment(`pos-term-${co.id}`, co.amount, 'Card (in store)', co.note || 'Counter charge', '', '', co.createdBy || 'Square Terminal')
  return 'Paid, and recorded on the Payments page'
})
