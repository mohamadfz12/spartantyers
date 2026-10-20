import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react'
import { site } from '@/config/site'
import { cn, money, pluralise } from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'
import { Badge, Button, Progress, Sheet, SheetClose } from '@/components/ui'
import { StaticWheel } from '@/components/three'
import { ProductThumb } from '@/components/shop/ProductThumb'
import { AnimatePresence, motion } from '@/components/motion'

/**
 * The cart drawer. Doubles as the place volume pricing is explained — the
 * "add N more to save X%" nudge is the clearest moment to surface a price
 * break, because the visitor is already looking at the quantity.
 */
export function CartDrawer() {
  const isOpen = useCart((s) => s.isOpen)
  const close = useCart((s) => s.close)
  const lines = useCart((s) => s.lines)
  const increment = useCart((s) => s.increment)
  const decrement = useCart((s) => s.decrement)
  const remove = useCart((s) => s.remove)
  const totals = useCartTotals()

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      side="right"
      labelledBy="cart-heading"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-border p-4">
          <h2
            id="cart-heading"
            className="flex items-center gap-2.5 font-heading text-base font-bold uppercase tracking-wide"
          >
            <ShoppingCart className="h-5 w-5 text-primary" />
            Your cart
            {totals.itemCount > 0 ? (
              <Badge variant="primary" size="sm">
                {totals.itemCount}
              </Badge>
            ) : null}
          </h2>
          <SheetClose className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="h-5 w-5" />
            <span className="sr-only">Close cart</span>
          </SheetClose>
        </header>

        {lines.length === 0 ? (
          <EmptyCart />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {lines.map((line) => (
                    <motion.li
                      key={line.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="flex gap-3 p-4">
                        <Link
                          to={`/product/${line.id}`}
                          onClick={close}
                          className="h-16 w-16 shrink-0 rounded-md bg-muted p-1"
                        >
                          <ProductThumb
                            brand={line.brand}
                            model={line.model}
                            tread={line.tread}
                          />
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/product/${line.id}`}
                            onClick={close}
                            className="block truncate font-heading text-sm font-bold hover:text-primary"
                          >
                            {line.brand} {line.model}
                          </Link>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {line.size}
                          </p>

                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center rounded-md border border-border">
                              <button
                                type="button"
                                onClick={() => decrement(line.id)}
                                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                aria-label={`Decrease quantity of ${line.brand} ${line.model}`}
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span
                                className="w-8 text-center font-heading text-sm font-bold"
                                aria-live="polite"
                              >
                                {line.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => increment(line.id)}
                                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                aria-label={`Increase quantity of ${line.brand} ${line.model}`}
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-heading text-sm font-bold">
                                {money(line.price * line.quantity)}
                              </span>
                              <button
                                type="button"
                                onClick={() => remove(line.id)}
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Remove ${line.brand} ${line.model} from cart`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              <VolumeNudge />
            </div>

            <footer className="border-t border-border bg-card p-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Subtotal ({totals.itemCount}{' '}
                    {pluralise(totals.itemCount, 'tyre')})
                  </dt>
                  <dd className="font-medium">{money(totals.subtotal)}</dd>
                </div>

                {totals.volumeDiscount > 0 ? (
                  <div className="flex justify-between text-primary">
                    <dt className="flex items-center gap-1.5">
                      <TrendingDown className="h-3.5 w-3.5" />
                      Volume discount ({totals.volumeLabel})
                    </dt>
                    <dd className="font-semibold">
                      −{money(totals.volumeDiscount)}
                    </dd>
                  </div>
                ) : null}

                {totals.promoDiscount > 0 ? (
                  <div className="flex justify-between text-primary">
                    <dt className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      Promo applied
                    </dt>
                    <dd className="font-semibold">
                      −{money(totals.promoDiscount)}
                    </dd>
                  </div>
                ) : null}

                <div className="flex justify-between text-muted-foreground">
                  <dt>Delivery</dt>
                  <dd className="font-medium text-primary">Free to metro</dd>
                </div>

                <div className="flex justify-between border-t border-border pt-2.5 text-base">
                  <dt className="font-heading font-bold uppercase">Total</dt>
                  <dd className="font-heading text-lg font-black">
                    {money(totals.total)}
                  </dd>
                </div>
                <p className="text-right text-[0.7rem] text-muted-foreground">
                  Includes {money(totals.gst)} GST
                </p>
              </dl>

              <Button asChild className="mt-4 w-full" size="lg">
                <Link to="/checkout" onClick={close}>
                  Secure checkout
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>

              <SheetClose className="mt-2 w-full rounded-md py-2 text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                Keep shopping
              </SheetClose>

              <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
                Outside metro? Order as normal with no upfront freight — we'll
                contact you to arrange it and confirm cost before dispatch.
              </p>
            </footer>
          </>
        )}
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */

function VolumeNudge() {
  const totals = useCartTotals()
  const { nextBreak, tyresToNextBreak, itemCount } = totals

  if (!nextBreak) {
    return (
      <div className="m-4 rounded-md border border-primary/30 bg-primary/5 p-3">
        <p className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wide text-primary">
          <TrendingDown className="h-4 w-4" />
          Maximum volume discount applied
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          You're on our best price break. For orders over{' '}
          {site.commerce.bulkThreshold} tyres we can also arrange consolidated
          depot freight — call {site.phone.display}.
        </p>
      </div>
    )
  }

  const progress = (itemCount / nextBreak.min) * 100

  return (
    <div className="m-4 rounded-md border border-border bg-card p-3">
      <p className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wide">
        <TrendingDown className="h-4 w-4 text-primary" />
        Add {tyresToNextBreak} more {pluralise(tyresToNextBreak, 'tyre')} to save{' '}
        {Math.round(nextBreak.discount * 100)}%
      </p>
      <Progress
        value={progress}
        className="mt-2.5"
        label={`${itemCount} of ${nextBreak.min} tyres towards the ${nextBreak.label} price break`}
      />
      <p className="mt-1.5 text-xs text-muted-foreground">
        {itemCount} of {nextBreak.min} tyres towards the {nextBreak.label} break
      </p>
    </div>
  )
}

function EmptyCart() {
  const close = useCart((s) => s.close)

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="h-24 w-24 opacity-30">
        <StaticWheel tread="rib" />
      </div>
      <h3 className="mt-5 font-heading text-base font-bold uppercase tracking-wide">
        Your cart is empty
      </h3>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Start shopping to add items to your cart. Free delivery applies to all
        metro orders.
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <Button asChild className="w-full">
          <Link to="/shop" onClick={close}>
            <Package className="mr-2 h-4 w-4" />
            Browse all tyres
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link to="/finder" onClick={close}>
            Find tyres by size
          </Link>
        </Button>
      </div>
    </div>
  )
}
