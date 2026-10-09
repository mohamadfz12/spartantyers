import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Mail, Phone } from 'lucide-react'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'
import { Magnetic, Reveal } from '@/components/motion'

/**
 * The closing band every content page shares: one phone call, one contact
 * link, the hours, and nothing else competing with them.
 */
export function CtaBand({
  title = 'Talk to our team about pricing, stock, or fleet enquiries',
  body,
  className,
}: {
  title?: string
  body?: string
  className?: string
}) {
  return (
    <section className={cn('section-tight', className)}>
      <div className="shell">
        <Reveal>
          <div className="relative overflow-hidden rounded-lg border border-border bg-charcoal text-charcoal-foreground">
            <div
              aria-hidden="true"
              className="tread-texture pointer-events-none absolute inset-0 opacity-30"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-transparent"
            />

            <div className="relative flex flex-col gap-8 p-6 md:p-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
              <div className="min-w-0 max-w-2xl">
                <h2 className="font-heading text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl">
                  {title}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-charcoal-foreground/75">
                  {body ??
                    `Speak to someone who knows load indexes, rim widths and axle mass. Send a photo of your sidewall and we will confirm the fitment before you order.`}
                </p>

                <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">Hours</dt>
                    <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
                    <dd className="text-charcoal-foreground/80">{site.hours.short}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="sr-only">Email</dt>
                    <Mail aria-hidden="true" className="h-4 w-4 text-primary" />
                    <dd>
                      <a
                        href={`mailto:${site.email.sales}`}
                        className="link-underline break-all text-charcoal-foreground/80 hover:text-primary"
                      >
                        {site.email.sales}
                      </a>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
                <Magnetic>
                  <Button asChild size="lg" className="w-full sm:w-auto lg:w-full">
                    <a href={site.phone.href}>
                      <Phone aria-hidden="true" className="h-4 w-4" />
                      Call {site.phone.display}
                    </a>
                  </Button>
                </Magnetic>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full border-charcoal-foreground/25 text-charcoal-foreground hover:border-primary hover:text-primary sm:w-auto lg:w-full"
                >
                  <Link to="/contact">
                    Send an enquiry
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
