import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Scale, ShoppingCart, Trophy } from 'lucide-react'
import {
  POSITION_LABELS,
  effectivePrice,
  hasPrice,
  productById,
  products,
  productsForPosition,
} from '@/data/products'
import type { AxlePosition, Product } from '@/data/types'
import { AxleSelector } from '@/components/shop/AxleSelector'
import { ProductThumb } from '@/components/shop/ProductThumb'
import { Badge, Button, Rating } from '@/components/ui'
import { Reveal } from '@/components/motion'
import { useCatalogueVersion } from '@/lib/live-catalogue'
import { cn, formatNumber, priceLabel } from '@/lib/utils'
import { useCart } from '@/store/cart'
import { useAxle, useCompare } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Greforce vs Lionshead — head to head
 *
 * The two brands we stock, side by side for the axle the visitor picks.
 * Each side starts on that brand's best-rated tyre for the axle (the
 * Lionshead in the same size where there is one, so it is a fair fight),
 * and either side can be swapped for any tyre in the range. Winning
 * figures are marked; a tie or a missing figure marks nothing.
 * ------------------------------------------------------------------ */

type Better = 'high' | 'low'

const FUEL = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const fuelRank = (rating: string | null) => (rating ? FUEL.indexOf(rating) : null)

interface Row {
  label: string
  value: (p: Product) => string
  metric?: (p: Product) => number | null
  better?: Better
}

const ROWS: Row[] = [
  { label: 'Price per tyre', value: (p) => priceLabel(effectivePrice(p)), metric: (p) => effectivePrice(p), better: 'low' },
  { label: 'Tread depth', value: (p) => (p.treadDepthMm != null ? `${p.treadDepthMm}mm` : '—'), metric: (p) => p.treadDepthMm, better: 'high' },
  { label: 'Load per tyre', value: (p) => (p.maxLoadKg != null ? `${formatNumber(p.maxLoadKg)}kg` : '—'), metric: (p) => p.maxLoadKg, better: 'high' },
  { label: 'Top speed', value: (p) => (p.maxSpeedKmh != null ? `${p.maxSpeedKmh}km/h` : '—'), metric: (p) => p.maxSpeedKmh, better: 'high' },
  { label: 'Ply rating', value: (p) => p.ply, metric: (p) => Number.parseInt(p.ply, 10) || null, better: 'high' },
  { label: 'Fuel rating', value: (p) => p.fuelRating ?? '—', metric: (p) => fuelRank(p.fuelRating), better: 'low' },
  { label: 'Noise', value: (p) => (p.noiseDb != null ? `${p.noiseDb}dB` : '—'), metric: (p) => p.noiseDb, better: 'low' },
  { label: 'Customer rating', value: (p) => (p.reviewCount ? `${p.rating.toFixed(1)} / 5` : '—'), metric: (p) => (p.reviewCount ? p.rating : null), better: 'high' },
  { label: 'Retreadable', value: (p) => (p.retreadable ? 'Yes' : 'No') },
  { label: 'Severe service (3PMSF)', value: (p) => (p.threePeak ? 'Rated' : 'No') },
  { label: 'Size', value: (p) => p.size },
  { label: 'Fitment', value: (p) => p.positionLabel },
  {
    label: 'Availability',
    value: (p) => (!hasPrice(p) ? 'Built to order' : p.stock > 0 ? `${formatNumber(p.stock)} in stock` : 'Pre-order'),
  },
]

/** Which side wins a row: 0, 1, or null for a tie / missing figure. */
function winner(row: Row, a: Product, b: Product): 0 | 1 | null {
  if (!row.metric || !row.better) return null
  const x = row.metric(a)
  const y = row.metric(b)
  if (x == null || y == null || x === y) return null
  const aWins = row.better === 'high' ? x > y : x < y
  return aWins ? 0 : 1
}

const byRating = (a: Product, b: Product) => b.rating - a.rating || b.reviewCount - a.reviewCount

/** The brand's best tyre for the axle; a matching size wins when given. */
function pick(brand: string, axle: AxlePosition, size?: string): Product | undefined {
  const forAxle = productsForPosition(axle).filter((p) => p.brand === brand)
  const pool = forAxle.length ? forAxle : products.filter((p) => p.brand === brand)
  const priced = pool.filter(hasPrice)
  const ranked = [...(priced.length ? priced : pool)].sort(byRating)
  return (size && ranked.find((p) => p.size === size)) || ranked[0]
}

export function BrandCompare() {
  const axle = useAxle((s) => s.axle)
  const setAxle = useAxle((s) => s.setAxle)
  const catalogue = useCatalogueVersion()

  const defaults = useMemo(() => {
    const left = pick('Greforce', axle)
    const right = pick('Lionshead', axle, left?.size)
    return [left?.id ?? '', right?.id ?? ''] as const
  }, [axle, catalogue])

  const [ids, setIds] = useState<[string, string]>([defaults[0], defaults[1]])
  // A new axle starts a new comparison.
  useEffect(() => setIds([defaults[0], defaults[1]]), [defaults])

  const pair = ids.map((id) => productById.get(id)).filter(Boolean) as Product[]
  const [a, b] = pair
  const wins = a && b ? ROWS.map((row) => winner(row, a, b)) : []
  const score = [wins.filter((w) => w === 0).length, wins.filter((w) => w === 1).length]

  return (
    <section className="section bg-muted/40" aria-labelledby="brand-compare-title">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow justify-center">Head to head</p>
          <h2 id="brand-compare-title" className="display-2 mt-3">
            Greforce <span className="text-primary">vs</span> Lionshead
          </h2>
          <p className="lede mt-4">
            Our two brands, side by side. Pick the axle, then swap either tyre for any in the range to see which one
            suits the job.
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-10 max-w-3xl">
          <AxleSelector value={axle} onChange={setAxle} showDetail={false} />
        </Reveal>

        {a && b ? (
          <Reveal className="mt-10">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lift">
              {/* The two tyres */}
              <div className="grid grid-cols-2 divide-x divide-border">
                {[a, b].map((p, side) => (
                  <Contender
                    key={side}
                    product={p}
                    side={side as 0 | 1}
                    wins={score[side] ?? 0}
                    leading={score[side]! > score[1 - side]!}
                    onChange={(id) => setIds((current) => (side === 0 ? [id, current[1]] : [current[0], id]))}
                  />
                ))}
              </div>

              {/* The figures */}
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  {a.brand} {a.model} compared with {b.brand} {b.model}
                </caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{a.brand} {a.model}</th>
                    <th scope="col">Specification</th>
                    <th scope="col">{b.brand} {b.model}</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => {
                    const w = wins[i]
                    return (
                      <tr key={row.label} className="border-t border-border">
                        <Cell value={row.value(a)} win={w === 0} align="right" />
                        <th scope="row" className="w-36 bg-muted/40 px-2 py-2.5 text-center font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground sm:w-48 sm:text-[0.7rem]">
                          {row.label}
                        </th>
                        <Cell value={row.value(b)} win={w === 1} align="left" />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <CompareActions a={a} b={b} />
          </Reveal>
        ) : null}
      </div>
    </section>
  )
}

function Cell({ value, win, align }: { value: string; win: boolean; align: 'left' | 'right' }) {
  return (
    <td className={cn('px-3 py-2.5 tabular-nums sm:px-6', align === 'right' ? 'text-right' : 'text-left', win && 'font-bold text-primary')}>
      <span className={cn('inline-flex items-center gap-1.5', align === 'right' && 'flex-row-reverse')}>
        {value}
        {win ? (
          <>
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">(better)</span>
          </>
        ) : null}
      </span>
    </td>
  )
}

/** Every tyre in the range, the side's own brand first. */
function options(brand: string) {
  const sorted = [...products].sort((x, y) => x.model.localeCompare(y.model) || x.size.localeCompare(y.size))
  const own = sorted.filter((p) => p.brand === brand)
  const other = sorted.filter((p) => p.brand !== brand)
  return [
    { label: brand, items: own },
    { label: other[0]?.brand ?? 'Other', items: other },
  ]
}

function Contender({
  product,
  side,
  wins,
  leading,
  onChange,
}: {
  product: Product
  side: 0 | 1
  wins: number
  leading: boolean
  onChange: (id: string) => void
}) {
  const id = `compare-pick-${side}`
  const brand = side === 0 ? 'Greforce' : 'Lionshead'
  return (
    <div className={cn('flex flex-col items-center gap-3 p-4 text-center sm:p-6', side === 0 ? 'bg-gradient-to-b from-primary/[0.06] to-transparent' : '')}>
      <div className="flex items-center gap-2">
        <Badge variant={side === 0 ? 'primary' : 'charcoal'} size="sm">
          {product.brand}
        </Badge>
        {leading ? (
          <Badge variant="success" size="sm">
            <Trophy aria-hidden="true" className="h-3 w-3" />
            Wins {wins}
          </Badge>
        ) : (
          <span className="text-[0.7rem] text-muted-foreground">Wins {wins}</span>
        )}
      </div>
      <Link to={`/product/${product.id}`} className="block h-28 w-28 transition-transform hover:scale-105 sm:h-40 sm:w-40" aria-label={`View ${product.brand} ${product.model}`}>
        <ProductThumb brand={product.brand} model={product.model} tread={product.tread} />
      </Link>
      <div>
        <p className="font-heading text-lg font-black uppercase leading-tight sm:text-2xl">{product.model}</p>
        <p className="font-mono text-xs text-muted-foreground">{product.size}</p>
        {product.reviewCount > 0 ? <Rating value={product.rating} count={product.reviewCount} size="sm" className="mt-1 justify-center" /> : null}
      </div>
      <label htmlFor={id} className="sr-only">
        Change the {side === 0 ? 'first' : 'second'} tyre
      </label>
      <select
        id={id}
        value={product.id}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options(brand).map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.brand} {p.model} · {p.size}
                {p.position.length === 1 ? ` · ${POSITION_LABELS[p.position[0]!]}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}

function CompareActions({ a, b }: { a: Product; b: Product }) {
  const navigate = useNavigate()
  const add = useCart((s) => s.add)
  const open = useCart((s) => s.open)
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      {[a, b].map((p) =>
        hasPrice(p) ? (
          <Button
            key={p.id}
            variant="outline"
            onClick={() => {
              add(p)
              open()
            }}
          >
            <ShoppingCart aria-hidden="true" className="mr-2 h-4 w-4" />
            Add {p.model} — {priceLabel(effectivePrice(p))}
          </Button>
        ) : (
          <Button key={p.id} variant="outline" asChild>
            <Link to={`/product/${p.id}`}>
              {p.model}: price on application
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ),
      )}
      <Button
        onClick={() => {
          useCompare.setState({ ids: [...new Set([a.id, b.id])] })
          navigate('/compare')
        }}
      >
        <Scale aria-hidden="true" className="mr-2 h-4 w-4" />
        Full comparison
      </Button>
    </div>
  )
}
