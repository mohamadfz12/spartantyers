import { site } from '@/config/site'
import type { PosTicket } from '@/lib/api'

/* ------------------------------------------------------------------ *
 * Printing a POS ticket: an 80 mm receipt-shaped page in its own
 * window, sent to the printer. Works on a receipt printer or an
 * ordinary office printer alike.
 * ------------------------------------------------------------------ */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const money = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TITLE: Record<PosTicket['status'], string> = {
  open: 'Quote',
  paid: 'Tax invoice / receipt',
  account: 'Tax invoice',
  void: 'Cancelled ticket',
}

export function ticketHtml(t: PosTicket): string {
  const when = new Date(t.paidAt || t.updatedAt || Date.now()).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  })
  const gst = Math.round((t.total / 11) * 100) / 100
  const c = t.customer
  const owing = Math.round((t.total - t.amountPaid) * 100) / 100
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.ref)}</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { font: 12px/1.35 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #000; width: 72mm; margin: 0 auto; }
    h1 { font-size: 17px; margin: 0 0 2px; text-align: center; letter-spacing: .04em; text-transform: uppercase; }
    .c { text-align: center; } .muted { color: #444; } .r { text-align: right; }
    hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; vertical-align: top; }
    .tot td { font-weight: 700; font-size: 14px; } .small { font-size: 11px; }
  </style></head><body>
    <h1>${esc(site.name)}</h1>
    <div class="c small">${esc(site.legalName)}</div>
    <div class="c small">${esc(site.office.full)}</div>
    <div class="c small">${esc([site.phone.display, site.email.sales].join(' · '))}</div>
    <hr>
    <div class="c"><b>${esc(TITLE[t.status] || 'Ticket')}</b></div>
    <div class="c small">${esc(t.ref)} · ${esc(when)}</div>
    ${c ? `<div class="small" style="margin-top:6px"><b>${esc(c.company || c.name)}</b>${c.company && c.name !== c.company ? `<br>${esc(c.name)}` : ''}${c.phone ? `<br>${esc(c.phone)}` : ''}${c.email ? `<br>${esc(c.email)}` : ''}</div>` : ''}
    <hr>
    <table>${t.lines
      .map(
        (l) =>
          `<tr><td>${l.qty} × ${esc(l.name)}${l.variation ? ` <span class="muted">(${esc(l.variation)})</span>` : ''}${l.qty > 1 ? `<div class="muted small">@ ${money(l.price)}</div>` : ''}</td><td class="r">${money(l.total ?? l.qty * l.price)}</td></tr>`,
      )
      .join('')}</table>
    <hr>
    <table>
      ${t.discount ? `<tr><td>Subtotal</td><td class="r">${money(t.subtotal)}</td></tr><tr><td>Discount</td><td class="r">−${money(t.discount)}</td></tr>` : ''}
      <tr class="tot"><td>Total (inc. GST)</td><td class="r">${money(t.total)}</td></tr>
      <tr><td class="small">GST included</td><td class="r small">${money(gst)}</td></tr>
      ${t.status === 'paid' && t.paymentMethod ? `<tr><td class="small">Paid with</td><td class="r small">${esc(t.paymentMethod)}</td></tr>` : ''}
      ${t.status === 'account' && t.amountPaid > 0 ? `<tr><td class="small">Paid so far</td><td class="r small">${money(t.amountPaid)}</td></tr>` : ''}
    </table>
    ${t.status === 'account' ? `<p class="c"><b>${money(owing)} to pay${t.dueDate ? ` by ${esc(new Date(`${t.dueDate}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}</b></p>` : ''}
    ${t.note ? `<p class="small">${esc(t.note)}</p>` : ''}
    <hr><p class="c small">Thank you for choosing ${esc(site.name)}</p>
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300) }</script>
  </body></html>`
}

/** Opens the receipt and prints it. False when pop-ups are blocked. */
export function printTicket(t: PosTicket): boolean {
  const w = window.open('', '_blank', 'width=420,height=640')
  if (!w) return false
  w.document.open()
  w.document.write(ticketHtml(t))
  w.document.close()
  return true
}
