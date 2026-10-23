import { Link } from 'react-router-dom'
import {
  Check,
  Fuel,
  Gauge,
  Layers,
  MessageSquareQuote,
  Plus,
  RefreshCw,
  Scale,
  ShoppingCart,
  Snowflake,
  Volume2,
} from 'lucide-react'
import type { Product } from '@/data/types'
import { POSITION_LABELS } from '@/data/products'
import { cn, money, specValue } from '@/lib/utils'
import { usePriceView, YourPrice } from '@/components/shop/YourPrice'
import { useCart } from '@/store/cart'
import { requestQuote, toast, useCompare } from '@/store/ui'
import { Badge, Button, Rating, Tooltip } from '@/components/ui'
import { StaticWheel } from '@/components/three'
import { productCardPhoto, productGallery } from '@/data/media'
import { Tilt } from '@/components/motion'

export interface ProductCardProps {
  product: Product
  /** Denser layout for sidebars and carousels. */
  compact?: boolean
  className?: string
  onQuickView?: (product: Product) => void
}

export function ProductCard({
  product,
  compact = false,
  className,
  onQuickView,
}: ProductCardProps) {
  const add = useCart((s) => s.add)
  const compareIds = useCompare((s) => s.ids)
  const toggleCompare = useCompare((s) => s.toggle)

  // One rule for the price: the signed-in customer's own price when it beats the shelf price.
  const view = usePriceView(product)
  const priced = view.buyable
  const price = view.current
  const photo = productCardPhoto(product)
  const inCompare = compareIds.includes(product.id)
  const compareFull = compareIds.length >= 4 && !inCompare

  const outOfStock = priced && product.stock <= 0
  const lowStock = priced && product.stock > 0 && product.stock <= 5

  const handleAdd = () => {
    add(product)
    toast({
      title: outOfStock ? 'Added as pre-order' : 'Added to cart',
      description: `${product.brand} ${product.model} — ${product.size}`,
      variant: 'success',
    })
  }

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-300 ease-brand hover:-translate-y-1 hover:border-primary/50 hover:shadow-lift',
        className,
      )}
    >
      {/* Corner flags */}
      <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
        {product.discount ? (
          <Badge variant="destructive" size="sm">
            Save {product.discount}%
          </Badge>
        ) : null}
        {!priced ? (
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
        ) : null}
        {product.fuelRating === 'A' && !product.discount ? (
          <Badge variant="success" size="sm">
            Fuel saver
          </Badge>
        ) : null}
      </div>

      {/* Compare toggle */}
      <button
        type="button"
        onClick={() => toggleCompare(product.id)}
        disabled={compareFull}
        aria-pressed={inCompare}
        aria-label={
          inCompare
            ? `Remove ${product.brand} ${product.model} from comparison`
            : `Add ${product.brand} ${product.model} to comparison`
        }
        className={cn(
          'absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border transition-all',
          inCompare
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-background/80 text-muted-foreground opacity-0 backdrop-blur hover:border-primary hover:text-primary focus-visible:opacity-100 group-hover:opacity-100',
          compareFull && 'cursor-not-allowed opacity-40',
        )}
      >
        {inCompare ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>

      {/* Visual */}
      <Link
        to={`/product/${product.id}`}
        className={cn('relative block overflow-hidden', photo ? 'bg-white' : 'bg-muted')}
        aria-label={`View ${product.brand} ${product.model} ${product.size}`}
      >
        {photo ? (
          /* The catalogue photograph of this pattern, on the white it was
             shot on — in either colour scheme, the way a buyer expects a
             product shot to look. */
          <div className={cn('relative p-4', compact ? 'h-36' : 'h-48')}>
            <img
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.06]"
            />
          </div>
        ) : (
          <>
            {/* No photograph of this pattern yet: tread photography as the
                backdrop, with the generated wheel in front. The wheel is what
                stays accurate to this SKU's brand, size and pattern, so the
                two are layered rather than one replacing the other. */}
            <img
              src={productGallery[0].src}
              alt=""
              aria-hidden="true"
              width={productGallery[0].width}
              height={productGallery[0].height}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-[1px] transition-transform duration-700 group-hover:scale-125 dark:opacity-25"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/40 to-background/80" />

            <Tilt max={7} className={cn('relative p-5', compact ? 'h-36' : 'h-48')}>
              <StaticWheel
                tread={product.tread}
                label={product.brand}
                size={product.size}
                className="h-full w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)] transition-transform duration-500 group-hover:scale-[1.06]"
                title={`${product.brand} ${product.model} ${product.size}`}
              />
            </Tilt>
          </>
        )}

        {/* Fitment caption */}
        <span
          className={cn(
            'absolute bottom-2 left-3 font-heading text-[0.6rem] font-bold uppercase tracking-brand',
            photo ? 'text-neutral-500' : 'text-muted-foreground',
          )}
        >
          {product.positionLabel}
        </span>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-primary">
          {product.brand}
        </p>

        <h3 className="mt-1 font-heading text-base font-bold leading-tight">
          <Link
            to={`/product/${product.id}`}
            className="transition-colors hover:text-primary"
          >
            {product.model}
          </Link>
        </h3>

        <p className="mt-1 font-mono text-sm font-semibold text-muted-foreground">
          {product.size}
        </p>

        {!compact ? (
          <>
            {product.reviewCount > 0 ? (
              <div className="mt-2.5 flex items-center gap-2">
                <Rating value={product.rating} count={product.reviewCount} size="sm" />
              </div>
            ) : null}

            {/* Spec chips — the four numbers a buyer actually compares. */}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <SpecChip
                icon={Layers}
                label="Tread"
                value={specValue(product.treadDepthMm, (mm) => `${mm}mm`, 'TBC')}
                hint={
                  product.treadDepthMm != null
                    ? 'Tread depth when new — sets removal mileage'
                    : 'Tread depth not published — confirmed with your order'
                }
              />
              <SpecChip
                icon={Scale}
                label="Load"
                value={specValue(product.maxLoadKg, (kg) => `${kg.toLocaleString('en-AU')}kg`, 'TBC')}
                hint={
                  product.loadIndex != null
                    ? `Load index ${product.loadIndex} — maximum per tyre, single fitment`
                    : 'Load index not published — confirmed with your order'
                }
              />
              <SpecChip
                icon={Gauge}
                label="Speed"
                value={specValue(product.maxSpeedKmh, (kmh) => `${kmh}km/h`, 'TBC')}
                hint={
                  product.speedRating != null
                    ? `Speed symbol ${product.speedRating}`
                    : 'Speed symbol not published — confirmed with your order'
                }
              />
              <SpecChip
                icon={Fuel}
                label="Fuel"
                value={product.fuelRating ?? '—'}
                hint={
                  product.fuelRating != null
                    ? 'Rolling resistance rating, A best to G worst'
                    : 'No EU tyre label published for this line'
                }
              />
            </dl>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="outline" size="sm">
                {product.ply}
              </Badge>
              {product.position.map((position) => (
                <Badge key={position} variant="outline" size="sm">
                  {POSITION_LABELS[position]}
                </Badge>
              ))}
              {product.retreadable ? (
                <Tooltip content="Casing designed for two to three retread cycles">
                  <Badge variant="outline" size="sm">
                    <RefreshCw className="mr-1 h-2.5 w-2.5" />
                    Retread
                  </Badge>
                </Tooltip>
              ) : null}
              {product.threePeak ? (
                <Tooltip content="Rated for severe service — mud, gravel and unsealed roads">
                  <Badge variant="outline" size="sm">
                    <Snowflake className="mr-1 h-2.5 w-2.5" />
                    Severe
                  </Badge>
                </Tooltip>
              ) : null}
              {product.noiseDb != null ? (
                <Tooltip content={`${product.noiseDb}dB pass-by noise`}>
                  <Badge variant="outline" size="sm">
                    <Volume2 className="mr-1 h-2.5 w-2.5" />
                    {product.noiseDb}dB
                  </Badge>
                </Tooltip>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Price & actions */}
        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-2">
            {price != null ? (
              <div>
                <div className={cn('flex items-baseline gap-2', view.yours && 'flex-wrap gap-y-1')}>
                  {view.yours ? (
                    <YourPrice view={view} priceClassName="text-2xl" />
                  ) : (
                    <>
                      <span className="font-heading text-2xl font-black leading-none">
                        {money(price)}
                      </span>
                      {product.discountPrice != null && product.price != null ? (
                        <span className="text-sm text-muted-foreground line-through">
                          {money(product.price)}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
                <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                  per tyre, inc. GST
                </p>
              </div>
            ) : (
              <div>
                <span className="font-heading text-2xl font-black leading-none">POA</span>
                <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                  Price on application
                </p>
              </div>
            )}

            {onQuickView ? (
              <button
                type="button"
                onClick={() => onQuickView(product)}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline"
              >
                Quick view
              </button>
            ) : null}
          </div>

          {priced ? (
            <Button
              onClick={handleAdd}
              className="mt-3 w-full"
              variant={outOfStock ? 'outline' : 'primary'}
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              {outOfStock ? 'Pre-order' : 'Add to cart'}
            </Button>
          ) : (
            <Button
              onClick={() => requestQuote(product)}
              className="mt-3 w-full"
              variant="outline"
            >
              <MessageSquareQuote className="mr-2 h-4 w-4" />
              Request a quote
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ */

function SpecChip({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Layers
  label: string
  value: string
  hint: string
}) {
  return (
    <Tooltip content={hint}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <dt className="sr-only">{label}</dt>
        <dd className="truncate font-semibold">{value}</dd>
      </div>
    </Tooltip>
  )
}
