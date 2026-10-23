/**
 * Pay-later orders from the website: `POST /api/account/order`.
 *
 * The customer is signed in, their account is active, may pay later and is linked to its till
 * customer. Everything below is all or nothing:
 *
 *   1. price the order at the account's prices; the total must match what the customer was shown;
 *   2. take the credit in ONE guarded update (`reserveCredit`): two orders at once cannot both fit
 *      under the limit;
 *   3. write the till ticket (on account, so balances and account payments just work) and the order
 *      (status 'account', unpaid), then take the stock;
 *   4. if anything after step 2 fails, give the credit back, cancel what was written, and say so.
 *
 * The same `key` is the same attempt: a double click or a retry answers with the first order and
 * reserves nothing twice.
 */
import { site } from '../../../src/config/site.js'
import { checkDeliveryAddress } from '../address.js'
import { sydneyDate } from '../audit.js'
import { asString, safeMessage } from '../http.js'
import { newOrderId, newOrderReference } from '../ids.js'
import { takeOnlineStock } from '../order-stock.js'
import { createOrderTicket, voidOrderTicket } from '../pos.js'
import { priceOrder } from '../pricing.js'
import { addDays } from '../square-api.js'
import { getOrder, getOverrides, getPosCustomer, getPosTicket, saveOrder, type StoredOrder, type StoredPosLine } from '../store.js'
import { creditAvailable, payLaterRefusal, pricingContext } from './pricing.js'
import { claimOrderKey, dropOrderKey, finishOrderKey, getAccount, markCreditMoving, releaseCredit, reserveCredit, type AccountRecord } from './repo.js'

export interface OrderReply {
  status: number
  json: Record<string, unknown>
}

const refuse = (status: number, error: string, field?: string): OrderReply => ({ status, json: field ? { error, field } : { error } })

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

const money = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const cents = (n: number) => Math.round(n * 100)

/** The answer for an order that is placed: the same for the first request and any repeat. */
function placed(order: StoredOrder, account: Pick<AccountRecord, 'creditLimit' | 'outstanding'>, repeated: boolean): OrderReply {
  return {
    status: 200,
    json: {
      ok: true,
      reference: order.reference,
      orderId: order.id,
      total: order.total,
      status: order.status,
      payment: 'account',
      dueDate: order.dueDate ?? '',
      outstanding: account.outstanding,
      creditAvailable: creditAvailable(account),
      ...(repeated ? { repeated: true } : {}),
    },
  }
}

export async function placeAccountOrder(sessionAccount: AccountRecord, body: Record<string, unknown>): Promise<OrderReply> {
  /* ---- The request ---------------------------------------------- */

  const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : ''
  if (!KEY_PATTERN.test(key)) {
    return refuse(400, 'Missing or invalid order key (8 to 64 letters, numbers, dashes). Please refresh and try again.', 'idempotencyKey')
  }

  if (body.fulfilment !== 'pickup' && body.fulfilment !== 'delivery') {
    return refuse(400, 'Choose either delivery or warehouse pickup.', 'fulfilment')
  }
  const fulfilment = body.fulfilment

  let address: StoredOrder['address']
  if (fulfilment === 'delivery') {
    const checked = checkDeliveryAddress(body.address)
    if (!checked.ok) return refuse(400, checked.error, 'address')
    address = checked.address
  }

  const notes = asString(body.notes, 1000) ?? undefined

  const expected = typeof body.expectedTotal === 'number' ? body.expectedTotal : Number(body.expectedTotal)
  if (body.expectedTotal === undefined || body.expectedTotal === null || body.expectedTotal === '' || !Number.isFinite(expected)) {
    return refuse(400, 'Send the order total you were shown (expectedTotal).', 'expectedTotal')
  }

  /* ---- The account (read fresh: the session only said who) ------- */

  const account = await getAccount(sessionAccount.id)
  if (!account) return refuse(401, 'Please sign in.')
  const why = payLaterRefusal(account)
  if (why) return refuse(409, why)
  const posCustomer = await getPosCustomer(account.posCustomerId!)
  if (!posCustomer || posCustomer.accountId !== account.id) {
    return refuse(409, 'Pay later is not available on this account yet. Please call us.')
  }

  /* ---- One attempt, one order ------------------------------------ */

  const claim = await claimOrderKey(account.id, key)
  if (claim.state === 'done') {
    const first = await getOrder(claim.orderId)
    if (first) return placed(first, account, true)
    return refuse(409, 'This order was already placed. Please call us to check it.')
  }
  if (claim.state === 'busy') return refuse(409, 'This order is already being placed. Please wait a moment.')

  let reserved = 0
  let ticketRef = ''
  let committed = false
  try {
    /* ---- Authoritative pricing ----------------------------------- */

    const overrides = await getOverrides()
    const pricing = priceOrder(
      // The promo code too: the total the customer saw includes it (it only ever applies to normal-price lines).
      { lines: body.lines, fulfilment, fittingTyres: body.fittingTyres, promoCode: body.promoCode },
      overrides,
      await pricingContext(account),
    )
    if (pricing.errors.length) {
      await dropOrderKey(account.id, key)
      return refuse(400, pricing.errors.join(' '))
    }
    if (Math.abs(expected - pricing.total) > 0.015) {
      await dropOrderKey(account.id, key)
      return refuse(
        409,
        [
          ...pricing.warnings,
          `This order comes to ${money(pricing.total)} rather than the ${money(expected)} shown, so nothing has been ordered. Review your cart, or call ${site.phone.display}.`,
        ].join(' '),
      )
    }

    /* ---- Credit, atomically -------------------------------------- */

    if ((await reserveCredit(account.id, pricing.total)) === null) {
      await dropOrderKey(account.id, key)
      const fresh = (await getAccount(account.id)) ?? account
      const refused = payLaterRefusal(fresh)
      return refuse(409, refused ?? `This order is over your credit limit: ${money(creditAvailable(fresh))} available.`)
    }
    reserved = pricing.total

    /* ---- The ticket, the order, the stock ------------------------- */

    const orderId = newOrderId()
    const reference = newOrderReference()
    const dueDate = addDays(sydneyDate(), account.termsDays)
    const discount = Math.round((pricing.volumeDiscount + pricing.promoDiscount) * 100) / 100

    const lines: StoredPosLine[] = pricing.lines.map((l) => ({
      source: 'tyre',
      itemId: l.id,
      name: l.name,
      variation: l.size,
      qty: l.quantity,
      price: l.unitPrice,
      total: l.lineTotal,
    }))
    if (pricing.fittingTotal > 0) {
      lines.push({
        source: 'service',
        itemId: 'fitting',
        name: 'Tyre fitting (per tyre)',
        variation: '',
        qty: pricing.fittingTyres,
        price: site.commerce.fittingFeePerTyre,
        total: pricing.fittingTotal,
      })
    }
    const ticket = await createOrderTicket(
      { customerId: posCustomer.id, accountId: account.id, channel: pricing.channel, orderId, reference, dueDate, lines, discount },
      'Website order',
    )
    ticketRef = ticket.ref
    // The ticket is what the customer owes; it must be exactly the order's total or the books would drift.
    if (cents(ticket.total) !== cents(pricing.total)) {
      throw new Error(`ticket total ${ticket.total} differs from order total ${pricing.total}`)
    }

    const order: StoredOrder = {
      id: orderId,
      reference,
      createdAt: new Date().toISOString(),
      status: 'account',
      fulfilment,
      customer: {
        name: account.name || account.company,
        email: account.email,
        phone: account.phone,
        ...(account.company ? { company: account.company } : {}),
      },
      ...(address ? { address } : {}),
      lines: pricing.lines.map((l) => ({ sku: l.sku, name: l.name, size: l.size, quantity: l.quantity, unitPrice: l.unitPrice, basis: l.basis })),
      fittingTyres: pricing.fittingTyres,
      subtotal: pricing.subtotal,
      fittingTotal: pricing.fittingTotal,
      discount,
      total: pricing.total,
      ...(notes ? { notes } : {}),
      accountId: account.id,
      channel: pricing.channel,
      payment: 'account',
      dueDate,
      posTicketRef: ticket.ref,
      ...(pricing.promoCode ? { promoCode: pricing.promoCode } : {}),
    }
    await saveOrder(order)
    committed = true

    // From here the order exists: nothing below may undo it, so nothing below may throw.
    await finishOrderKey(account.id, key, order.id, order.reference, order.total).catch((error) =>
      console.error(`[account-order] key not finished for ${order.reference}: ${safeMessage(error)}`),
    )
    await takeOnlineStock(pricing.lines, overrides, order.reference, 'Website order (on account)', 'account-order')
    return placed(order, (await getAccount(account.id).catch(() => null)) ?? account, false)
  } catch (error) {
    if (committed) throw error
    // Give everything back: the credit, the ticket, the attempt's key.
    console.error(`[account-order] failed, releasing: ${safeMessage(error)}`)
    if (reserved) await releaseCredit(account.id, reserved).catch((e) => console.error(`[account-order] credit not released: ${safeMessage(e)}`))
    if (ticketRef) await voidOrderTicket(ticketRef, 'Website order').catch(() => undefined)
    await dropOrderKey(account.id, key).catch(() => undefined)
    throw error
  }
}

/**
 * Cancelling a pay-later order: the ticket is cancelled and the credit given back, but only while no
 * money has been taken against it. Returns the reason it cannot be cancelled, or null when it can
 * (and the ticket has been cancelled).
 */
export async function cancelAccountOrder(order: StoredOrder, by: string): Promise<string | null> {
  if (order.payment !== 'account' || !order.posTicketRef || order.accountPaidAt) return null
  const ticket = await getPosTicket(order.posTicketRef)
  if (!ticket || ticket.status !== 'account') return null
  if (ticket.amountPaid > 0) {
    return 'Part of this order has already been paid on the customer account, so it cannot be cancelled here. Settle it with the customer first.'
  }
  // The figure is about to change: a repair reading the tickets meanwhile must wait.
  if (order.accountId) await markCreditMoving(order.accountId)
  const voided = await voidOrderTicket(ticket.ref, by)
  if (voided && order.accountId) await releaseCredit(order.accountId, ticket.total)
  return null
}
