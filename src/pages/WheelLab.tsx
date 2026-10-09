import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  Gauge,
  Layers,
  Maximize2,
  Phone,
  RotateCw,
  Ruler,
  Scale,
  ShoppingCart,
  Sparkles,
  Zap,
} from 'lucide-react'
import { site } from '@/config/site'
import { cn, money, pluralise } from '@/lib/utils'
import { useAxle, useRenderQuality, toast } from '@/store/ui'
import { useCart } from '@/store/cart'
import {
  POSITION_LABELS,
  allSizes,
  effectivePrice,
  products,
} from '@/data/products'
import type { AxlePosition, Product, TreadFamily } from '@/data/types'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { Badge, Button, Card, Select, Tooltip } from '@/components/ui'
import { ProductCard } from '@/components/shop/ProductCard'
import {
  EXPLODED_PARTS,
  StaticWheel,
  TREAD_SPECS,
  WheelConfigurator,
  wheelProportions,
} from '@/components/three'
import { Reveal, Stagger } from '@/components/motion'

const TREAD_FAMILIES: TreadFamily[] = ['rib', 'lug', 'block', 'trailer']

/** The tread family each axle position usually takes — the sensible default. */
const DEFAULT_TREAD: Record<AxlePosition, TreadFamily> = {
  steer: 'rib',
  drive: 'lug',
  trailer: 'trailer',
}

export default function WheelLab() {
  const axle = useAxle((s) => s.axle)
  const setAxle = useAxle((s) => s.setAxle)

  const [size, setSize] = useState('11R22.5')
  const [tread, setTread] = useState<TreadFamily>(DEFAULT_TREAD[axle])
  const [explode, setExplode] = useState(0)
  const [rimStyle, setRimStyle] = useState<'alloy' | 'steel'>('alloy')
  const [spinSpeed, setSpinSpeed] = useState(0.35)

  // Changing the axle should move the tread to that axle's usual pattern —
  // but only as a suggestion the visitor can then override freely.
  useEffect(() => {
    setTread(DEFAULT_TREAD[axle])
  }, [axle])

  /**
   * The configuration is matched back against the real catalogue. This is what
   * makes the lab more than a toy: whatever you build, it tells you which tyre
   * that actually is and lets you buy it.
   */
  const { exact, closest } = useMemo(() => {
    const exact = products.filter(
      (p) =>
        p.size === size && p.tread === tread && p.position.includes(axle),
    )

    const closest = products
      .filter((p) => !exact.includes(p))
      .map((p) => {
        // Right size matters most, then the pattern, then the fitment — a
        // visitor who picked 11R22.5 wants 11R22.5 alternatives first.
        let score = 0
        if (p.size === size) score += 5
        if (p.tread === tread) score += 4
        if (p.position.includes(axle)) score += 3
        return { product: p, score }
      })
      .filter((entry) => entry.score >= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.product)

    return { exact, closest }
  }, [size, tread, axle])

  /** The tyre whose markings are stamped on the 3D sidewall. */
  const reference: Product | undefined = exact[0] ?? closest[0]

  const treadDepthMm = reference?.treadDepthMm ?? TREAD_DEPTH_FALLBACK[tread]

  const sidewall = useMemo(
    () => ({
      brand: reference?.brand ?? 'Greforce',
      model: reference?.model ?? TREAD_SPECS[tread].label,
      size,
      loadIndex: reference?.loadIndex ?? '148/145',
      speedRating: reference?.speedRating ?? 'M',
      ply: reference?.ply ?? '18PR',
    }),
    [reference, size, tread],
  )

  const proportions = useMemo(
    () => wheelProportions(size, treadDepthMm),
    [size, treadDepthMm],
  )

  return (
    <>
      <Seo
        title="Wheel Lab — Interactive 3D Truck Tyre Configurator | Spartan Tyres"
        description="Build a commercial truck tyre in 3D. Change axle position, size and tread pattern, pull the wheel apart, and see exactly which tyre in our range it matches."
        canonicalPath="/wheel-lab"
        jsonLd={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Wheel Lab', path: '/wheel-lab' },
        ])}
      />

      <Intro />

      <section className="section-tight">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-10">
            {/* Stage */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-charcoal to-steel-950">
                <div className="grid-texture pointer-events-none absolute inset-0 opacity-[0.07]" />

                <WheelConfigurator
                  size={size}
                  tread={tread}
                  treadDepthMm={treadDepthMm}
                  sidewall={sidewall}
                  rimStyle={rimStyle}
                  explode={explode}
                  spinSpeed={spinSpeed}
                  glow={explode > 0.05 ? 0.14 : 0}
                  className="aspect-square w-full sm:aspect-[4/3]"
                />

                {/* Live readout overlaid on the stage */}
                <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/10 bg-charcoal/75 px-3.5 py-2.5 backdrop-blur-md">
                  <p className="font-mono text-sm font-bold text-white">{size}</p>
                  <p className="text-[0.68rem] uppercase tracking-wide text-white/55">
                    {TREAD_SPECS[tread].label} · {POSITION_LABELS[axle]}
                  </p>
                </div>

                <p className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-1.5 text-[0.68rem] text-white/40">
                  <Maximize2 className="h-3 w-3" />
                  Drag to orbit · scroll to zoom
                </p>
              </div>

              <QualityNote />

              {/* Derived dimensions */}
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  icon={Ruler}
                  label="Overall diameter"
                  value={`${proportions.overallDiameterMm}mm`}
                />
                <Metric
                  icon={Maximize2}
                  label="Section width"
                  value={`${proportions.sectionWidthMm}mm`}
                />
                <Metric
                  icon={Layers}
                  label="Tread depth"
                  value={`${treadDepthMm}mm`}
                />
                <Metric
                  icon={Scale}
                  label="Max load"
                  value={
                    reference
                      ? `${reference.maxLoadKg.toLocaleString('en-AU')}kg`
                      : '—'
                  }
                />
              </dl>
            </div>

            {/* Controls */}
            <div className="space-y-6">
              <ControlBlock
                step={1}
                title="Axle position"
                hint="Sets which tyres are rated for the fitment, and suggests the tread."
              >
                <div className="grid grid-cols-3 gap-2">
                  {(['steer', 'drive', 'trailer'] as AxlePosition[]).map((position) => (
                    <button
                      key={position}
                      type="button"
                      onClick={() => setAxle(position)}
                      aria-pressed={axle === position}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all duration-300 ease-brand',
                        axle === position
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40',
                      )}
                    >
                      <span className="h-9 w-9">
                        <StaticWheel tread={DEFAULT_TREAD[position]} />
                      </span>
                      <span
                        className={cn(
                          'font-heading text-xs font-bold uppercase',
                          axle === position ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {POSITION_LABELS[position]}
                      </span>
                    </button>
                  ))}
                </div>
              </ControlBlock>

              <ControlBlock
                step={2}
                title="Size"
                hint="The model is rebuilt to the real proportions of the size you pick — a super-single genuinely renders wider and squatter."
              >
                <Select
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  aria-label="Tyre size"
                >
                  {allSizes.map((option) => {
                    const count = products.filter((p) => p.size === option).length
                    return (
                      <option key={option} value={option}>
                        {option} — {count} {pluralise(count, 'tyre')}
                      </option>
                    )
                  })}
                </Select>
              </ControlBlock>

              <ControlBlock
                step={3}
                title="Tread pattern"
                hint="Each family is generated as real 3D geometry, not a texture — the block count, skew and groove width all change."
              >
                <div className="space-y-2">
                  {TREAD_FAMILIES.map((family) => {
                    const spec = TREAD_SPECS[family]
                    const active = tread === family
                    return (
                      <button
                        key={family}
                        type="button"
                        onClick={() => setTread(family)}
                        aria-pressed={active}
                        className={cn(
                          'flex w-full items-start gap-3.5 rounded-lg border-2 p-3 text-left transition-all duration-300 ease-brand',
                          active
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card hover:border-primary/40',
                        )}
                      >
                        <span className="h-11 w-11 shrink-0">
                          <StaticWheel tread={family} spin={active} />
                        </span>
                        <span className="min-w-0">
                          <span
                            className={cn(
                              'block font-heading text-sm font-bold uppercase tracking-wide',
                              active && 'text-primary',
                            )}
                          >
                            {spec.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {spec.detail}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </ControlBlock>

              <ControlBlock
                step={4}
                title="Pull it apart"
                hint="Separate the four assemblies along the axle to see how a commercial tyre is actually built."
              >
                <Slider
                  id="explode"
                  label="Teardown"
                  value={explode}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={setExplode}
                  format={(value) => `${Math.round(value * 100)}%`}
                />

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={explode === 0 ? 'primary' : 'outline'}
                    onClick={() => setExplode(0)}
                  >
                    <Boxes className="mr-1.5 h-3.5 w-3.5" />
                    Assembled
                  </Button>
                  <Button
                    size="sm"
                    variant={explode === 1 ? 'primary' : 'outline'}
                    onClick={() => setExplode(1)}
                  >
                    <Zap className="mr-1.5 h-3.5 w-3.5" />
                    Full teardown
                  </Button>
                </div>
              </ControlBlock>

              <ControlBlock step={5} title="Finish & motion">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground">
                      Rim finish
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['alloy', 'steel'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setRimStyle(option)}
                          aria-pressed={rimStyle === option}
                          className={cn(
                            'rounded-lg border-2 px-3 py-2.5 font-heading text-xs font-bold uppercase tracking-wide capitalize transition-all',
                            rimStyle === option
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border bg-card hover:border-primary/40',
                          )}
                        >
                          {option === 'alloy' ? 'Polished alloy' : 'Painted steel'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Slider
                    id="spin"
                    label="Spin speed"
                    value={spinSpeed}
                    min={0}
                    max={2}
                    step={0.05}
                    onChange={setSpinSpeed}
                    format={(value) =>
                      value === 0 ? 'Stopped' : `${value.toFixed(2)} rad/s`
                    }
                    icon={RotateCw}
                  />
                </div>
              </ControlBlock>
            </div>
          </div>
        </div>
      </section>

      <Teardown explode={explode} onFocus={setExplode} />

      <Matches
        exact={exact}
        closest={closest}
        size={size}
        tread={tread}
        axle={axle}
      />

      <PatternCompare onPick={setTread} active={tread} />
    </>
  )
}

/** Representative tread depth when no catalogue tyre matches the build. */
const TREAD_DEPTH_FALLBACK: Record<TreadFamily, number> = {
  rib: 14,
  lug: 21.5,
  block: 15.5,
  trailer: 12.5,
}

/* ================================================================== *
 * Intro
 * ================================================================== */

function Intro() {
  return (
    <section className="relative overflow-hidden bg-charcoal py-14 text-charcoal-foreground md:py-20">
      <div className="grid-texture pointer-events-none absolute inset-0 opacity-[0.07]" />
      <div className="pointer-events-none absolute -top-32 left-1/3 h-96 w-96 rounded-full bg-primary/20 blur-[130px]" />
      <div className="hazard pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-60" />

      <div className="shell relative">
        <Reveal className="max-w-3xl">
          <p className="eyebrow">
            <Sparkles className="h-3.5 w-3.5" />
            Wheel Lab
          </p>
          <h1 className="display-1 mt-4 text-white">
            Build a truck tyre in <span className="text-primary">3D</span>
          </h1>
          <p className="lede mt-5 text-white/70">
            Every wheel on this site is generated from the catalogue, not
            modelled by hand — the silhouette, the tread geometry and the
            sidewall markings all come from real specification data. Change the
            axle, the size or the pattern below and watch the model rebuild
            itself, then pull it apart to see how a commercial casing is
            constructed.
          </p>

          <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/60">
            {[
              'Real proportions from the size code',
              'Procedural tread geometry',
              'Sidewall stamped from spec data',
              'Matches back to buyable stock',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Teardown legend
 * ================================================================== */

function Teardown({
  explode,
  onFocus,
}: {
  explode: number
  onFocus: (value: number) => void
}) {
  return (
    <section className="section bg-muted/40">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">The four assemblies</p>
          <h2 className="display-2 mt-3">What you're actually buying</h2>
          <p className="lede mt-4">
            A commercial tyre is four jobs in one component. Pull the model
            apart above — these are the parts coming away.
          </p>
        </Reveal>

        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {EXPLODED_PARTS.map((part, index) => (
            <Card key={part.key} interactive className="h-full p-6">
              <div className="flex items-baseline justify-between">
                <span className="font-heading text-3xl font-black text-primary/25">
                  0{index + 1}
                </span>
                <Badge variant="outline" size="sm">
                  {part.offset > 0 ? 'Outboard' : 'Inboard'}
                </Badge>
              </div>
              <h3 className="mt-4 font-heading text-base font-bold uppercase tracking-wide">
                {part.label}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {part.blurb}
              </p>
            </Card>
          ))}
        </Stagger>

        <Reveal className="mt-8 text-center">
          <Button
            variant={explode > 0.5 ? 'outline' : 'primary'}
            onClick={() => onFocus(explode > 0.5 ? 0 : 1)}
          >
            {explode > 0.5 ? (
              <>
                <Boxes className="mr-2 h-4 w-4" />
                Put it back together
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Pull the model apart
              </>
            )}
          </Button>
        </Reveal>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Catalogue matches
 * ================================================================== */

function Matches({
  exact,
  closest,
  size,
  tread,
  axle,
}: {
  exact: Product[]
  closest: Product[]
  size: string
  tread: TreadFamily
  axle: AxlePosition
}) {
  const add = useCart((s) => s.add)

  const addAll = () => {
    exact.forEach((product) => add(product))
    toast({
      title: `${exact.length} ${pluralise(exact.length, 'tyre')} added`,
      description: 'Volume discounts apply automatically from four tyres up.',
      variant: 'success',
    })
  }

  return (
    <section className="section">
      <div className="shell">
        <Reveal className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Your build</p>
            <h2 className="display-2 mt-3">
              {exact.length > 0
                ? `${exact.length} ${pluralise(exact.length, 'tyre')} matches this spec`
                : 'No exact match — here are the closest'}
            </h2>
            <p className="lede mt-3 max-w-2xl">
              <span className="font-mono font-semibold text-foreground">{size}</span>{' '}
              · {TREAD_SPECS[tread].label} ·{' '}
              {POSITION_LABELS[axle]} axle
            </p>
          </div>

          {exact.length > 1 ? (
            <Button onClick={addAll}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Add all {exact.length} to cart
            </Button>
          ) : null}
        </Reveal>

        {exact.length > 0 ? (
          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {exact.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </Stagger>
        ) : (
          <div className="mt-10 rounded-lg border-2 border-dashed border-border bg-card p-8 text-center">
            <h3 className="font-heading text-base font-bold uppercase tracking-wide">
              We don't stock that exact combination
            </h3>
            <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Not every pattern is made in every size. We source specialty and
              hard-to-find fitments through our supplier network — call{' '}
              <a
                href={site.phone.href}
                className="font-semibold text-primary hover:underline"
              >
                {site.phone.display}
              </a>{' '}
              and we'll tell you what's available and what the lead time is.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <a href={site.phone.href}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call about this spec
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contact">Send an enquiry</Link>
              </Button>
            </div>
          </div>
        )}

        {closest.length > 0 ? (
          <div className="mt-14">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide">
              {exact.length > 0 ? 'You might also consider' : 'Closest in our range'}
            </h3>
            <Stagger className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {closest.map((product) => (
                <ProductCard key={product.id} product={product} compact />
              ))}
            </Stagger>
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* ================================================================== *
 * Pattern comparison
 * ================================================================== */

function PatternCompare({
  onPick,
  active,
}: {
  onPick: (tread: TreadFamily) => void
  active: TreadFamily
}) {
  return (
    <section className="section bg-charcoal text-charcoal-foreground">
      <div className="shell">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Side by side</p>
          <h2 className="display-2 mt-3 text-white">
            Four patterns, four different jobs
          </h2>
          <p className="lede mt-4 text-white/65">
            The geometry below is the same geometry the 3D model builds — block
            count, groove width and skew angle all differ by family.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TREAD_FAMILIES.map((family, index) => {
            const spec = TREAD_SPECS[family]
            const isActive = active === family
            const count = products.filter((p) => p.tread === family).length
            const cheapest = products
              .filter((p) => p.tread === family)
              .reduce<number | null>((min, p) => {
                const price = effectivePrice(p)
                return min === null || price < min ? price : min
              }, null)

            return (
              <Reveal key={family} delay={index * 0.08}>
                <button
                  type="button"
                  onClick={() => onPick(family)}
                  aria-pressed={isActive}
                  className={cn(
                    'flex h-full w-full flex-col rounded-lg border-2 p-6 text-left transition-all duration-300 ease-brand hover:-translate-y-1',
                    isActive
                      ? 'border-primary bg-primary/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-primary/40',
                  )}
                >
                  <span className="mx-auto h-24 w-24">
                    <StaticWheel tread={family} spin={isActive} />
                  </span>

                  <span
                    className={cn(
                      'mt-5 block font-heading text-sm font-bold uppercase tracking-wide',
                      isActive ? 'text-primary' : 'text-white',
                    )}
                  >
                    {spec.label}
                  </span>

                  <span className="mt-2.5 block flex-1 text-xs leading-relaxed text-white/60">
                    {spec.detail}
                  </span>

                  <span className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-[0.7rem] text-white/50">
                      {count} {pluralise(count, 'line')} in range
                    </span>
                    {cheapest !== null ? (
                      <span className="font-heading text-sm font-bold text-white">
                        from {money(cheapest)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </Reveal>
            )
          })}
        </div>

        <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/shop">
              Browse every tyre
              <ArrowRight className="ml-2 h-4 w-4" />
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
        </Reveal>
      </div>
    </section>
  )
}

/* ================================================================== *
 * Controls
 * ================================================================== */

function ControlBlock({
  step,
  title,
  hint,
  children,
}: {
  step: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-primary font-heading text-xs font-black text-primary">
          {step}
        </span>
        <div>
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide">
            {title}
          </h2>
          {hint ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  icon: IconComponent,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format: (value: number) => string
  icon?: typeof RotateCw
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={id}
          className="flex items-center gap-1.5 font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground"
        >
          {IconComponent ? <IconComponent className="h-3 w-3" /> : null}
          {label}
        </label>
        <span className="font-mono text-xs font-semibold text-primary">
          {format(value)}
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow"
      />
    </div>
  )
}

function Metric({
  icon: IconComponent,
  label,
  value,
}: {
  icon: typeof Ruler
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
        <IconComponent className="h-3 w-3 text-primary" />
        {label}
      </dt>
      <dd className="mt-1 font-heading text-sm font-bold">{value}</dd>
    </div>
  )
}

/**
 * Lets a visitor on weak hardware dial the renderer down — or off — without
 * losing the configurator, which falls back to the SVG wheel.
 */
function QualityNote() {
  const quality = useRenderQuality((s) => s.quality)
  const setQuality = useRenderQuality((s) => s.setQuality)

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        3D quality
      </p>

      <div className="flex gap-1" role="radiogroup" aria-label="3D render quality">
        {(['high', 'balanced', 'off'] as const).map((option) => (
          <Tooltip
            key={option}
            content={
              option === 'high'
                ? 'Full tread geometry and shadows'
                : option === 'balanced'
                  ? 'Fewer tread blocks, lower resolution'
                  : 'Static illustration instead of 3D'
            }
          >
            <button
              type="button"
              role="radio"
              aria-checked={quality === option}
              onClick={() => setQuality(option)}
              className={cn(
                'rounded px-2.5 py-1 font-heading text-[0.65rem] font-bold uppercase tracking-wide transition-colors',
                quality === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {option}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
