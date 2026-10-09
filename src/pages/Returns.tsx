import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Phone, ShieldCheck } from 'lucide-react'
import { site } from '@/config/site'
import { warrantyTerms } from '@/data/content'
import { Seo, breadcrumbJsonLd, organisationJsonLd } from '@/components/Seo'
import { Button } from '@/components/ui'
import { Reveal } from '@/components/motion'
import {
  CtaBand,
  EntityBlock,
  PageHero,
  PillarGrid,
  PolicyList,
  PolicyNav,
  PolicyNote,
  PolicySection,
  PolicyText,
  SectionHeading,
  type PolicySectionDef,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /returns
 *
 * Warranty, 30-day returns and the RMA process. The distinction that
 * matters: the manufacturer warranty covers defects, road hazard
 * protection covers damage, and neither limits Australian Consumer Law.
 * ------------------------------------------------------------------ */

const SECTIONS: PolicySectionDef[] = [
  { id: 'warranty', title: 'Manufacturer warranty' },
  { id: 'hazard', title: 'Road hazard protection' },
  { id: 'returns', title: '30-day returns' },
  { id: 'rma', title: 'The RMA process' },
  { id: 'delivery', title: 'Delivery condition guarantee' },
  { id: 'acl', title: 'Australian Consumer Law' },
]

const RMA_STEPS = [
  {
    title: 'Get in touch with your order number',
    body: `Email ${site.email.sales} or call ${site.phone.display} with your order number and the reason for the return. For a warranty claim, include photos of the tyre, the four-digit date code from the sidewall, and the odometer reading or kilometres run.`,
  },
  {
    title: 'We issue an RMA number',
    body: 'Our team reviews the request and issues a Return Merchandise Authorisation (RMA) number. Nothing should be sent back before you have one — an unauthorised return cannot be matched to your order and will slow the process down.',
  },
  {
    title: 'Return or arrange assessment',
    body: 'Mark the RMA number clearly on the consignment and return the tyre in its original condition. For a warranty claim we arrange assessment of the tyre rather than asking you to guess at the cause.',
  },
  {
    title: 'Refund, replacement or repair',
    body: 'Once the return is received or the claim assessed, we process the refund, replacement or repair. Approved manufacturing defect claims have the freight covered both ways.',
  },
]

export default function Returns() {
  return (
    <>
      <Seo
        title="Returns & Warranty — Spartan Tyres"
        description="Manufacturer warranty against defects until the tread reaches 1.6mm, optional 2-year road hazard protection, 30-day returns on unused tyres, and a delivery condition guarantee. RMA process explained."
        canonicalPath="/returns"
        jsonLd={[
          organisationJsonLd,
          breadcrumbJsonLd([{ name: 'Returns & Warranty', path: '/returns' }]),
        ]}
      />

      <PageHero
        eyebrow="Returns and warranty"
        title="What is covered, what is not, and how to claim"
        lede="Every tyre carries the manufacturer's warranty against defects. Road hazard damage is a separate, optional cover. Unused tyres can go back within 30 days. All of it sits alongside your rights under Australian Consumer Law, which nothing here limits."
        breadcrumb={[{ name: 'Returns & Warranty', path: '/returns' }]}
        actions={
          <>
            <Button asChild size="lg">
              <a href={`mailto:${site.email.sales}`}>
                <Mail aria-hidden="true" className="h-4 w-4" />
                Start a claim
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
            <ShieldCheck aria-hidden="true" className="h-8 w-8 text-primary" />
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <div>
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Defect warranty
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  From purchase until 1.6mm tread
                </dd>
              </div>
              <div>
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Road hazard cover
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  Optional, first 2 years
                </dd>
              </div>
              <div>
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Unused returns
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  30 days, original condition
                </dd>
              </div>
              <div>
                <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  Transit damage
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  Full replacement, freight both ways
                </dd>
              </div>
            </dl>
          </Reveal>
        }
      />

      {/* ---------------- Terms at a glance ---------------- */}
      <section className="section-tight" aria-labelledby="returns-overview">
        <div className="shell">
          <SectionHeading
            id="returns-overview"
            eyebrow="At a glance"
            title="The four covers, in plain terms"
          />
          <PillarGrid items={warrantyTerms} columns={2} className="mt-10" />
        </div>
      </section>

      <div className="section border-t border-border">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-16">
            <PolicyNav sections={SECTIONS} className="order-first lg:order-none" />

            <div className="flex min-w-0 flex-col gap-10">
              {/* ---------------- Warranty ---------------- */}
              <PolicySection id="warranty" title="Manufacturer warranty">
                <PolicyText>{warrantyTerms[0].body}</PolicyText>

                <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                  What the defect warranty covers
                </h3>
                <PolicyList
                  items={[
                    'Faults in materials or workmanship, from the date of purchase until the tread wears to the 1.6mm legal minimum.',
                    'Assessment of the tyre by our team rather than a judgement made from a photograph alone.',
                    'Freight both ways on any claim approved as a manufacturing defect.',
                  ]}
                />

                <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                  What it does not cover
                </h3>
                <PolicyList
                  items={[
                    'Road hazard damage — potholes, nails, glass, kerb strikes and other impact damage. That is what the optional road hazard protection is for.',
                    'Damage caused by underinflation or overloading. Running a tyre underinflated builds heat in the casing, and heat damage is permanent.',
                    'Irregular wear caused by misalignment, worn suspension components or mismatched duals.',
                    'Fitting errors, including fitting a pattern to an axle position it is not rated for.',
                    'Tyres run past the legal minimum tread depth into the belt package.',
                  ]}
                />
                <PolicyText>
                  If you have an irregular wear pattern you cannot explain, send us a photo of
                  the tread and both sidewalls on {site.phone.display} before you order a
                  replacement. Fitting a new tyre without diagnosing the cause means buying
                  the same tyre again in a few months.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Road hazard ---------------- */}
              <PolicySection id="hazard" title="Road hazard protection">
                <PolicyText>{warrantyTerms[1].body}</PolicyText>
                <PolicyText>
                  It is worth considering if your trucks spend real time on unsealed or poorly
                  maintained roads, where cut-and-chip damage and impact breaks are the normal
                  failure mode rather than wear. Ask about the protection plan at checkout, or
                  call {site.phone.display} before you order and we will talk through whether
                  it makes sense for your duty cycle.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Returns ---------------- */}
              <PolicySection id="returns" title="30-day returns">
                <PolicyText>{warrantyTerms[2].body}</PolicyText>
                <PolicyList
                  items={[
                    'The return must be requested within 30 days of purchase.',
                    'Tyres must be unused and in original condition, with no mounting marks, scuffing or damage.',
                    'Return shipping charges may apply, unless the return is our error or the tyre is defective. Verifying a fitment before ordering is the buyer’s responsibility.',
                    'Mounted or fitted tyres cannot be returned unless they are defective under warranty.',
                  ]}
                />
                <PolicyNote>
                  Ordered the wrong size? Call {site.phone.display} before anything is fitted.
                  We would much rather check the specification with you than process a return —
                  and once a tyre has been mounted, the 30-day return no longer applies.
                </PolicyNote>
              </PolicySection>

              {/* ---------------- RMA ---------------- */}
              <PolicySection id="rma" title="The RMA process">
                <PolicyText>
                  Every return and warranty claim runs through a Return Merchandise
                  Authorisation number. It is how we match a tyre coming back to the order it
                  went out on, so please do not send anything back before you have one.
                </PolicyText>

                <ol className="flex flex-col gap-4">
                  {RMA_STEPS.map((step, index) => (
                    <li
                      key={step.title}
                      className="rounded-lg border border-border bg-card p-5"
                    >
                      <div className="flex items-baseline gap-3">
                        <span
                          aria-hidden="true"
                          className="font-heading text-sm font-black tabular-nums text-primary"
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                          {step.title}
                        </h3>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <a href={`mailto:${site.email.sales}`}>
                      <Mail aria-hidden="true" className="h-4 w-4" />
                      Email {site.email.sales}
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href={site.phone.href}>
                      <Phone aria-hidden="true" className="h-4 w-4" />
                      {site.phone.display}
                    </a>
                  </Button>
                </div>
              </PolicySection>

              {/* ---------------- Delivery condition ---------------- */}
              <PolicySection id="delivery" title="Delivery condition guarantee">
                <PolicyText>{warrantyTerms[3].body}</PolicyText>
                <PolicyList
                  items={[
                    'Photograph the damage and the packaging before unwrapping any further — the packaging is part of the evidence.',
                    `Call ${site.phone.display} or email ${site.email.sales} with your order number.`,
                    'We arrange the replacement and cover the freight in both directions on transit damage claims.',
                  ]}
                />
                <PolicyText>
                  How orders are packed, palletised and tracked is set out on the{' '}
                  <Link to="/shipping" className="link-underline font-semibold text-primary">
                    shipping and delivery page
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              {/* ---------------- ACL ---------------- */}
              <PolicySection id="acl" title="Australian Consumer Law">
                <PolicyText>
                  Our goods come with guarantees that cannot be excluded under the Australian
                  Consumer Law. Nothing in this policy, in the manufacturer&rsquo;s warranty
                  terms, or in our terms and conditions limits or replaces those rights.
                </PolicyText>
                <PolicyText>
                  Where a failure is major you are entitled to a replacement or refund and to
                  compensation for any other reasonably foreseeable loss or damage. Where a
                  failure does not amount to a major failure, you are entitled to have the
                  problem fixed within a reasonable time, and if that is not done, to a refund
                  or replacement.
                </PolicyText>
                <PolicyText>
                  If you believe a tyre has failed to meet a consumer guarantee, contact us on{' '}
                  {site.phone.display} and we will work through it with you. The full terms of
                  sale are on the{' '}
                  <Link to="/terms" className="link-underline font-semibold text-primary">
                    terms and conditions page
                  </Link>
                  .
                </PolicyText>
              </PolicySection>

              <EntityBlock />
            </div>
          </div>
        </div>
      </div>

      <section className="section-tight border-t border-border bg-card" aria-labelledby="returns-faq">
        <div className="shell">
          <SectionHeading
            id="returns-faq"
            eyebrow="More answers"
            title="Warranty and returns questions"
            lede="The frequently asked questions page covers claim turnaround, what happens if you order the wrong size, and retreading in more detail."
          />
          <Button asChild variant="outline" className="mt-8">
            <Link to="/faq">
              Read the FAQs
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <CtaBand
        title="Talk to our team about pricing, stock, or fleet enquiries"
        body="Warranty claim, wrong size, or a wear pattern you cannot explain — call and we will work through it with you."
      />
    </>
  )
}
