/**
 * POST /api/square/create-payment
 *   -> { ok, reference, orderId, paymentId, total, receiptUrl? }
 *
 * The checkout path. Four rules govern this file:
 *
 * 1. SERVER-SIDE REPRICING. The request body carries only `{id, quantity}`
 *    pairs — no prices. `priceOrder()` recomputes the total from the catalogue,
 *    so a tampered cart cannot change what the card is charged. The total the
 *    Pay button showed comes along as `expectedTotal` purely as a check: if it
 *    differs from the authoritative figure, nothing is charged.
 *
 * 2. IDEMPOTENCY. The client's `idempotencyKey` is forwarded verbatim to
 *    Square, which deduplicates on it for 24 hours. A double-clicked Pay
 *    button or a retried request therefore returns the original payment
 *    instead of charging the card twice.
 *
 * 3. CHARGE LAST, PERSIST AFTER. Validation and pricing happen before any
 *    money moves. If persistence fails *after* a successful charge we still
 *    report success (the customer was charged) and log loudly — asking them to
 *    retry would be worse.
 *
 * 4. STOCK IS A SIDE EFFECT. Decrementing stock must never fail the response;
 *    a paid order with stale stock is recoverable, a 500 after a charge is not.
 */

import { randomUUID } from 'node:crypto'
import { site } from '../../../src/config/site.js'
import { isConversationId } from '../../../src/lib/ai/protocol.js'
import {
  asEmail,
  asPhone,
  asString,
  fail,
  methodGuard,
  ok,
  readBody,
  safeMessage,
  withGuard,
} from '../http.js'
import { linkOrderInBackground } from '../ai/orders.js'
import { newOrderId, newOrderReference } from '../ids.js'
import { priceOrder, toCents } from '../pricing.js'
import { resolveProduct } from '../catalogue.js'
import { createPayment, SquareError, getSquareConfig } from '../square.js'
import {
  getOverrides,
  saveOrder,
  saveStockMove,
  setOverride,
  type StoredOrder,
} from '../store.js'

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

interface PaymentBody {
  sourceId?: unknown
  verificationToken?: unknown
  idempotencyKey?: unknown
  fulfilment?: unknown
  fittingTyres?: unknown
  promoCode?: unknown
  customer?: unknown
  address?: unknown
  lines?: unknown
  notes?: unknown
  expectedTotal?: unknown
  /** The AI chat the order came from, if the customer used it (only used to link the two). */
  conversationId?: unknown
}

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  if (!getSquareConfig()) {
    fail(
      res,
      503,
      `Card payment is temporarily unavailable. Please call us on ${site.phone.display} to place your order.`,
    )
    return
  }

  const body = readBody<PaymentBody>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body.')
    return
  }

  /* ---- Payment token ------------------------------------------- */

  const sourceId = asString(body.sourceId, 1024)
  if (!sourceId) {
    fail(res, 400, 'Missing card payment token. Please re-enter your card details.')
    return
  }

  // Square rejects keys over 45 characters.
  const idempotencyKey = asString(body.idempotencyKey, 45)
  if (!idempotencyKey) {
    fail(
      res,
      400,
      'Missing or oversized idempotency key (max 45 characters). Please refresh and try again.',
    )
    return
  }

  const verificationToken = asString(body.verificationToken, 1024) ?? undefined

  /* ---- Customer ------------------------------------------------- */

  if (!body.customer || typeof body.customer !== 'object') {
    fail(res, 400, 'Customer details are required.')
    return
  }

  const rawCustomer = body.customer as Record<string, unknown>

  const name = asString(rawCustomer.name, 120)
  const email = asEmail(rawCustomer.email)
  const phone = asPhone(rawCustomer.phone)
  const company = asString(rawCustomer.company, 120) ?? undefined

  if (!name) {
    fail(res, 400, 'Please enter the name the order should be placed under.')
    return
  }
  if (!email) {
    fail(res, 400, 'Please enter a valid email address — we send your receipt there.')
    return
  }
  if (!phone) {
    fail(res, 400, 'Please enter a contact phone number with at least 8 digits.')
    return
  }

  /* ---- Fulfilment + address ------------------------------------- */

  const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery'
  if (body.fulfilment !== 'pickup' && body.fulfilment !== 'delivery') {
    fail(res, 400, 'Choose either delivery or warehouse pickup.')
    return
  }

  let address: StoredOrder['address']

  if (fulfilment === 'delivery') {
    if (!body.address || typeof body.address !== 'object') {
      fail(res, 400, 'A delivery address is required for delivered orders.')
      return
    }

    const rawAddress = body.address as Record<string, unknown>

    const line1 = asString(rawAddress.line1, 160)
    const suburb = asString(rawAddress.suburb, 80)
    const stateInput = asString(rawAddress.state, 40)
    const postcode = asString(rawAddress.postcode, 10)

    if (!line1) {
      fail(res, 400, 'Please enter the street address for delivery.')
      return
    }
    if (!suburb) {
      fail(res, 400, 'Please enter the delivery suburb.')
      return
    }

    const state = stateInput ? stateInput.toUpperCase() : ''
    if (!AU_STATES.includes(state)) {
      fail(res, 400, `State must be one of ${AU_STATES.join(', ')}.`)
      return
    }

    if (!postcode || !/^\d{4}$/.test(postcode)) {
      fail(res, 400, 'Postcode must be four digits.')
      return
    }

    address = { line1, suburb, state, postcode }
  }

  const notes = asString(body.notes, 1000) ?? undefined

  /* ---- Authoritative pricing ------------------------------------ */

  const overrides = await getOverrides()

  const pricing = priceOrder(
    {
      lines: body.lines,
      fulfilment,
      fittingTyres: body.fittingTyres,
      promoCode: body.promoCode,
    },
    overrides,
  )

  if (pricing.errors.length) {
    fail(res, 400, pricing.errors.join(' '))
    return
  }

  // The client's total is never an input to the charge, but it is what the
  // Pay button showed. If the authoritative total differs — a price changed
  // under an open cart, an admin override the storefront cannot see, or a
  // minimum-quantity promo dropped here — stop rather than charge an amount
  // the customer never agreed to. A cent of slack absorbs rounding drift
  // between the two copies of the arithmetic.
  const expected =
    typeof body.expectedTotal === 'number' ? body.expectedTotal : Number(body.expectedTotal)
  if (
    body.expectedTotal != null &&
    (!Number.isFinite(expected) || Math.abs(expected - pricing.total) > 0.015)
  ) {
    fail(
      res,
      409,
      [
        ...pricing.warnings,
        `This order comes to $${pricing.total.toFixed(2)} rather than the $${Number.isFinite(expected) ? expected.toFixed(2) : '—'} shown, so nothing has been charged. Review your cart, or call ${site.phone.display}.`,
      ].join(' '),
    )
    return
  }

  /* ---- Charge --------------------------------------------------- */

  const orderId = newOrderId()
  const reference = newOrderReference()

  let payment
  try {
    payment = await createPayment({
      sourceId,
      verificationToken,
      idempotencyKey,
      amountCents: toCents(pricing.total),
      referenceId: reference,
      note: `${site.name} order ${reference}`,
      buyerEmail: email,
    })
  } catch (error) {
    if (error instanceof SquareError) {
      // 4xx from Square is a customer problem (declined, expired, CVV); 5xx is
      // ours. Either way `error.message` is Square's own `errors[].detail`.
      const status = error.status >= 400 && error.status < 500 ? 400 : 502
      fail(res, status, error.message)
      return
    }
    throw error
  }

  /* ---- Persist -------------------------------------------------- */

  const order: StoredOrder = {
    id: orderId,
    reference,
    createdAt: new Date().toISOString(),
    status: 'paid',
    fulfilment,
    customer: { name, email, phone, ...(company ? { company } : {}) },
    ...(address ? { address } : {}),
    lines: pricing.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
    fittingTyres: pricing.fittingTyres,
    subtotal: pricing.subtotal,
    fittingTotal: pricing.fittingTotal,
    // `Order.discount` is the combined saving shown on the receipt.
    discount: Math.round((pricing.volumeDiscount + pricing.promoDiscount) * 100) / 100,
    total: pricing.total,
    ...(pricing.promoCode ? { promoCode: pricing.promoCode } : {}),
    paymentId: payment.paymentId,
    ...(notes ? { notes } : {}),
  }

  try {
    await saveOrder(order)
  } catch (error) {
    // The card has already been charged — never turn this into a failure for
    // the customer. Log it so the order can be reconciled from Square.
    console.error(
      `[create-payment] order ${reference} paid (${payment.paymentId}) but not persisted: ${safeMessage(error)}`,
    )
  }

  /* ---- Stock ---------------------------------------------------- */

  for (const line of pricing.lines) {
    try {
      const product = resolveProduct(line.id, overrides)
      if (!product) continue
      const after = Math.max(0, product.stock - line.quantity)
      await setOverride(line.id, { stock: after })
      // The stockroom's history of this tyre; best-effort like the decrement.
      await saveStockMove({
        id: randomUUID(),
        productId: line.id,
        sku: line.sku,
        type: 'sale',
        change: after - product.stock,
        before: product.stock,
        after,
        reason: 'Sold online',
        note: '',
        reference,
        at: new Date().toISOString(),
        by: 'Website checkout',
      })
    } catch (error) {
      console.error(
        `[create-payment] stock decrement failed for ${line.id}: ${safeMessage(error)}`,
      )
    }
  }

  // The AI assistant's chat, if the customer used it: in the background with a short time limit,
  // so it never delays or affects the payment's answer.
  if (isConversationId(body.conversationId)) {
    void linkOrderInBackground(body.conversationId, reference)
  }

  ok(res, {
    ok: true,
    reference,
    orderId,
    paymentId: payment.paymentId,
    total: pricing.total,
    ...(payment.receiptUrl ? { receiptUrl: payment.receiptUrl } : {}),
  })
})
