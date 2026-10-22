import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, Phone, Quote } from 'lucide-react'
import { site } from '@/config/site'
import { aboutStory, customerSegments, homeStats } from '@/data/content'
import { allSizes, poaProducts, priceRange, products } from '@/data/products'
import { featuredReviews } from '@/data/reviews'
import { money } from '@/lib/utils'
import { Seo, breadcrumbJsonLd, organisationJsonLd } from '@/components/Seo'
import { Badge, Button, Card, CardContent, Rating } from '@/components/ui'
import { StaticWheel } from '@/components/three'
import { Reveal, Stagger } from '@/components/motion'
import {
  BrandWall,
  CtaBand,
  FeatureGrid,
  PageHero,
  PillarGrid,
  SectionHeading,
  StatStrip,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /about
 *
 * The positioning that matters most here: Spartan is an online and
 * phone supplier shipping from its own warehouse, not a retail store
 * and not a fitting workshop. Everything on the page traces back to
 * src/config/site.ts and src/data/content.ts.
 * ------------------------------------------------------------------ */

const CAPABILITY = [
  {
    label: 'Warehouse',
    value: site.warehouse.full,
    detail: `Our own stock, picked and packed in ${site.commerce.dispatchWindow}. Collection is free from this address when you choose Pickup at checkout.`,
  },
  {
    label: 'Head office',
    value: site.office.full,
    detail: 'Accounts, fleet contracts and trade applications.',
  },
  {
    label: 'Range held',
    value: `${products.length} lines across ${allSizes.length} sizes`,
    detail: `Greforce and Lionshead, from 215/75R17.5 light truck to the 385/65R22.5 super-single, ${money(priceRange.min)}–${money(priceRange.max)} a tyre, with ${poaProducts.length} lines built to order and quoted on request.`,
  },
  {
    label: 'Freight',
    value: `Free to ${site.commerce.metroCities.length} metro areas`,
    detail: `No minimum spend, typically ${site.commerce.metroDeliveryEstimate} once dispatched. Non-metro freight is arranged and confirmed with you before anything leaves.`,
  },
]

export default function About() {
  return (
    <>
      <Seo
        title={`About ${site.name} — Sydney Commercial Tyre Supplier`}
        description={`${site.legalName} supplies commercial truck, bus and trailer tyres online and over the phone across Australia, shipping from our own warehouse at ${site.warehouse.suburb}, NSW.`}
        canonicalPath="/about"
        jsonLd={[
          organisationJsonLd,
          breadcrumbJsonLd([{ name: 'About', path: '/about' }]),
        ]}
      />

      <PageHero
        eyebrow={`About ${site.name}`}
        title="Commercial tyre supply, run like a warehouse rather than a shopfront"
        lede={aboutStory.lead}
        breadcrumb={[{ name: 'About', path: '/about' }]}
        actions={
          <>
            <Button asChild size="lg">
              <a href={site.phone.href}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                {site.phone.display}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/shop">
                Browse the range
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
          </>
        }
        visual={
          <div className="relative mx-auto max-w-sm overflow-hidden rounded-lg border border-border bg-background p-6 shadow-lift">
            <div
              aria-hidden="true"
              className="tread-texture pointer-events-none absolute inset-0 opacity-[0.07]"
            />
            <div className="relative">
              <StaticWheel
                tread="rib"
                label="Spartan"
                size="11R22.5"
                className="mx-auto h-40 w-40"
                title="Commercial truck tyre, highway rib pattern"
              />
              <dl className="mt-6 flex flex-col gap-3 text-sm">
                <div className="flex items-start gap-2.5">
                  <dt className="sr-only">Warehouse</dt>
                  <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <dd className="text-muted-foreground">
                    Dispatch and pickup from {site.warehouse.full}
                  </dd>
                </div>
                <div className="flex items-start gap-2.5">
                  <dt className="sr-only">Trading since</dt>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-center font-heading text-xs font-black text-primary"
                  >
                    ·
                  </span>
                  <dd className="text-muted-foreground">
                    Supplying operators across Australia since {site.foundedYear}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        }
      />

      {/* ---------------- Stats ---------------- */}
      <section className="section-tight" aria-labelledby="about-figures">
        <div className="shell">
          <SectionHeading
            id="about-figures"
            eyebrow="By the numbers"
            title="What we actually hold"
            lede="These figures are calculated from the live catalogue rather than written into the copy, so they cannot drift away from what is on the floor."
          />
          <StatStrip items={homeStats} className="mt-10" />
        </div>
      </section>

      {/* ---------------- Story ---------------- */}
      <section className="section border-t border-border bg-card" aria-labelledby="about-story">
        <div className="shell">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="about-story"
                eyebrow="Who we are"
                title="A supplier, not a shopfront"
              />
              <div className="mt-6 flex max-w-2xl flex-col gap-5">
                {aboutStory.paragraphs.map((paragraph) => (
                  <Reveal key={paragraph.slice(0, 40)}>
                    <p className="text-base leading-[1.75] text-muted-foreground">
                      {paragraph}
                    </p>
                  </Reveal>
                ))}
              </div>
            </div>

            <Reveal direction="left" className="min-w-0">
              <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-6">
                <Badge variant="primary" size="sm">
                  Worth knowing
                </Badge>
                <h3 className="mt-4 font-heading text-base font-bold uppercase tracking-tight text-foreground">
                  There is no retail store to visit
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  We sell online and over the phone. Orders are delivered to your depot or
                  business address, or collected from the warehouse at {site.warehouse.street}{' '}
                  when you choose Pickup at checkout.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Pickup orders can add wheel fitting at ${site.commerce.fittingFeePerTyre} per
                  tyre. Delivered orders arrive as loose tyres for your own fitter.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- Capability ---------------- */}
      <section className="section-tight" aria-labelledby="about-capability">
        <div className="shell">
          <SectionHeading
            id="about-capability"
            eyebrow="Warehouse and logistics"
            title="Two addresses, one business"
            lede={`Yennora is where the stock sits. The head office at ${site.office.street} handles accounts and trade applications; the warehouse at ${site.warehouse.street} is where tyres are picked, packed and collected.`}
          />

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2">
            {CAPABILITY.map((item) => (
              <div
                key={item.label}
                className="flex h-full flex-col rounded-lg border border-border bg-card p-6"
              >
                <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-3 font-heading text-lg font-bold uppercase leading-tight tracking-tight text-foreground">
                  {item.value}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Pillars ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="about-pillars"
      >
        <div className="shell">
          <SectionHeading
            id="about-pillars"
            eyebrow="How we work"
            title="Four things we hold ourselves to"
          />
          <PillarGrid items={aboutStory.pillars} columns={2} numbered className="mt-10" />
        </div>
      </section>

      {/* ---------------- Segments ---------------- */}
      <section className="section-tight" aria-labelledby="about-segments">
        <div className="shell">
          <SectionHeading
            id="about-segments"
            eyebrow="Who we supply"
            title="Owner-drivers through to national fleets"
            lede="Everyone orders through the same site at the same published prices. Quantity is the only thing that changes the number."
          />
          <FeatureGrid items={customerSegments} columns={2} className="mt-10" />

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/fleet-solutions">
                Fleet solutions
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/wholesale">
                Wholesale and trade
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------- Reviews ---------------- */}
      <section
        className="section border-t border-border bg-card"
        aria-labelledby="about-reviews"
      >
        <div className="shell">
          <SectionHeading
            id="about-reviews"
            eyebrow="In their words"
            title="What operators tell us"
          />

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredReviews.map((review) => (
              <Card key={review.id} className="h-full bg-background">
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <Quote aria-hidden="true" className="h-6 w-6 text-primary/30" />
                  <Rating value={review.rating} size="sm" />
                  <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                    {review.body}
                  </blockquote>
                  <footer className="border-t border-border pt-4">
                    <p className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                      {review.author}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {review.role} — {review.location}
                    </p>
                  </footer>
                </CardContent>
              </Card>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Brands ---------------- */}
      <section className="section-tight" aria-labelledby="about-brands">
        <div className="shell">
          <SectionHeading
            id="about-brands"
            eyebrow="Brands"
            title="Stocked here, or ordered in for you"
            lede={
              <>
                Greforce and Lionshead are held in our warehouse. Every other major brand is
                available to order on request rather than from our stock —{' '}
                <Link to="/brands" className="link-underline font-semibold text-primary">
                  see the full brand list
                </Link>
                .
              </>
            }
          />
        </div>
        <BrandWall className="mt-10" />
      </section>

      <CtaBand />
    </>
  )
}
