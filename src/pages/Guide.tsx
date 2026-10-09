import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Phone, Wrench } from 'lucide-react'
import { site } from '@/config/site'
import { tyreGuide } from '@/data/content'
import { getPost } from '@/data/blog'
import type { TreadFamily } from '@/data/types'
import { formatDate } from '@/lib/utils'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { StaticWheel, TREAD_SPECS } from '@/components/three'
import { Reveal, Stagger } from '@/components/motion'
import {
  CtaBand,
  PageHero,
  PillarGrid,
  SectionHeading,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /guide
 *
 * The educational page. The size anatomy is drawn as an annotated
 * breakdown of one real size code rather than listed as bullets: the
 * code itself is the navigation, and selecting a segment explains it.
 * ------------------------------------------------------------------ */

/** The size the anatomy in content.ts describes, segment by segment. */
const EXAMPLE_SIZE = '295/80R22.5 154/150K 20PR'

/** Separators printed between segments so the code still reads correctly. */
const SEPARATORS: Record<string, string> = {
  '295': '/',
  '22.5': ' ',
  '154/150': '',
  K: ' ',
}

const TREAD_FOR_POSITION: Record<'steer' | 'drive' | 'trailer', TreadFamily> = {
  steer: 'rib',
  drive: 'lug',
  trailer: 'trailer',
}

const RELATED_SLUGS = [
  'reading-commercial-truck-tyre-sizes',
  'steer-drive-trailer-what-goes-where',
  'cutting-fuel-costs-with-rolling-resistance',
  'tyre-pressure-management-australian-fleets',
  'signs-its-time-to-replace-truck-tyres',
  'choosing-truck-tyres-for-australian-conditions',
]

export default function Guide() {
  const relatedReading = RELATED_SLUGS.map((slug) => getPost(slug)).filter(
    (post): post is NonNullable<typeof post> => Boolean(post),
  )

  return (
    <>
      <Seo
        title="Truck Tyre Guide — Sizes, Axle Positions & Ratings | Spartan Tyres"
        description="How to read a commercial tyre size code, what steer, drive and trailer patterns are built for, what the rolling resistance and load ratings mean, and how to keep a casing alive."
        canonicalPath="/guide"
        jsonLd={breadcrumbJsonLd([{ name: 'Tyre Guide', path: '/guide' }])}
      />

      <PageHero
        eyebrow="Tyre guide"
        title="Everything on the sidewall, explained"
        lede="Buying the wrong size is the most expensive mistake a fleet can make, and it is almost always avoidable. Here is how to read a commercial tyre, match a pattern to an axle, and read the ratings that decide what it costs you per kilometre."
        breadcrumb={[{ name: 'Tyre Guide', path: '/guide' }]}
        actions={
          <>
            <Button asChild size="lg">
              <Link to="/finder">
                Find your size
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href={site.phone.href}>
                <Phone aria-hidden="true" className="h-4 w-4" />
                Check a fitment
              </a>
            </Button>
          </>
        }
      />

      {/* ---------------- Size anatomy ---------------- */}
      <section className="section" aria-labelledby="guide-anatomy">
        <div className="shell">
          <SectionHeading
            id="guide-anatomy"
            eyebrow="Anatomy of a size code"
            title="One real size, taken apart"
            lede="Select any segment of the code below to see what it controls. This is a premium linehaul steer and trailer specification — in our range it is the Greforce G-PILOT X1."
          />

          <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
            {/* The code itself, as the control surface. */}
            <Reveal className="min-w-0">
              <Tabs defaultValue={tyreGuide.sizeAnatomy[0].part}>
                <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5 md:p-8">
                  <div
                    aria-hidden="true"
                    className="grid-texture pointer-events-none absolute inset-0 opacity-30 dark:opacity-20"
                  />

                  <p className="relative font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    The full marking
                  </p>
                  <p className="relative mt-2 font-heading text-sm font-bold tracking-tight text-muted-foreground sm:text-base">
                    {EXAMPLE_SIZE}
                  </p>

                  <TabsList
                    label="Segments of the tyre size code"
                    className="relative mt-6 flex-wrap gap-x-1 gap-y-3 overflow-visible border-b-0"
                  >
                    {tyreGuide.sizeAnatomy.map((segment, index) => (
                      <TabsTrigger
                        key={segment.part}
                        value={segment.part}
                        className="group flex flex-col items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/60 aria-selected:bg-primary/10 sm:px-3"
                      >
                        <span
                          aria-hidden="true"
                          className="font-sans text-[0.625rem] font-bold tabular-nums text-muted-foreground group-aria-selected:text-primary"
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="font-heading text-xl font-black tracking-tight text-foreground group-aria-selected:text-primary sm:text-3xl">
                          {segment.part}
                          {SEPARATORS[segment.part] ? (
                            <span
                              aria-hidden="true"
                              className="text-muted-foreground/50"
                            >
                              {SEPARATORS[segment.part]}
                            </span>
                          ) : null}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {tyreGuide.sizeAnatomy.map((segment, index) => (
                    <TabsContent
                      key={segment.part}
                      value={segment.part}
                      className="relative mt-6 border-t border-border pt-6"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant="primary">
                          Segment {String(index + 1).padStart(2, '0')}
                        </Badge>
                        <h3 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                          {segment.part}
                        </h3>
                      </div>
                      <p className="mt-4 max-w-2xl text-base leading-[1.75] text-muted-foreground">
                        {segment.meaning}
                      </p>
                    </TabsContent>
                  ))}
                </div>
              </Tabs>
            </Reveal>

            {/* Dimensional schematic. Decorative: every figure is in the
                definition list beneath it. */}
            <Reveal direction="left" className="min-w-0">
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                  What those figures measure
                </h3>

                <svg
                  aria-hidden="true"
                  viewBox="0 0 240 260"
                  className="mt-5 h-auto w-full"
                >
                  {/* Width bar, as if looking down on the tread */}
                  <rect
                    x="56"
                    y="14"
                    width="128"
                    height="18"
                    rx="3"
                    className="fill-primary/15 stroke-primary/50"
                    strokeWidth="1"
                  />
                  <line
                    x1="56"
                    y1="42"
                    x2="184"
                    y2="42"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />
                  <line x1="56" y1="37" x2="56" y2="47" className="stroke-primary" strokeWidth="1.5" />
                  <line
                    x1="184"
                    y1="37"
                    x2="184"
                    y2="47"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />

                  {/* Front view of the wheel */}
                  <circle
                    cx="120"
                    cy="160"
                    r="76"
                    className="fill-charcoal stroke-border"
                    strokeWidth="1"
                  />
                  <circle
                    cx="120"
                    cy="160"
                    r="60"
                    className="fill-none stroke-border"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx="120"
                    cy="160"
                    r="38"
                    className="fill-steel-300 stroke-steel-500"
                    strokeWidth="1"
                  />
                  <circle cx="120" cy="160" r="10" className="fill-steel-700" />

                  {/* Sidewall height callout */}
                  <line
                    x1="120"
                    y1="84"
                    x2="120"
                    y2="122"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="112"
                    y1="84"
                    x2="128"
                    y2="84"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="112"
                    y1="122"
                    x2="128"
                    y2="122"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />

                  {/* Rim diameter callout */}
                  <line
                    x1="82"
                    y1="160"
                    x2="158"
                    y2="160"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="82"
                    y1="152"
                    x2="82"
                    y2="168"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="158"
                    y1="152"
                    x2="158"
                    y2="168"
                    className="stroke-primary"
                    strokeWidth="1.5"
                  />
                </svg>

                <dl className="mt-5 flex flex-col gap-4 text-sm">
                  <div>
                    <dt className="font-heading text-xs font-bold uppercase tracking-tight text-primary">
                      Section width — 295 mm
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      Sidewall to sidewall at the widest point, wider than the tread face.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-heading text-xs font-bold uppercase tracking-tight text-primary">
                      Sidewall height — about 236 mm
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      Eighty per cent of 295 mm. Change the aspect ratio and you change the
                      rolling circumference, the overall height and the speedometer.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-heading text-xs font-bold uppercase tracking-tight text-primary">
                      Rim diameter — 22.5 in
                    </dt>
                    <dd className="mt-1 text-muted-foreground">
                      The one figure with no tolerance at all. Quoted separately from the rim
                      width, which for this size is a 9.00.
                    </dd>
                  </div>
                </dl>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-8">
            <div className="rounded-lg border border-primary/25 bg-primary/[0.06] p-5 md:p-6">
              <p className="text-sm leading-relaxed text-foreground">
                <span className="font-heading font-bold uppercase tracking-tight">
                  Imperial sizes read differently.
                </span>{' '}
                A code like 11R22.5 quotes the width in inches — roughly 279 mm — and carries
                no aspect ratio, because the convention is an implied ratio of around 90 per
                cent. That is why an 11R22.5 stands taller than a 295/80R22.5 despite being
                narrower. It is still the most common heavy fitment in Australia.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/blog/reading-commercial-truck-tyre-sizes">
                  <BookOpen aria-hidden="true" className="h-4 w-4" />
                  The full size-reading guide
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- Axle positions ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="guide-positions"
      >
        <div className="shell">
          <SectionHeading
            id="guide-positions"
            eyebrow="Axle positions"
            title="Three axles, three different jobs"
            lede="Fitting the wrong pattern to a position is not illegal and the truck will drive away, which is exactly why it keeps happening. The cost turns up six weeks later as irregular wear."
          />

          <Stagger className="mt-10 grid gap-5 lg:grid-cols-3">
            {tyreGuide.positions.map((position) => {
              const tread = TREAD_FOR_POSITION[position.key]
              return (
                <div
                  key={position.key}
                  className="flex h-full flex-col rounded-lg border border-border bg-background p-6"
                >
                  <div className="flex items-start gap-5">
                    <div className="h-20 w-20 shrink-0 rounded-full bg-charcoal p-1">
                      <StaticWheel
                        tread={tread}
                        className="h-full w-full"
                        title={`${TREAD_SPECS[tread].label} pattern, typical of a ${position.title.toLowerCase()} tyre`}
                      />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                        {position.title}
                      </h3>
                      <p className="mt-1 font-heading text-xs font-bold uppercase tracking-brand text-primary">
                        {TREAD_SPECS[tread].label}
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {position.body}
                  </p>

                  <dl className="mt-5 border-t border-border pt-4 text-sm">
                    <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                      Best for
                    </dt>
                    <dd className="mt-1.5 font-semibold text-foreground">
                      {position.bestFor}
                    </dd>
                  </dl>

                  <Link
                    to={`/shop?position=${position.key}`}
                    className="mt-5 inline-flex items-center gap-2 self-start font-heading text-sm font-bold uppercase tracking-wide text-primary"
                  >
                    Shop {position.title.toLowerCase()} tyres
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </div>
              )
            })}
          </Stagger>

          <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            A steer-rated rib on a trailer axle is normal and correct — most rib patterns are
            rated for both, because the casing requirements overlap. A drive lug on a steer
            axle is the combination to avoid.{' '}
            <Link
              to="/blog/steer-drive-trailer-what-goes-where"
              className="link-underline font-semibold text-primary"
            >
              What happens when you get it wrong
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ---------------- Performance factors ---------------- */}
      <section className="section" aria-labelledby="guide-performance">
        <div className="shell">
          <SectionHeading
            id="guide-performance"
            eyebrow="Performance factors"
            title="The five ratings that decide cost per kilometre"
            lede="Every one of these is a trade against another. Deeper tread survives gravel and costs fuel; a low-hysteresis compound saves fuel and tears more easily. There is no pattern that wins everywhere."
          />
          <PillarGrid items={tyreGuide.performanceFactors} columns={2} className="mt-10" />
        </div>
      </section>

      {/* ---------------- Maintenance ---------------- */}
      <section
        className="section border-y border-border bg-card"
        aria-labelledby="guide-maintenance"
      >
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0">
              <SectionHeading
                id="guide-maintenance"
                eyebrow="Looking after them"
                title="Five habits that pay for themselves"
                lede="Inflation pressure is the cheapest lever you have over tyre life and fuel use, and it costs nothing but discipline."
              />

              <ol className="mt-8 flex flex-col gap-4">
                {tyreGuide.maintenanceTips.map((tip, index) => (
                  <li
                    key={tip}
                    className="flex items-start gap-4 rounded-lg border border-border bg-background p-5"
                  >
                    <span
                      aria-hidden="true"
                      className="font-heading text-lg font-black leading-none tabular-nums text-primary/40"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground">{tip}</span>
                  </li>
                ))}
              </ol>
            </div>

            <Reveal direction="left" className="min-w-0">
              <div className="rounded-lg border border-border bg-background p-6 md:p-8">
                <Wrench aria-hidden="true" className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-heading text-base font-bold uppercase tracking-tight text-foreground">
                  Never bleed a hot tyre
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  A tyre set to 110 psi cold can read 120 to 130 psi after three hours at
                  highway speed on a hot day. That is the system working correctly. Letting
                  air out to “correct” it leaves the tyre underinflated once it cools, and
                  underinflation is a heat problem before it is a wear problem.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Set pressure to the load you actually carry, from the load-inflation table
                  for your specific size — not to a fleet default and not to the maximum
                  figure moulded into the sidewall, which is a structural limit rather than a
                  recommendation.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  If you need the manufacturer&rsquo;s load-inflation figures for a Greforce or
                  Lionshead fitment, call{' '}
                  <a
                    href={site.phone.href}
                    className="link-underline font-semibold text-primary"
                  >
                    {site.phone.display}
                  </a>{' '}
                  or email{' '}
                  <a
                    href={`mailto:${site.email.sales}`}
                    className="link-underline break-all font-semibold text-primary"
                  >
                    {site.email.sales}
                  </a>{' '}
                  and we will send the table through.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild variant="outline">
                    <Link to="/blog/tyre-pressure-management-australian-fleets">
                      Pressure management
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/blog/signs-its-time-to-replace-truck-tyres">
                      When to replace
                    </Link>
                  </Button>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------- Related reading ---------------- */}
      <section className="section-tight" aria-labelledby="guide-reading">
        <div className="shell">
          <SectionHeading
            id="guide-reading"
            eyebrow="Go deeper"
            title="Long-form guides"
            lede="Written for Australian conditions, where heat, distance and unsealed roads punish tyres differently to the duty cycles most patterns are designed around."
          />

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {relatedReading.map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline" size="sm">
                    {post.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {post.readMinutes} min read
                  </span>
                </div>
                <h3 className="mt-4 font-heading text-base font-bold uppercase leading-tight tracking-tight text-foreground group-hover:text-primary">
                  {post.title}
                </h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                <span className="mt-4 text-xs text-muted-foreground">
                  {formatDate(post.date)}
                </span>
              </Link>
            ))}
          </Stagger>

          <Button asChild variant="outline" className="mt-8">
            <Link to="/blog">
              All articles
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <CtaBand
        title="Talk to our team about pricing, stock, or fleet enquiries"
        body="Send a photo of your sidewall and the rim stamping and we will confirm the fitment against your compliance plate before you order."
      />
    </>
  )
}
