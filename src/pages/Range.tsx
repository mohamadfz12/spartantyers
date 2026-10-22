import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Phone, Search } from 'lucide-react'
import { site } from '@/config/site'
import {
  POSITION_LABELS,
  allApplications,
  allRimDiameters,
  allSizes,
  lowestPrice,
  poaProducts,
  priceRange,
  pricedProducts,
  products,
  productsForPosition,
} from '@/data/products'
import { stockedBrands } from '@/data/brands'
import type { AxlePosition, Product } from '@/data/types'
import { money, pluralise, priceLabel } from '@/lib/utils'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { StaticWheel } from '@/components/three'
import { Reveal, Stagger } from '@/components/motion'
import { Icon } from '@/components/Icon'
import { CtaBand, PageHero, SectionHeading } from '@/components/marketing'
import { useCatalogueVersion } from '@/lib/live-catalogue'

/* ------------------------------------------------------------------ *
 * /products — the range overview
 *
 * Every count, size and price on this page is computed from the live
 * catalogue, so the page cannot describe a range we no longer carry.
 * Groups overlap where a casing is rated for more than one axle, which
 * is stated rather than hidden.
 * ------------------------------------------------------------------ */

interface Category {
  key: string
  title: string
  icon: string
  body: string
  match: (product: Product) => boolean
  href: string
  linkLabel: string
}

const CATEGORIES: Category[] = [
  {
    key: 'truck',
    title: 'Commercial truck',
    icon: 'Truck',
    body: 'The 22.5in heavy fitments: steer ribs, drive lugs and all-position casings for prime movers, tippers and heavy rigids. This is the deepest part of our stock and where the volume fitments sit.',
    match: (product) =>
      product.rimDiameterIn === 22.5 &&
      (product.position.includes('steer') || product.position.includes('drive')),
    href: '/shop?rim=22.5',
    linkLabel: 'Browse 22.5in',
  },
  {
    key: 'light',
    title: 'Light commercial',
    icon: 'Package',
    body: 'The 17.5in metro and light-truck fitments for delivery rigids, reefers and work utes. Chosen for kerb resistance and even wear through stop-start duty cycles rather than for tread depth.',
    match: (product) => product.rimDiameterIn === 17.5,
    href: '/shop?rim=17.5',
    linkLabel: 'Browse 17.5in',
  },
  {
    key: 'bus',
    title: 'Bus and trailer',
    icon: 'Route',
    body: 'The 19.5in all-position and drive patterns that turn up on buses, motorhomes and medium rigids, plus every trailer-rated casing in the range — including the 385/65R22.5 super-single.',
    match: (product) => product.rimDiameterIn === 19.5 || product.position.includes('trailer'),
    href: '/shop?position=trailer',
    linkLabel: 'Browse trailer fitments',
  },
  {
    key: 'mixed',
    title: 'Mixed orders',
    icon: 'Boxes',
    body: 'For workshops and dealerships: any combination of sizes, brands and axle positions on one order. The volume break looks at the total quantity, not the line, and there is no case quantity.',
    match: () => true,
    href: '/wholesale',
    linkLabel: 'Trade and wholesale',
  },
]

const POSITION_NOTE: Record<AxlePosition, string> = {
  steer: 'Continuous ribs for precise response and even wear on the front axle.',
  drive: 'Block and lug patterns with deeper tread for traction under torque.',
  trailer: 'Closed-shoulder ribs built for scrub resistance and free-rolling life.',
}

export default function Range() {
  const catalogue = useCatalogueVersion()
  /** Sizes grouped by rim diameter, with a count and a real price floor. */
  const byRim = useMemo(
    () =>
      allRimDiameters.map((rim) => {
        const matching = products.filter((product) => product.rimDiameterIn === rim)
        const sizes = [...new Set(matching.map((product) => product.size))]
        return {
          rim,
          count: matching.length,
          sizes,
          from: lowestPrice(matching),
        }
      }),
    [catalogue],
  )

  const byApplication = useMemo(
    () =>
      allApplications.map((application) => {
        const matching = products.filter((product) => product.application === application)
        return {
          application,
          count: matching.length,
          from: lowestPrice(matching),
          sizes: [...new Set(matching.map((product) => product.size))].length,
        }
      }),
    [catalogue],
  )

  return (
    <>
      <Seo
        title="Full Tyre Range — Truck, Light Commercial, Bus & Trailer | Spartan Tyres"
        description={`${products.length} commercial tyre lines across ${allSizes.length} sizes, from ${money(priceRange.min)} a tyre. Steer, drive, trailer and all-position fitments in 17.5in, 19.5in and 22.5in, from our Yennora warehouse or built to order.`}
        canonicalPath="/products"
        jsonLd={breadcrumbJsonLd([{ name: 'Range', path: '/products' }])}
      />

      <PageHero
        eyebrow="The range"
        title="Every fitment we carry, and how to find yours"
        lede={`${products.length} lines across ${allSizes.length} sizes: ${pricedProducts.length} sold online from ${money(priceRange.min)} to ${money(priceRange.max)} a tyre, and ${poaProducts.length} built to order and quoted on request. We are an independent supplier, so if the fitment you need is outside the range we will source it rather than talk you into something else.`}
        breadcrumb={[{ name: 'Range', path: '/products' }]}
        actions={
          <>
            <Button asChild size="lg">
              <Link to="/shop">
                Browse all tyres
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/finder">
                <Search aria-hidden="true" className="h-4 w-4" />
                Find by size or vehicle
              </Link>
            </Button>
          </>
        }
        visual={
          <div className="relative mx-auto max-w-sm rounded-lg border border-border bg-background p-6 shadow-lift">
            <StaticWheel
              tread="lug"
              label="Greforce"
              size="11R22.5"
              className="mx-auto h-36 w-36"
              title="Commercial drive tyre, deep open lug pattern"
            />
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Lines
                </dt>
                <dd className="mt-1 font-heading text-2xl font-black leading-none tabular-nums text-primary">
                  {products.length}
                </dd>
              </div>
              <div>
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Sizes
                </dt>
                <dd className="mt-1 font-heading text-2xl font-black leading-none tabular-nums text-primary">
                  {allSizes.length}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Brands stocked
                </dt>
                <dd className="mt-1.5 text-muted-foreground">
                  {stockedBrands.map((brand) => brand.name).join(' and ')}
                </dd>
              </div>
            </dl>
          </div>
        }
      />

      {/* ---------------- Categories ---------------- */}
      <section className="section" aria-labelledby="range-categories">
        <div className="shell">
          <SectionHeading
            id="range-categories"
            eyebrow="By the job"
            title="Four ways into the catalogue"
            lede="Most casings are rated for more than one axle position, so these groups deliberately overlap. Start with the one that matches the vehicle."
          />

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2">
            {CATEGORIES.map((category) => {
              const count = products.filter(category.match).length
              return (
                <div
                  key={category.key}
                  className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/50 md:p-8"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                      <Icon name={category.icon} className="h-6 w-6" />
                    </span>
                    <Badge variant="outline">
                      {category.key === 'mixed'
                        ? 'Any combination'
                        : `${count} ${pluralise(count, 'line')}`}
                    </Badge>
                  </div>

                  <h3 className="mt-5 font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                    {category.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {category.body}
                  </p>

                  <Link
                    to={category.href}
                    className="mt-6 inline-flex items-center gap-2 self-start font-heading text-sm font-bold uppercase tracking-wide text-primary"
                  >
                    {category.linkLabel}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 ease-brand group-hover:translate-x-1"
                    />
                  </Link>
                </div>
              )
            })}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Axle position ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="range-position"
      >
        <div className="shell">
          <SectionHeading
            id="range-position"
            eyebrow="By axle position"
            title="Steer, drive and trailer"
            lede={
              <>
                A heavy vehicle asks three different things of its tyres.{' '}
                <Link to="/guide" className="link-underline font-semibold text-primary">
                  The tyre guide
                </Link>{' '}
                explains what happens when a pattern ends up on the wrong axle.
              </>
            }
          />

          <Stagger className="mt-10 grid gap-5 lg:grid-cols-3">
            {(Object.keys(POSITION_LABELS) as AxlePosition[]).map((position) => {
              const matching = productsForPosition(position)
              const from = lowestPrice(matching)
              return (
                <Link
                  key={position}
                  to={`/shop?position=${position}`}
                  className="group flex h-full flex-col rounded-lg border border-border bg-background p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                      {POSITION_LABELS[position]}
                    </h3>
                    <span className="font-heading text-2xl font-black leading-none tabular-nums text-primary">
                      {matching.length}
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {POSITION_NOTE[position]}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-brand text-primary">
                    {from != null ? `From ${money(from)}` : 'Price on application'}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 transition-transform duration-300 ease-brand group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              )
            })}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Rim diameter ---------------- */}
      <section className="section-tight" aria-labelledby="range-rim">
        <div className="shell">
          <SectionHeading
            id="range-rim"
            eyebrow="By rim diameter"
            title="Every size we carry"
            lede="Rim diameter is the one figure on a sidewall with no tolerance at all, so it is the fastest way to narrow the catalogue."
          />

          <Reveal className="mt-10 overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Sizes in the range grouped by rim diameter, with line counts and starting prices
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-3 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground md:px-6"
                  >
                    Rim
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground md:px-6"
                  >
                    Sizes
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground md:px-6"
                  >
                    Lines
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground md:px-6"
                  >
                    From
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byRim.map((group) => (
                  <tr key={group.rim} className="align-top">
                    <th
                      scope="row"
                      className="px-4 py-4 font-heading text-base font-bold uppercase tracking-tight text-foreground md:px-6"
                    >
                      <Link
                        to={`/shop?rim=${group.rim}`}
                        className="link-underline hover:text-primary"
                      >
                        {group.rim}in
                      </Link>
                    </th>
                    <td className="px-4 py-4 md:px-6">
                      <ul className="flex flex-wrap gap-2">
                        {group.sizes.map((size) => (
                          <li key={size}>
                            <Link
                              to={`/shop?size=${encodeURIComponent(size)}`}
                              className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 font-heading text-xs font-bold tracking-tight text-muted-foreground transition-colors duration-200 hover:border-primary/50 hover:text-primary"
                            >
                              {size}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-4 text-right font-heading font-bold tabular-nums text-foreground md:px-6">
                      {group.count}
                    </td>
                    <td className="px-4 py-4 text-right font-heading font-bold tabular-nums text-primary md:px-6">
                      {priceLabel(group.from)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Application ---------------- */}
      <section
        className="section border-t border-border bg-card"
        aria-labelledby="range-application"
      >
        <div className="shell">
          <SectionHeading
            id="range-application"
            eyebrow="By duty cycle"
            title="What the truck actually does"
            lede="The honest trade is between fuel and casing strength. Linehaul rewards low rolling resistance; site and gravel work rewards a cut-resistant compound and a stronger sidewall."
          />

          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {byApplication.map((group) => (
              <Link
                key={group.application}
                to={`/shop?application=${encodeURIComponent(group.application)}`}
                className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-5 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
              >
                <div className="min-w-0">
                  <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                    {group.application}
                  </h3>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {group.count} {pluralise(group.count, 'line')} across {group.sizes}{' '}
                    {pluralise(group.sizes, 'size')} —{' '}
                    {group.from != null ? `from ${money(group.from)}` : 'price on application'}
                  </p>
                </div>
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-primary transition-transform duration-300 ease-brand group-hover:translate-x-1"
                />
              </Link>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Sourcing ---------------- */}
      <section className="section-tight" aria-labelledby="range-sourcing">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="range-sourcing"
                eyebrow="Independent supplier"
                title="If it is not in the range, we will go and find it"
                lede="We are not tied to one manufacturer's catalogue. The range we stock is deliberately focused, and anything outside it gets sourced rather than substituted."
              />
              <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Our range covers {allSizes.length} sizes across{' '}
                  {stockedBrands.map((brand) => brand.name).join(' and ')}, with published
                  prices from {money(priceRange.min)} to {money(priceRange.max)} a tyre — so
                  there is a genuine budget option and a genuine premium option in most
                  fitments rather than one price point.
                </p>
                <p>
                  Specialty and hard-to-find sizes are sourced through our partner{' '}
                  {site.partner.name} and our wider supplier network. Send the size, load
                  index, speed symbol and quantity and we come back with availability, lead
                  time and price before you commit to anything.
                </p>
                <p>
                  Out-of-stock lines can be pre-ordered, which allocates you stock from the
                  next shipment rather than putting you on a waiting list. Lines marked POA
                  are built to order: we quote price and lead time before you commit.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/contact">
                    Ask about a fitment
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href={site.phone.href}>
                    <Phone aria-hidden="true" className="h-4 w-4" />
                    {site.phone.display}
                  </a>
                </Button>
              </div>
            </div>

            <Reveal direction="left" className="min-w-0">
              <div className="rounded-lg border border-border bg-card p-6 md:p-8">
                <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                  Not sure which fitment you need?
                </h3>
                <ul className="mt-5 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
                  <li className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>
                      Read the size off the sidewall of the tyre currently on the vehicle —
                      something like 11R22.5 or 295/80R22.5 — and enter it in the{' '}
                      <Link
                        to="/finder"
                        className="link-underline font-semibold text-primary"
                      >
                        Tyre Finder
                      </Link>
                      .
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>
                      Check the load index and speed symbol that follow the size as well. Two
                      tyres in the same size can carry different ratings.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span>
                      Send us a photo of the sidewall on {site.phone.display} and we will
                      confirm it against your vehicle compliance plate before you order.
                    </span>
                  </li>
                </ul>

                <Button asChild variant="outline" className="mt-7">
                  <Link to="/guide">
                    How to read a tyre size
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
