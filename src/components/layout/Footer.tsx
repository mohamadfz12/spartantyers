import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Clock,
  CreditCard,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
} from 'lucide-react'
import { nav, site } from '@/config/site'
import { api } from '@/lib/api'
import { isValidEmail } from '@/lib/utils'
import { Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/brand/Logo'
import { Reveal } from '@/components/motion'
import { toast } from '@/store/ui'

export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden bg-charcoal text-charcoal-foreground">
      {/* Tread strip along the top edge — the brand motif as a divider. */}
      <div className="tread-texture h-3 w-full bg-primary/90" />

      <NewsletterBand />

      <div className="shell py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo className="text-charcoal-foreground" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">
              Australia's trusted supplier of premium truck and bus tyres.
              Strength, reliability and performance for your fleet.
            </p>

            <ul className="mt-6 space-y-3 text-sm">
              <li>
                <a
                  href={site.phone.href}
                  className="flex items-center gap-2.5 text-white/80 transition-colors hover:text-primary"
                >
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-heading font-bold">{site.phone.display}</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${site.email.sales}`}
                  className="flex items-center gap-2.5 text-white/70 transition-colors hover:text-primary"
                >
                  <Mail className="h-4 w-4 shrink-0 text-primary" />
                  <span className="break-all">{site.email.sales}</span>
                </a>
              </li>
              <li>
                <a
                  href={site.office.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 text-white/70 transition-colors hover:text-primary"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{site.office.full}</span>
                </a>
              </li>
              <li className="flex items-start gap-2.5 text-white/70">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{site.hours.label}</span>
              </li>
            </ul>
          </div>

          {nav.footer.map((column) => (
            <div key={column.title}>
              <h3 className="mb-4 font-heading text-xs font-bold uppercase tracking-brand text-primary">
                {column.title}
              </h3>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="text-sm text-white/65 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Partner callout */}
        <div className="mt-12 rounded-lg border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p className="font-heading text-xs font-bold uppercase tracking-brand text-primary">
                Our partner site
              </p>
              <h3 className="mt-1.5 font-heading text-lg font-bold">
                {site.partner.name}
              </h3>
              <p className="mt-1.5 max-w-xl text-sm text-white/65">
                Need fitting, a truck wash, an RTA inspection or a wheel
                alignment — or a brand we don't stock? Our sister business
                operates from the same Yennora site.
              </p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                {site.partner.services.map((service) => (
                  <span key={service}>{service}</span>
                ))}
              </p>
            </div>

            <Button asChild variant="outline" className="shrink-0">
              <a
                href={site.partner.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit our partner ${site.partner.name} website (opens in a new tab)`}
              >
                Visit {site.partner.name}
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-10 grid gap-4 border-t border-white/10 pt-8 sm:grid-cols-3">
          {[
            {
              icon: Truck,
              title: 'Free metro delivery',
              body: `${site.commerce.metroDeliveryEstimate}, no minimum spend`,
            },
            {
              icon: ShieldCheck,
              title: 'Manufacturer warranty',
              body: 'Covered against defects to 1.6mm tread',
            },
            {
              icon: CreditCard,
              title: 'Secure payment',
              body: 'Card, Afterpay and bank transfer',
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-heading text-sm font-bold">{item.title}</p>
                <p className="text-xs text-white/55">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="shell flex flex-col items-center justify-between gap-3 py-5 text-center text-xs text-white/50 sm:flex-row sm:text-left">
          <p>
            © {new Date().getFullYear()} {site.name}. All rights reserved.{' '}
            {site.legalName}.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/privacy" className="transition-colors hover:text-white">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-white">
              Terms & Conditions
            </Link>
            <Link to="/shipping" className="transition-colors hover:text-white">
              Shipping
            </Link>
            <span className="hidden sm:inline">
              Prices include GST · Our policies comply with Australian Consumer
              Law
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ *
 * Newsletter
 * ------------------------------------------------------------------ */

function NewsletterBand() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    setStatus('sending')
    try {
      const result = await api.newsletter(email)
      setStatus('done')
      toast({
        title: result.alreadySubscribed ? 'Already subscribed' : 'You’re on the list',
        description: result.alreadySubscribed
          ? 'That address is already receiving our stock alerts.'
          : 'Watch your inbox for our next bulk pricing update.',
        variant: 'success',
      })
    } catch {
      setStatus('idle')
      setError('We couldn’t sign you up just now. Please try again.')
    }
  }

  return (
    <div className="border-b border-white/10 bg-white/[0.02]">
      <div className="shell py-10">
        <Reveal className="grid items-center gap-7 md:grid-cols-2">
          <div>
            <h2 className="font-heading text-xl font-black uppercase tracking-tight sm:text-2xl">
              Bulk pricing, straight to your inbox
            </h2>
            <p className="mt-2 max-w-md text-sm text-white/65">
              New stock alerts and fleet offers. No spam, unsubscribe any time.
            </p>
          </div>

          {status === 'done' ? (
            <p className="flex items-center gap-2 font-heading font-bold text-primary">
              <ShieldCheck className="h-5 w-5" />
              You’re on the list. Watch your inbox for our next deals.
            </p>
          ) : (
            <form onSubmit={submit} noValidate>
              <Field
                label="Email address"
                htmlFor="newsletter-email"
                error={error ?? undefined}
              >
                <div className="flex gap-2">
                  <Input
                    id="newsletter-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@yourcompany.com.au"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="border-white/15 bg-white/5 text-white placeholder:text-white/35"
                  />
                  <Button type="submit" loading={status === 'sending'}>
                    Subscribe
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </Field>
            </form>
          )}
        </Reveal>
      </div>
    </div>
  )
}
