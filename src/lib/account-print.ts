import { site } from '@/config/site'
import type { AccountOrder, AccountStatement, CustomerAccount } from '@/lib/account-client'
import { formatDay, gstIncluded, payState } from '@/lib/account-orders'

/* ------------------------------------------------------------------ *
 * Printing for customers: a statement and a tax invoice, A4, in their own
 * window (the same way the till prints a receipt). The HTML builders are
 * pure so they are unit tested; everything customer-supplied is escaped.
 * ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c] as string)

export const dollars = (n: number) =>
  `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STYLE = `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font: 13px/1.45 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 24px; margin: 0; letter-spacing: .04em; text-transform: uppercase; }
  h2 { font-size: 13px; margin: 22px 0 6px; text-transform: uppercase; letter-spacing: .06em; }
  .top { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
  .muted { color: #555; } .r { text-align: right; } .small { font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; border-bottom: 2px solid #111; padding: 6px 4px; }
  th.r { text-align: right; }
  td { padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .tot td { font-weight: 700; font-size: 14px; border-bottom: 0; }
  .over { color: #b00020; font-weight: 700; }
  .box { border: 1px solid #111; padding: 10px 12px; margin-top: 14px; }
  .foot { margin-top: 28px; color: #555; font-size: 11px; }
`

type Buyer = Pick<CustomerAccount, 'name' | 'company' | 'email' | 'phone' | 'abn' | 'address'>

function seller(): string {
  return `<div>
    <h1>${esc(site.name)}</h1>
    <div>${esc(site.legalName)}</div>
    ${site.abn ? `<div>ABN ${esc(site.abn)}</div>` : ''}
    <div class="muted small">${esc(site.office.full)}<br>${esc(site.phone.display)} / ${esc(site.email.sales)}</div>
  </div>`
}

function buyer(me: Buyer): string {
  return `<div class="small">
    <b>${esc(me.company || me.name)}</b>${me.company && me.name ? `<br>${esc(me.name)}` : ''}
    ${me.address ? `<br>${esc(me.address)}` : ''}
    ${me.abn ? `<br>ABN ${esc(me.abn)}` : ''}
    ${me.email ? `<br>${esc(me.email)}` : ''}${me.phone ? `<br>${esc(me.phone)}` : ''}
  </div>`
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}<script>window.onload = function () { window.print() }</script></body></html>`

export function invoiceHtml(order: AccountOrder, me: Buyer): string {
  const state = payState(order)
  const lineSum = order.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const other = Math.round((order.total - (order.subtotal - order.discount + order.fittingTotal)) * 100) / 100
  const owing = order.payment === 'account' && !order.paid && order.status !== 'cancelled'
  const due = order.dueDate ? ` by ${formatDay(order.dueDate)}` : ''
  return page(
    `Tax invoice ${order.reference}`,
    `<div class="top">${seller()}<div class="r"><h1>Tax invoice</h1>
      <div>Invoice no. <b>${esc(order.reference)}</b></div>
      <div>Date ${esc(formatDay(order.createdAt))}</div>
      ${order.payment === 'account' && order.dueDate ? `<div>Due ${esc(formatDay(order.dueDate))}</div>` : ''}</div></div>
    <h2>Bill to</h2>${buyer(me)}
    <h2>Items</h2>
    <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>
    ${order.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.name)} <span class="muted">${esc(l.size)}</span></td><td class="r">${l.quantity}</td><td class="r">${dollars(l.unitPrice)}</td><td class="r">${dollars(l.quantity * l.unitPrice)}</td></tr>`,
      )
      .join('')}
    </tbody></table>
    <table style="margin-top:10px;width:55%;margin-left:auto">
      <tr><td>Items</td><td class="r">${dollars(order.subtotal || lineSum)}</td></tr>
      ${order.discount ? `<tr><td>Discount</td><td class="r">-${dollars(order.discount)}</td></tr>` : ''}
      ${order.fittingTotal ? `<tr><td>Fitting (${order.fittingTyres} ${order.fittingTyres === 1 ? 'tyre' : 'tyres'})</td><td class="r">${dollars(order.fittingTotal)}</td></tr>` : ''}
      ${Math.abs(other) >= 0.01 ? `<tr><td>Delivery and other</td><td class="r">${dollars(other)}</td></tr>` : ''}
      <tr class="tot"><td>Total (GST inclusive)</td><td class="r">${dollars(order.total)}</td></tr>
      <tr><td class="small muted">GST included in total</td><td class="r small muted">${dollars(gstIncluded(order.total))}</td></tr>
    </table>
    <div class="box"><b>${esc(owing ? `Amount due ${dollars(order.total)}${due}` : state.label)}</b></div>
    <p class="foot">Thank you for choosing ${esc(site.name)}.</p>`,
  )
}

export function statementHtml(statement: AccountStatement, me: Buyer, today = new Date()): string {
  const date = formatDay(today.toISOString())
  const open = statement.open
    .map(
      (i) =>
        `<tr><td>${esc(i.reference)}</td><td>${esc(formatDay(i.date))}</td><td class="${i.overdue ? 'over' : ''}">${esc(formatDay(i.dueDate))}${i.overdue ? ' (overdue)' : ''}</td><td class="r">${dollars(i.total)}</td><td class="r">${dollars(i.paid)}</td><td class="r">${dollars(i.owing)}</td></tr>`,
    )
    .join('')
  const paid = statement.payments
    .map(
      (p) =>
        `<tr><td>${esc(p.ref)}</td><td>${esc(formatDay(p.date))}</td><td>${esc(p.method)}</td><td>${esc(p.allocations.map((a) => a.ticketRef).join(', '))}</td><td class="r">${dollars(p.amount)}</td></tr>`,
    )
    .join('')
  return page(
    `Statement ${date}`,
    `<div class="top">${seller()}<div class="r"><h1>Statement</h1><div>Date ${esc(date)}</div></div></div>
    <h2>Account</h2>${buyer(me)}
    <div class="box"><table><tr><td>Balance owing (GST inclusive)</td><td class="r"><b>${dollars(statement.balance.due)}</b></td></tr>
      <tr><td>Of which overdue</td><td class="r ${statement.balance.overdue > 0 ? 'over' : ''}">${dollars(statement.balance.overdue)}</td></tr>
      <tr><td class="small muted">GST included in balance</td><td class="r small muted">${dollars(gstIncluded(statement.balance.due))}</td></tr></table></div>
    <h2>Open items</h2>
    ${open ? `<table><thead><tr><th>Reference</th><th>Date</th><th>Due</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Owing</th></tr></thead><tbody>${open}</tbody></table>` : '<p class="muted">Nothing is owing.</p>'}
    <h2>Payments received</h2>
    ${paid ? `<table><thead><tr><th>Reference</th><th>Date</th><th>Method</th><th>Applied to</th><th class="r">Amount</th></tr></thead><tbody>${paid}</tbody></table>` : '<p class="muted">No payments yet.</p>'}
    <p class="foot">All amounts include GST. Questions about this statement? Call ${esc(site.phone.display)} or email ${esc(site.email.accounts)}.</p>`,
  )
}

/** Opens the document in its own window and prints it. False when pop-ups are blocked. */
export function printHtml(html: string): boolean {
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
