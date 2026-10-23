/**
 * The counter till (see ../pos.ts).
 *
 * GET /api/admin/pos?view=
 *   items                       -> { items, squareError }
 *   tickets[&status=]           -> { tickets }   (also re-checks unfinished Terminal charges)
 *   ticket&ref=                 -> { ticket }
 *   customers                   -> { customers }  (each with its balance, and its website account's summary when it has one)
 *   customer&id=                -> { customer, account, balance, tickets, payments }
 *   account-items&customerId=   -> { account, prices }  the customer's website account and its unit price per tyre
 *                                  (only where it beats the shop price); account is null for an ordinary counter customer
 *   account-preview&id=&amount=[&ticket=] -> what an account payment would pay off
 *   terminal                    -> { devices, squareReady }
 *   checkout&id=                -> { checkout }   (polled while a Terminal charge runs)
 *
 * POST /api/admin/pos { action, ... }
 *   ticket-save, ticket-void, ticket-cash, ticket-other, ticket-account, ticket-charge,
 *   customer-save, customer-delete, account-cash, account-other, account-charge,
 *   terminal-cancel, item-save
 */

import { PAYMENT_METHODS } from '../../../src/lib/admin-ledger.js'
import { can } from '../../../src/lib/admin-roles.js'
import { audit } from '../audit.js'
import { authorize, type Actor } from '../auth.js'
import { accountPriceList } from '../../../src/lib/account-pricing.js'
import { accountSummary, pricingContext } from '../accounts/pricing.js'
import { getAccount, listAccounts, type AccountRecord } from '../accounts/repo.js'
import { effectivePrice, mergeCatalogue } from '../catalogue.js'
import { asString, fail, methodGuard, ok, readBody, withGuard, type ApiResponse } from '../http.js'
import {
  POS_SERVICES,
  PosError,
  accountChargeLines,
  balanceOf,
  chargeToAccount,
  cleanCustomer,
  payAccountCash,
  payAccountOther,
  payTicketCash,
  payTicketOther,
  previewAccountPayment,
  saveTicket,
  startAccountPayment,
  ticketChargeLines,
  voidTicket,
} from '../pos.js'
import {
  SquareApiError,
  squareStatus,
  allSquareItems,
  cancelTerminalCheckout,
  saveSquareItem,
  sendToTerminal,
  settleOpenCheckouts,
  settleTerminalCheckout,
  squareReady,
  terminalStatus,
} from '../square-api.js'
import {
  deletePosCustomer,
  getOverrides,
  getPosCustomer,
  getPosTicket,
  listAccountPayments,
  listPosCustomers,
  listPosTickets,
  savePosCustomer,
  type StoredPosCustomer,
} from '../store.js'

/** Anything that can go on a ticket. `stock` is set for tyres only. */
interface PosItem {
  key: string
  source: 'tyre' | 'service' | 'square'
  itemId: string
  name: string
  variation: string
  price: number | null
  stock: number | null
  sku: string
  squareItemId?: string
  singlePrice?: boolean
}

const OTHER_METHODS = PAYMENT_METHODS.filter((m) => m !== 'Cash') as readonly string[]

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST'])) return
  const actor = await authorize(req, res, 'pos')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  try {
    if ((req.method ?? 'GET').toUpperCase() === 'GET') return await read(req.query ?? {}, res)
    const body = readBody<Record<string, unknown>>(req)
    if (!body) return fail(res, 400, 'Expected a JSON request body.')
    return await act(body, actor, res)
  } catch (error) {
    if (error instanceof PosError) return fail(res, error.status, error.message)
    // Square refusing our token must not read as the admin's own session ending (401 signs out).
    if (error instanceof SquareApiError) return fail(res, squareStatus(error.status), error.message)
    throw error
  }
})

const q = (query: Record<string, string | string[]>, key: string) => {
  const v = query[key]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

async function read(query: Record<string, string | string[]>, res: ApiResponse) {
  const view = q(query, 'view')

  if (view === 'items') {
    const overrides = await getOverrides()
    const items: PosItem[] = mergeCatalogue(overrides).map((p) => ({
      key: `tyre:${p.id}`,
      source: 'tyre',
      itemId: p.id,
      name: `${p.brand} ${p.model}`,
      variation: p.size,
      price: effectivePrice(p),
      stock: p.stock,
      sku: p.sku,
    }))
    const services: PosItem[] = POS_SERVICES.map((s) => ({
      key: `service:${s.id}`,
      source: 'service',
      itemId: s.id,
      name: s.name,
      variation: '',
      price: s.price,
      stock: null,
      sku: '',
    }))
    let square: PosItem[] = []
    let squareError = ''
    if (squareReady()) {
      try {
        square = (await allSquareItems()).flatMap((item) =>
          item.variations.map((v): PosItem => ({
            key: `square:${v.id}`,
            source: 'square',
            itemId: v.id,
            name: item.name,
            variation: item.variations.length > 1 || (v.name && v.name !== 'Regular') ? v.name : '',
            price: v.price,
            stock: null,
            sku: v.sku,
            squareItemId: item.id,
            singlePrice: item.variations.length === 1,
          })),
        )
      } catch (error) {
        squareError = `Square items not loaded: ${(error as Error).message}`
      }
    }
    return ok(res, { items: [...items, ...services, ...square], squareError, squareReady: squareReady() })
  }

  if (view === 'tickets') {
    if (squareReady()) await settleOpenCheckouts()
    const status = q(query, 'status')
    const customers = new Map((await listPosCustomers()).map((c) => [c.id, c]))
    const tickets = (await listPosTickets())
      .filter((t) => !status || t.status === status)
      .slice(0, 300)
      .map((t) => ({ ...t, customer: t.customerId ? customers.get(t.customerId) ?? null : null }))
    return ok(res, { tickets })
  }

  if (view === 'ticket') {
    const t = await getPosTicket(q(query, 'ref'))
    if (!t) return fail(res, 404, 'Ticket not found')
    return ok(res, { ticket: { ...t, customer: t.customerId ? await getPosCustomer(t.customerId) : null } })
  }

  if (view === 'customers') {
    const [customers, tickets] = await Promise.all([listPosCustomers(), listPosTickets()])
    const accounts = await accountsOf(customers)
    return ok(res, { customers: customers.map((c) => ({ ...c, balance: balanceOf(c.id, tickets), account: accounts.get(c.id) ?? null })) })
  }

  if (view === 'customer') {
    const c = await getPosCustomer(q(query, 'id'))
    if (!c) return fail(res, 404, 'Customer not found')
    const [tickets, payments] = await Promise.all([listPosTickets(), listAccountPayments()])
    return ok(res, {
      customer: c,
      account: (await accountsOf([c])).get(c.id) ?? null,
      balance: balanceOf(c.id, tickets),
      tickets: tickets.filter((t) => t.customerId === c.id).map((t) => ({ ...t, customer: c })),
      payments: payments.filter((p) => p.customerId === c.id && p.status === 'paid').slice(0, 50),
    })
  }

  if (view === 'account-items') {
    const customer = await getPosCustomer(q(query, 'customerId'))
    if (!customer) return fail(res, 404, 'Customer not found')
    const account = (await linkedAccounts([customer])).get(customer.id)
    if (!account) return ok(res, { account: null, prices: {} })
    // A suspended account is not sold to at its agreed prices; the till shows why.
    const prices = account.status === 'active' ? accountPriceList(mergeCatalogue(await getOverrides()), await pricingContext(account)) : {}
    return ok(res, { account: accountSummary(account), prices })
  }

  if (view === 'account-preview') {
    return ok(res, await previewAccountPayment(q(query, 'id'), q(query, 'amount'), q(query, 'ticket') || undefined))
  }

  if (view === 'terminal') {
    if (!squareReady()) return ok(res, { devices: [], squareReady: false })
    const state = await terminalStatus()
    return ok(res, { devices: state.devices, squareReady: true })
  }

  if (view === 'checkout') {
    const checkout = await settleTerminalCheckout(q(query, 'id'))
    if (!checkout) return fail(res, 404, 'Charge not found')
    return ok(res, { checkout })
  }

  return fail(res, 400, 'Unknown view.')
}

async function act(body: Record<string, unknown>, actor: Actor, res: ApiResponse) {
  const by = actor.name
  const ref = asString(body.ref, 20) ?? ''

  switch (body.action) {
    case 'ticket-save': {
      const ticket = await saveTicket(body, by)
      return ok(res, { ticket })
    }
    case 'ticket-void': {
      const ticket = await voidTicket(ref, by)
      await audit(actor, 'pos.void', `Cancelled ticket ${ref}`)
      return ok(res, { ticket })
    }
    case 'ticket-cash': {
      const out = await payTicketCash(ref, body.tendered, by)
      await audit(actor, 'pos.sale', `Ticket ${ref} paid in cash ($${out.ticket?.total.toFixed(2)})`)
      return ok(res, out)
    }
    case 'ticket-other': {
      const method = otherMethod(body.method)
      const out = await payTicketOther(ref, method, by)
      await audit(actor, 'pos.sale', `Ticket ${ref} paid: ${method} ($${out.ticket?.total.toFixed(2)})`)
      return ok(res, out)
    }
    case 'ticket-account': {
      const out = await chargeToAccount(ref, body.dueDays, by)
      await audit(actor, 'pos.account', `Ticket ${ref} put on account, due ${out.dueDate}`)
      return ok(res, out)
    }
    case 'ticket-charge': {
      const t = await getPosTicket(ref)
      if (!t) throw new PosError('Ticket not found', 404)
      if (t.status !== 'open') throw new PosError('Only an open ticket can be charged', 409)
      const checkout = await sendToTerminal({
        purpose: 'ticket',
        ref: t.ref,
        amount: t.total,
        note: `Ticket ${t.ref}`,
        lines: ticketChargeLines(t),
        deviceId: asString(body.deviceId, 100) ?? undefined,
        by,
      })
      return ok(res, { checkout })
    }

    case 'customer-save': {
      const raw = (body.customer ?? {}) as Record<string, unknown>
      const existing = raw.id ? await getPosCustomer(String(raw.id)) : null
      if (raw.id && !existing) throw new PosError('Customer not found', 404)
      const customer = await savePosCustomer(cleanCustomer(raw, existing, by))
      await audit(actor, existing ? 'pos.customer.update' : 'pos.customer.create', `${existing ? 'Updated' : 'Added'} counter customer ${customer.company || customer.name}`)
      return ok(res, { customer })
    }
    case 'customer-delete': {
      const c = await getPosCustomer(asString(body.id, 120) ?? '')
      if (!c) throw new PosError('Customer not found', 404)
      if (c.accountId) {
        throw new PosError(`${c.company || c.name} has a website account, so can't be deleted from the till. Suspend the account instead.`, 409)
      }
      if ((await listPosTickets()).some((t) => t.customerId === c.id)) {
        throw new PosError(`${c.company || c.name} has tickets, so can't be deleted.`, 409)
      }
      await deletePosCustomer(c.id)
      await audit(actor, 'pos.customer.delete', `Deleted counter customer ${c.company || c.name}`)
      return ok(res, { ok: true })
    }

    case 'account-cash': {
      const out = await payAccountCash(String(body.customerId ?? ''), body.amount, body.tendered, by, ticketFilter(body))
      await audit(actor, 'pos.account.payment', `Account payment ${out.payment?.ref}: $${out.payment?.amount.toFixed(2)} cash`)
      return ok(res, out)
    }
    case 'account-other': {
      const method = otherMethod(body.method)
      const out = await payAccountOther(String(body.customerId ?? ''), body.amount, method, by, ticketFilter(body))
      await audit(actor, 'pos.account.payment', `Account payment ${out.payment?.ref}: $${out.payment?.amount.toFixed(2)} ${method}`)
      return ok(res, out)
    }
    case 'account-charge': {
      const payment = await startAccountPayment(String(body.customerId ?? ''), body.amount, 'card', '', by, ticketFilter(body))
      const customer = await getPosCustomer(payment.customerId)
      const checkout = await sendToTerminal({
        purpose: 'account',
        ref: payment.ref,
        amount: payment.amount,
        note: `Account payment ${payment.ref}${customer ? ` · ${customer.company || customer.name}` : ''}`,
        lines: accountChargeLines(payment),
        deviceId: asString(body.deviceId, 100) ?? undefined,
        by,
      })
      return ok(res, { checkout })
    }

    case 'terminal-cancel': {
      const checkout = await cancelTerminalCheckout(asString(body.id, 100) ?? '')
      return ok(res, { checkout })
    }

    case 'item-save': {
      if (!can(actor.role, 'pricing')) throw new PosError('Only an owner or manager can change Square items.', 403)
      const price = body.price === null || body.price === '' || body.price === undefined ? null : Number(body.price)
      const item = await saveSquareItem({
        id: asString(body.id, 100) ?? undefined,
        name: String(body.name ?? ''),
        price,
        description: String(body.description ?? ''),
      })
      await audit(actor, 'pos.item', `Square item ${item.name} saved (${item.price === null ? 'variable price' : `$${item.price.toFixed(2)}`})`)
      return ok(res, { item })
    }
  }
  return fail(res, 400, 'Unknown action.')
}

/**
 * The website accounts behind these counter customers, by counter customer id (only a two-way link
 * counts). Customers with no account never touch the accounts database; if it cannot be read the
 * till simply shows them as ordinary counter customers.
 */
async function linkedAccounts(customers: StoredPosCustomer[]): Promise<Map<string, AccountRecord>> {
  const out = new Map<string, AccountRecord>()
  const wanted = customers.filter((c) => c.accountId)
  if (!wanted.length) return out
  try {
    const found = wanted.length === 1 ? [await getAccount(wanted[0]!.accountId!)] : await listAccounts()
    const byId = new Map(found.flatMap((a) => (a ? [[a.id, a] as const] : [])))
    for (const c of wanted) {
      const a = byId.get(c.accountId!)
      if (a && a.posCustomerId === c.id) out.set(c.id, a)
    }
  } catch (error) {
    console.error('[pos] accounts not read:', (error as Error).message)
  }
  return out
}

async function accountsOf(customers: StoredPosCustomer[]): Promise<Map<string, ReturnType<typeof accountSummary>>> {
  return new Map([...(await linkedAccounts(customers))].map(([id, a]) => [id, accountSummary(a)]))
}

function otherMethod(raw: unknown): string {
  const method = typeof raw === 'string' ? raw : ''
  if (!OTHER_METHODS.includes(method)) throw new PosError(`Choose how it was paid: ${OTHER_METHODS.join(', ')}.`)
  return method
}

const ticketFilter = (body: Record<string, unknown>) => asString(body.ticket, 20) ?? undefined

