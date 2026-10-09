import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTransform } from 'framer-motion'
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Layers,
  MousePointer2,
  Package,
  Phone,
  Sparkles,
  Truck,
} from 'lucide-react'
import { site } from '@/config/site'
import { cn, money, pluralise } from '@/lib/utils'
import { useAxle } from '@/store/ui'
import {
  POSITION_LABELS,
  dealProducts,
  effectivePrice,
  featuredProducts,
  inStockCount,
  products,
  productsForPosition,
} from '@/data/products'
import { BRANDS_SUBTITLE, brands, stockedBrands } from '@/data/brands'
import {
  customerSegments,
  homeStats,
  howItWorks,
  valueProps,
} from '@/data/content'
import { featuredReviews } from '@/data/reviews'
import { Seo, localBusinessJsonLd } from '@/components/Seo'
import { Icon } from '@/components/Icon'
import { Badge, Button, Card, Rating } from '@/components/ui'
import { ProductCard } from '@/components/shop/ProductCard'
import { AxleSelector } from '@/components/shop/AxleSelector'
import { BrandMark } from '@/components/brand/BrandMark'
import { HeroWheel, StaticWheel } from '@/components/three'
import {
  Counter,
  Magnetic,
  Marquee,
  Parallax,
  Reveal,
  SplitText,
  Stagger,
  motion,
  useSectionProgress,
} from '@/components/motion'

export default function Home() {
  return (
    <>
      <Seo
        title="Commercial Truck Tyres Australia | Bulk Supply | Spartan Tyres"
        description="Buy commercial truck, bus and trailer tyres online at Spartan Tyres. Bulk pricing, consistent stock and fast Australia-wide delivery from our Sydney warehouse."
        canonicalPath="/"
        jsonLd={localBusinessJsonLd}
      />

      <Hero />
      <StatStrip />
      <AxlePicker />
      <FeaturedRange />
      <Anatomy />
      <ValueProps />
      <HowItWorks />
      <BrandWall />
      <DealsBand />
      <Segments />
      <Testimonials />
      <FleetCta />
    </>
  )
}

/* ================================================================== *
 * Hero
 * ================================================================== */

function Hero() {
  // The deepest-tread drive tyre makes the most of the 3D tread geometry.
  const heroProduct = useMemo(
    () =>
      products.find((p) => p.id === 'greforce-hd01m-11r22-5') ??
      featuredProducts[0] ??
      products[0],
    [],
  )

  return (
    <section className="relative isolate overflow-hidden bg-charcoal text-charcoal-foreground">
      {/* Atmosphere */}
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-[0.07]" />
      <div className="pointer-events-none absolute -left-32 -top-40 h-[32rem] w-[32rem] rounded-full bg-primary/25 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-48 -right-24 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-[120px]" />
      <div className="hazard pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-60" />

      <div className="shell relative grid min-h-[88vh] items-center gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:py-20">
        {/* Copy */}
        <div className="relative z-10 order-2 lg:order-1">
          <Reveal direction="right">
            <p className="eyebrow">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
                <span className="relative h-2 w-2 rounded-full bg-primary" />
              </span>
              {site.tagline}
            </p>
          </Reveal>

          <h1 className="display-1 mt-5 text-white">
            <SplitText text="Tyres that keep" />
            <br />
            <SplitText text="Australia moving" className="text-primary" delay={0.12} />
          </h1>

          <Reveal direction="up" delay={0.25}>
            <p className="lede mt-6 max-w-xl text-white/70">
              Premium commercial tyres engineered for Australian roads. From a
              single unit to a full fleet order, dispatched from our Yennora
              warehouse with free delivery to every metro area.
            </p>
          </Reveal>

          <Reveal direction="up" delay={0.35}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Magnetic strength={0.22}>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/shop">
                    Shop the range
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </Magnetic>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full border-white/25 bg-white/5 text-white hover:bg-white/10 sm:w-auto"
              >
                <a href={site.phone.href}>
                  <Phone className="mr-2 h-4 w-4" />
                  {site.phone.display}
                </a>
              </Button>
            </div>
          </Reveal>

          {/* Trust row */}
          <Reveal direction="up" delay={0.45}>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/60">
              {[
                { icon: Truck, label: 'Free metro delivery' },
                { icon: Clock, label: `Dispatch in ${site.commerce.dispatchWindow}` },
                { icon: Package, label: `${inStockCount} lines in stock` },
                { icon: Layers, label: 'Prices include GST' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0 text-primary" />
                  {item.label}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Quick size jump */}
          <Reveal direction="up" delay={0.55}>
            <div className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
              <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-white/50">
                Know your size? Jump straight in
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {['11R22.5', '295/80R22.5', '235/75R17.5', '385/65R22.5'].map((size) => (
                  <Link
                    key={size}
                    to={`/shop?size=${encodeURIComponent(size)}`}
                    className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs font-semibold text-white/85 transition-all hover:border-primary hover:bg-primary/15 hover:text-white"
                  >
                    {size}
                  </Link>
                ))}
                <Link
                  to="/finder"
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:underline"
                >
                  All sizes →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>

        {/* 3D wheel */}
        <div className="relative order-1 lg:order-2">
          <HeroWheel
            product={heroProduct}
            className="mx-auto aspect-square w-full max-w-[32rem] lg:max-w-none"
          />

          {/* Spec callout anchored to the model */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="pointer-events-none absolute bottom-2 right-0 hidden rounded-lg border border-white/10 bg-charcoal/80 p-3.5 backdrop-blur-md lg:block"
          >
            <p className="font-heading text-[0.6rem] font-bold uppercase tracking-brand text-primary">
              Shown above
            </p>
            <p className="mt-1 font-heading text-sm font-bold text-white">
              {heroProduct.brand} {heroProduct.model}
            </p>
            <p className="font-mono text-xs text-white/60">{heroProduct.size}</p>
            <p className="mt-1.5 text-[0.7rem] text-white/50">
              {heroProduct.treadDepthMm}mm tread · {heroProduct.ply} ·{' '}
              {heroProduct.maxLoadKg.toLocaleString('en-AU')}kg
            </p>
          </motion.div>

          <p className="mt-2 flex items-center justify-center gap-1.5 text-[0.7rem] text-white/40 lg:absolute lg:bottom-2 lg:left-0 lg:mt-0">
            <MousePointer2 className="h-3 w-3" />
            Move your cursor — scroll to roll
          </p>
        </div>
      </div>

      {/* Scroll cue */}
      <motion.div
        aria-hidden
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 lg:block"
      >
        <ChevronDown className="h-6 w-6 text-white/30" />
      </motion.div>
    </section>
  )
}

/* ================================================================== *
 * Stat strip
 * ================================================================== */

function StatStrip() {
  return (
    <section className="relative border-y border-border bg-background py-12">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />

      <div className="shell relative">
        <dl className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {homeStats.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 0.08} className="text-center">
              <dd className="font-heading text-3xl font-black leading-none text-primary sm:text-4xl lg:text-5xl">
                <Counter value={stat.value} suffix={stat.suffix} />
              </dd>
              <dt className="mt-2.5 font-heading text-xs font-bold uppercase tracking-wide">
                {stat.label}
              </dt>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {stat.detail}
              </p>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Axle picker
 * ================================================================== */

function AxlePicker() {
  const axle = useAxle((s) => s.axle)
  const setAxle = useAxle((s) => s.setAxle)

  const matches = useMemo(
    () =>
      productsForPosition(axle)
        .slice()
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3),
    [axle],
  )

  return (
    <section className="section bg-muted/40">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Start with the axle</p>
          <h2 className="display-2 mt-3">Which wheel are you replacing?</h2>
          <p className="lede mt-4">
            Steer, drive and trailer axles need genuinely different tread. Pick
            the position and we'll show only the tyres rated for it.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
          <Reveal direction="right">
            <AxleSelector value={axle} onChange={setAxle} />
          </Reveal>

          <Reveal direction="left" delay={0.1}>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-sm font-bold uppercase tracking-wide">
                  Top-rated {POSITION_LABELS[axle].toLowerCase()} tyres
                </h3>
                <Link
                  to={`/shop?position=${axle}`}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  See all →
                </Link>
              </div>

              <ul className="mt-4 flex-1 space-y-3" aria-live="polite">
                {matches.map((product) => (
                  <li key={product.id}>
                    <Link
                      to={`/product/${product.id}`}
                      className="group flex items-center gap-4 rounded-lg border border-border bg-card p-3.5 transition-all duration-300 ease-brand hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lift"
                    >
                      <div className="h-14 w-14 shrink-0">
                        <StaticWheel tread={product.tread} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-sm font-bold group-hover:text-primary">
                          {product.brand} {product.model}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {product.size} · {product.treadDepthMm}mm ·{' '}
                          {product.ply}
                        </p>
                        <Rating
                          value={product.rating}
                          count={product.reviewCount}
                          size="sm"
                          className="mt-1"
                        />
                      </div>

                      <span className="shrink-0 font-heading text-base font-black">
                        {money(effectivePrice(product))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <Button asChild variant="outline" className="mt-4 w-full">
                <Link to={`/shop?position=${axle}`}>
                  Browse all {POSITION_LABELS[axle].toLowerCase()} tyres
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Featured range
 * ================================================================== */

function FeaturedRange() {
  return (
    <section className="section">
      <div className="shell">
        <Reveal className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Fleet favourites</p>
            <h2 className="display-2 mt-3">The lines we move most</h2>
            <p className="lede mt-3 max-w-xl">
              Held in depth year round, so a fleet re-order ships the same week.
            </p>
          </div>

          <Button asChild variant="outline">
            <Link to="/shop">
              All {products.length} tyres
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Stagger>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Anatomy — scroll-pinned teardown
 * ================================================================== */

const ANATOMY_STEPS = [
  {
    title: 'Tread & cap compound',
    body: 'The wearing surface, and the number you are really buying. Our range runs from 12.5mm on a light-truck steer rib to 23.5mm on the HD02 drive lug — and tread depth is what sets removal mileage.',
    stat: '12.5 – 23.5mm',
    statLabel: 'Tread depth across the range',
  },
  {
    title: 'Belt package & casing',
    body: 'Steel belts over a radial ply casing. This is the structural part: it carries the load, survives the heat, and decides whether the tyre is worth retreading when the tread is gone.',
    stat: '16 – 24PR',
    statLabel: 'Ply ratings we stock',
  },
  {
    title: 'Bead & rim seat',
    body: 'The bead locks against the rim flange to hold air. Rim width has to match the tyre, which is why every one of our spec sheets lists the correct measuring rim — from 6.00 up to 11.75.',
    stat: '6.00 – 11.75',
    statLabel: 'Measuring rim widths',
  },
  {
    title: 'Load & speed rating',
    body: 'The two markings that decide legality. A 164 load index on our GR666 super-single carries 5000kg on a single fitment; an M speed symbol allows 130km/h. Get these wrong and the tyre is wrong.',
    stat: '1,750 – 5,000kg',
    statLabel: 'Load capacity per tyre',
  },
]

function Anatomy() {
  const { ref, progress } = useSectionProgress<HTMLDivElement>([
    'start start',
    'end end',
  ])

  // One full turn of the wheel across the whole section.
  const rotate = useTransform(progress, [0, 1], [0, 300])
  const scale = useTransform(progress, [0, 0.5, 1], [0.86, 1, 0.9])

  const [active, setActive] = useState(0)

  return (
    <section
      ref={ref}
      // `overflow-x-clip` rather than `overflow-hidden`: the glow orb below
      // bleeds past the right edge on narrow screens, but this section's whole
      // effect depends on a `sticky` child, and `overflow: hidden` on an
      // ancestor would silently kill that. `clip` contains the bleed without
      // creating a scroll container.
      className="relative overflow-x-clip bg-charcoal text-charcoal-foreground"
      style={{ height: `${ANATOMY_STEPS.length * 85}vh` }}
    >
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-[0.06]" />
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/15 blur-[130px]" />

      {/* Pinned viewport */}
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className="shell grid w-full items-center gap-8 lg:grid-cols-2">
          {/* Wheel */}
          <div className="relative order-2 lg:order-1">
            <motion.div
              style={{ rotate, scale }}
              className="mx-auto aspect-square w-full max-w-sm lg:max-w-md"
            >
              <StaticWheel
                tread="lug"
                label="Greforce"
                size="11R22.5"
                className="drop-shadow-2xl"
              />
            </motion.div>

            {/* Progress rail */}
            <ol className="mt-6 flex justify-center gap-2" aria-hidden>
              {ANATOMY_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span
                    className={cn(
                      'block h-1 rounded-full transition-all duration-500',
                      index === active ? 'w-10 bg-primary' : 'w-5 bg-white/20',
                    )}
                  />
                </li>
              ))}
            </ol>
          </div>

          {/* Copy panels */}
          <div className="order-1 lg:order-2">
            <p className="eyebrow">Anatomy of a truck tyre</p>
            <h2 className="display-2 mt-3 text-white">
              Four numbers decide the price
            </h2>

            <div className="relative mt-7 min-h-[16rem]">
              {ANATOMY_STEPS.map((step, index) => (
                <motion.div
                  key={step.title}
                  // Each panel owns a slice of the section's scroll range.
                  initial={false}
                  animate={{
                    opacity: index === active ? 1 : 0,
                    y: index === active ? 0 : 24,
                  }}
                  transition={{ duration: 0.4 }}
                  className={cn(
                    'absolute inset-0',
                    index === active ? 'pointer-events-auto' : 'pointer-events-none',
                  )}
                  aria-hidden={index !== active}
                >
                  <p className="font-heading text-xs font-bold uppercase tracking-brand text-primary">
                    Step {index + 1} of {ANATOMY_STEPS.length}
                  </p>
                  <h3 className="mt-2.5 font-heading text-xl font-bold uppercase tracking-tight text-white sm:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-lg leading-relaxed text-white/65">
                    {step.body}
                  </p>
                  <div className="mt-5 inline-block rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5">
                    <p className="font-heading text-xl font-black text-primary">
                      {step.stat}
                    </p>
                    <p className="text-[0.7rem] uppercase tracking-wide text-white/50">
                      {step.statLabel}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link to="/wheel-lab">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Open the Wheel Lab
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-white/5 text-white hover:bg-white/10"
              >
                <Link to="/guide">Read the tyre guide</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll tripwires: one per step, each flipping the active panel as it
          crosses the middle of the viewport. Cheaper and far more reliable
          than mapping a MotionValue onto React state. */}
      <div className="absolute inset-0" aria-hidden>
        {ANATOMY_STEPS.map((step, index) => (
          <Tripwire
            key={step.title}
            onEnter={() => setActive(index)}
            style={{
              top: `${(index / ANATOMY_STEPS.length) * 100}%`,
              height: `${100 / ANATOMY_STEPS.length}%`,
            }}
          />
        ))}
      </div>
    </section>
  )
}

function Tripwire({
  onEnter,
  style,
}: {
  onEnter: () => void
  style: React.CSSProperties
}) {
  return (
    <motion.div
      className="absolute inset-x-0"
      style={style}
      onViewportEnter={onEnter}
      // Collapse the detection zone to the middle row of the viewport so a
      // panel switches exactly as its slice reaches centre screen.
      viewport={{ margin: '-50% 0px -50% 0px' }}
    />
  )
}

/* ================================================================== *
 * Value props
 * ================================================================== */

function ValueProps() {
  return (
    <section className="section">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why Spartan</p>
          <h2 className="display-2 mt-3">Built for businesses that can't wait</h2>
          <p className="lede mt-4">
            Why operators across Australia trust us for their bulk tyre supply.
          </p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {valueProps.map((prop) => (
            <Card
              key={prop.title}
              interactive
              className="group h-full p-6"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon name={prop.icon} className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-heading text-base font-bold uppercase tracking-wide">
                {prop.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {prop.body}
              </p>
            </Card>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

/* ================================================================== *
 * How it works
 * ================================================================== */

function HowItWorks() {
  return (
    <section className="section relative overflow-hidden bg-muted/40">
      <Parallax speed={0.14} className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      </Parallax>

      <div className="shell relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="display-2 mt-3">Three steps to the right tyres</h2>
        </Reveal>

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {howItWorks.map((step, index) => (
            <Reveal key={step.step} delay={index * 0.12}>
              <li className="relative h-full rounded-lg border border-border bg-card p-6">
                {/* Connector, desktop only */}
                {index < howItWorks.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute -right-3 top-12 hidden h-px w-6 bg-gradient-to-r from-primary to-transparent md:block"
                  />
                ) : null}

                <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary font-heading text-lg font-black text-primary">
                  {step.step}
                </span>
                <h3 className="mt-5 font-heading text-base font-bold uppercase tracking-wide">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Brands
 * ================================================================== */

function BrandWall() {
  return (
    <section className="section-tight overflow-hidden">
      <div className="shell">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">Brands we stock & source</p>
          <h2 className="display-3 mt-3">Two in stock, every other brand sourced</h2>
          <p className="lede mt-4">{BRANDS_SUBTITLE}</p>
        </Reveal>
      </div>

      <Marquee className="mt-10" speed="slow">
        {brands.map((brand) => (
          <div
            key={brand.name}
            className="flex w-40 shrink-0 flex-col items-center gap-2 px-4 sm:w-48"
          >
            <BrandMark name={brand.name} />
            {brand.stocked ? (
              <Badge variant="success" size="sm">
                In stock
              </Badge>
            ) : (
              <Badge variant="outline" size="sm">
                To order
              </Badge>
            )}
          </div>
        ))}
      </Marquee>

      <div className="shell mt-10">
        <div className="grid gap-5 md:grid-cols-2">
          {stockedBrands.map((brand, index) => (
            <Reveal key={brand.name} delay={index * 0.1}>
              <Link
                to={brand.href}
                className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-all duration-300 ease-brand hover:-translate-y-1 hover:border-primary/50 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-4">
                  <BrandMark name={brand.name} size="lg" className="items-start" />
                  <Badge variant="primary" size="sm">
                    {brand.skuCount} {pluralise(brand.skuCount, 'line')}
                  </Badge>
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {brand.blurb}
                </p>
                <p className="mt-4 flex items-center gap-1.5 font-heading text-xs font-bold uppercase tracking-wide text-primary">
                  Browse {brand.name}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </p>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-6 text-center">
          <Button asChild variant="ghost">
            <Link to="/brands">
              See every brand we can supply
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Deals
 * ================================================================== */

function DealsBand() {
  const deals = dealProducts.slice(0, 3)
  if (deals.length === 0) return null

  const best = Math.max(...deals.map((p) => p.discount ?? 0))

  return (
    <section className="section bg-gradient-to-b from-background via-muted/30 to-background">
      <div className="shell">
        <Reveal className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Current deals</p>
            <h2 className="display-2 mt-3">
              Up to <span className="text-primary">{best}% off</span> this month
            </h2>
            <p className="lede mt-3 max-w-xl">
              Limited-stock discounts on top lines, with volume breaks stacking
              on top from four tyres up.
            </p>
          </div>

          <Button asChild>
            <Link to="/deals">
              All deals
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </Reveal>

        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </Stagger>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Segments
 * ================================================================== */

function Segments() {
  return (
    <section className="section">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Who we supply</p>
          <h2 className="display-2 mt-3">Trusted by professionals</h2>
          <p className="lede mt-4">
            From passenger cars to heavy commercial fleets — we supply tyres that
            keep Australia moving.
          </p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {customerSegments.map((segment) => (
            <Card key={segment.title} interactive className="h-full p-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name={segment.icon} className="h-7 w-7" />
              </span>
              <h3 className="mt-5 font-heading text-sm font-bold uppercase tracking-wide">
                {segment.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {segment.body}
              </p>
            </Card>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Testimonials
 * ================================================================== */

function Testimonials() {
  return (
    <section className="section bg-muted/40">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">From the yard</p>
          <h2 className="display-2 mt-3">What operators tell us</h2>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featuredReviews.map((review, index) => (
            <Reveal key={review.id} delay={index * 0.08}>
              <figure className="flex h-full flex-col rounded-lg border border-border bg-card p-6">
                <Rating value={review.rating} size="sm" />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground/85">
                  “{review.body}”
                </blockquote>
                <figcaption className="mt-5 border-t border-border pt-4">
                  <p className="font-heading text-sm font-bold">{review.author}</p>
                  <p className="text-xs text-muted-foreground">
                    {review.role} · {review.location}
                  </p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Fleet CTA
 * ================================================================== */

function FleetCta() {
  return (
    <section className="relative overflow-hidden bg-charcoal py-16 text-charcoal-foreground md:py-20">
      <div className="tread-texture pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute -right-20 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />

      <div className="shell relative grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
        <Reveal direction="right">
          <p className="eyebrow">Fleet & wholesale</p>
          <h2 className="display-2 mt-3 text-white">
            Running more than {site.commerce.bulkThreshold} tyres a year?
          </h2>
          <p className="lede mt-4 max-w-2xl text-white/70">
            We'll build a supply agreement around your fitments: fixed pricing,
            scheduled depot delivery, consolidated freight on bulk orders and a
            dedicated contact who knows your fleet.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/fleet-solutions">
                Fleet solutions
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/25 bg-white/5 text-white hover:bg-white/10"
            >
              <Link to="/wholesale">Wholesale accounts</Link>
            </Button>
          </div>
        </Reveal>

        <Reveal direction="left" delay={0.12}>
          <div className="rounded-lg border-2 border-primary/40 bg-white/[0.04] p-7 backdrop-blur-sm">
            <p className="font-heading text-xs font-bold uppercase tracking-brand text-primary">
              Talk to the team
            </p>
            <a
              href={site.phone.href}
              className="mt-2 block font-heading text-3xl font-black text-white transition-colors hover:text-primary"
            >
              {site.phone.display}
            </a>
            <p className="mt-2 text-sm text-white/60">{site.hours.label}</p>

            <dl className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
              <div>
                <dt className="text-white/50">Email</dt>
                <dd>
                  <a
                    href={`mailto:${site.email.sales}`}
                    className="break-all text-white/90 hover:text-primary"
                  >
                    {site.email.sales}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-white/50">Warehouse</dt>
                <dd className="text-white/90">{site.warehouse.full}</dd>
              </div>
            </dl>

            <Button asChild variant="ghost" className="mt-5 w-full text-white">
              <Link to="/contact">
                Send an enquiry
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
