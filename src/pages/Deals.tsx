import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Flame, Info, Percent, Phone, Tag } from 'lucide-react'
import type { Product } from '@/data/types'
import {
  PRICE_BREAKS,
  dealProducts,
  effectivePrice,
  products,
  type PricedProduct,
} from '@/data/products'
import { site } from '@/config/site'
import { cn, formatNumber, money, pluralise } from '@/lib/utils'
import { Badge, Button } from '@/components/ui'
import { Counter, Reveal } from '@/components/motion'
import { StaticWheel } from '@/components/three'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { ProductCard } from '@/components/shop/ProductCard'
import { QuickView } from '@/components/shop/QuickView'

/** A set of four is one axle end; eight is a full drive group. */
const SET_SIZES = [4, 8] as const

function savingPerTyre(product: PricedProduct): number {
  return product.price - effectivePrice(product)
}

/**
 * Current promotions.
 *
 * The honest version of a deals page: the discount is stated per tyre and per
 * set, because nobody buys one truck tyre, and the volume breaks are laid out
 * in full so the headline percentage is never the whole story.
 */
export default function Deals() {
  const [quickView, setQuickView] = useState<Product | null>(null)

  const deals = dealProducts
  const headline = deals[0]
  const totalSavingOnASet = useMemo(
    () => deals.reduce((sum, product) => sum + savingPerTyre(product) * 4, 0),
    [deals],
  )

  const jsonLd = useMemo(
    () =>
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Deals', path: '/deals' },
      ]),
    [],
  )

  return (
    <>
      <Seo
        title={`Truck Tyre Deals${headline ? ` — Save up to ${headline.discount}%` : ''} | ${site.name}`}
        description={
          headline
            ? `${deals.length} Greforce and Lionshead lines on promotion right now, up to ${headline.discount}% off. Prices include GST, with automatic volume discounts from ${PRICE_BREAKS[0].min} tyres.`
            : 'Current truck tyre promotions from Spartan Tyres. Automatic volume discounts apply on every order of four tyres or more.'
        }
        canonicalPath="/deals"
        jsonLd={jsonLd}
      />

      {/* Hero -------------------------------------------------- */}
      <header className="relative overflow-hidden border-b border-border bg-charcoal text-charcoal-foreground">
        <div
          aria-hidden="true"
          className="tread-texture pointer-events-none absolute inset-0 opacity-40"
        />
        <div
          aria-hidden="true"
          className="hazard pointer-events-none absolute inset-x-0 top-0 h-1.5 opacity-80"
        />

        <div className="shell relative grid gap-10 py-12 md:py-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="eyebrow">
              <Flame aria-hidden="true" className="h-3.5 w-3.5" />
              Current promotions
            </p>

            {headline ? (
              <>
                <h1 className="display-1 mt-4">
                  Save up to{' '}
                  <span className="text-primary">
                    <Counter value={headline.discount ?? 0} suffix="%" />
                  </span>{' '}
                  per tyre
                </h1>
                <p className="lede mt-5 max-w-xl text-charcoal-foreground/75">
                  The biggest cut on the floor right now is the{' '}
                  <Link
                    to={`/product/${headline.id}`}
                    className="font-semibold text-primary hover:underline"
                  >
                    {headline.brand} {headline.model}
                  </Link>{' '}
                  in {headline.size} — down to {money(effectivePrice(headline))} from{' '}
                  {money(headline.price)}, a saving of{' '}
                  {money(savingPerTyre(headline))} a tyre or{' '}
                  {money(savingPerTyre(headline) * 4)} across a set of four.
                </p>

                <dl className="mt-8 grid max-w-xl grid-cols-3 gap-4">
                  <HeroStat
                    label="Lines on promotion"
                    value={String(deals.length)}
                    detail={`of ${products.length} in the range`}
                  />
                  <HeroStat
                    label="Deepest cut"
                    value={`${headline.discount}%`}
                    detail={`${money(savingPerTyre(headline))} per tyre`}
                  />
                  <HeroStat
                    label="Across every deal"
                    value={money(Math.round(totalSavingOnASet))}
                    detail="if you bought a set of four of each"
                  />
                </dl>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg">
                    <a href="#deal-grid">
                      See every deal
                      <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link to="/shop">Browse the full range</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h1 className="display-1 mt-4">No promotions running today</h1>
                <p className="lede mt-5 max-w-xl text-charcoal-foreground/75">
                  Nothing in the range is discounted at the moment — but the volume
                  breaks below apply to every order, every day, and they are usually
                  worth more than a promotion on a single line. Call{' '}
                  {site.phone.display} and we will price your fleet order properly.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg">
                    <Link to="/shop">
                      Browse the full range
                      <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <a href={site.phone.href}>
                      <Phone aria-hidden="true" className="mr-2 h-4 w-4" />
                      {site.phone.display}
                    </a>
                  </Button>
                </div>
              </>
            )}
          </div>

          {headline ? (
            <div className="relative mx-auto w-full max-w-sm">
              <div className="absolute -right-2 -top-2 z-10">
                <Badge variant="destructive" className="shadow-lift">
                  Save {headline.discount}%
                </Badge>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
                <StaticWheel
                  tread={headline.tread}
                  label={headline.brand}
                  size={headline.size}
                  spin
                  className="drop-shadow-2xl"
                  title={`${headline.brand} ${headline.model} ${headline.size}`}
                />
                <p className="mt-5 text-center font-heading text-sm font-bold uppercase tracking-wide">
                  {headline.brand} {headline.model}
                </p>
                <p className="mt-1 text-center font-mono text-xs text-charcoal-foreground/70">
                  {headline.size}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {/* Deal grid --------------------------------------------- */}
      <section id="deal-grid" className="section-tight">
        <div className="shell">
          <Reveal>
            <p className="eyebrow">
              <Tag aria-hidden="true" className="h-3.5 w-3.5" />
              Discounted lines
            </p>
            <h2 className="display-3 mt-2">
              {deals.length > 0
                ? `${deals.length} ${pluralise(deals.length, 'line')} on promotion`
                : 'Nothing discounted right now'}
            </h2>
            <p className="lede mt-3 max-w-2xl">
              Every price shown includes GST. The saving under each card is the
              promotion only — volume breaks come off on top of it in the cart.
            </p>
          </Reveal>

          {deals.length > 0 ? (
            <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {deals.map((product) => {
                const saving = savingPerTyre(product)
                return (
                  <li key={product.id} className="flex flex-col">
                    <ProductCard
                      product={product}
                      onQuickView={setQuickView}
                      className="flex-1"
                    />

                    <div className="mt-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
                      <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-primary">
                        You save
                      </p>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                        <SavingCell label="Per tyre" value={money(saving)} />
                        {SET_SIZES.map((count) => (
                          <SavingCell
                            key={count}
                            label={`Set of ${count}`}
                            value={money(saving * count)}
                          />
                        ))}
                      </dl>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="mt-8 rounded-lg border border-border bg-card p-6 sm:p-10">
              <h3 className="font-heading text-lg font-bold uppercase tracking-wide">
                Check back, or ask us directly
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Promotions rotate with what lands in the container. In the meantime
                the volume breaks below apply to every order, and on anything over{' '}
                {site.commerce.bulkThreshold} tyres we will quote you specifically —
                call {site.phone.display}, {site.hours.short}.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/shop">
                    Browse all {products.length} lines
                    <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href={site.phone.href}>
                    <Phone aria-hidden="true" className="mr-2 h-4 w-4" />
                    {site.phone.display}
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Volume breaks ----------------------------------------- */}
      <section className="section-tight border-t border-border bg-card/40">
        <div className="shell">
          <Reveal>
            <p className="eyebrow">
              <Percent aria-hidden="true" className="h-3.5 w-3.5" />
              Automatic volume pricing
            </p>
            <h2 className="display-3 mt-2">The more you fit, the less each one is</h2>
            <p className="lede mt-3 max-w-2xl">
              These breaks are applied by the cart on the total number of tyres in
              the order — you do not need a code, an account or a phone call, and
              they stack on top of any promotion above.
            </p>
          </Reveal>

          <div className="mt-8 overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <caption className="sr-only">
                Volume discount breaks and the resulting per-tyre price on the{' '}
                {headline
                  ? `${headline.brand} ${headline.model}`
                  : 'cheapest line in the range'}
              </caption>
              <thead>
                <tr className="border-b-2 border-border">
                  <th
                    scope="col"
                    className="py-3 pr-4 text-left font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                  >
                    Tyres in the order
                  </th>
                  <th
                    scope="col"
                    className="py-3 pr-4 text-right font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                  >
                    Discount
                  </th>
                  {headline ? (
                    <>
                      <th
                        scope="col"
                        className="py-3 pr-4 text-right font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                      >
                        {headline.model} per tyre
                      </th>
                      <th
                        scope="col"
                        className="py-3 text-right font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                      >
                        Saved vs. list
                      </th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 text-left font-semibold">
                    1 – {PRICE_BREAKS[0].min - 1} tyres
                  </th>
                  <td className="py-3 pr-4 text-right text-muted-foreground">—</td>
                  {headline ? (
                    <>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                        {money(effectivePrice(headline))}
                      </td>
                      <td className="py-3 text-right tabular-nums text-muted-foreground">
                        {money(savingPerTyre(headline))}
                      </td>
                    </>
                  ) : null}
                </tr>

                {PRICE_BREAKS.map((breakPoint, index) => {
                  const next = PRICE_BREAKS[index + 1]
                  const range = next
                    ? `${breakPoint.min} – ${next.min - 1} tyres`
                    : `${breakPoint.min}+ tyres`
                  const unit = headline
                    ? effectivePrice(headline) * (1 - breakPoint.discount)
                    : 0
                  return (
                    <tr key={breakPoint.min} className="border-b border-border">
                      <th scope="row" className="py-3 pr-4 text-left font-semibold">
                        {range}
                      </th>
                      <td className="py-3 pr-4 text-right font-semibold tabular-nums text-primary">
                        {Math.round(breakPoint.discount * 100)}% off
                      </td>
                      {headline ? (
                        <>
                          <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                            {money(unit)}
                          </td>
                          <td className="py-3 text-right tabular-nums text-muted-foreground">
                            {money(headline.price - unit)}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {headline ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Worked on the {headline.brand} {headline.model} {headline.size} at its
              promotional price of {money(effectivePrice(headline))}. Your own
              figures depend on the lines you order.
            </p>
          ) : null}

          {/* Payment & GST ----------------------------------- */}
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <InfoCard title="Prices include GST">
              Every price on this site is GST inclusive, so the number on the card
              is the number you pay. Your tax invoice itemises the GST component.
            </InfoCard>
            <InfoCard title="Afterpay available">
              Afterpay is available on orders up to{' '}
              {money(site.commerce.afterpayMaxOrder)}. Split the order into four
              instalments and fit the tyres now.
            </InfoCard>
            <InfoCard
              title={`${formatNumber(site.commerce.bulkThreshold)}+ tyres`}
            >
              Bulk orders are palletised for forklift unloading and freighted
              specifically rather than sent through a parcel network. Call{' '}
              {site.phone.display} to line it up.
            </InfoCard>
          </div>
        </div>
      </section>

      <QuickView product={quickView} onClose={() => setQuickView(null)} />
    </>
  )
}

/* ------------------------------------------------------------------ */

function HeroStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div>
      <dt className="font-heading text-[0.6rem] font-bold uppercase tracking-brand text-charcoal-foreground/60">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-xl font-black leading-none sm:text-2xl">
        {value}
        <span className="mt-1 block font-sans text-[0.68rem] font-normal leading-snug text-charcoal-foreground/60">
          {detail}
        </span>
      </dd>
    </div>
  )
}

function SavingCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <dt className="font-heading text-[0.58rem] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-heading text-sm font-black tabular-nums text-primary">
        {value}
      </dd>
    </div>
  )
}

function InfoCard({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <article className={cn('rounded-lg border border-border bg-card p-5', className)}>
      <h3 className="flex items-start gap-2 font-heading text-sm font-bold uppercase tracking-wide">
        <Info aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-primary" />
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </article>
  )
}
