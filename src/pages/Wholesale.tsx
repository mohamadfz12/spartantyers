import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Phone } from 'lucide-react'
import { site } from '@/config/site'
import { wholesaleBenefits } from '@/data/content'
import { PRICE_BREAKS, allSizes, poaProducts, pricedProducts } from '@/data/products'
import { stockedBrands } from '@/data/brands'
import { Seo, breadcrumbJsonLd, organisationJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { BrandMark } from '@/components/brand/BrandMark'
import { Reveal, Stagger } from '@/components/motion'
import { Icon } from '@/components/Icon'
import {
  CtaBand,
  EnquiryForm,
  FeatureGrid,
  PageHero,
  SectionHeading,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /wholesale
 *
 * Trade supply for businesses that resell: independent tyre shops,
 * automotive workshops and dealerships. The account application posts
 * through api.contact tagged as a wholesale account enquiry.
 * ------------------------------------------------------------------ */

const AUDIENCE = [
  {
    icon: 'Store',
    title: 'Independent tyre shops and auto retailers',
    body: 'Build an inventory across sizes and axle positions rather than committing to a pallet of one pattern. Consistent batch-to-batch specification means a repeat order for a returning customer fits the same way as the first one.',
  },
  {
    icon: 'Wrench',
    title: 'Automotive workshops',
    body: `Dispatch within ${site.commerce.dispatchWindow} and a phone number that reaches someone who can confirm a fitment against a compliance plate. Order what the job on the hoist needs today rather than carrying the stock for it.`,
  },
  {
    icon: 'Building2',
    title: 'Truck and trailer dealerships',
    body: 'Specify the tyres that go out on a new or used unit, in the quantities a handover actually needs. Mixed orders across steer, drive and trailer fitments go on one purchase order and one consignment.',
  },
]

const MIXED_ORDER = [
  'Any combination of sizes, brands and axle positions on one order — the volume break looks at the total quantity, not the line.',
  `All ${pricedProducts.length} stocked lines across ${allSizes.length} sizes are available in any quantity, and the ${poaProducts.length} built-to-order lines are quoted to your volume. There is no case quantity and no minimum spend.`,
  'Metro delivery is free with no minimum, so a four-tyre top-up order costs no more to move than a forty-tyre one.',
  `Orders of ${site.commerce.bulkThreshold} or more are palletised and moved as bulk freight to your workshop or depot.`,
  `Sizes we do not hold are sourced through our supplier network — we come back with availability, lead time and price before you commit.`,
]

export default function Wholesale() {
  return (
    <>
      <Seo
        title="Wholesale & Trade Tyre Supply — Spartan Tyres"
        description={`Trade supply for independent tyre shops, workshops and dealerships across Australia. Published volume breaks, mixed orders in any combination, and account facilities. Call ${site.phone.display}.`}
        canonicalPath="/wholesale"
        jsonLd={[
          organisationJsonLd,
          breadcrumbJsonLd([{ name: 'Wholesale', path: '/wholesale' }]),
        ]}
      />

      <PageHero
        eyebrow="Wholesale and trade"
        title="Trade supply for the businesses that fit the tyres"
        lede="If you resell, you need stock you can rely on, pricing you can mark up and specifications that do not drift between orders. Published volume breaks, mixed orders in any combination, and quotes back inside a business day."
        breadcrumb={[{ name: 'Wholesale', path: '/wholesale' }]}
        actions={
          <>
            <Button asChild size="lg">
              <a href="#trade-account">
                Apply for a trade account
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={site.phone.href}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                {site.phone.display}
              </a>
            </Button>
          </>
        }
        visual={
          <Reveal
            direction="none"
            className="rounded-lg border border-border bg-background p-6 shadow-lift"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
              Stocked and ready to ship
            </p>
            <ul className="mt-5 flex flex-col gap-5">
              {stockedBrands.map((brand) => (
                <li
                  key={brand.name}
                  className="flex items-center justify-between gap-4 border-b border-border pb-5 last:border-b-0 last:pb-0"
                >
                  <BrandMark name={brand.name} size="sm" className="items-start" />
                  <span className="font-heading text-sm font-bold tabular-nums text-muted-foreground">
                    {brand.skuCount} lines
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Held at {site.warehouse.full}. Other brands are ordered in on request rather than
              supplied from our stock.
            </p>
          </Reveal>
        }
      />

      {/* ---------------- Benefits ---------------- */}
      <section className="section-tight" aria-labelledby="wholesale-benefits">
        <div className="shell">
          <SectionHeading
            id="wholesale-benefits"
            eyebrow="Why trade buyers use us"
            title="Six things that matter when you are reselling"
          />
          <FeatureGrid items={wholesaleBenefits} className="mt-10" />
        </div>
      </section>

      {/* ---------------- Audience ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="wholesale-audience"
      >
        <div className="shell">
          <SectionHeading
            id="wholesale-audience"
            eyebrow="Who it is for"
            title="Shops, workshops and dealerships"
            lede="We sell to the public and to trade through the same site at the same published prices. What a trade account adds is contract pricing, streamlined re-ordering and a contact who knows your business."
          />

          <Stagger className="mt-10 grid gap-5 lg:grid-cols-3">
            {AUDIENCE.map((item) => (
              <div
                key={item.title}
                className="flex h-full flex-col rounded-lg border border-border bg-background p-6"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                  <Icon name={item.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-heading text-base font-bold uppercase tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Mixed orders + breaks ---------------- */}
      <section className="section-tight" aria-labelledby="wholesale-mixed">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="wholesale-mixed"
                eyebrow="Mixed orders"
                title="Buy to your inventory, not to a pallet"
              />
              <ul className="mt-8 flex flex-col gap-4">
                {MIXED_ORDER.map((item) => (
                  <li key={item.slice(0, 32)} className="flex gap-3">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    />
                    <span className="text-sm leading-relaxed text-muted-foreground">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <Reveal direction="left" className="min-w-0">
              <div className="rounded-lg border border-border bg-card p-6 md:p-8">
                <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                  Trade pricing that scales
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  The published breaks apply to every order, trade or retail, and are
                  calculated automatically in the cart. Regular trade volumes beyond the top
                  tier move to contract pricing.
                </p>

                <ul className="mt-6 flex flex-col divide-y divide-border">
                  {PRICE_BREAKS.map((breakPoint) => (
                    <li
                      key={breakPoint.min}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                        {breakPoint.label}
                      </span>
                      <Badge variant="primary">
                        {Math.round(breakPoint.discount * 100)}% off
                      </Badge>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  Every price on the site is GST inclusive, and a tax invoice showing the GST
                  component separately is emailed with the order confirmation.
                </p>

                <Button asChild variant="outline" className="mt-6">
                  <Link to="/products">
                    See the full range
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- Account application ---------------- */}
      <section
        className="section border-t border-border bg-card"
        id="trade-account"
        aria-labelledby="wholesale-apply"
      >
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="wholesale-apply"
                eyebrow="Trade account"
                title="Apply for an account"
                lede="Open a trade account online in a few minutes. Our team checks it and switches on your trade pricing. Prefer to talk first? Use the enquiry form below."
              />

              <dl className="mt-8 flex flex-col gap-5 text-sm">
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Quotes
                  </dt>
                  <dd className="mt-1.5 text-muted-foreground">
                    Pricing, stock position and lead time, usually the same business day.
                  </dd>
                </div>
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Accounts team
                  </dt>
                  <dd className="mt-1.5 text-muted-foreground">
                    <a
                      href={`mailto:${site.email.accounts}`}
                      className="link-underline break-all font-semibold text-primary"
                    >
                      {site.email.accounts}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Or call
                  </dt>
                  <dd className="mt-1.5 text-muted-foreground">
                    <a
                      href={site.phone.href}
                      className="link-underline font-semibold text-primary"
                    >
                      {site.phone.display}
                    </a>
                    , {site.hours.short}.
                  </dd>
                </div>
              </dl>
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <div className="rounded-lg border border-primary/40 bg-primary/[0.06] p-6 md:p-8">
                <h3 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                  Open a trade account online
                </h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    'Takes a few minutes: your details, your business and a password.',
                    'You can shop straight away as a Customer while our team checks your trade request.',
                    'Once approved, your trade pricing and any account terms are set up for you.',
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <Button asChild size="lg">
                    <Link to="/account/signup?level=wholesaler">
                      Open a trade account
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Link to="/account/login" className="link-underline text-sm font-semibold text-primary">
                    Already have an account? Log in
                  </Link>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-6 md:p-8">
                <h3 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                  Talk to us first
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Not ready to open an account? Tell us about your business and what you move, and we will come back with trade pricing.
                </p>
                <div className="mt-6">
                <EnquiryForm
                  enquiryType="Wholesale account"
                  companyRequired
                  phoneRequired
                  extras={[
                    {
                      id: 'businessType',
                      label: 'Business type',
                      kind: 'select',
                      required: true,
                      placeholder: 'Choose the closest match',
                      options: [
                        'Independent tyre shop',
                        'Auto retailer',
                        'Automotive workshop',
                        'Truck or trailer dealership',
                        'Transport operator reselling',
                        'Other',
                      ],
                    },
                    {
                      id: 'monthlyVolume',
                      label: 'Tyres per month',
                      kind: 'select',
                      placeholder: 'Choose a range',
                      options: ['Under 10', '10–50', '50–150', 'More than 150', 'Not sure yet'],
                    },
                    {
                      id: 'tradingName',
                      label: 'Trading location',
                      kind: 'text',
                      placeholder: 'Suburb and state',
                      hint: 'So we can confirm whether free metro delivery applies to you.',
                    },
                  ]}
                  messageLabel="What you need from a trade account"
                  messagePlaceholder={
                    'For example:\nThe fitments we move most, the sizes we struggle to source, and how you would like to order and pay.'
                  }
                  messageHint="The sizes you turn over most are the most useful thing you can tell us."
                  submitLabel="Send enquiry"
                  successTitle="Enquiry received"
                  successBody={`Thanks, your enquiry is with our accounts team. We will come back with trade pricing and the next steps, usually within one business day. For anything urgent, call ${site.phone.display}.`}
                />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Talk to our team about pricing, stock, or fleet enquiries"
        body="Trade pricing, mixed orders and a contact who knows your business. Send a size list and we will quote it."
      />
    </>
  )
}
