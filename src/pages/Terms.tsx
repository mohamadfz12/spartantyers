import { Link } from 'react-router-dom'
import { site } from '@/config/site'
import { PRICE_BREAKS } from '@/data/products'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import {
  CtaBand,
  EntityBlock,
  POLICY_UPDATED,
  PageHero,
  PolicyList,
  PolicyNav,
  PolicyNote,
  PolicySection,
  PolicyText,
  type PolicySectionDef,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /terms
 *
 * The terms of sale, written against how this business actually
 * operates: GST-inclusive pricing, published volume breaks, pre-orders
 * on out-of-stock lines, non-metro freight confirmed before dispatch,
 * fitting on pickup orders only, and NSW governing law.
 * ------------------------------------------------------------------ */

const SECTIONS: PolicySectionDef[] = [
  { id: 'about', title: 'These terms' },
  { id: 'orders', title: 'Orders and acceptance' },
  { id: 'pricing', title: 'Pricing, GST and payment' },
  { id: 'stock', title: 'Stock, pre-orders and sourcing' },
  { id: 'delivery', title: 'Delivery, title and risk' },
  { id: 'pickup', title: 'Pickup and wheel fitting' },
  { id: 'fitment', title: 'Fitment and suitability' },
  { id: 'warranty', title: 'Warranty' },
  { id: 'returns', title: 'Returns and cancellations' },
  { id: 'liability', title: 'Liability' },
  { id: 'site', title: 'Using this website' },
  { id: 'law', title: 'Governing law and contact' },
]

const breakSummary = PRICE_BREAKS.map(
  (tier) => `${tier.label} ${Math.round(tier.discount * 100)}%`,
).join(', ')

export default function Terms() {
  return (
    <>
      <Seo
        title="Terms & Conditions — Spartan Tyres"
        description={`The terms of sale for ${site.legalName}: orders, GST-inclusive pricing, volume breaks, delivery and risk, pickup and fitting, warranty, returns and governing law.`}
        canonicalPath="/terms"
        jsonLd={breadcrumbJsonLd([{ name: 'Terms & Conditions', path: '/terms' }])}
      />

      <PageHero
        eyebrow="Legal"
        title="Terms and conditions"
        lede={`The terms on which ${site.legalName} sells and supplies tyres. They are written to match how we actually operate, so nothing here should surprise you after you order.`}
        breadcrumb={[{ name: 'Terms & Conditions', path: '/terms' }]}
        meta={<span>Last updated {POLICY_UPDATED}</span>}
      />

      <div className="section">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-16">
            <PolicyNav sections={SECTIONS} className="order-first lg:order-none" />

            <div className="flex min-w-0 flex-col gap-10">
              {/* ---------------- About ---------------- */}
              <PolicySection id="about" title="These terms">
                <PolicyText>
                  These terms apply to every order placed with {site.legalName}{' '}
                  (&ldquo;we&rdquo;, &ldquo;us&rdquo;), trading as {site.name}, whether placed
                  through {site.domain}, by phone on {site.phone.display} or by email. By
                  placing an order you accept them.
                </PolicyText>
                <PolicyText>
                  We are an online and telephone supplier of commercial truck, bus and trailer
                  tyres. We are not a retail store and not a fitting workshop. The only
                  exception to that is wheel fitting on warehouse pickup orders, set out
                  below.
                </PolicyText>
                <PolicyText>
                  We may update these terms. The version published on this page at the time
                  you place your order is the version that applies to it.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Orders ---------------- */}
              <PolicySection id="orders" title="Orders and acceptance">
                <PolicyList
                  items={[
                    'An order placed on the site is an offer to buy. A contract is formed when we accept it, which we do by confirming the order and taking payment.',
                    'We may decline or cancel an order before dispatch — for example where a line has sold out, where a price or specification has been published in error, or where we cannot verify the payment. If we do, we refund any amount already paid in full.',
                    'Order confirmations and dispatch notifications are sent to the email address you give us, so please make sure it is correct.',
                    'Changes to an order are possible until it has been picked. Once a consignment is packed or dispatched, a change becomes a return.',
                    'There is no minimum order and no minimum spend.',
                  ]}
                />
              </PolicySection>

              {/* ---------------- Pricing ---------------- */}
              <PolicySection id="pricing" title="Pricing, GST and payment">
                <PolicyText>
                  Every price shown on this site is in Australian dollars and is{' '}
                  <span className="font-semibold text-foreground">GST inclusive</span>, so the
                  figure in the cart is the figure you pay. A tax invoice showing the GST
                  component separately is emailed with your order confirmation, and customers
                  with an account can view and print their tax invoices in My account at any time.
                </PolicyText>
                <PolicyList
                  items={[
                    `Volume price breaks are published rather than negotiated: ${breakSummary}. They apply across the whole order rather than per line, and are calculated automatically in the cart.`,
                    'Accepted payment methods are all major credit and debit cards through Square, Afterpay on orders up to $' +
                      site.commerce.afterpayMaxOrder.toLocaleString('en-AU') +
                      ', and bank transfer.',
                    'Card payments are processed by Square. We never see or store your card details.',
                    'Where you pay by bank transfer, goods are dispatched once the funds clear, which usually adds a business day or two.',
                    'Prices may change without notice, but a change never affects an order we have already accepted.',
                  ]}
                />
                <PolicyText>
                  If you need an invoice reissued to a different entity name for your accounts,
                  email {site.email.sales} with the order number. For trade account facilities,
                  contact {site.email.accounts}.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Stock ---------------- */}
              <PolicySection id="stock" title="Stock, pre-orders and sourcing">
                <PolicyText>
                  Stock figures on the site reflect what is on hand in our warehouse at{' '}
                  {site.warehouse.full}. We hold Greforce and Lionshead ourselves. Other
                  brands shown on our brands page are not held by us and are ordered in on
                  request rather than supplied from our stock.
                </PolicyText>
                <PolicyList
                  items={[
                    'Out-of-stock lines can be pre-ordered, which allocates you stock from the next shipment rather than placing you on a waiting list. Normal dispatch and handling times apply once the shipment lands.',
                    'Lines marked POA (price on application) are built to order and are not sold through the online checkout. We confirm price, specification and lead time with you in writing before taking any payment.',
                    'Lead times quoted on pre-orders and sourced items are estimates based on supplier advice and are not guaranteed.',
                    'Where we source a specialty or hard-to-find fitment, we come back to you with availability, lead time and price before you commit to anything.',
                    'Specifications can vary between production batches on some lines — load index and speed symbol in particular. Always check the sidewall of what arrives against your vehicle compliance plate before fitting.',
                  ]}
                />
              </PolicySection>

              {/* ---------------- Delivery ---------------- */}
              <PolicySection id="delivery" title="Delivery, title and risk">
                <PolicyList
                  items={[
                    `We dispatch from ${site.warehouse.suburb} within ${site.commerce.dispatchWindow} on business days. Metro delivery is free with no minimum spend and typically takes ${site.commerce.metroDeliveryEstimate} from dispatch.`,
                    'There is no upfront freight charge for non-metro addresses. We contact you after the order is placed to arrange the delivery and confirm the cost, and nothing is dispatched until you have agreed to it.',
                    'Delivery is handled by trusted third-party couriers. Timeframes are estimates and are not guaranteed.',
                    'A signature is required on every delivery. It is your responsibility to have someone available to receive and sign for the consignment at the address you nominate.',
                    'Title in the goods passes to you on payment in full. Risk passes to you on delivery, or on collection where you choose pickup.',
                    'Any transit damage must be reported promptly, with photographs of the damage and the packaging, so we can claim against the carrier. We cover full replacement and freight both ways on transit damage.',
                  ]}
                />
                <PolicyText>
                  The full delivery process, packaging standards and bulk freight
                  arrangements are set out on the{' '}
                  <Link to="/shipping" className="link-underline font-semibold text-primary">
                    shipping and delivery page
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              {/* ---------------- Pickup ---------------- */}
              <PolicySection id="pickup" title="Pickup and wheel fitting">
                <PolicyList
                  items={[
                    `Pickup is free. Choose Pickup at checkout and collect from ${site.warehouse.full} — the warehouse, not our head office at ${site.office.street}. We contact you when the order is ready to collect.`,
                    `Pickup orders may add professional wheel fitting at $${site.commerce.fittingFeePerTyre} per tyre, selected at checkout. Fitting is carried out on site at our Yennora premises.`,
                    'Fitting is available on pickup orders only. Delivered orders arrive as loose tyres for your own fitter.',
                  ]}
                />
                <PolicyNote>
                  Please do not send couriers or arrange collections at{' '}
                  {site.office.street} — no stock is held at the head office.
                </PolicyNote>
              </PolicySection>

              {/* ---------------- Fitment ---------------- */}
              <PolicySection id="fitment" title="Fitment and suitability">
                <PolicyText>
                  Choosing a tyre that suits your vehicle, its axle masses and its duty cycle
                  is ultimately your responsibility as the operator. The load index and speed
                  symbol you fit must meet or exceed the requirements on your vehicle
                  compliance plate, and tread depth must remain above the 1.6mm legal minimum.
                </PolicyText>
                <PolicyText>
                  We will help with that, and we would much rather check a specification than
                  process a return. Send a photograph of the sidewall and the rim stamping to{' '}
                  {site.email.sales}, or call {site.phone.display} with your axle masses, and
                  we will confirm the fitment before you order. Advice we give is offered in
                  good faith on the information you provide; it does not transfer
                  responsibility for the vehicle&rsquo;s compliance or for how the tyre is
                  fitted and maintained.
                </PolicyText>
                <PolicyList
                  items={[
                    'Fit patterns only to the axle positions the manufacturer rates them for. Fitting a drive-only pattern to a steer axle is outside the warranty and is unsafe.',
                    'Fitting, balancing and torquing must be carried out by a competent fitter using proper equipment.',
                    'Match diameters and tread patterns within a dual pair and across an axle.',
                  ]}
                />
              </PolicySection>

              {/* ---------------- Warranty ---------------- */}
              <PolicySection id="warranty" title="Warranty">
                <PolicyText>
                  All tyres carry the manufacturer&rsquo;s warranty against defects in
                  materials and workmanship, from the date of purchase until the tread wears
                  to 1.6mm. That covers manufacturing faults. It does not cover damage from
                  road hazards, underinflation, overloading, misalignment or fitting errors.
                </PolicyText>
                <PolicyText>
                  Optional road hazard protection covering impact and debris damage is
                  available for the first 2 years. Claims are made by contacting us with your
                  order number, photographs and the sidewall date code, after which we issue a
                  Return Merchandise Authorisation number and arrange assessment. The full
                  process is on the{' '}
                  <Link to="/returns" className="link-underline font-semibold text-primary">
                    returns and warranty page
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              {/* ---------------- Returns ---------------- */}
              <PolicySection id="returns" title="Returns and cancellations">
                <PolicyList
                  items={[
                    'Unused tyres may be returned within 30 days of purchase for a full refund, provided they are in original condition with no mounting marks or damage.',
                    'Return shipping charges may apply unless the return is our error or the tyre is defective.',
                    'Mounted or fitted tyres cannot be returned unless they are defective under warranty.',
                    'A Return Merchandise Authorisation number must be obtained before anything is sent back, so the return can be matched to your order.',
                    'An order can be cancelled at no cost until it has been picked. After dispatch, cancellation is handled as a return.',
                  ]}
                />
              </PolicySection>

              {/* ---------------- Liability ---------------- */}
              <PolicySection id="liability" title="Liability">
                <PolicyNote>
                  Our goods come with guarantees that cannot be excluded under the Australian
                  Consumer Law. Nothing in these terms excludes, restricts or modifies those
                  guarantees or any other right you have that cannot lawfully be excluded.
                </PolicyNote>
                <PolicyText>
                  Where a failure is major, you are entitled to a replacement or refund and to
                  compensation for any other reasonably foreseeable loss or damage. Where a
                  failure is not major, you are entitled to have the problem fixed within a
                  reasonable time, and if that is not done, to a refund or replacement.
                </PolicyText>
                <PolicyText>
                  Subject to those rights, and to the extent permitted by law: our liability
                  for any claim relating to goods we supply is limited, at our option, to
                  replacing the goods, supplying equivalent goods, or refunding the price
                  paid; we are not liable for indirect or consequential loss, including loss
                  of profit, loss of use, downtime, towing, recovery or substitute hire costs;
                  and we are not liable for loss or damage arising from incorrect fitting,
                  fitting to an axle position the tyre is not rated for, operation outside the
                  tyre&rsquo;s load or speed rating, underinflation, overloading, misalignment
                  or defective vehicle components.
                </PolicyText>
                <PolicyText>
                  We are not liable for delays caused by events outside our reasonable
                  control, including courier network delays, severe weather, road closures or
                  supply interruptions.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Site ---------------- */}
              <PolicySection id="site" title="Using this website">
                <PolicyList
                  items={[
                    'Specifications, images and diagrams on this site are provided to help you identify a fitment. Tread diagrams and 3D models are representations generated from manufacturer specification data, not photographs of the individual tyre you will receive.',
                    'Manufacturer names and trade marks referred to on this site belong to their respective owners and are used only to identify products. Their logos appear only to show which brands we stock or can source; no affiliation with or endorsement by those manufacturers is implied.',
                    'Content on this site is ours or used with permission, and may not be reproduced commercially without our consent.',
                    'We aim to keep stock, pricing and specification data accurate, and it is reviewed against the manufacturer data sheets, but we do not warrant that it is free of error. Where an error affects your order we will contact you before dispatch.',
                  ]}
                />
                <PolicyText>
                  How we handle personal information collected through the site is set out in
                  our{' '}
                  <Link to="/privacy" className="link-underline font-semibold text-primary">
                    privacy policy
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              {/* ---------------- Law ---------------- */}
              <PolicySection id="law" title="Governing law and contact">
                <PolicyText>
                  These terms are governed by the laws of New South Wales, Australia, and you
                  and we submit to the non-exclusive jurisdiction of the courts of New South
                  Wales and the Commonwealth of Australia.
                </PolicyText>
                <PolicyText>
                  If any provision of these terms is found to be unenforceable, it is severed
                  and the remaining provisions continue to apply.
                </PolicyText>
                <PolicyText>
                  Questions about these terms, an order or an invoice: call{' '}
                  <a
                    href={site.phone.href}
                    className="link-underline font-semibold text-primary"
                  >
                    {site.phone.display}
                  </a>{' '}
                  during {site.hours.short}, or email{' '}
                  <a
                    href={`mailto:${site.email.sales}`}
                    className="link-underline break-all font-semibold text-primary"
                  >
                    {site.email.sales}
                  </a>
                  .
                </PolicyText>
              </PolicySection>

              <EntityBlock />
            </div>
          </div>
        </div>
      </div>

      <CtaBand
        title="Talk to our team about pricing, stock, or fleet enquiries"
        body="If something in these terms is unclear before you order, ask us. It is a short phone call."
      />
    </>
  )
}
