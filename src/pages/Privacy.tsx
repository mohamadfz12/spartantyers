import { Link } from 'react-router-dom'
import { site } from '@/config/site'
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
 * /privacy
 *
 * A real policy for this business: what the site collects, why, who it
 * goes to, and what we deliberately never hold — card numbers being
 * the important one, since payments are processed by Square.
 * ------------------------------------------------------------------ */

const SECTIONS: PolicySectionDef[] = [
  { id: 'scope', title: 'Who this policy covers' },
  { id: 'collect', title: 'What we collect' },
  { id: 'why', title: 'Why we collect it' },
  { id: 'payments', title: 'Payment information' },
  { id: 'cookies', title: 'Cookies, analytics and advertising' },
  { id: 'disclosure', title: 'Who we share information with' },
  { id: 'security', title: 'How we protect it' },
  { id: 'retention', title: 'How long we keep it' },
  { id: 'rights', title: 'Access, correction and opting out' },
  { id: 'contact', title: 'Questions and complaints' },
]

export default function Privacy() {
  return (
    <>
      <Seo
        title="Privacy Policy — Spartan Tyres"
        description={`How ${site.legalName} collects, uses and protects personal information. Card payments are processed by Square and never stored by us.`}
        canonicalPath="/privacy"
        jsonLd={breadcrumbJsonLd([{ name: 'Privacy Policy', path: '/privacy' }])}
      />

      <PageHero
        eyebrow="Legal"
        title="Privacy policy"
        lede={`How ${site.legalName} collects, uses, stores and discloses personal information, and what you can ask us to do with it. Written to be read rather than filed.`}
        breadcrumb={[{ name: 'Privacy Policy', path: '/privacy' }]}
        meta={<span>Last updated {POLICY_UPDATED}</span>}
      />

      <div className="section">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-16">
            <PolicyNav sections={SECTIONS} className="order-first lg:order-none" />

            <div className="flex min-w-0 flex-col gap-10">
              {/* ---------------- Scope ---------------- */}
              <PolicySection id="scope" title="Who this policy covers">
                <PolicyText>
                  This policy applies to {site.legalName} (&ldquo;we&rdquo;,
                  &ldquo;us&rdquo;), trading as {site.name}, and to everything you do on{' '}
                  {site.domain} — browsing, ordering, requesting a quote, applying for a trade
                  account, subscribing to our updates or contacting us by phone or email.
                </PolicyText>
                <PolicyText>
                  We handle personal information in accordance with the Privacy Act 1988 (Cth)
                  and the Australian Privacy Principles. We are a business-to-business and
                  retail supplier of commercial tyres, so most of the information we hold is
                  ordinary contact and order detail rather than anything sensitive. We do not
                  collect sensitive information as defined by the Privacy Act, and we do not
                  knowingly collect information from children.
                </PolicyText>
              </PolicySection>

              {/* ---------------- What we collect ---------------- */}
              <PolicySection id="collect" title="What we collect">
                <PolicyText>
                  We collect only what we need to quote, supply and deliver tyres, and to
                  support them afterwards.
                </PolicyText>

                <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                  Information you give us
                </h3>
                <PolicyList
                  items={[
                    'Your name, business or trading name, email address and phone number, whenever you order, request a quote, apply for a trade account or send an enquiry.',
                    'The delivery address for your order, or your nomination to collect from our warehouse.',
                    'Order detail: the tyres, sizes and quantities you buy, whether you add wheel fitting on a pickup order, and any notes you include with the order.',
                    'The content of enquiries — including fitment questions, fleet size, estimated volumes, depot locations and photographs of sidewalls you send us so we can confirm a specification.',
                    'Your email address alone, if you subscribe to our updates without ordering.',
                  ]}
                />

                <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                  Information collected automatically
                </h3>
                <PolicyList
                  items={[
                    'Standard web server and analytics data: IP address, approximate location derived from it, browser and device type, the pages you viewed, referring site and the date and time.',
                    'Cookie and local-storage values that remember your cart, your light or dark theme preference and your comparison selections.',
                  ]}
                />

                <PolicyNote>
                  We never ask for and never receive your full card number, expiry date or
                  security code. See the payment information section below.
                </PolicyNote>
              </PolicySection>

              {/* ---------------- Why ---------------- */}
              <PolicySection id="why" title="Why we collect it">
                <PolicyList
                  items={[
                    'To process, pack, dispatch and deliver your order, and to contact you about it — including arranging and confirming non-metro freight before dispatch, and letting you know when a pickup order is ready.',
                    'To answer fitment and stock questions, prepare fleet and wholesale quotes, and assess trade account applications.',
                    'To issue tax invoices and meet our record-keeping and tax obligations.',
                    'To handle warranty claims, returns and Return Merchandise Authorisation requests, which requires us to match a tyre coming back to the order it went out on.',
                    'To send you updates about products, stock and offers, if you have asked for them.',
                    'To understand how the site is used so we can improve it, and to measure whether our advertising is working.',
                  ]}
                />
                <PolicyText>
                  If you choose not to give us the information an order needs, we may not be
                  able to supply or deliver it. Everything beyond that is optional.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Payments ---------------- */}
              <PolicySection id="payments" title="Payment information">
                <PolicyText>
                  Card payments on this site are processed by{' '}
                  <span className="font-semibold text-foreground">Square</span>. Your card
                  details are entered into Square&rsquo;s own hosted payment fields, encrypted
                  in your browser and sent directly to Square.{' '}
                  <span className="font-semibold text-foreground">
                    We never see, handle or store your card number, expiry date or security
                    code
                  </span>{' '}
                  — not in our database, not in our emails, and not in our records.
                </PolicyText>
                <PolicyText>
                  What we receive back from Square is a payment confirmation: a payment
                  reference, the amount, and the result. If you use Afterpay, available on
                  orders up to ${site.commerce.afterpayMaxOrder.toLocaleString('en-AU')}, your
                  payment arrangement is between you and Afterpay and is subject to their own
                  terms and privacy policy. If you pay by bank transfer, we see only the
                  information your bank includes with the transfer.
                </PolicyText>
                <PolicyText>
                  Square and Afterpay handle your payment information under their own privacy
                  policies, which we recommend reading if you want the detail of how a payment
                  provider treats your data.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Cookies ---------------- */}
              <PolicySection id="cookies" title="Cookies, analytics and advertising">
                <PolicyText>
                  Some cookies and local-storage values are needed for the site to work: they
                  remember what is in your cart, whether you have chosen the dark theme, and
                  which tyres you have added to a comparison. Those are stored in your own
                  browser and are not shared with anyone.
                </PolicyText>
                <PolicyText>
                  We also use Google tags for analytics and advertising measurement, under the
                  tag ID{' '}
                  <span className="font-heading text-sm font-bold tracking-tight text-foreground">
                    {site.analytics.gtagId}
                  </span>
                  . These tell us how visitors find and use the site and whether a Google Ads
                  campaign led to an order. Google may set its own cookies and may use this
                  data in accordance with its own policies, including for advertising
                  personalisation and remarketing.
                </PolicyText>
                <PolicyList
                  items={[
                    'You can block or delete cookies in your browser settings. Blocking the functional ones will stop the cart and theme preference from being remembered between visits.',
                    'You can opt out of personalised Google advertising through Google’s own ad settings, and you can install the Google Analytics opt-out browser add-on.',
                    'We do not sell your personal information to anyone, and we do not share it with advertisers for their own marketing.',
                  ]}
                />
              </PolicySection>

              {/* ---------------- Disclosure ---------------- */}
              <PolicySection id="disclosure" title="Who we share information with">
                <PolicyText>
                  We disclose personal information only where it is needed to do the job you
                  have asked us to do, or where the law requires it.
                </PolicyText>
                <PolicyList
                  items={[
                    'Freight and courier companies, who receive the delivery name, address and phone number so they can deliver the consignment and obtain a signature.',
                    'Square, as our payment processor, and Afterpay where you choose it.',
                    `${site.partner.name}, our sister business at ${site.partner.address}, where you have asked us to source a brand or size we do not stock, or where a fitting or wash booking is involved.`,
                    'Service providers who operate parts of our infrastructure — website hosting, email and order management — under confidentiality obligations and only to the extent needed to provide the service.',
                    'Our accountants and professional advisers, and government agencies where we are required to disclose by law.',
                  ]}
                />
                <PolicyText>
                  Some of these providers, including Square and Google, operate servers
                  outside Australia, so your information may be stored or processed overseas
                  by them. We do not otherwise transfer personal information overseas, and we
                  do not disclose it for any purpose unrelated to supplying you tyres.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Security ---------------- */}
              <PolicySection id="security" title="How we protect it">
                <PolicyList
                  items={[
                    'The site is served over HTTPS, so information you submit is encrypted in transit.',
                    'Order and enquiry records are held in access-controlled systems, and administrative access is limited to the staff who need it to do their job.',
                    'Card data is never in our systems at all, which is the single most effective protection we can offer on the most sensitive information involved in a tyre order.',
                  ]}
                />
                <PolicyText>
                  No method of transmission or storage is completely secure, and we will not
                  pretend otherwise. If we became aware of a data breach likely to cause
                  serious harm, we would notify affected individuals and the Office of the
                  Australian Information Commissioner as required by the Notifiable Data
                  Breaches scheme.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Retention ---------------- */}
              <PolicySection id="retention" title="How long we keep it">
                <PolicyText>
                  Order and invoice records are kept for as long as our tax and
                  record-keeping obligations require, and for as long as a warranty claim
                  could reasonably be made — a defect warranty runs until the tread reaches
                  1.6mm, so order history is genuinely useful years after the sale.
                </PolicyText>
                <PolicyText>
                  Enquiries and quote requests that do not become orders are kept while they
                  are commercially useful and then deleted. Newsletter subscriptions are kept
                  until you unsubscribe. Analytics data is retained according to Google&rsquo;s
                  own retention settings.
                </PolicyText>
              </PolicySection>

              {/* ---------------- Rights ---------------- */}
              <PolicySection id="rights" title="Access, correction and opting out">
                <PolicyText>
                  You can ask us for a copy of the personal information we hold about you, and
                  you can ask us to correct anything that is wrong or out of date. Email{' '}
                  <a
                    href={`mailto:${site.email.sales}`}
                    className="link-underline break-all font-semibold text-primary"
                  >
                    {site.email.sales}
                  </a>{' '}
                  or call{' '}
                  <a
                    href={site.phone.href}
                    className="link-underline font-semibold text-primary"
                  >
                    {site.phone.display}
                  </a>
                  . We will need to verify who you are before releasing anything, and we will
                  respond within a reasonable time at no charge.
                </PolicyText>
                <PolicyList
                  items={[
                    'Every marketing email we send carries an unsubscribe link, and unsubscribing takes effect immediately.',
                    'You can ask us to delete information we are not legally required to keep. Where tax or warranty obligations mean we must retain an order record, we will tell you that rather than quietly ignoring the request.',
                    'You can ask us to stop calling or emailing you about a quote at any time.',
                  ]}
                />
              </PolicySection>

              {/* ---------------- Contact ---------------- */}
              <PolicySection id="contact" title="Questions and complaints">
                <PolicyText>
                  If you have a question about this policy, or you think we have mishandled
                  your personal information, contact us first — we would rather fix it
                  directly. Call {site.phone.display} during {site.hours.short}, or email{' '}
                  <a
                    href={`mailto:${site.email.sales}`}
                    className="link-underline break-all font-semibold text-primary"
                  >
                    {site.email.sales}
                  </a>
                  . Write to us at {site.office.full} if you would prefer it in writing.
                </PolicyText>
                <PolicyText>
                  We will acknowledge your complaint and respond within a reasonable time. If
                  you are not satisfied with our response, you can raise the matter with the
                  Office of the Australian Information Commissioner.
                </PolicyText>
                <PolicyText>
                  We may update this policy as the business or the law changes. The current
                  version always sits on this page with its revision date, and material
                  changes will be reflected here rather than announced after the fact. See
                  also our{' '}
                  <Link to="/terms" className="link-underline font-semibold text-primary">
                    terms and conditions
                  </Link>
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
        body="Privacy questions, access requests or anything else — a phone call is usually the fastest way to sort it out."
      />
    </>
  )
}
