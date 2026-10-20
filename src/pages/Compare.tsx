import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MessageSquareQuote, Plus, Scale, ShoppingCart, X } from 'lucide-react'
import type { Product } from '@/data/types'
import { effectivePrice, hasPrice, productById } from '@/data/products'
import { site } from '@/config/site'
import { cn, formatNumber, money, priceLabel, specValue } from '@/lib/utils'
import { useCart } from '@/store/cart'
import { MAX_COMPARE, requestQuote, toast, useCompare } from '@/store/ui'
import { Badge, Button, Rating } from '@/components/ui'
import { proportionsForProduct } from '@/components/three'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { fuelRank } from '@/components/shop/Filters'
import { ProductThumb } from '@/components/shop/ProductThumb'

/* ------------------------------------------------------------------ *
 * The comparison rows
 *
 * `better` is the whole point of this page. Where a row has a defensible
 * winner — deepest tread, highest load, best rolling resistance, lowest
 * price, highest rating, quietest — it gets flagged. Where "best" would be
 * a matter of what the truck does, it is left alone. A tyre with no figure
 * for a row (POA, or a spec the maker does not publish) sits that row out.
 * ------------------------------------------------------------------ */

interface Row {
  label: string
  render: (product: Product) => React.ReactNode
  metric?: (product: Product) => number | null
  better?: 'high' | 'low'
  note?: string
}

const ROWS: Row[] = [
  {
    label: 'Price per tyre',
    render: (product) => (
      <span className="font-heading text-lg font-black">
        {priceLabel(effectivePrice(product))}
      </span>
    ),
    metric: (product) => effectivePrice(product),
    better: 'low',
    note: 'Inc. GST, before volume breaks',
  },
  {
    label: 'Tread depth',
    render: (product) => specValue(product.treadDepthMm, (mm) => `${mm}mm`),
    metric: (product) => product.treadDepthMm,
    better: 'high',
    note: 'More rubber to wear through',
  },
  {
    label: 'Load per tyre',
    render: (product) => specValue(product.maxLoadKg, (kg) => `${formatNumber(kg)}kg`),
    metric: (product) => product.maxLoadKg,
    better: 'high',
    note: 'Single fitment, from the load index',
  },
  {
    label: 'Fuel rating',
    render: (product) => product.fuelRating ?? 'Not published',
    metric: (product) => fuelRank(product.fuelRating),
    better: 'low',
    note: 'Rolling resistance, A best',
  },
  {
    label: 'Customer rating',
    render: (product) =>
      product.reviewCount > 0 ? (
        <Rating value={product.rating} count={product.reviewCount} size="sm" />
      ) : (
        'No ratings yet'
      ),
    metric: (product) => (product.reviewCount > 0 ? product.rating : null),
    better: 'high',
  },
  {
    label: 'Top speed',
    render: (product) => specValue(product.maxSpeedKmh, (kmh) => `${kmh}km/h`),
    metric: (product) => product.maxSpeedKmh,
    better: 'high',
    note: 'From the speed symbol',
  },
  {
    label: 'Pass-by noise',
    render: (product) => specValue(product.noiseDb, (db) => `${db}dB`, 'Not published'),
    metric: (product) => product.noiseDb,
    better: 'low',
  },
  {
    label: 'Retreadable',
    render: (product) =>
      product.retreadable == null ? 'Not published' : product.retreadable ? 'Yes' : 'No',
    metric: (product) => (product.retreadable == null ? null : product.retreadable ? 1 : 0),
    better: 'high',
    note: 'Two to three further lives',
  },
  { label: 'Size', render: (product) => product.size },
  {
    label: 'Axle fitment',
    render: (product) => product.positionLabel,
    note: 'What the casing is rated for',
  },
  { label: 'Application', render: (product) => product.application },
  { label: 'Ply rating', render: (product) => product.ply },
  { label: 'Measuring rim', render: (product) => `${product.rim}in` },
  { label: 'Load index', render: (product) => specValue(product.loadIndex, (index) => index) },
  {
    label: 'Speed symbol',
    render: (product) => specValue(product.speedRating, (symbol) => symbol),
  },
  { label: 'Section width', render: (product) => `${product.sectionWidthMm}mm` },
  { label: 'Rim diameter', render: (product) => `${product.rimDiameterIn}in` },
  {
    label: 'Overall diameter',
    render: (product) => `${formatNumber(proportionsForProduct(product).overallDiameterMm)}mm`,
    note: 'Check this against your clearance',
  },
  {
    label: 'Severe service',
    render: (product) => (product.threePeak ? 'Rated' : 'No'),
  },
  {
    label: 'Availability',
    render: (product) =>
      !hasPrice(product)
        ? 'Built to order'
        : product.stock > 0
          ? `${formatNumber(product.stock)} in stock`
          : 'Pre-order',
  },
  { label: 'Tread pattern', render: (product) => product.tread },
  { label: 'SKU', render: (product) => product.sku },
]

/* ------------------------------------------------------------------ */

export default function Compare() {
  const ids = useCompare((state) => state.ids)
  const remove = useCompare((state) => state.remove)
  const clear = useCompare((state) => state.clear)
  const add = useCart((state) => state.add)

  const selected = useMemo(
    () =>
      ids
        .map((id) => productById.get(id))
        .filter((product): product is Product => Boolean(product))
        .slice(0, MAX_COMPARE),
    [ids],
  )

  /* Winning value per comparable row, or null when every tyre ties. */
  const winners = useMemo(() => {
    const map = new Map<string, number>()
    if (selected.length < 2) return map

    for (const row of ROWS) {
      if (!row.metric || !row.better) continue
      const values = selected
        .map(row.metric)
        .filter((value): value is number => value != null)
      // A "best" needs at least two tyres that actually have the figure.
      if (values.length < 2) continue
      const best =
        row.better === 'high' ? Math.max(...values) : Math.min(...values)
      // Nothing to flag if they are all the same.
      if (values.every((value) => value === best)) continue
      map.set(row.label, best)
    }
    return map
  }, [selected])

  const jsonLd = useMemo(
    () =>
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: 'Compare', path: '/compare' },
      ]),
    [],
  )

  const handleAdd = (product: Product) => {
    if (!hasPrice(product)) {
      requestQuote(product)
      return
    }
    add(product)
    toast({
      title: product.stock > 0 ? 'Added to cart' : 'Added as pre-order',
      description: `${product.brand} ${product.model} — ${product.size}`,
      variant: 'success',
    })
  }

  return (
    <>
      <Seo
        title={`Compare Truck Tyres | ${site.name}`}
        description="Put up to four truck tyres side by side on tread depth, load rating, rolling resistance, price and customer rating."
        canonicalPath="/compare"
        jsonLd={jsonLd}
        noIndex
      />

      <header className="border-b border-border bg-card">
        <div className="shell py-10 md:py-12">
          <p className="eyebrow">
            <Scale aria-hidden="true" className="h-3.5 w-3.5" />
            Side by side
          </p>
          <h1 className="display-2 mt-3">Compare tyres</h1>
          <p className="lede mt-4 max-w-2xl">
            {selected.length >= 2
              ? `${selected.length} of ${MAX_COMPARE} selected. The best figure in every comparable row is flagged — on price, tread, load, rolling resistance, noise and rating.`
              : `Pick up to ${MAX_COMPARE} tyres and we will line up every spec that matters, with the best figure in each row flagged.`}
          </p>

          {selected.length > 0 ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <Link to="/shop">
                  <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
                  Add another tyre
                </Link>
              </Button>
              <button
                type="button"
                onClick={clear}
                className="rounded-md px-2 py-1 text-sm font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Clear the comparison
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {selected.length < 2 ? (
        <EmptyState count={selected.length} selected={selected} onRemove={remove} />
      ) : (
        <section className="shell py-8 md:py-12">
          {/* Horizontal scroll with the label column pinned ------- */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Specification comparison of {selected.length} truck tyres
              </caption>

              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-40 min-w-[9rem] border-b border-r border-border bg-card p-3 text-left align-bottom font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground sm:w-48"
                  >
                    Specification
                  </th>

                  {selected.map((product) => (
                    <th
                      key={product.id}
                      scope="col"
                      className="min-w-[14rem] border-b border-r border-border bg-card p-4 text-left align-top last:border-r-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="h-16 w-16 shrink-0">
                          <ProductThumb
                            brand={product.brand}
                            model={product.model}
                            tread={product.tread}
                            alt={`${product.brand} ${product.model} ${product.size}`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(product.id)}
                          aria-label={`Remove ${product.brand} ${product.model} ${product.size} from the comparison`}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </div>

                      <p className="mt-3 font-heading text-[0.6rem] font-bold uppercase tracking-brand text-primary">
                        {product.brand}
                      </p>
                      <p className="mt-0.5 font-heading text-base font-bold leading-tight">
                        <Link
                          to={`/product/${product.id}`}
                          className="transition-colors hover:text-primary"
                        >
                          {product.model}
                        </Link>
                      </p>
                      <p className="mt-0.5 font-mono text-xs font-semibold text-muted-foreground">
                        {product.size}
                      </p>

                      <p className="mt-2 flex items-baseline gap-2">
                        <span className="font-heading text-xl font-black">
                          {priceLabel(effectivePrice(product))}
                        </span>
                        {product.discountPrice != null && product.price != null ? (
                          <span className="text-xs text-muted-foreground line-through">
                            {money(product.price)}
                          </span>
                        ) : null}
                      </p>

                      {hasPrice(product) ? (
                        <Button
                          size="sm"
                          onClick={() => handleAdd(product)}
                          variant={product.stock > 0 ? 'primary' : 'outline'}
                          className="mt-3 w-full"
                        >
                          <ShoppingCart aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                          {product.stock > 0 ? 'Add to cart' : 'Pre-order'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAdd(product)}
                          variant="outline"
                          className="mt-3 w-full"
                        >
                          <MessageSquareQuote aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                          Request a quote
                        </Button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {ROWS.map((row, index) => {
                  const best = winners.get(row.label)
                  return (
                    <tr
                      key={row.label}
                      className={index % 2 === 1 ? 'bg-muted/30' : undefined}
                    >
                      <th
                        scope="row"
                        className={cn(
                          'sticky left-0 z-10 border-b border-r border-border p-3 text-left align-top',
                          index % 2 === 1 ? 'bg-muted/95' : 'bg-card',
                        )}
                      >
                        <span className="font-heading text-xs font-bold uppercase tracking-wide">
                          {row.label}
                        </span>
                        {row.note ? (
                          <span className="mt-0.5 block text-[0.65rem] font-normal leading-snug text-muted-foreground">
                            {row.note}
                          </span>
                        ) : null}
                      </th>

                      {selected.map((product) => {
                        const isBest =
                          best != null &&
                          row.metric != null &&
                          row.metric(product) === best

                        return (
                          <td
                            key={product.id}
                            className={cn(
                              'border-b border-r border-border p-3 align-top last:border-r-0',
                              isBest && 'bg-primary/10',
                            )}
                          >
                            <span
                              className={cn(
                                'flex flex-wrap items-center gap-2',
                                isBest && 'font-semibold text-primary',
                              )}
                            >
                              <span>{row.render(product)}</span>
                              {isBest ? (
                                <Badge variant="primary" size="sm">
                                  Best
                                </Badge>
                              ) : null}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground lg:hidden">
            Scroll the table sideways to see every tyre — the spec names stay put.
          </p>

          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            A flagged figure is the best number in that row, not the best tyre. A
            deep lug wins on tread depth and loses on rolling resistance, which is
            exactly the trade you are choosing between. If you want a second
            opinion on the trade-off, call{' '}
            <a
              href={site.phone.href}
              className="font-semibold text-primary hover:underline"
            >
              {site.phone.display}
            </a>{' '}
            — {site.hours.short}.
          </p>
        </section>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Empty state — nothing to compare, or only one tyre picked
 * ------------------------------------------------------------------ */

function EmptyState({
  count,
  selected,
  onRemove,
}: {
  count: number
  selected: Product[]
  onRemove: (id: string) => void
}) {
  const only = selected[0]

  return (
    <section className="shell py-10 md:py-16">
      <div className="rounded-lg border border-border bg-card p-6 sm:p-10">
        <Badge variant="outline">
          {count} of {MAX_COMPARE} selected
        </Badge>

        <h2 className="display-3 mt-4">
          {count === 0
            ? 'Nothing selected yet'
            : 'One more and we can compare them'}
        </h2>

        <p className="lede mt-3 max-w-2xl">
          {count === 0 ? (
            <>
              A comparison needs at least two tyres. On any product card in the
              shop, hit the <strong className="text-foreground">+</strong> button in
              the top-right corner to add it here — up to {MAX_COMPARE} at a time.
            </>
          ) : (
            <>
              You have the {only?.brand} {only?.model} ready. Add a second tyre and
              we will line up tread depth, load rating, rolling resistance, noise,
              price and rating, flagging the best figure in every row.
            </>
          )}
        </p>

        {only ? (
          <div className="mt-6 flex max-w-sm items-center gap-4 rounded-lg border border-border bg-background p-4">
            <div className="h-14 w-14 shrink-0">
              <ProductThumb
                brand={only.brand}
                model={only.model}
                tread={only.tread}
                alt={`${only.brand} ${only.model} ${only.size}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[0.6rem] font-bold uppercase tracking-brand text-primary">
                {only.brand}
              </p>
              <p className="truncate font-heading text-sm font-bold">{only.model}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {only.size} · {priceLabel(effectivePrice(only))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(only.id)}
              aria-label={`Remove ${only.brand} ${only.model} from the comparison`}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to="/shop">
              {count === 0 ? 'Browse the range' : 'Pick another tyre'}
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/finder">Find my size first</Link>
          </Button>
        </div>

        <ul className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
          <Hint title="Up to four at once">
            Four is as many as fits side by side and stays readable. Remove one to
            make room for another.
          </Hint>
          <Hint title="It follows you around">
            Your selection is kept in this browser, so the tray at the bottom of
            the screen stays with you across the whole site.
          </Hint>
          <Hint title="Compare like for like">
            Comparing a steer rib against a drive lug will tell you less than
            comparing two patterns rated for the same axle. Filter by axle in the{' '}
            <Link to="/shop" className="font-semibold text-primary hover:underline">
              shop
            </Link>{' '}
            first.
          </Hint>
        </ul>
      </div>
    </section>
  )
}

function Hint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <h3 className="font-heading text-sm font-bold uppercase tracking-wide">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </li>
  )
}
