import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CheckCircle2, Phone } from 'lucide-react'
import { site } from '@/config/site'
import { fleetServices, howItWorks } from '@/data/content'
import { PRICE_BREAKS, allSizes, products } from '@/data/products'
import { Seo, breadcrumbJsonLd, organisationJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { Reveal, Stagger } from '@/components/motion'
import { Icon } from '@/components/Icon'
import {
  CtaBand,
  EnquiryForm,
  FeatureGrid,
  PageHero,
  SectionHeading,
  StepList,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /fleet-solutions
 *
 * Volume supply for operators: published price breaks, bulk freight
 * above the 20-tyre threshold, named account contact, scheduled depot
 * delivery, and a quote form that tags the enquiry as a fleet quote.
 * ------------------------------------------------------------------ */

const BULK_BENEFITS = [
  {
    icon: 'Boxes',
    title: `Palletised from ${site.commerce.bulkThreshold} tyres`,
    body: `Orders of ${site.commerce.bulkThreshold} tyres or more are palletised and moved as bulk freight rather than through a parcel network. Unloading becomes a forklift job instead of four people rolling tyres off a tail lift.`,
  },
  {
    icon: 'CalendarClock',
    title: 'Scheduled depot delivery',
    body: 'Deliveries timed to your replacement calendar rather than your breakdowns. Tell us the months your axle groups come due and we book the consignments against them.',
  },
  {
    icon: 'Handshake',
    title: 'Dedicated account management',
    body: 'A named contact who knows your axle loads and your fitment list, so a re-order is a phone call rather than a specification exercise every time.',
  },
  {
    icon: 'FileSignature',
    title: 'Fixed contract pricing',
    body: 'Supply agreements covering fixed pricing on your nominated fitments and agreed lead times, for fleets whose volume justifies going beyond the published breaks.',
  },
]

const CONSOLIDATION = [
  'Put several vehicles on one order. The breaks apply across the whole order rather than per line, so three trucks needing three different sizes in the same month can move the lot up a tier.',
  `At ${site.commerce.bulkThreshold} tyres and above we arrange the freight specifically, so a regional depot gets one palletised consignment instead of a parcel per tyre.`,
  'Metro delivery is free with no minimum spend, so on metro orders consolidating saves your time rather than your freight bill.',
  'Outside metro there is no upfront freight charge at checkout — we contact you after the order is placed and confirm the cost before anything is dispatched.',
]

export default function FleetSolutions() {
  return (
    <>
      <Seo
        title="Fleet Tyre Supply & Bulk Pricing — Spartan Tyres"
        description={`Bulk commercial tyre supply for Australian fleets: published volume breaks to 11%, bulk freight on ${site.commerce.bulkThreshold}+ tyres, scheduled depot delivery and contract pricing. Call ${site.phone.display}.`}
        canonicalPath="/fleet-solutions"
        jsonLd={[
          organisationJsonLd,
          breadcrumbJsonLd([{ name: 'Fleet Solutions', path: '/fleet-solutions' }]),
        ]}
      />

      <PageHero
        eyebrow="Fleet solutions"
        title="Bulk tyre supply for fleets that cannot afford to wait"
        lede={`Volume pricing that is published rather than negotiated, ${products.length} lines held across ${allSizes.length} sizes at our own warehouse, and freight arranged to your depot. Dispatch within ${site.commerce.dispatchWindow} of payment clearing.`}
        breadcrumb={[{ name: 'Fleet Solutions', path: '/fleet-solutions' }]}
        actions={
          <>
            <Button asChild size="lg">
              <a href="#fleet-quote">
                Request a fleet quote
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
              Published volume breaks
            </p>
            <ul className="mt-4 flex flex-col divide-y divide-border">
              {PRICE_BREAKS.map((breakPoint) => (
                <li
                  key={breakPoint.min}
                  className="flex items-baseline justify-between gap-4 py-3"
                >
                  <span className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                    {breakPoint.label}
                  </span>
                  <span className="font-heading text-xl font-black leading-none tabular-nums text-primary">
                    {Math.round(breakPoint.discount * 100)}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Applied across the whole order, not per line, and calculated automatically in
              the cart.
            </p>
          </Reveal>
        }
      />

      {/* ---------------- Services ---------------- */}
      <section className="section-tight" aria-labelledby="fleet-services">
        <div className="shell">
          <SectionHeading
            id="fleet-services"
            eyebrow="What fleet accounts get"
            title="Supply built around a replacement cycle"
            lede="Fleet supply is less about the unit price than about knowing the tyre will be there in the month you need it, at a price you agreed in advance."
          />
          <FeatureGrid items={fleetServices} className="mt-10" />
        </div>
      </section>

      {/* ---------------- Price breaks ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="fleet-breaks"
      >
        <div className="shell">
          <SectionHeading
            id="fleet-breaks"
            eyebrow="Volume pricing"
            title="The breaks are published, so there is nothing to negotiate"
            lede="Every buyer sees the same tiers. The discount applies to the whole order rather than line by line, which is why putting several vehicles on one purchase order is usually worth more than haggling."
          />

          <Reveal className="mt-10 overflow-hidden rounded-lg border border-border bg-background">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Volume discount tiers by order quantity
              </caption>
              <thead>
                <tr className="border-b border-border bg-card">
                  <th
                    scope="col"
                    className="px-4 py-3 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground md:px-6"
                  >
                    Order quantity
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground md:px-6"
                  >
                    Discount
                  </th>
                  <th
                    scope="col"
                    className="hidden px-4 py-3 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground sm:table-cell md:px-6"
                  >
                    Typically
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PRICE_BREAKS.map((breakPoint) => (
                  <tr key={breakPoint.min}>
                    <th
                      scope="row"
                      className="px-4 py-4 font-heading text-sm font-bold uppercase tracking-tight text-foreground md:px-6"
                    >
                      {breakPoint.label}
                    </th>
                    <td className="px-4 py-4 md:px-6">
                      <Badge variant="primary">
                        {Math.round(breakPoint.discount * 100)}% off
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-4 text-muted-foreground sm:table-cell md:px-6">
                      {breakPoint.min === 4
                        ? 'One axle set on a rigid'
                        : breakPoint.min === 8
                          ? 'A drive group, or two vehicles combined'
                          : breakPoint.min === 20
                            ? 'A monthly order for a mid-size fleet — and the point bulk freight starts'
                            : 'A quarterly consolidated order'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>

          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Regular trade and fleet volumes beyond the top tier are covered by contract
            pricing instead. Send your fitment list and annual volumes to{' '}
            <a
              href={`mailto:${site.email.sales}`}
              className="link-underline break-all font-semibold text-primary"
            >
              {site.email.sales}
            </a>{' '}
            and we will come back with a proposal, usually within a business day.
          </p>
        </div>
      </section>

      {/* ---------------- Bulk + freight ---------------- */}
      <section className="section-tight" aria-labelledby="fleet-bulk">
        <div className="shell">
          <SectionHeading
            id="fleet-bulk"
            eyebrow="Bulk orders"
            title={`Freight consolidation from ${site.commerce.bulkThreshold} tyres`}
          />

          <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-14">
            <Stagger className="grid gap-5">
              {BULK_BENEFITS.map((item) => (
                <div
                  key={item.title}
                  className="flex gap-4 rounded-lg border border-border bg-card p-5"
                >
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </Stagger>

            <Reveal direction="left">
              <div className="rounded-lg border border-border bg-card p-6 md:p-8">
                <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                  How to get the most out of one order
                </h3>
                <ul className="mt-5 flex flex-col gap-4">
                  {CONSOLIDATION.map((item) => (
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

                <Button asChild variant="outline" className="mt-7">
                  <Link to="/blog/bulk-tyre-buying-guide-for-fleets">
                    <BookOpen aria-hidden="true" className="h-4 w-4" />
                    Read the bulk buying guide
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- Ordering ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="fleet-process"
      >
        <div className="shell">
          <SectionHeading
            id="fleet-process"
            eyebrow="Ordering"
            title="Three steps, whatever the quantity"
          />
          <StepList items={howItWorks} className="mt-10" />
        </div>
      </section>

      {/* ---------------- Quote form ---------------- */}
      <section className="section" aria-labelledby="fleet-quote-heading" id="fleet-quote">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="fleet-quote-heading"
                eyebrow="Fleet quote"
                title="Send us the fitment list"
                lede="Sizes and quantities are enough to start. If you are not certain of a fitment, give us the axle mass from the compliance plate and we will work it back."
              />

              <dl className="mt-8 flex flex-col gap-5 text-sm">
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Turnaround
                  </dt>
                  <dd className="mt-1.5 text-muted-foreground">
                    Pricing, stock position and lead time, usually inside one business day.
                  </dd>
                </div>
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Prefer the phone
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
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Account facilities
                  </dt>
                  <dd className="mt-1.5 text-muted-foreground">
                    Email{' '}
                    <a
                      href={`mailto:${site.email.accounts}`}
                      className="link-underline break-all font-semibold text-primary"
                    >
                      {site.email.accounts}
                    </a>{' '}
                    with your business details and volumes.
                  </dd>
                </div>
              </dl>
            </div>

            <div className="min-w-0 rounded-lg border border-border bg-card p-6 md:p-8">
              <EnquiryForm
                enquiryType="Fleet quote"
                companyRequired
                phoneRequired
                extras={[
                  {
                    id: 'fleetSize',
                    label: 'Fleet size',
                    kind: 'select',
                    required: true,
                    placeholder: 'Choose a range',
                    options: [
                      '1–5 vehicles',
                      '6–20 vehicles',
                      '21–50 vehicles',
                      'More than 50 vehicles',
                    ],
                  },
                  {
                    id: 'tyresPerYear',
                    label: 'Tyres per year',
                    kind: 'select',
                    placeholder: 'Choose a range',
                    options: [
                      'Under 50',
                      '50–200',
                      '200–500',
                      'More than 500',
                      'Not sure yet',
                    ],
                  },
                  {
                    id: 'depot',
                    label: 'Depot suburb and state',
                    kind: 'text',
                    placeholder: 'For example, Wetherill Park NSW',
                    hint: 'So we can tell you whether free metro delivery applies.',
                  },
                ]}
                messageLabel="Fitment list and quantities"
                messagePlaceholder={
                  'For example:\n8 × 11R22.5 drive\n4 × 295/80R22.5 steer\nReplacement due March, delivery to depot'
                }
                messageHint="Sizes, quantities and axle positions. Add your replacement months if you want a delivery schedule."
                submitLabel="Request fleet quote"
                successTitle="Fleet quote requested"
                successBody={`Thanks — your fitment list is with our fleet team. Expect pricing, stock position and lead time, usually within one business day. For anything urgent, call ${site.phone.display}.`}
              />
            </div>
          </div>
        </div>
      </section>

      <CtaBand
        title="Talk to our team about pricing, stock, or fleet enquiries"
        body="Fixed pricing on nominated fitments, scheduled depot delivery and a named contact who knows your fleet. Start with a phone call."
      />
    </>
  )
}
