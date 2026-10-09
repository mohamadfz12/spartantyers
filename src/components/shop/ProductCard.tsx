import { Link } from 'react-router-dom'
import {
  Check,
  Fuel,
  Gauge,
  Layers,
  Plus,
  RefreshCw,
  Scale,
  ShoppingCart,
  Snowflake,
  Volume2,
} from 'lucide-react'
import type { Product } from '@/data/types'
import { effectivePrice, POSITION_LABELS } from '@/data/products'
import { cn, money } from '@/lib/utils'
import { useCart } from '@/store/cart'
import { useCompare } from '@/store/ui'
import { toast } from '@/store/ui'
import { Badge, Button, Rating, Tooltip } from '@/components/ui'
import { StaticWheel } from '@/components/three'
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

  const price = effectivePrice(product)
  const inCompare = compareIds.includes(product.id)
  const compareFull = compareIds.length >= 4 && !inCompare

  const outOfStock = product.stock <= 0
  const lowStock = product.stock > 0 && product.stock <= 5

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
        {outOfStock ? (
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
        className="relative block overflow-hidden bg-gradient-to-b from-muted/60 to-muted"
        aria-label={`View ${product.brand} ${product.model} ${product.size}`}
      >
        <Tilt max={7} className={cn('p-5', compact ? 'h-36' : 'h-48')}>
          <StaticWheel
            tread={product.tread}
            label={product.brand}
            size={product.size}
            className="h-full w-full drop-shadow-xl transition-transform duration-500 group-hover:scale-[1.06]"
            title={`${product.brand} ${product.model} ${product.size}`}
          />
        </Tilt>

        {/* Tread family caption */}
        <span className="absolute bottom-2 left-3 font-heading text-[0.6rem] font-bold uppercase tracking-brand text-muted-foreground">
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
            <div className="mt-2.5 flex items-center gap-2">
              <Rating value={product.rating} count={product.reviewCount} size="sm" />
            </div>

            {/* Spec chips — the four numbers a buyer actually compares. */}
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <SpecChip
                icon={Layers}
                label="Tread"
                value={`${product.treadDepthMm}mm`}
                hint="Tread depth when new — sets removal mileage"
              />
              <SpecChip
                icon={Scale}
                label="Load"
                value={`${product.maxLoadKg.toLocaleString('en-AU')}kg`}
                hint={`Load index ${product.loadIndex} — maximum per tyre, single fitment`}
              />
              <SpecChip
                icon={Gauge}
                label="Speed"
                value={`${product.maxSpeedKmh}km/h`}
                hint={`Speed symbol ${product.speedRating}`}
              />
              <SpecChip
                icon={Fuel}
                label="Fuel"
                value={product.fuelRating}
                hint="Rolling resistance rating, A best to G worst"
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
              <Tooltip content={`${product.noiseDb}dB pass-by noise`}>
                <Badge variant="outline" size="sm">
                  <Volume2 className="mr-1 h-2.5 w-2.5" />
                  {product.noiseDb}dB
                </Badge>
              </Tooltip>
            </div>
          </>
        ) : null}

        {/* Price & actions */}
        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-2xl font-black leading-none">
                  {money(price)}
                </span>
                {product.discountPrice ? (
                  <span className="text-sm text-muted-foreground line-through">
                    {money(product.price)}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                per tyre, inc. GST
              </p>
            </div>

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

          <Button
            onClick={handleAdd}
            className="mt-3 w-full"
            variant={outOfStock ? 'outline' : 'primary'}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            {outOfStock ? 'Pre-order' : 'Add to cart'}
          </Button>
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
