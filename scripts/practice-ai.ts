/**
 * The practice AI: a stand-in for OpenAI's chat completions that costs nothing. It speaks the same
 * OpenAI-style streaming as the real API (server-sent events, tool calls, token usage), so
 * the assistant can be tried end to end without a model, but it answers from keywords.
 *
 *   npm run dev:ai     on http://localhost:3410 (npm run dev starts it too)
 *
 * In .env.local:  OPENAI_API_KEY=practice   (the chat then comes here by itself)
 *
 * It knows the Spartan Tyres tools and calls them with valid arguments from plain phrases:
 *
 *   "11R22.5 steer tyres"                  search_tyres (size, position)
 *   "add 4 11R22.5 drive tyres"            search_tyres, then propose_add_to_cart (the first priced tyre)
 *   "... with fitting" / "... check out"   the same, with fitting / checkout
 *   "quote for 295/80R22.5" or "price"     search_tyres, then prepare_quote_request for a price-on-request tyre
 *   "I run a fleet" / "wholesale" / "bulk" / "michelin"
 *                                          prepare_quote_request (fleet, wholesale, sourcing)
 *   "talk to a person" / "call me back"    talk_to_person
 *   "order status SPT-AB12-CD34 me@x.com"  order_status
 *   "open the finder / shop / faq ..."               open_page
 *   "details of 11R22.5"                   search_tyres, then tyre_details
 *   "phone number"                         show_contact_buttons
 *
 * After a tool result it answers in one or two plain sentences using the result.
 *
 *   "[slow]" anywhere makes the answer start 15 seconds late (PRACTICE_AI_SLOW_MS), like the real
 *   AI on a slow day, so leaving the page halfway through an answer can be tried by hand.
 */
import http from 'node:http'

interface Msg {
  role: string
  content?: string | null
  tool_calls?: { id: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}
export interface Call {
  name: string
  args: Record<string, unknown>
}
export interface Answer {
  text?: string
  calls?: Call[]
}

const lastUser = (messages: Msg[]) =>
  String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '')

/** A turn that asks for one tool; like GLM, the practice AI says a few words first. */
export const tool = (name: string, args: Record<string, unknown> = {}): Answer => ({
  text: 'Let me check.',
  calls: [{ name, args }],
})

/* ------------------------------------------------------------ reading the customer */

/** 11R22.5, 11r225, 295/80R22.5, 9.5R17.5 */
const SIZE_RX = /\b(\d{2,3}\s*\/\s*\d{2,3}\s*r\s*\d{2}(?:\.\d)?|\d{1,2}(?:\.\d)?\s*r\s*\d{2}(?:\.\d)?|\d{1,2}(?:\.\d)?r\d{2,3})(?!\d)/i
const EMAIL_RX = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+/
const REFERENCE_RX = /\bSPT-[A-Z0-9]{4}-[A-Z0-9]{4}\b/i

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 }

const sizeOf = (t: string) => SIZE_RX.exec(t)?.[1]?.replace(/\s+/g, '').toUpperCase()
const positionOf = (t: string) => /\b(steer|drive|trailer)\b/i.exec(t)?.[1]?.toLowerCase()

/** How many tyres: "4 tyres", "add 6", "40 x", "a pair", "four tyres"; 1 when it does not say. */
function quantityOf(t: string): number {
  const rest = t.replace(SIZE_RX, ' ')
  const digits =
    /\b(\d{1,3})\s*(?:x\s*)?(?:tyres?|tires?|units?|of\s+them)\b/i.exec(rest) ??
    /\b(?:add|order|buy|get|need|want|take|put)\s+(?:me\s+)?(\d{1,3})\b/i.exec(rest) ??
    /\b(\d{1,3})\s*x\b/i.exec(rest)
  if (digits) return Math.min(Math.max(Number(digits[1]), 1), 200)
  if (/\ba\s+pair\b/i.test(rest)) return 2
  const word = /\b(one|two|three|four|five|six|eight|ten|twelve)\s+(?:tyres?|tires?)\b/i.exec(rest)
  return word ? WORD_NUMBERS[word[1].toLowerCase()] : 1
}

const ADD_RX = /\b(add|order|buy|purchase|put)\b/i
const QUOTE_RX = /\bquote\b|\bprice on request\b|\bpoa\b/i
const FLEET_RX = /\bfleet\b|\bwholesale\b|\bbulk\b|\bresell|\bmichelin\b|\bbridgestone\b|\bgoodyear\b|\bcontinental\b|\bpirelli\b|\bdunlop\b|\bhankook\b|\byokohama\b|\bother brands?\b|\bsourc/i
const DETAILS_RX = /\b(details?|specs?|specifications?|tell me about)\b/i

const PAGE_WORDS: [RegExp, string][] = [
  [/\b(?:tyre\s+)?finder\b/i, 'finder'],
  [/\bfaq|frequently asked\b/i, 'faq'],
  [/\bdeals?\b/i, 'deals'],
  [/\bbrands\b/i, 'brands'],
  [/\bfleet\b/i, 'fleet'],
  [/\bwholesale\b/i, 'wholesale'],
  [/\bguide\b/i, 'guide'],
  [/\bshipping\b|\bdelivery\b/i, 'shipping'],
  [/\breturns?\b|\bwarranty\b/i, 'returns'],
  [/\bcontact\b/i, 'contact'],
  [/\babout\b/i, 'about'],
  [/\bblog\b/i, 'blog'],
  [/\bcart\b/i, 'cart'],
  [/\bcheck-?out\b/i, 'checkout'],
  [/\bcompare\b/i, 'compare'],
  [/\border\s+(?:status|look-?up)\b/i, 'order_lookup'],
  [/\bfull range\b|\bwhole range\b/i, 'range'],
  [/\bshop\b|\bstore\b/i, 'shop'],
  [/\bhome\b/i, 'home'],
]

const moneyText = (n: unknown) =>
  typeof n === 'number' ? `A$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'price on request'

/* --------------------------------------------------------------- reading tool results */

interface ToolResult {
  name: string
  out: Record<string, any>
}

/** The results of the tools called in the last step, with the tool's name. */
function toolResults(messages: Msg[]): ToolResult[] {
  const results: ToolResult[] = []
  for (let i = messages.length - 1; i >= 0 && messages[i].role === 'tool'; i--) {
    const m = messages[i]
    const assistant = [...messages.slice(0, i)].reverse().find((x) => x.role === 'assistant' && x.tool_calls?.some((c) => c.id === m.tool_call_id))
    const name = assistant?.tool_calls?.find((c) => c.id === m.tool_call_id)?.function.name ?? ''
    let out: Record<string, any> = {}
    try {
      out = JSON.parse(String(m.content ?? '{}'))
    } catch {
      out = {}
    }
    results.unshift({ name, out })
  }
  return results
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** What to say once the tools have answered, or the next tool to call. */
function afterTools(messages: Msg[]): Answer {
  const user = lastUser(messages)
  const [first] = toolResults(messages)
  if (!first) return { text: 'Done.' }
  const { name, out } = first

  if (name === 'search_tyres') {
    const rows: Record<string, any>[] = Array.isArray(out.results) ? out.results : []
    const size = sizeOf(user)
    const quantity = quantityOf(user)
    const priced = rows.find((r) => r.price_each_aud != null)
    if (ADD_RX.test(user) && !QUOTE_RX.test(user)) {
      if (priced) {
        return tool('propose_add_to_cart', {
          product_id: priced.id,
          quantity,
          ...(/\bfitting|\bfitted\b/i.test(user) ? { fitting: true } : {}),
          ...(/\bcheck\s?-?out\b|\bbuy now\b|\bpay now\b/i.test(user) ? { checkout: true } : {}),
        })
      }
      if (rows.length) {
        return tool('prepare_quote_request', {
          enquiry_type: 'quote',
          product_id: rows[0].id,
          size: rows[0].size,
          quantity,
          message: `The customer would like a quote for ${quantity} x ${rows[0].name} ${rows[0].size}.`,
        })
      }
    }
    if (QUOTE_RX.test(user) && rows.length) {
      const poa = rows.find((r) => r.price_each_aud == null) ?? rows[0]
      if (poa.price_each_aud == null) {
        return tool('prepare_quote_request', {
          enquiry_type: 'quote',
          product_id: poa.id,
          size: poa.size,
          quantity,
          message: `The customer would like a quote for ${quantity} x ${poa.name} ${poa.size}.`,
        })
      }
    }
    if (DETAILS_RX.test(user) && rows.length) return tool('tyre_details', { product_id: rows[0].id })
    if (!rows.length) {
      const sizes = Array.isArray(out.sizes_we_stock) ? out.sizes_we_stock.map((s: any) => s.size).join(', ') : ''
      return { text: `I could not find a match${size ? ` for ${size}` : ''}.${sizes ? ` We stock these sizes: ${sizes}.` : ''}` }
    }
    const top = rows[0]
    const more = out.total_matches > 1 ? ` I found ${out.total_matches} matches.` : ''
    return {
      text: `${top.name} ${top.size} is ${top.price_each_aud == null ? 'price on request' : `${moneyText(top.price_each_aud)} each`} (${top.stock_status}).${more}`,
    }
  }

  if (name === 'propose_add_to_cart') {
    if (out.ok) return { text: `Please check the card and tap the button to add it. ${out.shown}.` }
    return { text: `I could not set that up: ${(out.problems ?? [out.error]).join(' ')}` }
  }
  if (name === 'prepare_quote_request') {
    return out.ok
      ? { text: 'I have prepared a quote request. Please check it, fill in anything missing and tap Send.' }
      : { text: `I could not prepare that: ${out.error}` }
  }
  if (name === 'talk_to_person') {
    return out.ok
      ? { text: 'I have prepared a message for the sales team. Please check it, add your name and email, and tap the button.' }
      : { text: `I could not prepare that: ${out.error}` }
  }
  if (name === 'order_status') {
    if (out.found) {
      return { text: `Order ${out.reference} is ${out.status}. It was placed on ${out.placed} and the total is ${moneyText(out.total_aud)}.` }
    }
    return { text: String(out.message ?? out.error ?? 'I could not find that order.') }
  }
  if (name === 'open_page') {
    return out.ok ? { text: `I've ${lowerFirst(String(out.opened))} for you.` } : { text: String(out.error ?? 'I could not open that page.') }
  }
  if (name === 'tyre_details') {
    if (out.error) return { text: String(out.error) }
    return {
      text: `${out.name} ${out.size}: ${out.ply} ply, load index ${out.load_index ?? 'to be confirmed'}, ${out.price_each_aud == null ? 'price on request' : `${moneyText(out.price_each_aud)} each`} (${out.stock_status}).`,
    }
  }
  if (name === 'show_contact_buttons') return { text: 'Tap a button below to call or email the sales team.' }
  return { text: 'Done.' }
}

/** The first answer to a customer's message. */
function firstAnswer(text: string): Answer {
  const t = text.toLowerCase().trim()
  const size = sizeOf(text)
  const position = positionOf(text)
  const email = EMAIL_RX.exec(text)?.[0]
  const reference = REFERENCE_RX.exec(text)?.[0]

  if (/\border status\b|\bstatus of (?:my |the )?order\b|\btrack (?:my )?order\b|\bwhere is my order\b/.test(t)) {
    if (reference && email) return tool('order_status', { reference: reference.toUpperCase(), email })
    return { text: 'To check an order I need the order reference, like SPT-AB12-CD34, and the email address it was placed with.' }
  }
  if (/\btalk to (?:a |an )?(?:person|human|someone|manager)\b|\bspeak (?:to|with) (?:a |an )?(?:person|human|someone|manager)\b|\bcall me back\b|\bcallback\b|\bget back to me\b/.test(t)) {
    return tool('talk_to_person', {
      reason: 'The customer asked for a person',
      message: `The customer asked for someone to get back to them. They wrote: ${text.slice(0, 300)}`,
      ...(email ? { email } : {}),
    })
  }
  if (/\b(open|show me|take me to|go to|bring up)\b/.test(t)) {
    const page = PAGE_WORDS.find(([rx]) => rx.test(text))?.[1]
    if (page) {
      return tool('open_page', {
        page,
        ...(page === 'shop' ? { ...(size ? { size } : {}), ...(position ? { position } : {}), ...(/\bin stock\b/i.test(text) ? { in_stock: true } : {}) } : {}),
      })
    }
  }
  if (/\bphone number\b|\bcontact (?:details|buttons)\b|\bcall (?:you|the team|sales)\b|\bemail (?:you|the team|sales)\b/.test(t)) {
    return tool('show_contact_buttons')
  }
  if (ADD_RX.test(t) && !QUOTE_RX.test(t) && !FLEET_RX.test(t) && (size || position || /\btyres?\b|\btires?\b/.test(t))) {
    return tool('search_tyres', { ...(size ? { size } : {}), ...(position ? { position } : {}), limit: 8 })
  }
  if (FLEET_RX.test(t) && !(QUOTE_RX.test(t) && size)) {
    const type = /\bwholesale\b|\bresell/.test(t) ? 'wholesale' : /\bmichelin\b|\bbridgestone\b|\bgoodyear\b|\bcontinental\b|\bpirelli\b|\bdunlop\b|\bhankook\b|\byokohama\b|\bother brands?\b|\bsourc/.test(t) ? 'sourcing' : 'fleet'
    const quantity = /\b\d{1,5}\b/.test(t.replace(SIZE_RX, ' ')) ? quantityOf(text) : undefined
    return tool('prepare_quote_request', {
      enquiry_type: type,
      ...(size ? { size } : {}),
      ...(quantity && quantity > 1 ? { quantity } : {}),
      message: `The customer asked about ${type} pricing. They wrote: ${text.slice(0, 300)}`,
    })
  }
  if (size || position || /\b(price|prices|cost|how much|stock|in stock|tyres?|tires?|quote)\b/.test(t)) {
    return tool('search_tyres', { ...(size ? { size } : {}), ...(position ? { position } : {}), limit: 8 })
  }
  if (/^(hi|hello|hey|g'?day|good (morning|afternoon|evening))\b/.test(t)) {
    return {
      text: 'Hello, and welcome to Spartan Tyres. I am the practice assistant, so I only understand a few things and nothing costs money. How can I help?',
    }
  }
  return {
    text: 'This is the practice AI, so I only understand a few things and nothing costs money. Try saying hello, or ask for 11R22.5 steer tyres.',
  }
}

export function answerFor(body: Record<string, unknown>): Answer {
  const messages = (body.messages ?? []) as Msg[]
  const allowTools = body.tool_choice !== 'none'
  const answer = messages.at(-1)?.role === 'tool' ? afterTools(messages) : firstAnswer(lastUser(messages))
  return allowTools
    ? answer
    : { text: answer.calls ? 'Sorry, I could not finish that one. Please ask again.' : answer.text }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The practice gateway as an HTTP server (not yet listening). */
export function createPracticeAi() {
  return http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/chat/completions')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(
        JSON.stringify({ error: { message: 'The practice AI only answers POST /v1/chat/completions.' } }),
      )
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: 'Not JSON.' } }))
    }
    // "[slow]": taken out before the message is read; only the first call of a message waits.
    const messages = (body.messages ?? []) as Msg[]
    const slow = messages.at(-1)?.role === 'user' && /\[slow\]/i.test(String(messages.at(-1)?.content ?? ''))
    for (const m of messages) {
      if (m.role === 'user' && typeof m.content === 'string') {
        m.content = m.content.replace(/\s*\[slow\]\s*/gi, ' ').trim()
      }
    }
    const answer = answerFor(body)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)
    await sleep(slow ? Number(process.env.PRACTICE_AI_SLOW_MS || 15_000) : 300)
    const text = answer.text ?? ''
    for (let i = 0; i < text.length; i += 24) {
      send({ choices: [{ index: 0, delta: { content: text.slice(i, i + 24) } }] })
      await sleep(25)
    }
    ;(answer.calls ?? []).forEach((c, i) => {
      const args = JSON.stringify(c.args)
      send({
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: i, id: `practice_${Date.now()}_${i}`, type: 'function', function: { name: c.name, arguments: args.slice(0, 10) } },
              ],
            },
          },
        ],
      })
      send({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: args.slice(10) } }] } }] })
    })
    send({ choices: [{ index: 0, delta: {}, finish_reason: answer.calls?.length ? 'tool_calls' : 'stop' }] })
    // Token counts like the real gateway's, so the usage figures move.
    send({
      choices: [],
      usage: {
        prompt_tokens: Math.ceil(JSON.stringify(body.messages ?? []).length / 4),
        completion_tokens: Math.ceil((text.length + 40) / 4),
        prompt_tokens_details: { cached_tokens: 0 },
      },
    })
    res.end('data: [DONE]\n\n')
  })
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/practice-ai.ts')) {
  const port = Number(process.env.PRACTICE_AI_PORT || 3410)
  createPracticeAi()
    .on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') console.log(`  Practice AI  already running on port ${port}`)
      else throw err
    })
    .listen(port, () =>
      console.log(`  Practice AI  http://localhost:${port}   (no real AI, no cost; used with OPENAI_API_KEY=practice)`),
    )
}
