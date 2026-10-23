import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ExternalLink,
  MapPin,
  Package,
  PenLine,
  Phone,
  Truck,
} from 'lucide-react'
import { site } from '@/config/site'
import { deliveryZones } from '@/data/content'
import { Seo, breadcrumbJsonLd, localBusinessJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { Reveal, Stagger } from '@/components/motion'
import {
  CtaBand,
  EntityBlock,
  PageHero,
  PolicyList,
  PolicyNav,
  PolicyNote,
  PolicySection,
  PolicyText,
  type PolicySectionDef,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /shipping
 *
 * Free metro delivery with no minimum, a non-metro process that quotes
 * before dispatch, free warehouse pickup with optional fitting, and
 * bulk freight above the 20-tyre threshold. The courier disclaimer is
 * stated plainly rather than buried.
 * ------------------------------------------------------------------ */

const SECTIONS: PolicySectionDef[] = [
  { id: 'metro', title: 'Free metro delivery' },
  { id: 'non-metro', title: 'Outside the metro areas' },
  { id: 'pickup', title: 'Warehouse pickup and fitting' },
  { id: 'packaging', title: 'Packaging and handling' },
  { id: 'tracking', title: 'Tracking and delivery' },
  { id: 'bulk', title: 'Bulk orders and depot freight' },
  { id: 'couriers', title: 'Third-party couriers' },
]

export default function Shipping() {
  return (
    <>
      <Seo
        title="Shipping, Delivery & Pickup — Spartan Tyres"
        description={`Free delivery to ${site.commerce.metroCities.length} metro areas with no minimum spend, typically ${site.commerce.metroDeliveryEstimate}. Dispatch within ${site.commerce.dispatchWindow} from Yennora, free warehouse pickup, and bulk freight on ${site.commerce.bulkThreshold}+ tyres.`}
        canonicalPath="/shipping"
        jsonLd={[
          localBusinessJsonLd,
          breadcrumbJsonLd([{ name: 'Shipping & Delivery', path: '/shipping' }]),
        ]}
      />

      <PageHero
        eyebrow="Shipping and delivery"
        title="Free to every metro area, no minimum spend"
        lede={`One tyre or forty. We dispatch from ${site.warehouse.full} within ${site.commerce.dispatchWindow}, and metro delivery typically takes ${site.commerce.metroDeliveryEstimate} from there. Outside metro there is no upfront freight charge — we confirm the cost with you before anything moves.`}
        breadcrumb={[{ name: 'Shipping & Delivery', path: '/shipping' }]}
        actions={
          <>
            <Button asChild size="lg">
              <Link to="/shop">
                Shop tyres
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
        visual={
          <Reveal
            direction="none"
            className="rounded-lg border border-border bg-background p-6 shadow-lift"
          >
            <dl className="flex flex-col gap-5 text-sm">
              <div className="flex items-start gap-3">
                <Truck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Metro delivery
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    Free, {site.commerce.metroDeliveryEstimate}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Package
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                />
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Dispatch
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    Within {site.commerce.dispatchWindow}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Pickup
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    Free from {site.warehouse.street}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <PenLine
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                />
                <div>
                  <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    On delivery
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    Signature required
                  </dd>
                </div>
              </div>
            </dl>
          </Reveal>
        }
      />

      <div className="section">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-16">
            <PolicyNav sections={SECTIONS} className="order-first lg:order-none" />

            <div className="flex min-w-0 flex-col gap-10">
              {/* ---------------- Metro ---------------- */}
              <PolicySection id="metro" title="Free metro delivery">
                <PolicyText>
                  Delivery is free to every metro area below, with no minimum spend. Whether
                  you order one tyre or a pallet of forty, there is no freight charge on a
                  metro address.
                </PolicyText>

                <ul className="flex flex-wrap gap-2">
                  {deliveryZones.metro.map((city) => (
                    <li key={city}>
                      <Badge variant="outline">{city}</Badge>
                    </li>
                  ))}
                </ul>

                <PolicyText>{deliveryZones.note}</PolicyText>
              </PolicySection>

              {/* ---------------- Non-metro ---------------- */}
              <PolicySection id="non-metro" title="Outside the metro areas">
                <PolicyText>
                  Regional and remote addresses are quoted individually, because a single tyre
                  to a country depot and twenty tyres to the same depot do not cost twenty
                  times apart to move. There is no upfront freight charge at checkout.
                </PolicyText>

                <ol className="mt-2 flex flex-col gap-4">
                  {deliveryZones.nonMetroSteps.map((step, index) => (
                    <li
                      key={step}
                      className="flex items-start gap-4 rounded-lg border border-border bg-card p-5"
                    >
                      <span
                        aria-hidden="true"
                        className="font-heading text-lg font-black leading-none tabular-nums text-primary/40"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-sm leading-relaxed text-foreground">{step}</span>
                    </li>
                  ))}
                </ol>

                <PolicyNote>
                  You are never committed to a freight figure you have not seen. Nothing is
                  dispatched to a non-metro address until the delivery cost has been confirmed
                  with you.
                </PolicyNote>
              </PolicySection>

              {/* ---------------- Pickup ---------------- */}
              <PolicySection id="pickup" title="Warehouse pickup and fitting">
                <PolicyText>
                  Choose Pickup at checkout and collect from{' '}
                  <span className="font-semibold text-foreground">
                    {site.warehouse.full}
                  </span>{' '}
                  at no charge. This is the warehouse, not our head office at{' '}
                  {site.office.street} — stock is only held and collected at{' '}
                  {site.warehouse.street}.
                </PolicyText>

                <Stagger className="grid gap-4">
                  {deliveryZones.pickupPoints.map((point) => (
                    <div
                      key={point.title}
                      className="rounded-lg border border-border bg-card p-5"
                    >
                      <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                        {point.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {point.body}
                      </p>
                    </div>
                  ))}
                </Stagger>

                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <a
                      href={site.warehouse.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${site.warehouse.full} on Google Maps (opens in a new tab)`}
                    >
                      <MapPin aria-hidden="true" className="h-4 w-4" />
                      Warehouse on Google Maps
                      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </PolicySection>

              {/* ---------------- Packaging ---------------- */}
              <PolicySection id="packaging" title="Packaging and handling">
                <PolicyList
                  items={[
                    'Every tyre is inspected before it leaves the warehouse and individually wrapped and labelled, regardless of order size.',
                    'Orders of four or more tyres are palletised to prevent transit damage and to make unloading manageable.',
                    `Orders of ${site.commerce.bulkThreshold} or more are palletised for forklift unloading and moved as bulk freight rather than through a parcel network.`,
                    'Delivered orders arrive as loose tyres for your own fitter. Wheel fitting is available on warehouse pickup orders only.',
                  ]}
                />
                <PolicyText>
                  If a consignment does arrive damaged it is covered for full replacement and
                  we pay the freight both ways. Photograph the damage and the packaging before
                  unwrapping any further, then call {site.phone.display} with your order
                  number. The full terms are on the{' '}
                  <Link to="/returns" className="link-underline font-semibold text-primary">
                    returns and warranty page
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              {/* ---------------- Tracking ---------------- */}
              <PolicySection id="tracking" title="Tracking and delivery">
                <PolicyList
                  items={[
                    'An order confirmation email is sent when the order is placed.',
                    `We do not issue courier tracking numbers at the moment. To find out where a delivery is, call ${site.phone.display} with your order reference.`,
                    'You can check the status of any order with your order reference and email on the order page. Customers with an account can see all their orders, their statement and their tax invoices in My account.',
                    'A signature is required on every delivery. A commercial depot or business address is usually easier than a residential one, because someone is there to sign for it.',
                  ]}
                />
                <PolicyText>
                  Deliveries are made during business hours. If nobody is available to sign,
                  the courier will follow their own re-delivery or card-left process, which
                  can add a day or more to the timeframe.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Bulk ---------------- */}
              <PolicySection id="bulk" title="Bulk orders and depot freight">
                <PolicyText>
                  At {site.commerce.bulkThreshold} tyres and above we arrange the freight
                  specifically rather than sending the consignment through a parcel network.
                  That means palletised deliveries direct to your depot, and unloading becomes
                  a forklift job instead of four people rolling tyres off a tail lift.
                </PolicyText>
                <PolicyText>
                  Fleet customers can have deliveries timed to a replacement calendar rather
                  than to breakdowns. Call {site.phone.display} to line up a collection time
                  or a scheduled depot delivery, or see the{' '}
                  <Link
                    to="/fleet-solutions"
                    className="link-underline font-semibold text-primary"
                  >
                    fleet solutions page
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              {/* ---------------- Couriers ---------------- */}
              <PolicySection id="couriers" title="Third-party couriers">
                <PolicyNote>
                  Delivery is handled by trusted third-party couriers. Timeframes are estimates
                  and are not guaranteed.
                </PolicyNote>
                <PolicyText>
                  We control when an order is picked, packed and dispatched — that is the{' '}
                  {site.commerce.dispatchWindow} window, and we hold ourselves to it. What
                  happens between our dock and your gate is in the courier network&rsquo;s
                  hands, and weather, road closures and regional run schedules all move it.
                  Where a delivery date genuinely matters, call us before you order and we will
                  tell you honestly what is realistic.
                </PolicyText>
                <PolicyText>
                  Nothing on this page limits your rights under Australian Consumer Law.
                </PolicyText>
              </PolicySection>

              <EntityBlock />
            </div>
          </div>
        </div>
      </div>

      <CtaBand
        title="Talk to our team about pricing, stock, or fleet enquiries"
        body="Not sure whether your address counts as metro, or what freight to a regional depot will cost? Ask before you order."
      />
    </>
  )
}
