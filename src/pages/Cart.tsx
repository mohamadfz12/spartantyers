import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Minus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Truck,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { StaticWheel } from '@/components/three'
import { Reveal } from '@/components/motion'
import { ProductThumb } from '@/components/shop/ProductThumb'
import { FulfilmentPicker } from '@/components/checkout/FulfilmentPicker'
import { OrderSummary } from '@/components/checkout/OrderSummary'
import { PriceBreakLadder } from '@/components/checkout/PriceBreakLadder'
import { PromoField } from '@/components/checkout/PromoField'
import { TradeLoginLink } from '@/components/checkout/PayOnAccount'
import { site } from '@/config/site'
import { effectivePrice, productById } from '@/data/products'
import { AccountUnit, accountLine } from '@/components/shop/YourPrice'
import { cn, money, pluralise } from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'

/**
 * The full-page cart.
 *
 * The drawer is for the quick glance after an add-to-cart; this is the
 * considered-review surface, so it earns the room to explain volume pricing,
 * fulfilment and the fitting add-on before anyone reaches the card form.
 */
export default function Cart() {
  const lines = useCart((s) => s.lines)
  const totals = useCartTotals()

  return (
    <>
      <Seo
        title={`Your Cart | ${site.name}`}
        description="Review your truck tyre order, apply volume pricing and promo codes, choose delivery or warehouse pickup, then check out securely."
        canonicalPath="/cart"
        noIndex
      />

      <div className="section-tight">
        <div className="shell">
          <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to="/" className="rounded hover:text-foreground">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link to="/shop" className="rounded hover:text-foreground">
                  Shop
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground">
                Cart
              </li>
            </ol>
          </nav>

          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display-3">Your cart</h1>
              <p className="lede mt-2">
                {lines.length === 0
                  ? 'Nothing here yet — your next order starts in the shop.'
                  : `${totals.itemCount} ${pluralise(totals.itemCount, 'tyre')} across ${totals.lineCount} ${pluralise(totals.lineCount, 'product')}. All prices include GST.`}
              </p>
            </div>

            {lines.length > 0 ? (
              <Button asChild variant="outline">
                <Link to="/shop">
                  <Package aria-hidden="true" className="h-4 w-4" />
                  Keep shopping
                </Link>
              </Button>
            ) : null}
          </header>

          {lines.length === 0 ? (
            <EmptyCart />
          ) : (
            <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
              <div className="min-w-0 space-y-6">
                <CartLines />
                <PriceBreakLadder />
                <section
                  aria-labelledby="fulfilment-heading"
                  className="rounded-lg border border-border bg-card p-5 md:p-6"
                >
                  <h2 id="fulfilment-heading" className="sr-only">
                    Fulfilment
                  </h2>
                  <FulfilmentPicker variant="cart" />
                </section>
              </div>

              <aside className="lg:sticky lg:top-24">
                <OrderSummary showLines={false}>
                  <div className="space-y-4">
                    <PromoField />

                    <Button asChild size="lg" className="w-full">
                      <Link to="/checkout">
                        Continue to checkout
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Link>
                    </Button>

                    <TradeLoginLink className="text-xs" />

                    <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <Truck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        Free delivery to all metro orders, estimated{' '}
                        {site.commerce.metroDeliveryEstimate}.
                      </li>
                      <li className="flex items-start gap-2">
                        <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        Card payments are processed by Square. We never store your
                        card details.
                      </li>
                    </ul>
                  </div>
                </OrderSummary>
              </aside>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Line items
 * ------------------------------------------------------------------ */

function CartLines() {
  const lines = useCart((s) => s.lines)
  const totals = useCartTotals()
  const increment = useCart((s) => s.increment)
  const decrement = useCart((s) => s.decrement)
  const setQuantity = useCart((s) => s.setQuantity)
  const remove = useCart((s) => s.remove)

  return (
    <section
      aria-labelledby="cart-lines-heading"
      className="rounded-lg border border-border bg-card"
    >
      <h2
        id="cart-lines-heading"
        className="flex items-center gap-2 border-b border-border p-5 font-heading text-base font-bold uppercase tracking-wide md:p-6"
      >
        <ShoppingCart aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        Items
      </h2>

      <ul className="divide-y divide-border">
        {lines.map((line) => {
          const product = productById.get(line.id)
          const rrp = product && product.discountPrice != null ? product.price : null
          // The cart only ever holds priced lines (see the store's merge), so
          // the saved price is a safe fallback for a line that has just left.
          const acct = accountLine(totals, line.id)
          const unit = acct?.unit ?? (product && effectivePrice(product)) ?? line.price
          const lowStock =
            product && product.stock > 0 && line.quantity > product.stock
              ? product.stock
              : null
          const preOrder = product ? product.stock <= 0 : false

          return (
            <li key={line.id} className="p-4 md:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Link
                  to={`/product/${line.id}`}
                  aria-label={`View ${line.brand} ${line.model} ${line.size}`}
                  className={cn(
                    'h-20 w-20 shrink-0 rounded-md bg-muted p-1 transition-colors',
                    'hover:bg-accent focus-visible:outline-none focus-visible:ring-2',
                    'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  <ProductThumb brand={line.brand} model={line.model} tread={line.tread} />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-bold leading-tight">
                        <Link
                          to={`/product/${line.id}`}
                          className="rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          {line.brand} {line.model}
                        </Link>
                      </h3>
                      <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{line.size}</span>
                        <span aria-hidden="true">&middot;</span>
                        <span>SKU {line.sku}</span>
                        {product ? (
                          <>
                            <span aria-hidden="true">&middot;</span>
                            <span>{product.positionLabel}</span>
                          </>
                        ) : null}
                      </p>

                      {acct ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          <AccountUnit
                            unit={acct.unit}
                            retail={acct.retail}
                            className="font-heading text-sm font-bold text-foreground"
                          />{' '}
                          per tyre
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          <span className="font-heading text-sm font-bold text-foreground">
                            {money(unit)}
                          </span>{' '}
                          per tyre
                          {rrp ? (
                            <>
                              {' '}
                              <span className="line-through">{money(rrp)}</span>
                            </>
                          ) : null}
                        </p>
                      )}

                      {preOrder ? (
                        <Badge variant="warning" size="sm" className="mt-2">
                          Back-order
                        </Badge>
                      ) : null}
                      {lowStock != null ? (
                        <p className="mt-2 text-xs font-medium text-destructive">
                          Only {lowStock} in stock — reduce the quantity or call{' '}
                          {site.phone.display} for the rest.
                        </p>
                      ) : null}
                    </div>

                    <p className="font-heading text-lg font-black tabular-nums">
                      {money(unit * line.quantity)}
                      <span className="sr-only"> line total</span>
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor={`qty-${line.id}`}
                        className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                      >
                        Qty
                      </label>

                      <div className="flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => decrement(line.id)}
                          className={cn(
                            'flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors',
                            'hover:bg-accent hover:text-foreground focus-visible:outline-none',
                            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            'focus-visible:ring-offset-background',
                          )}
                        >
                          <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                          <span className="sr-only">
                            Decrease quantity of {line.brand} {line.model}
                          </span>
                        </button>

                        <input
                          id={`qty-${line.id}`}
                          type="number"
                          min={1}
                          max={500}
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(event) => {
                            const next = Number.parseInt(event.target.value, 10)
                            // Typing a leading 0 must not delete the line —
                            // removal is the Remove button's job.
                            if (Number.isFinite(next) && next >= 1) {
                              setQuantity(line.id, Math.min(next, 500))
                            }
                          }}
                          aria-label={`Quantity of ${line.brand} ${line.model} ${line.size}`}
                          className={cn(
                            'h-10 w-14 border-x border-border bg-background text-center',
                            'font-heading text-sm font-bold tabular-nums text-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none',
                          )}
                        />

                        <button
                          type="button"
                          onClick={() => increment(line.id)}
                          className={cn(
                            'flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors',
                            'hover:bg-accent hover:text-foreground focus-visible:outline-none',
                            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            'focus-visible:ring-offset-background',
                          )}
                        >
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          <span className="sr-only">
                            Increase quantity of {line.brand} {line.model}
                          </span>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(line.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium',
                        'text-muted-foreground transition-colors hover:bg-destructive/10',
                        'hover:text-destructive focus-visible:outline-none focus-visible:ring-2',
                        'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      )}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      Remove
                      <span className="sr-only">
                        {line.brand} {line.model} {line.size} from your cart
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function EmptyCart() {
  return (
    <Reveal className="mt-10">
      <div className="mx-auto max-w-xl rounded-lg border border-border bg-card p-8 text-center md:p-12">
        <div className="mx-auto h-28 w-28 opacity-30">
          <StaticWheel tread="rib" />
        </div>

        <h2 className="mt-6 font-heading text-xl font-bold uppercase tracking-wide">
          Your cart is empty
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Add truck, bus or trailer tyres to see volume pricing, fitting options
          and your total. Free delivery applies to all metro orders.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg">
            <Link to="/shop">
              <Package aria-hidden="true" className="h-4 w-4" />
              Browse all tyres
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/finder">
              <Search aria-hidden="true" className="h-4 w-4" />
              Find tyres by size
            </Link>
          </Button>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Not sure what you need? Call our team on{' '}
          <a
            href={site.phone.href}
            className="rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {site.phone.display}
          </a>{' '}
          — {site.hours.short}.
        </p>
      </div>
    </Reveal>
  )
}
