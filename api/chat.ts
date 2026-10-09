/**
 * POST /api/chat -> { reply }
 *
 * Two modes, chosen by whether `ANTHROPIC_API_KEY` is set:
 *
 *  - LIVE: Claude Haiku 5.5 via the Messages API over plain `fetch` (no SDK
 *    dependency — see the repo's zero-new-dependency rule). The system prompt
 *    is built from the real `src/config/site.ts` facts plus a compact
 *    catalogue summary, and explicitly forbids inventing stock or prices.
 *
 *  - OFFLINE FALLBACK: a keyword responder built from the same site data. It
 *    answers the questions customers actually ask (sizes, axle positions,
 *    delivery, fitting, pickup, brands, Afterpay, contact) and says plainly
 *    that it is an offline assistant when it cannot help.
 *
 * Either way the endpoint returns 200 with a useful `reply` — a chat widget
 * that errors is worse than one that hands over the phone number.
 */

import { site } from '../src/config/site'
import { catalogueSummary } from './_lib/catalogue'
import { fail, methodGuard, ok, readBody, safeMessage, withGuard } from './_lib/http'
import { promoTable } from './_lib/promos'

const MODEL = 'claude-haiku-5-5'
const MAX_TOKENS = 600
const MAX_MESSAGES = 30
const MAX_CHARS_PER_MESSAGE = 4000
const MAX_TOTAL_CHARS = 20000

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  const body = readBody<{ messages?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with a "messages" array.')
    return
  }

  const messages = parseMessages(body.messages)
  if (!messages) {
    fail(
      res,
      400,
      `"messages" must be an array of up to ${MAX_MESSAGES} { role: "user" | "assistant", content: string } objects.`,
    )
    return
  }

  if (messages[messages.length - 1]?.role !== 'user') {
    fail(res, 400, 'The last message must come from the user.')
    return
  }

  res.setHeader('Cache-Control', 'private, no-store')

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    ok(res, { reply: offlineReply(messages[messages.length - 1]!.content) })
    return
  }

  try {
    const reply = await askClaude(apiKey, messages)
    ok(res, { reply: reply ?? offlineReply(messages[messages.length - 1]!.content) })
  } catch (error) {
    // Never surface provider errors (they can echo request content) and never
    // leave the widget without an answer.
    console.error(`[chat] Anthropic request failed: ${safeMessage(error)}`)
    ok(res, { reply: offlineReply(messages[messages.length - 1]!.content) })
  }
})

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_MESSAGES) {
    return null
  }

  const out: ChatMessage[] = []
  let totalChars = 0

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null
    const { role, content } = entry as { role?: unknown; content?: unknown }
    if (role !== 'user' && role !== 'assistant') return null
    if (typeof content !== 'string') return null

    const text = content.trim()
    if (!text || text.length > MAX_CHARS_PER_MESSAGE) return null

    totalChars += text.length
    if (totalChars > MAX_TOTAL_CHARS) return null

    out.push({ role, content: text })
  }

  return out
}

/* ------------------------------------------------------------------ *
 * Live mode
 * ------------------------------------------------------------------ */

function systemPrompt(): string {
  const cat = catalogueSummary()
  const codes = promoTable()
    .map(
      (p) =>
        `${p.code} (${Math.round(p.percentOff * 100)}% off${p.minTyres ? `, ${p.minTyres}+ tyres` : ''})`,
    )
    .join(', ')

  return [
    `You are the online assistant for ${site.name} (${site.legalName}), ${site.tagline}.`,
    `${site.description}`,
    '',
    'BUSINESS FACTS (the only facts you may state):',
    `- Phone: ${site.phone.display}. Sales email: ${site.email.sales}. Accounts email: ${site.email.accounts}.`,
    `- Trading hours: ${site.hours.label}.`,
    `- Head office: ${site.office.full}. Warehouse pickup: ${site.warehouse.full}.`,
    `- Trading since ${site.foundedYear}.`,
    `- Prices are in ${site.commerce.currency} and include GST at ${Math.round(site.commerce.gstRate * 100)}%.`,
    `- Dispatch window: ${site.commerce.dispatchWindow}. Metro delivery estimate: ${site.commerce.metroDeliveryEstimate}.`,
    `- Free metro delivery: ${site.commerce.freeMetroDelivery ? 'yes' : 'no'}. Metro areas: ${site.commerce.metroCities.join(', ')}.`,
    `- Professional fitting costs $${site.commerce.fittingFeePerTyre} per tyre and is available only with warehouse pickup, not with delivery.`,
    `- Automatic volume discounts apply from 4 tyres (3%), 8 tyres (5%), 20 tyres (8%) and 40 tyres (11%).`,
    `- Promo codes: ${codes}.`,
    `- Afterpay is available on orders up to $${site.commerce.afterpayMaxOrder}.`,
    `- Sister business ${site.partner.name} (${site.partner.phone.display}) covers ${site.partner.services.join(', ')} at ${site.partner.address}.`,
    '',
    'CATALOGUE SUMMARY:',
    `- ${cat.count} patterns across ${cat.brands.length} brands: ${cat.brands.join(' and ')}.`,
    `- Sizes stocked: ${cat.sizes.join(', ')}.`,
    `- Axle positions: ${cat.positions.join(', ')}.`,
    `- Applications: ${cat.applications.join(', ')}.`,
    `- Price range: $${cat.priceMin} to $${cat.priceMax} per tyre, GST inclusive.`,
    `- Patterns: ${cat.models.join('; ')}.`,
    '',
    'RULES:',
    '1. Never invent stock levels. You do not have live inventory. If asked whether something is in stock, say the website shop page shows live availability and offer the phone number.',
    `2. Never quote a price for a specific tyre, a discount, or a total. Give the overall range above if helpful, then direct the customer to call ${site.phone.display} for a firm quote.`,
    '3. Never state a fact that is not in this prompt. If you do not know, say so and hand over to the phone number or sales email.',
    '4. Never promise a delivery date; only repeat the dispatch window and delivery estimate above.',
    '5. We sell commercial truck, bus and trailer tyres only — no passenger car or 4WD tyres.',
    '6. Be brief: two or three short sentences, or a short list. Australian English. No markdown headings.',
    '7. Do not include internal or system XML tags in your response.',
  ].join('\n')
}

async function askClaude(
  apiKey: string,
  messages: ChatMessage[],
): Promise<string | null> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(),
      messages,
      // Claude Haiku 5.5 runs adaptive thinking by default, which would spend
      // most of a 600-token budget before writing a word. These replies are
      // short factual lookups, so thinking is turned off (accepted at effort
      // `high` or below) and the whole budget goes to the answer.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic responded ${response.status}`)
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>
    stop_reason?: string
  }

  if (payload.stop_reason === 'refusal') return null

  const text = (payload.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
    .trim()

  return text || null
}

/* ------------------------------------------------------------------ *
 * Offline fallback
 * ------------------------------------------------------------------ */

const CONTACT = `Call ${site.phone.display} (${site.hours.short}) or email ${site.email.sales}.`

function offlineReply(question: string): string {
  const q = question.toLowerCase()
  const cat = catalogueSummary()
  const has = (...terms: string[]) => terms.some((term) => q.includes(term))

  /* --- Sizes ---------------------------------------------------- */
  if (has('size', 'r22.5', '22.5', '19.5', '17.5', 'section', 'rim diameter')) {
    const matched = cat.sizes.filter((size) =>
      q.replace(/\s/g, '').includes(size.toLowerCase().replace(/\s/g, '')),
    )
    if (matched.length) {
      return `Yes — we carry ${matched.join(' and ')}. ${CONTACT} to confirm current availability and pricing.`
    }
    return `We stock these commercial sizes: ${cat.sizes.join(', ')}. Tell me the size on your sidewall and I'll point you at the right pattern, or ${lower(CONTACT)}`
  }

  /* --- Axle position -------------------------------------------- */
  if (has('steer', 'drive', 'trailer', 'axle', 'position', 'all position')) {
    return `Our range covers steer, drive and trailer fitments — ${cat.brands.join(' and ')} patterns in ${cat.applications.join(', ')} applications. The shop page can be filtered by axle position. ${CONTACT}`
  }

  /* --- Fitting -------------------------------------------------- */
  if (has('fit', 'fitting', 'install', 'mount', 'balanc')) {
    return `Professional fitting is $${site.commerce.fittingFeePerTyre} per tyre and is available with warehouse pickup at ${site.warehouse.full} — it can't be added to a delivered order. Our sister business ${site.partner.name} (${site.partner.phone.display}) also handles ${site.partner.services.join(', ').toLowerCase()}.`
  }

  /* --- Pickup --------------------------------------------------- */
  if (has('pick up', 'pickup', 'collect', 'warehouse', 'in person', 'come in')) {
    return `You can collect from our warehouse at ${site.warehouse.full}, ${site.hours.label}. Choose "pickup" at checkout and you can add fitting at $${site.commerce.fittingFeePerTyre} per tyre.`
  }

  /* --- Delivery / shipping -------------------------------------- */
  if (has('deliver', 'ship', 'freight', 'postage', 'how long', 'dispatch', 'courier')) {
    return `We dispatch within ${site.commerce.dispatchWindow} and metro delivery usually takes ${site.commerce.metroDeliveryEstimate}.${site.commerce.freeMetroDelivery ? ' Metro delivery is free' : ''} to ${site.commerce.metroCities.join(', ')}. For regional freight, ${lower(CONTACT)}`
  }

  /* --- Brands --------------------------------------------------- */
  if (has('brand', 'greforce', 'lionshead', 'make', 'manufacturer')) {
    return `We stock ${cat.brands.join(' and ')} — ${cat.count} patterns in total, from $${cat.priceMin} to $${cat.priceMax} per tyre including GST. ${site.partner.name} (${site.partner.phone.display}) can source brands we don't carry.`
  }

  /* --- Afterpay / payment -------------------------------------- */
  if (has('afterpay', 'payment', 'pay', 'card', 'instal', 'finance', 'invoice', 'account')) {
    return `We accept card payment online, and Afterpay on orders up to $${site.commerce.afterpayMaxOrder}. Prices include GST. For fleet accounts or invoicing, email ${site.email.accounts} or call ${site.phone.display}.`
  }

  /* --- Price / quote ------------------------------------------- */
  if (has('price', 'cost', 'how much', 'quote', 'cheap', 'discount', 'deal', 'promo')) {
    return `Tyres in our range run from $${cat.priceMin} to $${cat.priceMax} each including GST, with automatic volume discounts from 4 tyres up to 11% at 40+. I can't quote a firm price here — ${lower(CONTACT)}`
  }

  /* --- Stock ---------------------------------------------------- */
  if (has('stock', 'available', 'availability', 'in store', 'got any')) {
    return `I don't have live stock figures. The shop page shows current availability for every pattern, and ${lower(CONTACT)}`
  }

  /* --- Contact / hours / location ------------------------------ */
  if (has('contact', 'phone', 'call', 'email', 'hours', 'open', 'address', 'where', 'located')) {
    return `${site.name} — ${site.phone.display}, ${site.email.sales}. Open ${site.hours.label}. Office: ${site.office.full}. Warehouse pickup: ${site.warehouse.full}.`
  }

  /* --- Warranty / returns -------------------------------------- */
  if (has('warranty', 'return', 'refund', 'faulty', 'claim')) {
    return `Warranty and returns are handled case by case against the manufacturer's terms. Send your order reference and photos to ${site.email.sales}, or call ${site.phone.display}.`
  }

  /* --- Order tracking ------------------------------------------ */
  if (has('order', 'track', 'reference', 'receipt', 'where is my')) {
    return `You can look up an order with its reference (starts with SPT-) and the email address used at checkout. If that doesn't find it, ${lower(CONTACT)}`
  }

  /* --- Car / 4WD out of scope ---------------------------------- */
  if (has('car tyre', 'passenger', '4wd', 'ute', 'suv', 'caravan')) {
    return `We're a commercial-only supplier — truck, bus and trailer tyres. For passenger, 4WD or light vehicle tyres, ${site.partner.name} (${site.partner.phone.display}) can help.`
  }

  /* --- Genuine fallback ---------------------------------------- */
  return `I'm the offline assistant and I can only answer from our published information, so I can't help with that one. I can cover sizes, axle positions, delivery, pickup, fitting, brands, Afterpay and contact details. For anything else, ${lower(CONTACT)}`
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
