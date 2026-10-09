import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink, Phone } from 'lucide-react'
import { site } from '@/config/site'
import { BRANDS_SUBTITLE, brands, sourcedBrands, stockedBrands } from '@/data/brands'
import { allSizes, products } from '@/data/products'
import { pluralise } from '@/lib/utils'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { BrandMark } from '@/components/brand/BrandMark'
import { Reveal, Stagger, Tilt } from '@/components/motion'
import { CtaBand, PageHero, SectionHeading } from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /brands
 *
 * The single most important distinction on this page is stocked versus
 * sourced. It is modelled in src/data/brands.ts rather than left to the
 * copy, and rendered as two visually different groups so a visitor
 * cannot mistake one for the other.
 * ------------------------------------------------------------------ */

export default function Brands() {
  const itemListJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `Tyre brands available from ${site.name}`,
      description: BRANDS_SUBTITLE,
      numberOfItems: brands.length,
      itemListElement: brands.map((brand, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'Brand',
          name: brand.name,
          description: brand.blurb,
          url: brand.external ? brand.href : `${site.url}${brand.href}`,
        },
      })),
    }),
    [],
  )

  return (
    <>
      <Seo
        title="Tyre Brands — Stocked and Sourced | Spartan Tyres"
        description={BRANDS_SUBTITLE}
        canonicalPath="/brands"
        jsonLd={[itemListJsonLd, breadcrumbJsonLd([{ name: 'Brands', path: '/brands' }])]}
      />

      <PageHero
        eyebrow="Brands"
        title="Two brands in our warehouse, the rest through our partner"
        lede={BRANDS_SUBTITLE}
        breadcrumb={[{ name: 'Brands', path: '/brands' }]}
        actions={
          <>
            <Button asChild size="lg">
              <Link to="/shop">
                Shop stocked brands
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={site.phone.href}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                {site.phone.display}
              </a>
            </Button>
          </>
        }
      />

      {/* ---------------- Stocked ---------------- */}
      <section className="section" aria-labelledby="brands-stocked">
        <div className="shell">
          <SectionHeading
            id="brands-stocked"
            eyebrow="In stock at Yennora"
            title="Stocked brands"
            lede={`${products.length} lines across ${allSizes.length} sizes, held in our own warehouse and dispatched within ${site.commerce.dispatchWindow}. These are the brands we can quote a real stock figure on.`}
          />

          <Stagger className="mt-10 grid gap-6 md:grid-cols-2">
            {stockedBrands.map((brand) => (
              <Tilt key={brand.name} className="group h-full">
                <Link
                  to={brand.href}
                  className="relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary md:p-8"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />

                  <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <BrandMark name={brand.name} size="lg" className="items-start" />
                    <Badge variant="success">In stock</Badge>
                  </div>

                  <dl className="relative mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                    <div>
                      <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                        Lines carried
                      </dt>
                      <dd className="mt-1 font-heading text-2xl font-black leading-none tabular-nums text-primary">
                        {brand.skuCount}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                        Origin
                      </dt>
                      <dd className="mt-1.5 text-muted-foreground">{brand.origin}</dd>
                    </div>
                  </dl>

                  <p className="relative mt-5 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {brand.blurb}
                  </p>

                  <span className="relative mt-6 inline-flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-primary">
                    Shop {brand.name}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 ease-brand group-hover:translate-x-1"
                    />
                  </span>
                </Link>
              </Tilt>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Sourced ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="brands-sourced"
      >
        <div className="shell">
          <SectionHeading
            id="brands-sourced"
            eyebrow="Through our partner network"
            title="Sourced brands"
            lede={
              <>
                We do not hold these in our warehouse and make no stock claim on them. They
                are available through our sister business {site.partner.name}, which operates
                from {site.partner.address} — call{' '}
                <a
                  href={site.partner.phone.href}
                  className="link-underline font-semibold text-primary"
                >
                  {site.partner.phone.display}
                </a>
                . Each link below opens their truck tyre page.
              </>
            }
          />

          <Stagger className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {sourcedBrands.map((brand) => (
              <a
                key={brand.name}
                href={brand.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${brand.name} truck tyres at ${site.partner.name} (opens in a new tab)`}
                className="group flex h-full flex-col items-start gap-4 rounded-lg border border-border bg-background p-5 transition-colors duration-300 ease-brand hover:border-primary/50 focus-visible:border-primary"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <BrandMark name={brand.name} size="sm" className="items-start" />
                  <ExternalLink
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors duration-300 group-hover:text-primary"
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {brand.origin}
                </p>
                <span className="mt-auto font-heading text-[0.625rem] font-bold uppercase tracking-brand text-muted-foreground">
                  Order through {site.partner.name}
                </span>
              </a>
            ))}
          </Stagger>

          <Reveal className="mt-10">
            <div className="rounded-lg border border-border bg-background p-6">
              <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                Need a brand or size we do not hold?
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Send us the size, load index and speed symbol you need along with the
                quantity. We source specialty and hard-to-find fitments through{' '}
                {site.partner.name} and our wider supplier network, and come back to you with
                availability, lead time and price before you commit to anything.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/contact">
                    Ask us to source it
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a
                    href={site.partner.tyresUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${site.partner.name} truck tyres (opens in a new tab)`}
                  >
                    Visit {site.partner.name}
                    <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Difference ---------------- */}
      <section className="section-tight" aria-labelledby="brands-difference">
        <div className="shell">
          <SectionHeading
            id="brands-difference"
            eyebrow="Greforce or Lionshead"
            title="How the two stocked ranges differ"
            lede="It is a difference in range coverage rather than a quality tier — both are specified to the same standard."
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {stockedBrands.map((brand) => (
              <Reveal key={brand.name}>
                <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                  <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                    {brand.name}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {brand.blurb}
                  </p>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {brand.skuCount} {pluralise(brand.skuCount, 'line')} currently catalogued.
                  </p>
                  <Button asChild variant="outline" className="mt-6 self-start">
                    <Link to={brand.href}>
                      Shop {brand.name}
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
