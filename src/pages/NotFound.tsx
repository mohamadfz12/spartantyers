import { Link, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  BadgePercent,
  HelpCircle,
  Mail,
  Phone,
  Search,
  ShoppingBag,
} from 'lucide-react'
import { site } from '@/config/site'
import { allSizes, products } from '@/data/products'
import { Seo } from '@/components/Seo'
import { Button } from '@/components/ui'
import { StaticWheel } from '@/components/three'
import { Reveal, Stagger } from '@/components/motion'
import { PageHero, SectionHeading } from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * 404
 *
 * A wrong turn should still be useful: the four places people actually
 * want, the phone number, and a nudge towards searching by size rather
 * than guessing at a URL. Never indexed.
 * ------------------------------------------------------------------ */

const DESTINATIONS = [
  {
    title: 'Shop all tyres',
    body: `${products.length} commercial lines across ${allSizes.length} sizes, with live stock figures.`,
    href: '/shop',
    icon: ShoppingBag,
  },
  {
    title: 'Tyre Finder',
    body: 'Enter your size or vehicle details and get the fitments built for your work.',
    href: '/finder',
    icon: Search,
  },
  {
    title: 'Current deals',
    body: 'Everything currently discounted, with the volume breaks still applying on top.',
    href: '/deals',
    icon: BadgePercent,
  },
  {
    title: 'Contact us',
    body: `Phone and email, both Yennora addresses, and our hours — ${site.hours.short}.`,
    href: '/contact',
    icon: HelpCircle,
  },
]

export default function NotFound() {
  const { pathname } = useLocation()

  return (
    <>
      <Seo
        title="Page not found — Spartan Tyres"
        description="That page does not exist. Browse the full tyre range, search by size with the Tyre Finder, or call us and we will point you at the right fitment."
        noIndex
      />

      <PageHero
        eyebrow="Error 404"
        title="That page has gone flat"
        lede={
          <>
            We could not find anything at{' '}
            <span className="font-heading font-bold tracking-tight text-foreground">
              {pathname}
            </span>
            . The link may be mistyped or the page may have moved. Everything below is still
            exactly where it should be.
          </>
        }
        align="centre"
        actions={
          <>
            <Button asChild size="lg">
              <Link to="/shop">
                Shop all tyres
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
          <div className="relative mx-auto max-w-[18rem]">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-primary/10 blur-3xl"
            />
            <StaticWheel
              tread="lug"
              label="Spartan"
              size="404"
              spin
              className="relative h-auto w-full drop-shadow-2xl"
              title="A truck wheel, slowly turning"
            />
          </div>
        }
      />

      {/* ---------------- Destinations ---------------- */}
      <section className="section" aria-labelledby="notfound-links">
        <div className="shell">
          <SectionHeading
            id="notfound-links"
            eyebrow="Where to next"
            title="Four places that will have what you need"
            align="centre"
          />

          <Stagger className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2">
            {DESTINATIONS.map((destination) => (
              <Link
                key={destination.href}
                to={destination.href}
                className="group flex h-full items-start gap-4 rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                  <destination.icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-tight text-foreground group-hover:text-primary">
                    {destination.title}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-300 ease-brand group-hover:translate-x-1"
                    />
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                    {destination.body}
                  </span>
                </span>
              </Link>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ---------------- Search suggestion ---------------- */}
      <section
        className="section-tight border-t border-border bg-card"
        aria-labelledby="notfound-search"
      >
        <div className="shell">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2
              id="notfound-search"
              className="font-heading text-xl font-extrabold uppercase tracking-tight text-foreground sm:text-2xl"
            >
              Looking for a particular tyre?
            </h2>
            <p className="lede mt-4">
              Searching by size is faster than guessing at a URL. Read the size off the
              sidewall of the tyre currently on the vehicle — something like 11R22.5 or
              295/80R22.5 — and put it into the Tyre Finder. If you are not sure what you are
              reading, send us a photo of the sidewall and we will confirm the fitment.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/finder">
                  <Search aria-hidden="true" className="h-4 w-4" />
                  Open the Tyre Finder
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/guide">How to read a tyre size</Link>
              </Button>
              <Button asChild variant="outline">
                <a href={`mailto:${site.email.sales}`}>
                  <Mail aria-hidden="true" className="h-4 w-4" />
                  {site.email.sales}
                </a>
              </Button>
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              Or just call{' '}
              <a
                href={site.phone.href}
                className="link-underline font-heading font-bold tracking-tight text-primary"
              >
                {site.phone.display}
              </a>{' '}
              — {site.hours.label}.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  )
}
