/**
 * The assistant's tools: what it can look up and show. They are deliberately limited. It finds
 * tyres with live prices and stock, opens pages, shows a card (add to cart, quote request, message
 * for the sales team), checks an order's status and shows the call and email buttons. It has NO
 * tool that creates an order or takes a payment: the customer taps the card in their browser, the
 * tyre goes into the existing cart, and the site's own checkout takes payment.
 *
 * Every argument is validated here (the model's JSON is untrusted), and every result is small JSON
 * the model reads, with an `error` or `problems` field it can act on. The chat and the voice calls
 * (voice.ts `callTool`) use the same ones.
 */
import { site } from '../../../src/config/site.js'
import { blogPosts } from '../../../src/data/blog.js'
import { brands } from '../../../src/data/brands.js'
import { allBrands, allSizes, effectivePrice } from '../../../src/data/products.js'
import type { AxlePosition, Product } from '../../../src/data/types.js'
import { sizeKey } from '../../../src/lib/size.js'
import {
  contactActions,
  ENQUIRY_TYPES,
  newCardId,
  type CartCard,
  type Card,
  type ChatEvent,
  type HandoverCard,
  type QuoteCard,
  type QuoteEnquiryType,
} from '../../../src/lib/ai/protocol.js'
import { mergeCatalogue } from '../catalogue.js'
import { asEmail } from '../http.js'
import { priceOrder } from '../pricing.js'
import { findOrder, getOverrides, type StoredOrder, type StoredOverride } from '../store.js'
import type { Tool, ToolCall } from './gateway.js'
import { rateLimited } from './spend.js'

/** What one message did besides its words: kept with the answer, and shown to the model next turn. */
export interface Turn {
  /** Today in Sydney, YYYY-MM-DD */
  today: string
  /** The page the customer is on (a path) */
  page: string
  /** The visitor's hashed network, for the order lookup's rate limit */
  ipHash: string
  emit: (e: ChatEvent) => void
  /** The server's own record of what was done (searches made, pages opened, cards shown) */
  notes: string[]
  /** The pages opened, saved with the answer so a browser collecting it later can open them too */
  went: { to: string; note: string }[]
  opened: boolean
  buttons: boolean
  /** The cards shown in this answer (at most one of each kind) */
  cards: Card[]
  /** The live catalogue (the bundled tyres with the admin's price and stock edits), read once per message */
  live: { overrides: Record<string, StoredOverride>; catalogue: Product[] } | null
}

export const newTurn = (today: string, page: string, emit: (e: ChatEvent) => void, ipHash = ''): Turn => ({
  today,
  page,
  ipHash,
  emit,
  notes: [],
  went: [],
  opened: false,
  buttons: false,
  cards: [],
  live: null,
})

/** The live catalogue for this message: read once, so every tool in the answer sees the same prices and stock. */
export async function liveCatalogue(t: Turn) {
  if (!t.live) {
    const overrides = await getOverrides()
    t.live = { overrides, catalogue: mergeCatalogue(overrides) }
  }
  return t.live
}

/* ------------------------------------------------------------------ schemas */

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): Tool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
})

const POSITIONS = ['steer', 'drive', 'trailer'] as const

export const PAGES = [
  'home',
  'shop',
  'product',
  'finder',
  'deals',
  'brands',
  'range',
  'fleet',
  'wholesale',
  'guide',
  'faq',
  'shipping',
  'returns',
  'contact',
  'about',
  'blog',
  'blog_post',
  'cart',
  'checkout',
  'order_lookup',
  'compare',
] as const
export type PageName = (typeof PAGES)[number]

export const TOOLS: Tool[] = [
  fn(
    'search_tyres',
    'Search the live catalogue. Returns tyres with the price each in Australian dollars (inc. GST, null when it is price on request), stock and key specs, priced in-stock tyres first. Use it before saying anything about a price or about stock. When nothing matches it returns the sizes we do stock. Returns up to 5 tyres by default; never list them all in the answer (see how_to_answer in the result).',
    {
      size: { type: 'string', description: 'A tyre size such as 11R22.5 or 295/80R22.5. Spacing and case do not matter.' },
      position: { type: 'string', enum: [...POSITIONS], description: 'Axle position: steer, drive or trailer.' },
      brand: { type: 'string', description: 'Greforce or Lionshead. Other brands are not in our stock.' },
      text: { type: 'string', description: 'Free words, for example a pattern name such as HD02 or an application such as long haul.' },
      in_stock_only: { type: 'boolean', description: 'Only tyres we hold in the warehouse right now.' },
      limit: { type: 'integer', minimum: 1, maximum: 8, description: 'How many to return, 1 to 8. Default 5.' },
    },
    [],
  ),
  fn(
    'tyre_details',
    'The full specification of one tyre: ratings, tread depth, highlights, price and stock. Use the id from search_tyres.',
    { product_id: { type: 'string', description: 'The id from search_tyres.' } },
    ['product_id'],
  ),
  fn(
    'propose_add_to_cart',
    'Show the customer an "Add to cart" card for one tyre and quantity, priced exactly as checkout will charge it. Nothing is added or ordered: the customer taps the button on the card. Use it as soon as they want to buy, add or order tyres. Price-on-request tyres cannot be added: use prepare_quote_request.',
    {
      product_id: { type: 'string', description: 'The id from search_tyres.' },
      quantity: { type: 'integer', minimum: 1, maximum: 200, description: 'How many tyres.' },
      fitting: { type: 'boolean', description: `Professional fitting at warehouse pickup, $${site.commerce.fittingFeePerTyre} per tyre. Only if the customer asked for it.` },
      checkout: { type: 'boolean', description: 'The customer wants to go straight to checkout after adding.' },
    },
    ['product_id', 'quantity'],
  ),
  fn(
    'open_page',
    'Open a page of the website for the customer. When the customer asks to see, show or browse several tyres ("show me all drive tyres in stock"), open page "shop" with the matching filters instead of listing the tyres in the answer. page "shop" takes optional size, position, brand, in_stock and query filters; "product" needs product_id; "blog_post" needs slug; "order_lookup" is the page where a customer looks up an order.',
    {
      page: { type: 'string', enum: [...PAGES] },
      product_id: { type: 'string', description: 'With page "product".' },
      size: { type: 'string', description: 'With page "shop": a tyre size.' },
      position: { type: 'string', enum: [...POSITIONS], description: 'With page "shop".' },
      brand: { type: 'string', description: 'With page "shop": Greforce or Lionshead.' },
      in_stock: { type: 'boolean', description: 'With page "shop": only tyres in stock.' },
      query: { type: 'string', description: 'With page "shop": search words.' },
      slug: { type: 'string', description: 'With page "blog_post": the article slug.' },
    },
    ['page'],
  ),
  fn(
    'prepare_quote_request',
    'Prepare a quote request for the customer to check, edit and send to the sales team: price-on-request tyres, fleet or wholesale pricing, large or bulk orders, and brands we do not stock. Nothing is sent until the customer taps Send.',
    {
      enquiry_type: { type: 'string', enum: [...ENQUIRY_TYPES], description: 'quote (a specific tyre), fleet, wholesale or sourcing (a brand or size we do not stock).' },
      product_id: { type: 'string', description: 'The tyre, if one was discussed.' },
      size: { type: 'string', description: 'The tyre size, if known.' },
      quantity: { type: 'integer', minimum: 1, maximum: 100000 },
      message: { type: 'string', description: 'The request, written from the customer, 10 to 4000 characters.' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      company: { type: 'string' },
    },
    ['enquiry_type', 'message'],
  ),
  fn(
    'talk_to_person',
    'Prepare a short message for the sales team for the customer to check and send: when they ask for a person, a callback or a manager, are unhappy, or after two failed tries. Also shows the call and email buttons. Nothing is sent until the customer taps the button.',
    {
      reason: { type: 'string', description: 'Why, in a few words.' },
      message: { type: 'string', description: 'What the customer wants the team to know, 10 to 4000 characters.' },
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
    },
    ['reason', 'message'],
  ),
  fn(
    'order_status',
    'Look up the status of an order. Needs the order reference (like SPT-AB12-CD34) AND the email address the order was placed with. Returns only the status, date, items and total.',
    { reference: { type: 'string' }, email: { type: 'string' } },
    ['reference', 'email'],
  ),
  fn('show_contact_buttons', 'Show buttons to call or email the sales team. Use it for anything urgent or unsafe, and when a phone call is the right answer.', {}, []),
]

/* ------------------------------------------------------------------ helpers */

/** "A$1,234.50" */
export const aud = (amount: number) =>
  `A$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const asInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d{1,6}$/.test(v.trim()) ? Number(v) : null
const asBool = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null
const present = (v: unknown) => v !== undefined && v !== null && v !== ''

/** One line of text from the model: no NUL, one space between words, cut to `max`. */
const line = (v: unknown, max: number) =>
  String(typeof v === 'string' || typeof v === 'number' ? v : '')
    .split('\0')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

const text = (v: unknown, max: number) =>
  String(typeof v === 'string' ? v : '')
    .split('\0')
    .join('')
    .trim()
    .slice(0, max)

/** The site's own words, used in a sentence the customer reads: no em dashes. */
const EM_DASH = new RegExp(`\\s*${String.fromCharCode(0x2014)}\\s*`, 'g')
const plain = (s: string) => s.replace(EM_DASH, ', ')

const productName = (p: Pick<Product, 'brand' | 'model'>) => `${p.brand} ${p.model}`

/** The call and email buttons, once per answer. */
export function showContactButtons(t: Turn) {
  if (t.buttons) return
  t.buttons = true
  t.emit({ type: 'buttons', actions: contactActions() })
  t.notes.push('Showed the call and email buttons')
}

const REACH_SALES = `The sales team can help: ${site.phone.display}. Use talk_to_person or show_contact_buttons.`

const stockStatus = (p: Product) => (p.price == null ? 'price on request' : p.stock > 0 ? `in stock: ${p.stock}` : 'pre-order')

/** Priced tyres we hold first, then priced pre-orders, then price on request; cheapest first within each. */
function rank(p: Product): number {
  return p.price == null ? 2 : p.stock > 0 ? 0 : 1
}
const byRank = (a: Product, b: Product) =>
  rank(a) - rank(b) || (effectivePrice(a) ?? 0) - (effectivePrice(b) ?? 0) || a.id.localeCompare(b.id)

const urlOf = (p: Product) => `/product/${p.id}`

const row = (p: Product) => {
  const price = effectivePrice(p)
  return {
    id: p.id,
    name: productName(p),
    size: p.size,
    positions: p.position,
    application: p.application,
    price_each_aud: price,
    ...(price != null && p.discount != null ? { discount_percent: p.discount } : {}),
    stock_status: stockStatus(p),
    ply: p.ply,
    load_index: p.loadIndex,
    speed_rating: p.speedRating,
    tread_mm: p.treadDepthMm,
    url: urlOf(p),
  }
}

/** Finds a tyre by id (or SKU) in the live catalogue. */
function findProduct(catalogue: Product[], raw: unknown): Product | undefined {
  const q = line(raw, 120).toLowerCase()
  return q ? catalogue.find((p) => p.id.toLowerCase() === q || p.sku.toLowerCase() === q) : undefined
}

const unknownTyre = { error: 'Unknown tyre. Use an id from search_tyres.' }

/* -------------------------------------------------------------------- tools */

/** Runs one tool call. Never throws: a failure comes back as `{ error }` for the model to read. */
export async function runTool(call: ToolCall, t: Turn): Promise<unknown> {
  let args: Record<string, unknown>
  try {
    const parsed = JSON.parse(call.arguments || '{}')
    args = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return { error: 'The arguments were not valid JSON.' }
  }
  try {
    return await run(call.name, args, t)
  } catch (err) {
    console.error(`chat: tool ${call.name} failed:`, err instanceof Error ? err.message : 'unknown error')
    return { error: `That lookup failed. Say you could not check it just now and offer the sales team on ${site.phone.display}.` }
  }
}

/**
 * Opens a page for the customer: one per answer, and never the page they are on. Used by the
 * open_page tool and by the answer check below, so both do exactly the same.
 */
export function openOnTurn(t: Turn, to: string, note: string) {
  if (t.opened) return { ok: false, error: 'Only one page can be opened per answer.' }
  if (to === t.page) return { ok: false, error: 'The customer is already on that page.' }
  t.opened = true
  t.notes.push(note)
  t.went.push({ to, note })
  t.emit({ type: 'go', to, note })
  return { ok: true, opened: note }
}

/* ------------------------------------------------------------ page table */

export type Target = { to: string; note: string }

/** The pages with one fixed address. open_page and the claim check both read this table, so they cannot drift. */
const FIXED_PAGES: Record<Exclude<PageName, 'shop' | 'product' | 'blog_post'>, [string, string]> = {
  home: ['/', 'Opened the home page'],
  finder: ['/finder', 'Opened the Tyre Finder'],
  deals: ['/deals', 'Opened the deals'],
  brands: ['/brands', 'Opened the brands page'],
  range: ['/products', 'Opened the full range'],
  fleet: ['/fleet-solutions', 'Opened Fleet Solutions'],
  wholesale: ['/wholesale', 'Opened the wholesale page'],
  guide: ['/guide', 'Opened the tyre guide'],
  faq: ['/faq', 'Opened the FAQ'],
  shipping: ['/shipping', 'Opened Shipping and Delivery'],
  returns: ['/returns', 'Opened Returns and Warranty'],
  contact: ['/contact', 'Opened the contact page'],
  about: ['/about', 'Opened the about page'],
  blog: ['/blog', 'Opened the blog'],
  cart: ['/cart', 'Opened the cart'],
  checkout: ['/checkout', 'Opened the checkout'],
  order_lookup: ['/order', 'Opened the order lookup'],
  compare: ['/compare', 'Opened the tyre comparison'],
}

export interface PageArgs {
  product_id?: unknown
  size?: unknown
  position?: unknown
  brand?: unknown
  in_stock?: unknown
  query?: unknown
  slug?: unknown
}

/**
 * The address and note for a page, or an error the model can act on. This is the one place that
 * knows the site's addresses and the shop's filter parameters (`size`, `position`, `brand`,
 * `inStock`, `q`, as `src/components/shop/Filters.tsx` reads them). Never an admin address:
 * only the pages in the table above, the shop, a tyre and an article can come out.
 */
export function pageTarget(page: unknown, args: PageArgs, catalogue: Product[]): Target | { error: string } {
  if (typeof page !== 'string' || !(PAGES as readonly string[]).includes(page)) {
    return { error: `Unknown page. Use one of: ${PAGES.join(', ')}.` }
  }
  switch (page as PageName) {
    case 'shop': {
      const params = new URLSearchParams()
      const parts: string[] = []
      if (present(args.query)) {
        const q = line(args.query, 80)
        if (q) {
          params.set('q', q)
          parts.push(`"${q}"`)
        }
      }
      if (present(args.brand)) {
        const wanted = line(args.brand, 40).toLowerCase()
        const brand = allBrands.find((b) => b.toLowerCase() === wanted)
        if (!brand) return { error: `We only stock ${allBrands.join(' and ')}. Other brands can be ordered in on request.` }
        params.set('brand', brand)
        parts.push(brand)
      }
      if (present(args.size)) {
        const key = sizeKey(line(args.size, 40))
        const size = key ? allSizes.find((s) => sizeKey(s) === key) : undefined
        if (!size) return { error: `Unknown size. We stock: ${allSizes.join(', ')}.` }
        params.set('size', size)
        parts.push(size)
      }
      if (present(args.position)) {
        const position = line(args.position, 20).toLowerCase()
        if (!(POSITIONS as readonly string[]).includes(position)) return { error: `position must be one of: ${POSITIONS.join(', ')}.` }
        params.set('position', position)
        parts.push(`${position} tyres`)
      }
      if (present(args.in_stock)) {
        const inStock = asBool(args.in_stock)
        if (inStock === null) return { error: 'in_stock must be true or false.' }
        if (inStock) {
          params.set('inStock', '1')
          parts.push('in stock')
        }
      }
      const qs = params.toString()
      return { to: qs ? `/shop?${qs}` : '/shop', note: parts.length ? `Opened the shop: ${parts.join(', ')}` : 'Opened the shop' }
    }
    case 'product': {
      const p = findProduct(catalogue, args.product_id)
      return p ? { to: urlOf(p), note: `Opened ${productName(p)} ${p.size}` } : unknownTyre
    }
    case 'blog_post': {
      const slug = line(args.slug, 120).toLowerCase()
      const post = slug ? blogPosts.find((b) => b.slug === slug) : undefined
      return post
        ? { to: `/blog/${post.slug}`, note: `Opened the article "${post.title}"` }
        : { error: `Unknown article. Use one of these slugs: ${blogPosts.map((b) => b.slug).join(', ')}.` }
    }
    default: {
      const [to, note] = FIXED_PAGES[page as keyof typeof FIXED_PAGES]
      return { to, note }
    }
  }
}

/** The model says it opened a page ("I've opened ...", "I've pulled up ..."). An offer ("I can open ...") is not a claim. */
const OPEN_CLAIM =
  /\b(?:i['’]ve|i\s+have|i\s+just|i\s+went\s+ahead\s+and)\s+(?:just\s+)?(?:opened|pulled\s+up|brought\s+up)\b|\bopened\s+(?:up\s+)?(?:the|our)\b[^.!?\n]{0,80}\bfor\s+you\b/i

/** What was brought up is a card, message, quote, request, form or details on the chat, not a page ("brought up the quote request for ..."). */
const NOT_A_PAGE =
  /^[^.!?,\n]*?\b(?:opened|pulled\s+up|brought\s+up)\s+(?:up\s+)?(?:(?:the|a|an|your|our|that|this)\s+)?(?:[\w+'’-]+\s+){0,2}(?:cart\s+card|card|message|quote|request|enquiry|inquiry|form|details)\b/i

/** True when the text claims an opened page: a claim whose object is a card, message, request, form or details is not one. */
export const claimsPage = (s: string): boolean => {
  const claim = OPEN_CLAIM.exec(s)
  return !!claim && !NOT_A_PAGE.test(s.slice(claim.index))
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A name as it may be written in a sentence: any case, the words in order. */
const nameRx = (name: string) => new RegExp(`(?<![\\w-])${esc(name.toLowerCase().trim()).replace(/\s+/g, '\\s+')}(?![\\w-])`, 'i')

/**
 * The page a sentence says was opened, as the address and note open_page would give it, or null
 * when the text does not claim an opened page or names none the site has. The first page named
 * after the claim wins; a tyre pattern or size comes before a brand, a position or a named page,
 * and those before the general ones (shop, home).
 */
export function claimedPage(s: string, catalogue: Product[]): Target | null {
  const claim = OPEN_CLAIM.exec(s)
  if (!claim || !claimsPage(s)) return null
  // Only the sentence that makes the claim: from the claim to its end.
  const rest = s.slice(claim.index)
  // A full stop inside a size (22.5) does not end the sentence.
  const clause = /^(?:[^.!?\n]|\.(?=\d))*/.exec(rest)?.[0] ?? rest
  const found: { at: number; weight: number; size: number; to: Target }[] = []
  const add = (rx: RegExp, weight: number, to: Target | { error: string }) => {
    const hit = rx.exec(clause)
    if (hit && !('error' in to)) found.push({ at: hit.index, weight, size: hit[0].length, to })
  }

  // A pattern name: one tyre when the name is unique, otherwise the shop searching for it.
  const models = [...new Set(catalogue.map((p) => p.model))]
  for (const model of models) {
    const lines = catalogue.filter((p) => p.model === model)
    add(nameRx(model), 0, lines.length === 1 ? pageTarget('product', { product_id: lines[0].id }, catalogue) : pageTarget('shop', { query: model }, catalogue))
  }
  for (const size of allSizes) add(nameRx(size), 0, pageTarget('shop', { size }, catalogue))
  for (const brand of allBrands) add(nameRx(brand), 1, pageTarget('shop', { brand }, catalogue))
  for (const position of POSITIONS) add(new RegExp(`\\b${position}\\s+tyres?\\b`, 'i'), 1, pageTarget('shop', { position }, catalogue))

  const fixed = (rx: RegExp, weight: number, page: PageName) => add(rx, weight, pageTarget(page, {}, catalogue))
  fixed(/\btyre\s+finder\b|\bfinder\b/i, 1, 'finder')
  fixed(/\bdeals?\b|\bspecials?\b|\bon\s+sale\b/i, 1, 'deals')
  fixed(/\bbrands\b/i, 1, 'brands')
  fixed(/\bfull\s+range\b|\bwhole\s+range\b/i, 1, 'range')
  fixed(/\bfleet\b/i, 1, 'fleet')
  fixed(/\bwholesale\b/i, 1, 'wholesale')
  fixed(/\btyre\s+guide\b|\bguide\b/i, 1, 'guide')
  fixed(/\bfaqs?\b|\bfrequently\s+asked\b/i, 1, 'faq')
  fixed(/\bshipping\b|\bdelivery\s+(?:page|info)/i, 1, 'shipping')
  fixed(/\breturns?\b|\bwarranty\b/i, 1, 'returns')
  fixed(/\bcontact\b/i, 1, 'contact')
  fixed(/\babout\b/i, 1, 'about')
  fixed(/\bblog\b/i, 1, 'blog')
  fixed(/\bcart\b|\bbasket\b/i, 1, 'cart')
  fixed(/\bcheck-?out\b/i, 1, 'checkout')
  fixed(/\border\s+(?:status|look-?up|tracking)\b/i, 1, 'order_lookup')
  fixed(/\bcompar(?:e|ison)\b/i, 1, 'compare')
  add(/\bshop\b|\bstore\b|\btyres\b/i, 2, pageTarget('shop', {}, catalogue))
  add(/\bhome\s*page\b|\bhome\b/i, 2, pageTarget('home', {}, catalogue))
  found.sort((a, b) => a.weight - b.weight || a.at - b.at || b.size - a.size)
  return found[0]?.to ?? null
}

/**
 * The model wrote that it opened a page but did not call open_page, so nothing opened. Opens the
 * page it named, as the tool would. Does nothing when a page was already opened this answer, or a
 * card or the contact buttons are on screen (opening a page would push them out of view).
 */
export async function openClaimedPage(s: string, t: Turn): Promise<void> {
  if (t.opened || t.cards.length || t.buttons || !claimsPage(s)) return
  const to = claimedPage(s, (await liveCatalogue(t)).catalogue)
  if (!to) {
    console.warn('chat: the model said it opened a page, but none matched')
    return
  }
  openOnTurn(t, to.to, to.note)
}

/* ---------------------------------------------------------- claimed cards */

export type CardClaim = 'cart' | 'request' | 'handover'

const CLAIMS: Record<CardClaim, RegExp[]> = {
  cart: [
    /\b(?:i['’]ve|i\s+have|i\s+just|i\s+went\s+ahead\s+and|i\s+now)\s+(?:just\s+|now\s+|also\s+)?(?:added|put|placed|popped)\b[^.!?\n]{0,80}\b(?:cart|basket)\b/i,
    /\b(?:tap|press|hit|click|use)\s+(?:the\s+)?["'“]?(?:add\s+to\s+cart|add\s+and\s+check\s+out)\b/i,
    /\bconfirm[^.!?\n]*\b(?:screen|card)\b/i,
    /\b(?:i['’]ve|i\s+have|i\s+just)\s+(?:shown|put\s+up|set\s+up)\b[^.!?\n]{0,40}\bcard\b/i,
  ],
  request: [
    /\b(?:i['’]ve|i\s+have|i\s+just)\s+(?:just\s+)?(?:prepared|drafted|put\s+together|written|set\s+up|filled\s+in)\b[^.!?\n]{0,60}\b(?:quote|request|enquiry)\b/i,
    /\b(?:tap|press|hit|click)\s+(?:the\s+)?["'“]?send\b/i,
  ],
  handover: [
    /\b(?:i['’]ve|i\s+have|i\s+just)\s+(?:just\s+)?(?:passed|sent|forwarded|flagged|asked)\b[^.!?\n]{0,60}\b(?:on|team|someone|sales)\b/i,
    /\b(?:someone|the\s+(?:sales\s+)?team|a\s+member\s+of\s+(?:the|our)\s+team)\s+(?:will|is\s+going\s+to)\s+(?:call|contact|get\s+back|be\s+in\s+touch|reach\s+out)\b/i,
    /\bask\s+someone\s+to\s+get\s+back\s+to\s+me\b/i,
  ],
}

/**
 * The card the text says was shown or sent, when no such card was shown in this answer, or null.
 * Models sometimes write "I've added that to your cart, tap the button" without calling the tool,
 * which would leave the customer looking at words and no card. The engine then sends ONE hidden
 * nudge. A quote request or a message for the team satisfies either of those two claims.
 */
export function unbackedClaim(s: string, t: Pick<Turn, 'cards'>): CardClaim | null {
  const has = (kinds: Card['kind'][]) => t.cards.some((c) => kinds.includes(c.kind))
  for (const [claim, kinds] of [
    ['cart', ['cart']],
    ['request', ['quote', 'handover']],
    ['handover', ['quote', 'handover']],
  ] as const) {
    if (CLAIMS[claim].some((rx) => rx.test(s)) && !has([...kinds])) return claim
  }
  return null
}

/** The hidden note that makes the model call the tool it skipped. */
export const NUDGES: Record<CardClaim, string> = {
  cart: 'You wrote that you added tyres to the cart or showed a card, but no card exists because you did not call propose_add_to_cart. Call it now with the right tyre and quantity. Do not repeat your previous message; after the tool call, reply with one short sentence asking the customer to check the card and tap the button.',
  request:
    'You wrote that you prepared a request, but no card exists because you did not call prepare_quote_request. Call it now. Do not repeat your previous message; after the tool call, reply with one short sentence asking the customer to check it and tap Send.',
  handover:
    'You wrote that the message was passed on, but no card exists because you did not call talk_to_person. Call it now. Do not repeat your previous message; after the tool call, reply with one short sentence asking the customer to check it and tap the button.',
}

/* ------------------------------------------------------------------- run */

const hasCard = (t: Turn, kind: Card['kind']) => t.cards.some((c) => c.kind === kind)

function show(t: Turn, card: Card, note: string) {
  t.cards.push(card)
  t.notes.push(note)
  t.emit({ type: 'card', card })
}

/** Plain-words status of an order, for the model to read out. */
const ORDER_STATUS: Record<StoredOrder['status'], string> = {
  pending: 'received, waiting for payment to be confirmed',
  paid: 'paid and waiting to be packed',
  packing: 'being packed',
  dispatched: 'dispatched',
  collected: 'collected',
  cancelled: 'cancelled',
}

/** The same words whichever part was wrong, so a guess learns nothing. They read right to the customer too. */
const ORDER_NOT_FOUND = `No order was found with that reference and email. Please check both and try again, or call the sales team on ${site.phone.display}.`

async function run(name: string, args: Record<string, unknown>, t: Turn): Promise<unknown> {
  switch (name) {
    case 'search_tyres': {
      const { catalogue } = await liveCatalogue(t)

      let position: AxlePosition | null = null
      if (present(args.position)) {
        const p = line(args.position, 20).toLowerCase()
        if (!(POSITIONS as readonly string[]).includes(p)) return { error: `position must be one of: ${POSITIONS.join(', ')}.` }
        position = p as AxlePosition
      }
      let limit = 5
      if (present(args.limit)) {
        const n = asInt(args.limit)
        if (n === null || n < 1 || n > 8) return { error: 'limit must be a whole number from 1 to 8.' }
        limit = n
      }
      let inStockOnly = false
      if (present(args.in_stock_only)) {
        const b = asBool(args.in_stock_only)
        if (b === null) return { error: 'in_stock_only must be true or false.' }
        inStockOnly = b
      }
      const size = present(args.size) ? line(args.size, 40) : ''
      const query = present(args.text) ? line(args.text, 100) : ''
      const brandWanted = present(args.brand) ? line(args.brand, 40) : ''

      let brand: string | null = null
      if (brandWanted) {
        brand = allBrands.find((b) => b.toLowerCase() === brandWanted.toLowerCase()) ?? null
        if (!brand) {
          const sourced = brands.find((b) => !b.stocked && b.name.toLowerCase() === brandWanted.toLowerCase())
          t.notes.push(`Searched tyres for ${brandWanted}: not a brand we stock`)
          return {
            total_matches: 0,
            results: [],
            note: sourced
              ? `${sourced.name} is not in our own stock. We can order it in on request (${site.phone.display}). Offer prepare_quote_request with enquiry_type "sourcing".`
              : `We only stock ${allBrands.join(' and ')}. Other major brands can be ordered in on request (${site.phone.display}); offer prepare_quote_request with enquiry_type "sourcing".`,
          }
        }
      }

      const key = sizeKey(size)
      const terms: string[] = query.toLowerCase().split(/\s+/).filter(Boolean)
      let matches = catalogue.filter((p) => {
        if (key && sizeKey(p.size) !== key) return false
        if (position && !p.position.includes(position)) return false
        if (brand && p.brand !== brand) return false
        if (inStockOnly && !(p.price != null && p.stock > 0)) return false
        if (terms.length) {
          const fields = [p.brand, p.model, p.size, p.application, p.positionLabel, p.sku, p.ply, p.headline, ...p.tags]
          const lower = fields.map((f) => f.toLowerCase())
          const keys = fields.map(sizeKey)
          return terms.every((term) => lower.some((f) => f.includes(term)) || (sizeKey(term) !== '' && keys.some((k) => k.includes(sizeKey(term)))))
        }
        return true
      })
      matches = matches.sort(byRank)

      const what = [size, position, brand, query && `"${query}"`, inStockOnly && 'in stock'].filter(Boolean).join(', ') || 'all'
      const prices = matches.map((p) => effectivePrice(p)).filter((n): n is number => n != null)
      t.notes.push(
        matches.length
          ? `Searched tyres (${what}): ${matches.length} found${prices.length ? `, from ${aud(Math.min(...prices))}` : ''}`
          : `Searched tyres (${what}): none found`,
      )
      if (!matches.length) {
        const sizes = allSizes.map((s) => ({ size: s, lines: catalogue.filter((p) => p.size === s).length }))
        return {
          total_matches: 0,
          results: [],
          sizes_we_stock: sizes,
          note: 'Nothing matches. Say so in one plain sentence, suggest the nearest real sizes from sizes_we_stock, or offer prepare_quote_request with enquiry_type "sourcing" for a size or brand we do not stock.',
        }
      }
      return {
        total_matches: matches.length,
        currency: 'AUD',
        results: matches.slice(0, limit).map(row),
        how_to_answer: 'Name at most two of these tyres in plain sentences, with no list or table. When more match, or the customer asked to see them all, open the shop page with these filters using open_page instead of listing them.',
        ...(matches.length > limit ? { note: `Showing ${limit} of ${matches.length}. Narrow by size, position or brand, or open the shop.` } : {}),
        ...(matches.slice(0, limit).some((p) => p.price == null) ? { poa_note: 'A tyre with price_each_aud null is price on request: use prepare_quote_request, never invent a price.' } : {}),
      }
    }

    case 'tyre_details': {
      const { catalogue } = await liveCatalogue(t)
      const p = findProduct(catalogue, args.product_id)
      if (!p) return unknownTyre
      t.notes.push(`Looked at the details of ${productName(p)} ${p.size}`)
      const price = effectivePrice(p)
      return {
        id: p.id,
        name: productName(p),
        sku: p.sku,
        size: p.size,
        positions: p.position,
        position_label: p.positionLabel,
        application: p.application,
        ply: p.ply,
        rim: p.rim,
        rim_diameter_in: p.rimDiameterIn,
        section_width_mm: p.sectionWidthMm,
        tread_mm: p.treadDepthMm,
        load_index: p.loadIndex,
        max_load_kg: p.maxLoadKg,
        speed_rating: p.speedRating,
        max_speed_kmh: p.maxSpeedKmh,
        price_each_aud: price,
        ...(price != null && p.discount != null ? { discount_percent: p.discount } : {}),
        stock_status: stockStatus(p),
        rating: p.rating,
        review_count: p.reviewCount,
        fuel_rating: p.fuelRating,
        noise_db: p.noiseDb,
        retreadable: p.retreadable,
        three_peak_mountain_snowflake: p.threePeak,
        headline: plain(p.headline),
        description: plain(p.description),
        highlights: p.highlights.map(plain),
        url: urlOf(p),
        note: 'A value of null was not published for this tyre: say it is to be confirmed, never guess. If price_each_aud is null the tyre is price on request: use prepare_quote_request.',
      }
    }

    case 'propose_add_to_cart': {
      if (hasCard(t, 'cart')) {
        return { ok: false, error: 'An Add to cart card is already shown in this answer. Ask which tyre they want; a new card can follow their next message.' }
      }
      const { catalogue, overrides } = await liveCatalogue(t)
      const p = findProduct(catalogue, args.product_id)
      if (!p) return { ok: false, ...unknownTyre }
      const quantity = asInt(args.quantity)
      if (quantity === null || quantity < 1 || quantity > 200) {
        return { ok: false, error: `quantity must be a whole number from 1 to 200. For more than 200 tyres use prepare_quote_request. ${REACH_SALES}` }
      }
      let fitting = false
      if (present(args.fitting)) {
        const b = asBool(args.fitting)
        if (b === null) return { ok: false, error: 'fitting must be true or false.' }
        fitting = b
      }
      let checkout = false
      if (present(args.checkout)) {
        const b = asBool(args.checkout)
        if (b === null) return { ok: false, error: 'checkout must be true or false.' }
        checkout = b
      }
      if (effectivePrice(p) == null) {
        return { ok: false, error: `${productName(p)} ${p.size} is price on request, so it cannot be added to the cart. Use prepare_quote_request so the sales team can quote it.` }
      }

      // Priced exactly as checkout will charge it: the same function, the same live prices.
      const priced = priceOrder(
        {
          lines: [{ id: p.id, quantity }],
          fulfilment: fitting ? 'pickup' : 'delivery',
          fittingTyres: fitting ? quantity : 0,
        },
        overrides,
      )
      if (priced.errors.length) return { ok: false, problems: priced.errors.map(plain) }
      const lineItem = priced.lines[0]
      const notes = priced.warnings.map(plain)
      if (quantity >= site.commerce.bulkThreshold) {
        notes.push(`Orders of ${site.commerce.bulkThreshold} tyres or more are palletised; the sales team arranges bulk freight.`)
      }
      notes.push('Volume discounts apply to your whole cart at checkout.')

      const card: CartCard = {
        id: newCardId(),
        kind: 'cart',
        productId: p.id,
        name: lineItem.name,
        size: lineItem.size,
        positionLabel: p.positionLabel,
        quantity,
        unitPrice: lineItem.unitPrice,
        lineTotal: lineItem.lineTotal,
        volumeDiscount: priced.volumeDiscount,
        volumeLabel: priced.volumeLabel,
        fitting,
        fittingTotal: priced.fittingTotal,
        total: priced.total,
        preOrder: lineItem.preOrder,
        stock: lineItem.stock,
        checkout,
        notes,
      }
      show(t, card, `Showed an Add to cart card: ${quantity} x ${card.name} ${card.size}, total ${aud(card.total)}`)
      return {
        ok: true,
        shown: `${quantity} x ${card.name} ${card.size}, ${aud(card.unitPrice)} each${card.volumeLabel ? `, ${aud(card.volumeDiscount)} volume discount (${card.volumeLabel})` : ''}${fitting ? `, fitting ${aud(card.fittingTotal)}` : ''}, total ${aud(card.total)} inc. GST`,
        pre_order: card.preOrder,
        notes,
        next: 'Ask the customer to check the card and tap the button. It is not in the cart yet: they finish on the secure checkout, where they enter their details and pay.',
      }
    }

    case 'open_page': {
      const { catalogue } = await liveCatalogue(t)
      const target = pageTarget(args.page, args, catalogue)
      if ('error' in target) return { ok: false, error: target.error }
      return openOnTurn(t, target.to, target.note)
    }

    case 'prepare_quote_request': {
      if (hasCard(t, 'quote')) return { ok: false, error: 'A quote request is already shown in this answer.' }
      if (!(ENQUIRY_TYPES as readonly unknown[]).includes(args.enquiry_type)) {
        return { ok: false, error: `enquiry_type must be one of: ${ENQUIRY_TYPES.join(', ')}.` }
      }
      const enquiryType = args.enquiry_type as QuoteEnquiryType
      const message = text(args.message, 5000)
      if (message.length < 10) return { ok: false, error: 'The message needs at least 10 characters: write what the customer wants quoted.' }
      if (message.length > 4000) return { ok: false, error: 'The message is too long: keep it under 4000 characters.' }
      const contact = readContact(args)
      if ('error' in contact) return { ok: false, error: contact.error }
      const company = line(args.company, 400)
      if (company.length > 120) return { ok: false, error: 'company must be 120 characters or fewer.' }

      let productId: string | undefined
      let size = line(args.size, 100)
      if (present(args.product_id)) {
        const { catalogue } = await liveCatalogue(t)
        const p = findProduct(catalogue, args.product_id)
        if (!p) return { ok: false, ...unknownTyre }
        productId = p.id
        size = size || p.size
      }
      if (size.length > 40) return { ok: false, error: 'size must be 40 characters or fewer.' }
      let quantity: number | undefined
      if (present(args.quantity)) {
        const n = asInt(args.quantity)
        if (n === null || n < 1 || n > 100000) return { ok: false, error: 'quantity must be a whole number from 1 to 100000.' }
        quantity = n
      }

      const card: QuoteCard = {
        id: newCardId(),
        kind: 'quote',
        enquiryType,
        ...(productId ? { productId } : {}),
        ...(size ? { size } : {}),
        ...(quantity ? { quantity } : {}),
        message,
        ...contact,
        ...(company ? { company } : {}),
      }
      show(t, card, `Prepared a quote request: ${enquiryType}${quantity ? `, ${quantity}` : ''}${size ? ` x ${size}` : ''}`)
      return { ok: true, next: 'Ask them to check the card, fill in anything missing and tap Send. Nothing is sent until they do.' }
    }

    case 'talk_to_person': {
      if (hasCard(t, 'handover')) return { ok: false, error: 'A message for the team is already shown in this answer.' }
      const reason = line(args.reason, 300)
      if (!reason) return { ok: false, error: 'reason is needed: say in a few words why the customer wants a person.' }
      if (reason.length > 200) return { ok: false, error: 'reason must be 200 characters or fewer.' }
      const message = text(args.message, 5000)
      if (message.length < 10) return { ok: false, error: 'The message needs at least 10 characters: write what the customer wants the team to know.' }
      if (message.length > 4000) return { ok: false, error: 'The message is too long: keep it under 4000 characters.' }
      const contact = readContact(args)
      if ('error' in contact) return { ok: false, error: contact.error }

      const card: HandoverCard = { id: newCardId(), kind: 'handover', reason, message, ...contact }
      show(t, card, `Prepared a message for the sales team: ${reason}`)
      showContactButtons(t)
      return {
        ok: true,
        next: 'Ask them to check the card, fill in their name and email if missing, and tap the button. Nothing is sent until they do. The call and email buttons are shown too.',
      }
    }

    case 'order_status': {
      const reference = line(args.reference, 60)
      const email = line(args.email, 300)
      if (!reference) return { error: 'reference is needed: ask the customer for the order reference, like SPT-AB12-CD34.' }
      if (!asEmail(email)) return { error: 'email is needed: ask the customer for the email address the order was placed with.' }
      // A guess costs the same as a real lookup: five tries in ten minutes for each visitor.
      if (await rateLimited(`orderstatus:${t.ipHash || 'unknown'}`, 5, 600)) {
        return { error: `Too many order lookups just now. Ask the customer to wait a few minutes, or offer the sales team on ${site.phone.display}.` }
      }
      const order = await findOrder(reference, email)
      if (!order) {
        t.notes.push('Looked up an order: not found')
        return { found: false, message: ORDER_NOT_FOUND }
      }
      t.notes.push(`Looked up order ${order.reference}: ${ORDER_STATUS[order.status]}`)
      return {
        found: true,
        reference: order.reference,
        status: ORDER_STATUS[order.status],
        placed: new Date(order.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' }),
        fulfilment: order.fulfilment === 'pickup' ? 'collection from the warehouse' : 'delivery',
        items: order.lines.map((l) => ({ name: l.name, size: l.size, quantity: l.quantity })),
        total_aud: order.total,
        note: 'Say only this. Do not guess a delivery date or tracking details.',
      }
    }

    case 'show_contact_buttons':
      showContactButtons(t)
      return { ok: true, shown: 'the call and email buttons' }

    default:
      return { error: `There is no tool called ${name}.` }
  }
}

/** The optional name, email and phone of a card, checked. */
function readContact(args: Record<string, unknown>): { name?: string; email?: string; phone?: string } | { error: string } {
  const out: { name?: string; email?: string; phone?: string } = {}
  const name = line(args.name, 400)
  if (name.length > 120) return { error: 'name must be 120 characters or fewer.' }
  if (name) out.name = name
  const email = line(args.email, 400)
  if (email) {
    if (!asEmail(email)) return { error: 'That email address does not look right. Ask the customer, or leave it out.' }
    out.email = email.toLowerCase()
  }
  const phone = line(args.phone, 400)
  if (phone.length > 40) return { error: 'phone must be 40 characters or fewer.' }
  if (phone) out.phone = phone
  return out
}
