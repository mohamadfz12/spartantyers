import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, Tag, TrendingDown, Truck, Warehouse, Wrench } from 'lucide-react'
import { site } from '@/config/site'
import { cn, money, moneyExact, pluralise } from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'
import { Badge } from '@/components/ui'
import { ProductThumb } from '@/components/shop/ProductThumb'

/**
 * The money panel, shared by the cart and every step of checkout.
 *
 * It reads `useCartTotals()` rather than taking numbers as props so there is
 * exactly one arithmetic path in the client — and the server recomputes the
 * same figures from product ids at charge time, so nothing here is ever
 * trusted as an input to a payment.
 */
export interface OrderSummaryProps {
  className?: string
  /** Itemise the lines above the totals. */
  showLines?: boolean
  /** Collapse to a tappable bar below `md`. Always open from `md` up. */
  collapsible?: boolean
  heading?: string
  /** Rendered under the totals — promo field, CTA, fine print. */
  children?: ReactNode
}

export function OrderSummary({
  className,
  showLines = false,
  collapsible = false,
  heading = 'Order summary',
  children,
}: OrderSummaryProps) {
  const totals = useCartTotals()
  const lines = useCart((s) => s.lines)
  const fulfilment = useCart((s) => s.fulfilment)
  const fittingTyres = useCart((s) => s.fittingTyres)
  const promo = useCart((s) => s.promo)
  const [open, setOpen] = useState(false)
  const bodyId = useId()

  return (
    <section
      aria-labelledby={`${bodyId}-heading`}
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground',
        className,
      )}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={cn(
            'flex w-full items-center justify-between gap-3 p-4 text-left md:hidden',
            'rounded-lg focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          <span className="font-heading text-sm font-bold uppercase tracking-wide">
            {heading}
            <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
              {totals.itemCount} {pluralise(totals.itemCount, 'tyre')}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-heading text-base font-black">
              {money(totals.total)}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>
      ) : null}

      <div
        id={bodyId}
        className={cn(
          collapsible && (open ? 'border-t border-border md:border-t-0' : 'hidden'),
          collapsible && 'md:block',
        )}
      >
        <h2
          id={`${bodyId}-heading`}
          className={cn(
            'px-5 pt-5 font-heading text-base font-bold uppercase tracking-wide md:px-6 md:pt-6',
            collapsible && 'sr-only md:not-sr-only',
          )}
        >
          {heading}
        </h2>

        {showLines && lines.length > 0 ? (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 px-5 py-3 md:px-6">
                <span
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-md bg-muted p-0.5"
                >
                  <ProductThumb brand={line.brand} model={line.model} tread={line.tread} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-sm font-bold">
                    {line.brand} {line.model}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {line.size} &middot; {line.quantity} &times; {money(line.price)}
                  </span>
                </span>
                <span className="shrink-0 font-heading text-sm font-bold tabular-nums">
                  {money(line.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="space-y-2 p-5 text-sm md:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">
              Subtotal ({totals.itemCount} {pluralise(totals.itemCount, 'tyre')})
            </dt>
            <dd className="font-medium tabular-nums">{money(totals.subtotal)}</dd>
          </div>

          {totals.volumeDiscount > 0 ? (
            <div className="flex items-baseline justify-between gap-3 text-primary">
              <dt className="flex items-center gap-1.5">
                <TrendingDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                Volume discount
                {totals.volumeLabel ? (
                  <Badge variant="primary" size="sm">
                    {totals.volumeLabel}
                  </Badge>
                ) : null}
              </dt>
              <dd className="font-semibold tabular-nums">
                &minus;{money(totals.volumeDiscount)}
              </dd>
            </div>
          ) : null}

          {totals.promoDiscount > 0 ? (
            <div className="flex items-baseline justify-between gap-3 text-primary">
              <dt className="flex items-center gap-1.5">
                <Tag aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                Promo
                {promo ? (
                  <Badge variant="primary" size="sm">
                    {promo.code}
                  </Badge>
                ) : null}
              </dt>
              <dd className="font-semibold tabular-nums">
                &minus;{money(totals.promoDiscount)}
              </dd>
            </div>
          ) : null}

          {totals.fittingTotal > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <Wrench aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                Fitting ({fittingTyres} &times;{' '}
                {money(site.commerce.fittingFeePerTyre)})
              </dt>
              <dd className="font-medium tabular-nums">{money(totals.fittingTotal)}</dd>
            </div>
          ) : null}

          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {fulfilment === 'pickup' ? (
                <Warehouse aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Truck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              )}
              {fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
            </dt>
            <dd className="font-medium text-primary">
              {fulfilment === 'pickup' ? site.warehouse.suburb : 'Free to metro'}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="font-heading text-base font-bold uppercase tracking-wide">
              Total
            </dt>
            <dd className="font-heading text-xl font-black tabular-nums">
              {money(totals.total)}
            </dd>
          </div>

          <div className="flex justify-end">
            <dt className="sr-only">GST included</dt>
            <dd className="text-xs text-muted-foreground">
              Includes {moneyExact(totals.gst)} GST
            </dd>
          </div>
        </dl>

        {children ? <div className="px-5 pb-5 md:px-6 md:pb-6">{children}</div> : null}
      </div>
    </section>
  )
}
