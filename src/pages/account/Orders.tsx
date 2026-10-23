import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, RotateCcw } from 'lucide-react'
import { products, hasPrice } from '@/data/products'
import { Badge, Button } from '@/components/ui'
import { AccountPage, FormAlert, Notice, RequireAccount } from '@/components/account/AccountUi'
import { AccountApiError, accountApi, type AccountOrder } from '@/lib/account-client'
import { formatDay, orderStatusLabel, payState, planReorder } from '@/lib/account-orders'
import { invoiceHtml, printHtml } from '@/lib/account-print'
import { moneyExact } from '@/lib/utils'
import { useAccount } from '@/store/account'
import { useCart } from '@/store/cart'

/* /account/orders: the customer's own website orders, with details, Reorder and a printable tax invoice. */
export default function Orders() {
  return (
    <RequireAccount>
      <Inner />
    </RequireAccount>
  )
}

function Inner() {
  const me = useAccount((s) => s.me)
  const [orders, setOrders] = useState<AccountOrder[] | null>(null)
  const [error, setError] = useState('')
  const [openRef, setOpenRef] = useState<string | null>(null)
  const [notes, setNotes] = useState<{ reference: string; added: number; lines: string[] } | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      setOrders(await accountApi.orders())
    } catch (err) {
      if (err instanceof AccountApiError && err.status === 401) {
        void useAccount.getState().refresh()
        return
      }
      setError(err instanceof AccountApiError ? err.message : 'Something went wrong. Please try again.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function reorder(order: AccountOrder) {
    const plan = planReorder(order.lines, (name, size) => {
      const product = products.find((p) => `${p.brand} ${p.model}` === name && p.size === size)
      return product ? { id: product.id, available: hasPrice(product) ? product.stock : 0 } : null
    })
    const cart = useCart.getState()
    for (const item of plan.add) {
      const product = products.find((p) => p.id === item.id)
      if (product) cart.add(product, item.quantity)
    }
    setNotes({ reference: order.reference, added: plan.add.reduce((n, i) => n + i.quantity, 0), lines: plan.notes })
    if (plan.add.length) {
      cart.open()
    }
  }

  function printInvoice(order: AccountOrder) {
    if (!me) return
    if (!printHtml(invoiceHtml(order, me))) setError('Your browser blocked the print window. Allow pop-ups for this site and try again.')
  }

  return (
    <AccountPage title="Your orders" heading="Your orders" lede="Orders you placed while signed in, newest first." width="wide">
      <div className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>
        {notes ? (
          <Notice tone={notes.added ? 'info' : 'warning'} title={`Reorder of ${notes.reference}`}>
            {notes.added ? `${notes.added} ${notes.added === 1 ? 'tyre' : 'tyres'} added to your cart at today's prices. ` : 'Nothing could be added. '}
            {notes.lines.length ? (
              <ul className="mt-2 list-disc pl-5">
                {notes.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </Notice>
        ) : null}

        {orders === null && !error ? (
          <p role="status" className="animate-pulse text-sm text-muted-foreground">
            Loading your orders
          </p>
        ) : null}

        {orders && orders.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="font-heading text-base font-bold uppercase tracking-tight text-foreground">No orders yet</p>
            <p className="mt-2 text-sm text-muted-foreground">Orders you place while signed in will show here.</p>
            <Button asChild className="mt-4">
              <Link to="/shop">Shop tyres</Link>
            </Button>
          </div>
        ) : null}

        {orders?.map((order) => {
          const state = payState(order)
          const isOpen = openRef === order.reference
          const count = order.lines.reduce((n, l) => n + l.quantity, 0)
          return (
            <article key={order.reference} className="min-w-0 rounded-lg border border-border bg-card" aria-label={`Order ${order.reference}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4 md:p-5">
                <div className="min-w-0">
                  <h2 className="break-all font-heading text-base font-bold uppercase tracking-tight text-foreground">{order.reference}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDay(order.createdAt)} · {count} {count === 1 ? 'tyre' : 'tyres'} · {order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{orderStatusLabel(order.status)}</Badge>
                    <Badge variant={state.tone === 'default' ? 'default' : state.tone}>{state.label}</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-heading text-xl font-black tabular-nums text-foreground">{moneyExact(order.total)}</p>
                  <button
                    type="button"
                    onClick={() => setOpenRef(isOpen ? null : order.reference)}
                    aria-expanded={isOpen}
                    className="link-underline mt-1 text-sm font-semibold text-primary"
                  >
                    {isOpen ? 'Hide details' : 'View details'}
                  </button>
                </div>
              </div>

              {isOpen ? (
                <div className="border-t border-border p-4 md:p-5">
                  <ul className="flex flex-col divide-y divide-border">
                    {order.lines.map((line) => (
                      <li key={`${line.name}-${line.size}`} className="flex items-start justify-between gap-4 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block break-words font-semibold text-foreground">{line.name}</span>
                          <span className="block text-muted-foreground">
                            {line.size} · {line.quantity} × {moneyExact(line.unitPrice)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{moneyExact(line.quantity * line.unitPrice)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-3 ml-auto flex max-w-xs flex-col gap-1 text-sm">
                    <Row label="Items" value={moneyExact(order.subtotal)} />
                    {order.discount ? <Row label="Discount" value={`-${moneyExact(order.discount)}`} /> : null}
                    {order.fittingTotal ? <Row label={`Fitting (${order.fittingTyres})`} value={moneyExact(order.fittingTotal)} /> : null}
                    <Row label="Total (GST inclusive)" value={moneyExact(order.total)} strong />
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button size="sm" onClick={() => reorder(order)}>
                      <RotateCcw aria-hidden="true" className="h-4 w-4" />
                      Reorder
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printInvoice(order)}>
                      <Printer aria-hidden="true" className="h-4 w-4" />
                      Print tax invoice
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </AccountPage>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'border-t border-border pt-1 font-bold text-foreground' : 'text-muted-foreground'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
