import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Check,
  Phone,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  POSITION_LABELS,
  allRimDiameters,
  allSizes,
  lowestPrice,
  products,
} from '@/data/products'
import { site } from '@/config/site'
import { cn, formatNumber, money, pluralise } from '@/lib/utils'
import { useAxle } from '@/store/ui'
import { Button, Input, Label, Select } from '@/components/ui'
import { Reveal, Stagger } from '@/components/motion'
import { StaticWheel } from '@/components/three'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { AxleSelector } from '@/components/shop/AxleSelector'
import { ProductCard } from '@/components/shop/ProductCard'
import { SizeDecoder } from '@/components/shop/SizeDecoder'
import { SIZE_FACETS, matchSizes } from '@/components/shop/Filters'

/**
 * The fast path for somebody who already knows their size.
 *
 * Two routes to the same answer: type the code off the sidewall — in any
 * format, because nobody transcribes `295/80R22.5` consistently — or build it
 * up from rim diameter down when the sidewall is too worn to read. Both narrow
 * from real catalogue data, so the finder can never offer a size we do not hold.
 */
export default function Finder() {
  const [query, setQuery] = useState('')
  const [size, setSize] = useState<string | null>(null)
  const [rimChoice, setRimChoice] = useState('')
  const [widthChoice, setWidthChoice] = useState('')

  const axle = useAxle((state) => state.axle)
  const setAxle = useAxle((state) => state.setAxle)

  const trimmed = query.trim()
  const suggestions = useMemo(
    () => (trimmed ? matchSizes(trimmed) : []),
    [trimmed],
  )

  /* ---- build-it-up selects, each narrowed by the one before ---- */

  const widthsForRim = useMemo(() => {
    if (!rimChoice) return []
    const rim = Number(rimChoice)
    const seen = new Map<string, number>()
    for (const facet of SIZE_FACETS) {
      if (facet.rimDiameterIn !== rim) continue
      seen.set(facet.widthLabel, facet.widthSort)
    }
    return [...seen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label)
  }, [rimChoice])

  const sizesForChoice = useMemo(() => {
    if (!rimChoice || !widthChoice) return []
    return SIZE_FACETS.filter(
      (facet) =>
        facet.rimDiameterIn === Number(rimChoice) &&
        facet.widthLabel === widthChoice,
    )
  }, [rimChoice, widthChoice])

  /* ---- matches ---- */

  const inSize = useMemo(
    () => (size ? products.filter((product) => product.size === size) : []),
    [size],
  )
  const matches = useMemo(
    () => inSize.filter((product) => product.position.includes(axle)),
    [inSize, axle],
  )
  const fromPrice = useMemo(() => lowestPrice(inSize), [inSize])

  const chooseSize = (next: string) => {
    setSize(next)
    setQuery('')
  }

  const reset = () => {
    setSize(null)
    setQuery('')
    setRimChoice('')
    setWidthChoice('')
  }

  const jsonLd = useMemo(
    () =>
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Tyre Finder', path: '/finder' },
      ]),
    [],
  )

  return (
    <>
      <Seo
        title={`Truck Tyre Size Finder | ${site.name}`}
        description={`Find truck tyres by size in seconds. Search any of our ${allSizes.length} stocked sizes, or build the size up from rim diameter, then pick your axle to see every matching fitment.`}
        canonicalPath="/finder"
        jsonLd={jsonLd}
      />

      {/* Header ------------------------------------------------ */}
      <header className="relative overflow-hidden border-b border-border bg-card">
        <div
          aria-hidden="true"
          className="grid-texture pointer-events-none absolute inset-0 opacity-30"
        />
        <div className="shell relative py-10 md:py-14">
          <p className="eyebrow">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Tyre finder
          </p>
          <h1 className="display-2 mt-3">Start with your size</h1>
          <p className="lede mt-4 max-w-2xl">
            The size is moulded on the sidewall — something like 295/80R22.5 or
            11R22.5. Type it however it comes out and we will find it, or build it
            up below if the sidewall is past reading. We carry{' '}
            {allSizes.length} sizes across {products.length} lines.
          </p>
        </div>
      </header>

      <div className="shell flex flex-col gap-8 py-8 md:gap-12 md:py-12">
        {/* Step 1 -------------------------------------------- */}
        <section aria-labelledby="finder-step-1">
          <StepHeading
            id="finder-step-1"
            step={1}
            title="Which size?"
            done={size !== null}
          />

          {size ? (
            /* Chosen ------------------------------------------ */
            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-primary/40 bg-primary/5 p-5">
              <div className="h-14 w-14 shrink-0">
                <StaticWheel
                  tread={inSize[0]?.tread ?? 'rib'}
                  title={`${size} truck tyre`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-primary">
                  Your size
                </p>
                <p className="font-mono text-2xl font-bold leading-tight">{size}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {inSize.length} {pluralise(inSize.length, 'line')} in this size,{' '}
                  {fromPrice != null
                    ? `from ${money(fromPrice)} per tyre`
                    : 'price on application'}
                </p>
              </div>
              <Button variant="outline" onClick={reset}>
                Change size
              </Button>
            </div>
          ) : (
            <>
              {/* Search ------------------------------------- */}
              <div className="mt-5 rounded-lg border border-border bg-card p-5 sm:p-6">
                <Label htmlFor="finder-size">Type your size</Label>
                <div className="relative mt-2">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="finder-size"
                    type="search"
                    autoComplete="off"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="295/80R22.5, 11r225, 22.5 …"
                    className="h-14 pl-12 pr-12 font-mono text-lg"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear the size search"
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
                  {trimmed
                    ? `${suggestions.length} ${pluralise(suggestions.length, 'size')} match “${trimmed}”`
                    : 'Slashes, spaces and capitals do not matter — 11R22.5, 11 r 22.5 and 11r225 all work.'}
                </p>

                {suggestions.length > 0 ? (
                  <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {suggestions.map((facet) => (
                      <li key={facet.size}>
                        <button
                          type="button"
                          onClick={() => chooseSize(facet.size)}
                          className="group flex w-full items-center gap-3 rounded-lg border-2 border-border bg-background p-4 text-left transition-all duration-300 ease-brand hover:-translate-y-0.5 hover:border-primary hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          <span className="h-12 w-12 shrink-0">
                            <StaticWheel
                              tread={
                                products.find((p) => p.size === facet.size)?.tread ??
                                'rib'
                              }
                            />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-mono text-lg font-bold leading-tight transition-colors group-hover:text-primary">
                              {facet.size}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {facet.count} {pluralise(facet.count, 'tyre')} ·{' '}
                              {facet.widthLabel} on {facet.rimDiameterIn}in
                            </span>
                          </span>
                          <ArrowRight
                            aria-hidden="true"
                            className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : trimmed ? (
                  <div className="mt-4 rounded-lg border border-border bg-muted/40 p-5">
                    <p className="font-heading text-sm font-bold uppercase tracking-wide">
                      We do not list “{trimmed}”
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Our range covers {allSizes.length} commercial sizes. If yours
                      is not one of them we can almost certainly source it through{' '}
                      {site.partner.name} — call{' '}
                      <a
                        href={site.phone.href}
                        className="font-semibold text-primary hover:underline"
                      >
                        {site.phone.display}
                      </a>{' '}
                      ({site.hours.short}) with the code off the sidewall.
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {allSizes.map((option) => (
                        <li key={option}>
                          <button
                            type="button"
                            onClick={() => chooseSize(option)}
                            className="rounded-full border border-border bg-background px-3 py-1 font-mono text-xs font-semibold transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            {option}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {/* Build it up -------------------------------- */}
              <div className="mt-5 rounded-lg border border-border bg-card p-5 sm:p-6">
                <h3 className="font-heading text-sm font-bold uppercase tracking-wide">
                  Or build the size up
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Work down from the wheel. Each step only offers what we actually
                  stock, so you cannot build a size that does not exist.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="finder-rim">1. Rim diameter</Label>
                    <Select
                      id="finder-rim"
                      className="mt-1.5"
                      placeholder="Choose a rim"
                      value={rimChoice}
                      onChange={(event) => {
                        setRimChoice(event.target.value)
                        setWidthChoice('')
                      }}
                    >
                      {allRimDiameters.map((rim) => (
                        <option key={rim} value={String(rim)}>
                          {rim} inch
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="finder-width">2. Section width</Label>
                    <Select
                      id="finder-width"
                      className="mt-1.5"
                      placeholder={rimChoice ? 'Choose a width' : 'Pick a rim first'}
                      disabled={!rimChoice}
                      value={widthChoice}
                      onChange={(event) => setWidthChoice(event.target.value)}
                    >
                      {widthsForRim.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="finder-size-select">3. Size</Label>
                    <Select
                      id="finder-size-select"
                      className="mt-1.5"
                      placeholder={
                        widthChoice ? 'Choose a size' : 'Pick a width first'
                      }
                      disabled={!widthChoice}
                      value=""
                      onChange={(event) => {
                        if (event.target.value) chooseSize(event.target.value)
                      }}
                    >
                      {sizesForChoice.map((facet) => (
                        <option key={facet.size} value={facet.size}>
                          {facet.size} ({facet.count}{' '}
                          {pluralise(facet.count, 'tyre')})
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Size decoder ------------------------------------- */}
        {size ? (
          <Reveal>
            <SizeDecoder size={size} />
            <p className="mt-3 text-sm text-muted-foreground">
              Want the long version — load indexes, speed symbols, retreading and
              what actually wears a tyre out?{' '}
              <Link
                to="/guide"
                className="font-semibold text-primary hover:underline"
              >
                Read the full tyre guide
              </Link>
              .
            </p>
          </Reveal>
        ) : null}

        {/* Step 2 ------------------------------------------- */}
        {size ? (
          <section aria-labelledby="finder-step-2">
            <StepHeading
              id="finder-step-2"
              step={2}
              title="Which axle?"
              done
            />
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Steer, drive and trailer axles want genuinely different tread. Pick
              the axle you are replacing — we remember it across the site.
            </p>
            <div className="mt-5 rounded-lg border border-border bg-card p-5 sm:p-6">
              <AxleSelector value={axle} onChange={setAxle} showDetail />
            </div>
          </section>
        ) : null}

        {/* Step 3 ------------------------------------------- */}
        {size ? (
          <section aria-labelledby="finder-step-3">
            <StepHeading
              id="finder-step-3"
              step={3}
              title="Your matches"
              done={matches.length > 0}
            />

            <p
              aria-live="polite"
              aria-atomic="true"
              className="mt-2 text-sm text-muted-foreground"
            >
              <span className="font-heading font-bold text-foreground">
                {matches.length} {pluralise(matches.length, 'tyre')}
              </span>{' '}
              in {size} rated for the {POSITION_LABELS[axle].toLowerCase()} axle.
            </p>

            {matches.length > 0 ? (
              <>
                <Stagger className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {matches.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      className="h-full"
                    />
                  ))}
                </Stagger>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <Link
                      to={`/shop?size=${encodeURIComponent(size)}&position=${axle}`}
                    >
                      Open this in the shop
                      <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to={`/shop?size=${encodeURIComponent(size)}`}>
                      All {inSize.length} {pluralise(inSize.length, 'line')} in{' '}
                      {size}
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-lg border border-border bg-card p-6">
                <h3 className="font-heading text-lg font-bold uppercase tracking-wide">
                  Nothing in {size} is rated for the{' '}
                  {POSITION_LABELS[axle].toLowerCase()} axle
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  We carry {inSize.length} {pluralise(inSize.length, 'line')} in this
                  size, but none of them carries a{' '}
                  {POSITION_LABELS[axle].toLowerCase()} rating. Fitting a tyre to an
                  axle it is not rated for is not something we will recommend — try
                  another axle, or call us and we will work out the right fitment.
                </p>

                <ul className="mt-5 flex flex-wrap gap-2">
                  {(['steer', 'drive', 'trailer'] as const)
                    .filter((position) => position !== axle)
                    .map((position) => {
                      const count = inSize.filter((product) =>
                        product.position.includes(position),
                      ).length
                      return (
                        <li key={position}>
                          <Button
                            variant="outline"
                            disabled={count === 0}
                            onClick={() => setAxle(position)}
                          >
                            {POSITION_LABELS[position]}
                            <span className="ml-2 font-normal normal-case opacity-80">
                              ({count})
                            </span>
                          </Button>
                        </li>
                      )
                    })}
                  <li>
                    <Button asChild variant="ghost">
                      <a href={site.phone.href}>
                        <Phone aria-hidden="true" className="mr-2 h-4 w-4" />
                        {site.phone.display}
                      </a>
                    </Button>
                  </li>
                </ul>
              </div>
            )}
          </section>
        ) : null}

        {/* Guide prompt ------------------------------------- */}
        {!size ? (
          <section className="rounded-lg border border-border bg-card p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 font-heading text-lg font-bold uppercase tracking-wide">
                  <BookOpen aria-hidden="true" className="h-5 w-5 text-primary" />
                  Not sure what the numbers mean?
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Our guide walks through size codes, load indexes, speed symbols,
                  ply ratings and when a casing is worth retreading — written for
                  operators, not engineers.
                </p>
              </div>
              <Button asChild variant="outline" className="shrink-0">
                <Link to="/guide">
                  Read the tyre guide
                  <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 sm:grid-cols-4">
              <Figure label="Sizes stocked" value={String(allSizes.length)} />
              <Figure label="Lines in range" value={String(products.length)} />
              <Figure
                label="Rim diameters"
                value={allRimDiameters.map((rim) => `${rim}"`).join(' · ')}
              />
              <Figure
                label="Tyres on the floor"
                value={formatNumber(
                  products.reduce((sum, product) => sum + product.stock, 0),
                )}
              />
            </dl>
          </section>
        ) : null}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */

function StepHeading({
  id,
  step,
  title,
  done = false,
}: {
  id: string
  step: number
  title: string
  done?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-sm font-black',
          done
            ? 'bg-primary text-primary-foreground'
            : 'border-2 border-border text-muted-foreground',
        )}
      >
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : step}
      </span>
      <h2 id={id} className="display-3">
        <span className="sr-only">Step {step}: </span>
        {title}
      </h2>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-heading text-[0.6rem] font-bold uppercase tracking-brand text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-lg font-black leading-tight">{value}</dd>
    </div>
  )
}
