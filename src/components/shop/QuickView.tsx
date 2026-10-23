import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Info, MessageSquareQuote, ShoppingCart } from 'lucide-react'
import type { Product } from '@/data/types'
import { PRICE_BREAKS, priceBreakFor } from '@/data/products'
import { site } from '@/config/site'
import { volumeUnit } from '@/lib/account-price-display'
import { cn, money, pluralise } from '@/lib/utils'
import { usePriceView, YourPrice } from './YourPrice'
import { useCart } from '@/store/cart'
import { requestQuote, toast } from '@/store/ui'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Rating,
} from '@/components/ui'
import { ProductWheel } from '@/components/three'
import { QuantityStepper } from './QuantityStepper'
import { SpecTable } from './SpecTable'

export interface QuickViewProps {
  /** `null` closes the dialog. */
  product: Product | null
  onClose: () => void
}

/**
 * The spec sheet without leaving the grid.
 *
 * A trade buyer comparing eight patterns should not have to load eight pages,
 * so the quick view carries everything that decides the purchase: the wheel,
 * the full spec table and add-to-cart.
 */
export function QuickView({ product, onClose }: QuickViewProps) {
  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {product ? <Body key={product.id} product={product} onClose={onClose} /> : null}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function Body({ product, onClose }: { product: Product; onClose: () => void }) {
  const add = useCart((state) => state.add)
  const [quantity, setQuantity] = useState(4)

  const view = usePriceView(product)
  const price = view.current
  const outOfStock = price != null && product.stock <= 0
  const lowStock = price != null && product.stock > 0 && product.stock <= 5
  const band = priceBreakFor(quantity)

  const handleAdd = () => {
    add(product, quantity)
    toast({
      title: outOfStock ? 'Added as pre-order' : 'Added to cart',
      description: `${quantity} × ${product.brand} ${product.model} — ${product.size}`,
      variant: 'success',
    })
  }

  // One dialog at a time: close this one, then open the quote form.
  const handleQuote = () => {
    onClose()
    requestQuote(product, quantity)
  }

  return (
    <DialogContent size="xl" className="p-0">
      <DialogHeader className="border-b border-border">
        <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-primary">
          {product.brand}
        </p>
        <DialogTitle>
          {product.model} <span className="font-mono normal-case">{product.size}</span>
        </DialogTitle>
        <DialogDescription>{product.headline}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-0 md:grid-cols-2">
        {/* Wheel --------------------------------------------------- */}
        <div className="relative border-b border-border bg-gradient-to-b from-muted/60 to-muted md:border-b-0 md:border-r">
          <ProductWheel product={product} className="h-56 w-full sm:h-72 md:h-full md:min-h-[26rem]" />
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[0.65rem] font-semibold uppercase tracking-brand text-muted-foreground">
            Drag to rotate
          </p>
        </div>

        {/* Buy box ------------------------------------------------- */}
        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {product.reviewCount > 0 ? (
              <Rating value={product.rating} count={product.reviewCount} size="sm" />
            ) : null}
            {product.discount ? (
              <Badge variant="destructive" size="sm">
                Save {product.discount}%
              </Badge>
            ) : null}
            {price == null ? (
              <Badge variant="charcoal" size="sm">
                Built to order
              </Badge>
            ) : outOfStock ? (
              <Badge variant="charcoal" size="sm">
                Pre-order
              </Badge>
            ) : lowStock ? (
              <Badge variant="warning" size="sm">
                Only {product.stock} left
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                In stock
              </Badge>
            )}
          </div>

          {price != null ? (
            <>
              <div className={cn('mt-4 flex items-baseline gap-2.5', view.yours && 'flex-wrap gap-y-1')}>
                {view.yours ? (
                  <YourPrice view={view} priceClassName="text-3xl" retailClassName="text-base" />
                ) : (
                  <>
                    <span className="font-heading text-3xl font-black leading-none">
                      {money(price)}
                    </span>
                    {product.discountPrice != null && product.price != null ? (
                      <span className="text-base text-muted-foreground line-through">
                        {money(product.price)}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">per tyre, inc. GST</p>
            </>
          ) : (
            <>
              <p className="mt-4 font-heading text-3xl font-black leading-none">POA</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Price on application — built to order
              </p>
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <QuantityStepper
              id={`quickview-qty-${product.id}`}
              label={`Quantity of ${product.brand} ${product.model} ${product.size}`}
              value={quantity}
              onChange={setQuantity}
              max={price == null || outOfStock ? 200 : Math.max(product.stock, 1)}
            />
            {price != null ? (
              <Button onClick={handleAdd} className="flex-1">
                <ShoppingCart aria-hidden="true" className="mr-2 h-4 w-4" />
                {outOfStock ? 'Pre-order' : 'Add to cart'}
              </Button>
            ) : (
              <Button onClick={handleQuote} className="flex-1">
                <MessageSquareQuote aria-hidden="true" className="mr-2 h-4 w-4" />
                Request a quote
              </Button>
            )}
          </div>

          <p className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              {price == null ? (
                <>
                  This line is built to order, so it is priced per order rather
                  than listed. Tell us the quantity and we come back with price
                  and lead time, usually within one business day.
                </>
              ) : view.yours ? (
                <>
                  <strong className="font-semibold text-foreground">
                    {money(volumeUnit(view, band?.discount ?? 0) ?? price)} each at {quantity}{' '}
                    {pluralise(quantity, 'tyre')}
                  </strong>{' '}
                  is your account price, or the volume price when that is lower. They are never combined.
                </>
              ) : band ? (
                <>
                  <strong className="font-semibold text-foreground">
                    {band.label}: {money(price * (1 - band.discount))} each
                  </strong>{' '}
                  — {money(price * quantity * band.discount)} off {quantity}{' '}
                  {pluralise(quantity, 'tyre')}, applied automatically in the cart.
                </>
              ) : (
                <>
                  Volume pricing starts at {PRICE_BREAKS[0].min} tyres. Add{' '}
                  {PRICE_BREAKS[0].min - quantity} more for{' '}
                  {money(price * (1 - PRICE_BREAKS[0].discount))} each.
                </>
              )}
            </span>
          </p>

          <div className="mt-5 border-t border-border pt-4">
            <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
              Specifications
            </h3>
            <SpecTable
              product={product}
              dense
              className="mt-2"
              caption={`Specifications for the ${product.brand} ${product.model} in ${product.size}`}
            />
          </div>
        </div>
      </div>

      <DialogFooter className="sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Not sure it is the right fitment? Call{' '}
          <a href={site.phone.href} className="font-semibold text-primary hover:underline">
            {site.phone.display}
          </a>
          .
        </p>
        <Button asChild variant="outline">
          <Link to={`/product/${product.id}`}>
            Full details
            <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
