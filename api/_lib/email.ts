/**
 * Email, over Resend's REST API with plain `fetch` (no SDK). `RESEND_API_KEY` and `MAIL_FROM`
 * (for example `Spartan Tyres <accounts@spartantrucktyres.com.au>`, on a domain verified in Resend).
 *
 * `sendEmail` never throws and never logs an address, a link or a key: only a short safe message.
 * When email is not configured nothing is sent; callers then show staff the link to copy instead.
 *
 * On a developer's machine (not Vercel) with no key, each email is kept in a small dev outbox
 * (the last 50, in memory; also written to `.data/outbox/` when `MAIL_OUTBOX_FILES=1`) so a flow can
 * be tried end to end. Nothing in the outbox exists on Vercel.
 */
import { site } from '../../src/config/site.js'
import { safeMessage } from './http.js'

export interface Email {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export type SendResult = { sent: true } | { sent: false; reason: 'not_configured' | 'failed' }

const RESEND_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 8000
const OUTBOX_MAX = 50

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
}

/* ------------------------------------------------------------------ *
 * Dev outbox
 * ------------------------------------------------------------------ */

export interface OutboxEntry extends Email {
  at: string
}

const outboxStore = globalThis as unknown as { __spartanOutbox?: OutboxEntry[] }

/** True where the dev outbox exists: never on Vercel or in production. */
export const outboxEnabled = (): boolean => !process.env.VERCEL && process.env.NODE_ENV !== 'production'

/** The kept emails, newest last. Empty where there is no outbox. */
export function devOutbox(): OutboxEntry[] {
  return outboxEnabled() ? [...(outboxStore.__spartanOutbox ?? [])] : []
}

export function clearDevOutbox(): void {
  outboxStore.__spartanOutbox = []
}

async function keepInOutbox(email: Email): Promise<void> {
  const entry: OutboxEntry = { ...email, at: new Date().toISOString() }
  const list = (outboxStore.__spartanOutbox ??= [])
  list.push(entry)
  while (list.length > OUTBOX_MAX) list.shift()
  if (process.env.MAIL_OUTBOX_FILES !== '1') return
  try {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync('./.data/outbox', { recursive: true })
    writeFileSync(`./.data/outbox/${Date.now()}-${list.length}.json`, JSON.stringify(entry, null, 2))
  } catch {
    // The memory copy is enough.
  }
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

export async function sendEmail(email: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) {
    if (outboxEnabled()) await keepInOutbox(email)
    return { sent: false, reason: 'not_configured' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject.replace(/\s*[\r\n]+\s*/g, ' '),
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`[email] Resend answered ${response.status}`)
      return { sent: false, reason: 'failed' }
    }
    return { sent: true }
  } catch (error) {
    // The message of a fetch failure can name the host, never the key; still, keep it to one line.
    console.error(`[email] could not send: ${safeMessage(error).slice(0, 120)}`)
    return { sent: false, reason: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * Template
 * ------------------------------------------------------------------ */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** Escapes text for HTML (element content and quoted attributes). */
export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!)

export interface Layout {
  /** Shown big at the top. */
  heading: string
  /** Plain-text paragraphs; escaped for you. */
  paragraphs: string[]
  /** A call to action. The URL must be one we built (https or http://localhost). */
  button?: { label: string; url: string }
  /** Small print under the button. */
  note?: string
  /** Label/value rows (for example the details of an application). */
  details?: Array<[string, string]>
}

const BRAND = '#e15c23'

/** A branded HTML email and its plain-text twin. Every value is escaped. */
export function renderEmail(layout: Layout): { html: string; text: string } {
  const paragraphs = layout.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#262626">${escapeHtml(p)}</p>`).join('')
  const details = layout.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;border-collapse:collapse">${layout.details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:#737373;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:#262626">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
  const button = layout.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(layout.button.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:6px">${escapeHtml(layout.button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#737373">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${escapeHtml(layout.button.url)}</span></p>`
    : ''
  const note = layout.note ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#737373">${escapeHtml(layout.note)}</p>` : ''

  const html =
    `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(layout.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">` +
    `<tr><td style="background:#171717;padding:20px 28px;border-bottom:4px solid ${BRAND}"><span style="font-size:20px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">${escapeHtml(site.name)}</span></td></tr>` +
    `<tr><td style="padding:28px">` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#171717">${escapeHtml(layout.heading)}</h1>` +
    paragraphs +
    details +
    button +
    note +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px;background:#fafafa;font-size:12px;line-height:1.5;color:#737373">${escapeHtml(site.legalName)}<br>${escapeHtml(site.office.full)}<br>${escapeHtml(site.phone.display)} &middot; ${escapeHtml(site.email.sales)}</td></tr>` +
    `</table></td></tr></table></body></html>`

  const text = [
    layout.heading,
    '',
    ...layout.paragraphs.flatMap((p) => [p, '']),
    ...(layout.details?.length ? [...layout.details.map(([l, v]) => `${l}: ${v}`), ''] : []),
    ...(layout.button ? [`${layout.button.label}: ${layout.button.url}`, ''] : []),
    ...(layout.note ? [layout.note, ''] : []),
    '--',
    site.legalName,
    site.office.full,
    `${site.phone.display} / ${site.email.sales}`,
  ].join('\n')

  return { html, text }
}
