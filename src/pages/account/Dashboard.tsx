import { Link } from 'react-router-dom'
import { ArrowRight, Clock, CreditCard, FileText, Mail, Package, Phone, ShoppingBag, UserCog } from 'lucide-react'
import { site } from '@/config/site'
import { Badge } from '@/components/ui'
import { AccountPage, Notice, RequireAccount } from '@/components/account/AccountUi'
import { LEVEL_LABEL, availableCredit, shortName, termsText } from '@/lib/account-portal'
import { moneyExact } from '@/lib/utils'
import { useAccount } from '@/store/account'

/* /account: the dashboard. Level, any request waiting for the team, pay later figures and quick links. */
export default function Dashboard() {
  return (
    <RequireAccount>
      <Inner />
    </RequireAccount>
  )
}

function Inner() {
  const me = useAccount((s) => s.me)
  if (!me) return null
  const left = availableCredit(me.creditLimit, me.outstanding)

  return (
    <AccountPage
      title="My account"
      heading={`Welcome, ${shortName(me)}`}
      lede={me.company ? me.company : me.email}
      width="wide"
    >
      <div className="flex flex-col gap-6">
        {me.requestedLevel ? (
          <Notice tone="warning" title={`Waiting for approval: ${LEVEL_LABEL[me.requestedLevel]} account`}>
            <span className="flex items-start gap-2">
              <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Our team is checking your request. Until it is approved you are a {LEVEL_LABEL[me.level]} account. We will email you when it changes. Questions? Call{' '}
                <a href={site.phone.href} className="link-underline font-semibold text-primary">
                  {site.phone.display}
                </a>
                .
              </span>
            </span>
          </Notice>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="min-w-0 rounded-lg border border-border bg-card p-5 md:p-6" aria-labelledby="acct-level">
            <h2 id="acct-level" className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
              Account level
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge variant="primary" size="md">
                {LEVEL_LABEL[me.level]}
              </Badge>
              {me.discountPct > 0 ? (
                <Badge variant="success" size="md">
                  {me.discountPct}% agreed discount
                </Badge>
              ) : null}
            </div>
            <p className="mt-4 break-words text-sm leading-relaxed text-muted-foreground">
              {me.level === 'customer'
                ? 'You buy at our normal shop prices and pay by card at checkout.'
                : me.discountPct > 0
                  ? `Your account has ${me.discountPct}% off our normal prices, plus any special prices our team has set for you.`
                  : 'Your account is set up by our team. Any special prices agreed with you apply to your orders.'}
            </p>
          </section>

          {me.payLater ? (
            <section className="min-w-0 rounded-lg border border-border bg-card p-5 md:p-6" aria-labelledby="acct-credit">
              <h2 id="acct-credit" className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                <CreditCard aria-hidden="true" className="h-4 w-4 text-primary" />
                Pay later
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Terms</dt>
                  <dd className="font-semibold text-foreground">{termsText(me.termsDays)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Credit limit</dt>
                  <dd className="font-heading font-bold tabular-nums text-foreground">{moneyExact(me.creditLimit)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Owing now</dt>
                  <dd className="font-heading font-bold tabular-nums text-foreground">{moneyExact(me.outstanding)}</dd>
                </div>
                <div className="col-span-2 border-t border-border pt-3">
                  <dt className="text-xs text-muted-foreground">Available to spend</dt>
                  <dd className="font-heading text-2xl font-black tabular-nums text-primary">{moneyExact(left)}</dd>
                </div>
              </dl>
            </section>
          ) : (
            <section className="min-w-0 rounded-lg border border-border bg-card p-5 md:p-6" aria-labelledby="acct-contact">
              <h2 id="acct-contact" className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Your details
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2 break-all">
                  <Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {me.email}
                </li>
                {me.phone ? (
                  <li className="flex items-start gap-2">
                    <Phone aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {me.phone}
                  </li>
                ) : null}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Want to pay later on account? Ask our team on{' '}
                <a href={site.phone.href} className="link-underline font-semibold text-primary">
                  {site.phone.display}
                </a>
                .
              </p>
            </section>
          )}
        </div>

        <section aria-labelledby="acct-links">
          <h2 id="acct-links" className="sr-only">
            Quick links
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            <QuickLink to="/shop" icon={<ShoppingBag aria-hidden="true" className="h-5 w-5" />} title="Shop tyres" body="Browse the full range." />
            <QuickLink to="/account/orders" icon={<Package aria-hidden="true" className="h-5 w-5" />} title="Your orders" body="Track orders, reorder and print tax invoices." />
            <QuickLink to="/account/statement" icon={<FileText aria-hidden="true" className="h-5 w-5" />} title="Your statement" body="See what is owing and what you have paid." />
            <QuickLink to="/account/details" icon={<UserCog aria-hidden="true" className="h-5 w-5" />} title="Your details" body="Update your details or change your password." />
          </ul>
        </section>
      </div>
    </AccountPage>
  )
}

function QuickLink({ to, icon, title, body }: { to: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex h-full items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-sm font-bold uppercase tracking-tight text-foreground">{title}</span>
          <span className="block text-sm text-muted-foreground">{body}</span>
        </span>
        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </li>
  )
}
