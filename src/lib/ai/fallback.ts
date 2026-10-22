/**
 * Quick answers for when the assistant cannot answer: it is switched off, over its limit, busy, or
 * the customer's connection cannot reach it. A small set of keyword rules over the real site facts,
 * so the chat never shows a raw error. Every answer is short, true, and ends with a way to reach
 * the team. (These replace the offline answers of the old chat widget.)
 *
 * Rules for the words in here: no promo code of any kind, nothing the business does not offer
 * (bank transfer, customer accounts, tracking emails, road-hazard cover, vehicle look-up, a best
 * price guarantee), no em dashes. tests/ai-ui.test.ts checks all three.
 *
 * React-free so the tests can run it.
 */
import { site } from '../../config/site.js'
import { PRICE_BREAKS, allSizes, products } from '../../data/products.js'
import { EMERGENCY, isEmergency } from './emergency.js'
import { contactActions, type ContactAction } from './protocol.js'
import { sizeKey } from '../size.js'

export type QuickAnswer = { text: string; actions: ContactAction[] }

/** The short note shown above a quick answer, by why the assistant could not answer. */
export const FALLBACK_NOTE = 'Our assistant is busy, here is a quick answer.'
export const OFFLINE_NOTE = 'You seem to be offline, so here is a quick answer.'

/** Site wording with its dashes turned into words (an en dash range "8:00 AM to 6:00 PM" reads as words). */
const DASHES = new RegExp(`\\s*[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]\\s*`, 'g')
const plain = (text: string) => text.replace(DASHES, ' to ')

const CONTACT = `Call ${site.phone.display} or email ${site.email.sales}.`
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const test = (q: string, ...patterns: RegExp[]) => patterns.some((p) => p.test(q))

export function quickAnswer(question: string): QuickAnswer {
  if (isEmergency(question)) return EMERGENCY
  const q = question.toLowerCase()
  const reply = (text: string): QuickAnswer => ({ text, actions: contactActions() })
  const brands = [...new Set(products.map((p) => p.brand))]
  const c = site.commerce

  /* Greeting */
  if (/^\s*(hi|hello|hey|g'?day|good (morning|afternoon|evening))\b/.test(q) && q.length < 40) {
    return reply(
      `G'day! I can answer questions about truck, bus and trailer tyres, sizes, delivery and fitting. ${CONTACT}`,
    )
  }

  /* Sizes */
  if (test(q, /\bsizes?\b/, /\d\s*r\s*\d/, /22\.5|19\.5|17\.5|\brim\b/)) {
    const asked = allSizes.filter((size) => q.replace(/[^a-z0-9]/g, '').includes(sizeKey(size)))
    if (asked.length) {
      return reply(
        `Yes, we carry ${list(asked)}. The shop page shows current prices and availability for each pattern, or ${lower(CONTACT)}`,
      )
    }
    return reply(
      `We range these commercial sizes: ${list([...allSizes])}. Tell us the size on your sidewall and the team can point you at the right pattern. ${CONTACT}`,
    )
  }

  /* Fitting */
  if (test(q, /\bfit(ted|ting|ment)?\b/, /\binstall/, /\bmount/, /\bbalanc/)) {
    return reply(
      `Fitting is $${c.fittingFeePerTyre} per tyre and is available when you pick up from our warehouse at ${site.warehouse.full}. It cannot be added to a delivered order. ${CONTACT}`,
    )
  }

  /* Pickup */
  if (test(q, /pick[ -]?up/, /\bcollect/, /\bwarehouse/, /\bin person\b/)) {
    return reply(
      `You can collect from our warehouse at ${site.warehouse.full}, ${plain(site.hours.label)}. Choose pickup at checkout, and you can add fitting at $${c.fittingFeePerTyre} per tyre.`,
    )
  }

  /* Delivery */
  if (test(q, /\bdeliver/, /\bship/, /\bfreight/, /\bpostage/, /\bdispatch/, /how long/, /\bcourier/)) {
    return reply(
      `We dispatch within ${c.dispatchWindow}, and metro delivery usually takes ${plain(c.metroDeliveryEstimate)}.${c.freeMetroDelivery ? ` Metro delivery is free to ${list([...c.metroCities])}.` : ''} For regional freight, ${lower(CONTACT)}`,
    )
  }

  /* Axle positions */
  if (test(q, /\bsteer/, /\bdrive\b/, /\btrailer/, /\baxle/, /\bposition/)) {
    return reply(
      `Our range covers steer, drive and trailer positions from ${list(brands)}. The [Tyre Finder](/finder) helps you choose, and the [shop](/shop) can be filtered by axle position. ${CONTACT}`,
    )
  }

  /* Brands */
  if (test(q, /\bbrands?\b/, /greforce/, /lionshead/, /manufacturer/, /\bmakes?\b/)) {
    return reply(
      `We stock ${list(brands)}. Other brands can be ordered in on request: call us on ${site.phone.display}. See the [brands page](/brands).`,
    )
  }

  /* Payment */
  if (test(q, /afterpay/, /\bpay(ment|ing)?\b/, /\bcards?\b/, /instal/, /financ/)) {
    return reply(
      `You can pay by card through Square at our secure checkout, and the payment options are shown there. Prices include GST. For fleet or wholesale pricing, call ${site.phone.display} or email ${site.email.sales}.`,
    )
  }

  /* Price and quotes (a promo code is never mentioned) */
  if (test(q, /\bprice/, /\bcost/, /how much/, /\bquote/, /cheap/, /discount/, /\bdeals?\b/, /promo|voucher|coupon|code/, /\bpoa\b/)) {
    const first = PRICE_BREAKS[0]
    const last = PRICE_BREAKS[PRICE_BREAKS.length - 1]
    return reply(
      `Prices on the [shop](/shop) are live and include GST. Volume discounts apply automatically from ${first.min} tyres (${Math.round(first.discount * 100)}%) up to ${last.min} or more (${Math.round(last.discount * 100)}%). Lines marked price on request are quoted by our team, and the sales team can help with pricing. ${CONTACT}`,
    )
  }

  /* Stock */
  if (test(q, /\bstock/, /availab/, /got any/, /\bhave you\b/, /do you have/)) {
    return reply(
      `The [shop](/shop) shows current availability for every pattern, and tyres out of stock can be pre-ordered. ${CONTACT}`,
    )
  }

  /* Contact, hours, location */
  if (test(q, /contact/, /phone/, /\bcall\b/, /email/, /\bhours?\b/, /\bopen\b/, /address/, /where/, /located/)) {
    return reply(
      `${site.name}: ${site.phone.display}, ${site.email.sales}. Open ${plain(site.hours.label)}. Office: ${site.office.full}. Warehouse pickup: ${site.warehouse.full}.`,
    )
  }

  /* Warranty and returns */
  if (test(q, /warrant/, /\breturn/, /refund/, /faulty/, /\bclaim/)) {
    return reply(
      `Warranty and returns follow the manufacturer's terms and are handled case by case. Send your order reference and photos to ${site.email.sales}, or call ${site.phone.display}. See [returns](/returns).`,
    )
  }

  /* Orders */
  if (test(q, /\border/, /\btrack/, /reference/, /receipt/, /where is my/)) {
    return reply(
      `You can look up an order with its reference (it starts with SPT-) and the email address used at checkout, on the [order lookup](/order) page. If that does not find it, ${lower(CONTACT)}`,
    )
  }

  /* Not commercial tyres */
  if (test(q, /car tyre/, /passenger/, /\b4wd\b/, /\bute\b/, /\bsuv\b/, /caravan/)) {
    return reply(
      `We supply commercial truck, bus and trailer tyres only, so we cannot help with passenger or 4WD tyres. ${CONTACT}`,
    )
  }

  /* Anything else */
  return reply(
    `I can only give quick answers right now, on sizes, axle positions, delivery, pickup, fitting, brands, payment and contact details. For anything else, ${lower(CONTACT)}`,
  )
}
