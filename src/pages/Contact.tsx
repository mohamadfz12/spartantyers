import { Link } from 'react-router-dom'
import {
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  Phone,
  Truck,
  Wrench,
} from 'lucide-react'
import { site } from '@/config/site'
import { Seo, breadcrumbJsonLd, localBusinessJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { Reveal, Stagger } from '@/components/motion'
import { CtaBand, EnquiryForm, PageHero, SectionHeading } from '@/components/marketing'
import { AssistantCallCard } from '@/components/assistant/CallCard'

/* ------------------------------------------------------------------ *
 * /contact
 *
 * Two addresses, and the difference between them matters: the office at
 * 12 Pine Road handles accounts and trade, the warehouse at 10 Pine Rd
 * is where stock is picked, packed and collected. Maps are plain links
 * rather than an embedded iframe — an embed needs an API key and costs
 * a third-party script on every visit.
 * ------------------------------------------------------------------ */

const ENQUIRY_TYPES = [
  'General enquiry',
  'Product or fitment question',
  'Stock and availability',
  'Fleet quote',
  'Wholesale account',
  'Order or delivery',
  'Warranty or return',
  'Sourcing a size you do not stock',
]

export default function Contact() {
  return (
    <>
      <Seo
        title={`Contact ${site.name} — ${site.phone.display}`}
        description={`Call ${site.phone.display} or email ${site.email.sales}. Head office ${site.office.full}; warehouse pickup from ${site.warehouse.full}. ${site.hours.label}.`}
        canonicalPath="/contact"
        jsonLd={[
          localBusinessJsonLd,
          breadcrumbJsonLd([{ name: 'Contact', path: '/contact' }]),
        ]}
      />

      <PageHero
        eyebrow="Contact"
        title="Talk to someone who knows trucks"
        lede={`We are an online and phone supplier, so the fastest answer is almost always a call. Load indexes, rim widths, axle mass and stock position — ${site.hours.short} on ${site.phone.display}.`}
        breadcrumb={[{ name: 'Contact', path: '/contact' }]}
        actions={
          <>
            <Button asChild size="lg">
              <a href={site.phone.href}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                {site.phone.display}
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={`mailto:${site.email.sales}`}>
                <Mail aria-hidden="true" className="h-4 w-4" />
                Email sales
              </a>
            </Button>
          </>
        }
      />

      {/* ---------------- Channels ---------------- */}
      <section className="section-tight" aria-labelledby="contact-channels">
        <div className="shell">
          <h2 id="contact-channels" className="sr-only">
            How to reach us
          </h2>

          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
              <Phone aria-hidden="true" className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Phone
              </h3>
              <a
                href={site.phone.href}
                className="mt-2 font-heading text-lg font-bold tracking-tight text-foreground hover:text-primary"
              >
                {site.phone.display}
              </a>
              <p className="mt-2 text-sm text-muted-foreground">
                Sales, fitment checks and stock.
              </p>
            </div>

            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
              <Mail aria-hidden="true" className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Sales email
              </h3>
              <a
                href={`mailto:${site.email.sales}`}
                className="mt-2 break-all font-heading text-sm font-bold tracking-tight text-foreground hover:text-primary"
              >
                {site.email.sales}
              </a>
              <p className="mt-2 text-sm text-muted-foreground">
                Quotes, size lists and warranty claims.
              </p>
            </div>

            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
              <Mail aria-hidden="true" className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Accounts email
              </h3>
              <a
                href={`mailto:${site.email.accounts}`}
                className="mt-2 break-all font-heading text-sm font-bold tracking-tight text-foreground hover:text-primary"
              >
                {site.email.accounts}
              </a>
              <p className="mt-2 text-sm text-muted-foreground">
                Trade accounts, invoices and payment.
              </p>
            </div>

            <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
              <Clock aria-hidden="true" className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Hours
              </h3>
              <p className="mt-2 font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                {site.hours.label}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Closed weekends and public holidays.
              </p>
            </div>
          </Stagger>

          <div className="mt-5">
            <AssistantCallCard />
          </div>
        </div>
      </section>

      {/* ---------------- Form ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="contact-form-heading"
      >
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="contact-form-heading"
                eyebrow="Send an enquiry"
                title="Tell us what you need"
                lede="Choose the closest enquiry type so it reaches the right person. If you are asking about a fitment, the size, load index and speed symbol from the sidewall are the most useful things you can include."
              />

              <div className="mt-8 rounded-lg border border-border bg-background p-6 md:p-8">
                <EnquiryForm
                  enquiryType={ENQUIRY_TYPES}
                  messageLabel="Your message"
                  messagePlaceholder="Sizes, quantities, your vehicle, or the question you need answered."
                  messageHint="Include an order number if your enquiry is about an existing order."
                  submitLabel="Send enquiry"
                />
              </div>
            </div>

            <Reveal direction="left" className="min-w-0">
              <div className="flex flex-col gap-5">
                <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-6">
                  <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                    Faster than a form
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Send a photo of your sidewall and the rim stamping to{' '}
                    <a
                      href={`mailto:${site.email.sales}`}
                      className="link-underline break-all font-semibold text-primary"
                    >
                      {site.email.sales}
                    </a>{' '}
                    and we will confirm the fitment against your vehicle compliance plate
                    before you order.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-background p-6">
                  <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                    Already looking for an answer?
                  </h3>
                  <ul className="mt-4 flex flex-col gap-2.5 text-sm">
                    <li>
                      <Link to="/faq" className="link-underline text-primary">
                        Frequently asked questions
                      </Link>
                    </li>
                    <li>
                      <Link to="/shipping" className="link-underline text-primary">
                        Shipping, delivery and pickup
                      </Link>
                    </li>
                    <li>
                      <Link to="/returns" className="link-underline text-primary">
                        Returns and warranty
                      </Link>
                    </li>
                    <li>
                      <Link to="/guide" className="link-underline text-primary">
                        Tyre guide and sizing
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- Addresses ---------------- */}
      <section className="section" aria-labelledby="contact-addresses">
        <div className="shell">
          <SectionHeading
            id="contact-addresses"
            eyebrow="Where we are"
            title="Two addresses on Pine Road, and they are not interchangeable"
            lede="Both are in Yennora, a few doors apart. Sending a courier or turning up at the wrong one is the most common mix-up we see, so it is worth checking before you travel."
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Reveal>
              <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <Package aria-hidden="true" className="h-6 w-6 text-primary" />
                  <Badge variant="primary">Collect orders here</Badge>
                </div>
                <h3 className="mt-5 font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                  Pickup warehouse
                </h3>
                <address className="mt-3 not-italic text-base font-semibold text-foreground">
                  {site.warehouse.full}
                </address>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Where the stock sits and where every order is picked and packed. Choose
                  Pickup at checkout to collect free of charge — we will contact you when the
                  order is ready. Pickup orders can add professional wheel fitting at $
                  {site.commerce.fittingFeePerTyre} per tyre, ticked at checkout and done on
                  site while you wait.
                </p>
                <Button asChild variant="outline" className="mt-6 self-start">
                  <a
                    href={site.warehouse.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${site.warehouse.full} on Google Maps (opens in a new tab)`}
                  >
                    <MapPin aria-hidden="true" className="h-4 w-4" />
                    Open in Google Maps
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div className="flex h-full flex-col rounded-lg border border-border bg-card p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <MapPin aria-hidden="true" className="h-6 w-6 text-primary" />
                  <Badge variant="outline">Correspondence</Badge>
                </div>
                <h3 className="mt-5 font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                  Head office
                </h3>
                <address className="mt-3 not-italic text-base font-semibold text-foreground">
                  {site.office.full}
                </address>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  Our registered office: accounts, fleet contracts, trade applications and
                  correspondence. There is no retail counter and no stock held here — please
                  do not send couriers or collections to this address.
                </p>
                <Button asChild variant="outline" className="mt-6 self-start">
                  <a
                    href={site.office.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${site.office.full} on Google Maps (opens in a new tab)`}
                  >
                    <MapPin aria-hidden="true" className="h-4 w-4" />
                    Open in Google Maps
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  </a>
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
