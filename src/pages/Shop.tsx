import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Phone, Search, SlidersHorizontal, X } from 'lucide-react'
import type { Product } from '@/data/types'
import { POSITION_LABELS, inStockCount, poaProducts, preOrderCount, products } from '@/data/products'
import { site } from '@/config/site'
import { cn, debounce, formatNumber, money, pluralise } from '@/lib/utils'
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  Sheet,
  SheetClose,
  SheetHeader,
  SheetTitle,
  buttonClasses,
} from '@/components/ui'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import {
  Filters,
  SORT_OPTIONS,
  activeFilterCount,
  applyFilters,
  blockingFacets,
  clearedFacet,
  filtersFromParams,
  paramsFromFilters,
  sortProducts,
  type FacetKey,
  type ShopFilters,
  type SortKey,
} from '@/components/shop/Filters'
import { ProductGrid } from '@/components/shop/ProductGrid'
import { QuickView } from '@/components/shop/QuickView'

/**
 * The full catalogue browse.
 *
 * The query string is the source of truth for every filter, sort and search
 * term, so a link to a filtered view reproduces that view exactly — which is
 * how fleet buyers actually share a shortlist with the person who signs off.
 * The header's search navigates to `/shop?q=…`, read by the same contract.
 */
export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])

  const [quickView, setQuickView] = useState<Product | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  /* ---- URL writes ------------------------------------------------ */

  // Always derived from the live params rather than a captured `filters`, so a
  // debounced keystroke can never overwrite a filter chosen in the meantime.
  const update = useCallback(
    (patch: Partial<ShopFilters>) => {
      setSearchParams(
        (previous) =>
          paramsFromFilters({ ...filtersFromParams(previous), ...patch }),
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const clearAll = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  /* ---- search box ------------------------------------------------ */

  const [queryDraft, setQueryDraft] = useState(filters.q)

  // Re-sync when the URL changes from outside — the header search, a shared
  // link, or the browser's back button.
  useEffect(() => setQueryDraft(filters.q), [filters.q])

  const commitQuery = useMemo(
    () =>
      debounce((value: string) => {
        setSearchParams(
          (previous) => {
            const next = new URLSearchParams(previous)
            const trimmed = value.trim()
            if (trimmed) next.set('q', trimmed)
            else {
              next.delete('q')
              // Relevance has nothing to rank against once the term is gone.
              if (next.get('sort') === 'relevance') next.delete('sort')
            }
            return next
          },
          { replace: true },
        )
      }, 260),
    [setSearchParams],
  )

  /* ---- results --------------------------------------------------- */

  const results = useMemo(
    () => sortProducts(applyFilters(filters), filters),
    [filters],
  )

  const activeCount = activeFilterCount(filters)
  const chips = useMemo(() => buildChips(filters), [filters])
  const suggestions = useMemo(
    () => (results.length === 0 ? blockingFacets(filters).slice(0, 3) : []),
    [results.length, filters],
  )

  const sortOptions = filters.q
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((option) => option.value !== 'relevance')

  const jsonLd = useMemo(
    () =>
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
      ]),
    [],
  )

  const title = filters.q
    ? `${filters.q} — Truck Tyre Search | ${site.name}`
    : `Shop Truck Tyres Online | ${site.name}`

  return (
    <>
      <Seo
        title={title}
        description={`Browse all ${products.length} Greforce and Lionshead truck, bus and trailer tyre lines. Filter by size, axle position, application and price. ${inStockCount} lines in stock at our Yennora warehouse, the rest on pre-order or built to order.`}
        canonicalPath="/shop"
        jsonLd={jsonLd}
      />

      {/* Header -------------------------------------------------- */}
      <header className="relative overflow-hidden border-b border-border bg-card">
        <div
          aria-hidden="true"
          className="grid-texture pointer-events-none absolute inset-0 opacity-30"
        />
        <div className="shell relative py-10 md:py-14">
          <p className="eyebrow">The full range</p>
          <h1 className="display-2 mt-3">Truck &amp; trailer tyres</h1>
          <p className="lede mt-4 max-w-2xl">
            Every Greforce and Lionshead line we carry, with the specs that decide
            the purchase on the card. {formatNumber(inStockCount)} of{' '}
            {products.length} lines are in stock at Yennora right now,{' '}
            {preOrderCount} can be pre-ordered, and {poaProducts.length} are built to
            order and quoted on request.
          </p>
        </div>
      </header>

      <div className="shell py-8 md:py-12">
        <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
          {/* Desktop rail --------------------------------------- */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2">
              <Filters
                filters={filters}
                onChange={update}
                onClearAll={clearAll}
                idPrefix="rail"
              />
            </div>
          </aside>

          {/* Results -------------------------------------------- */}
          <div className="min-w-0">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="shop-search">Search the range</Label>
                <div className="relative mt-1.5">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="shop-search"
                    type="search"
                    value={queryDraft}
                    placeholder="Size, pattern, brand — try 11R22.5 or GRD57"
                    onChange={(event) => {
                      setQueryDraft(event.target.value)
                      commitQuery(event.target.value)
                    }}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="w-full sm:w-56">
                <Label htmlFor="shop-sort">Sort by</Label>
                <Select
                  id="shop-sort"
                  value={filters.sort}
                  onChange={(event) => update({ sort: event.target.value as SortKey })}
                  className="mt-1.5"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <Button
                variant="outline"
                onClick={() => setSheetOpen(true)}
                className="w-full justify-center sm:w-auto lg:hidden"
                aria-haspopup="dialog"
              >
                <SlidersHorizontal aria-hidden="true" className="mr-2 h-4 w-4" />
                {activeCount > 0
                  ? `${activeCount} ${pluralise(activeCount, 'filter')} active`
                  : 'Filters'}
              </Button>
            </div>

            {/* Active chips */}
            {chips.length > 0 ? (
              <ul className="mt-5 flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <button
                      type="button"
                      onClick={() => update(chip.patch)}
                      className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-3 pr-2 text-xs font-semibold transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {chip.label}
                      <X
                        aria-hidden="true"
                        className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary"
                      />
                      <span className="sr-only">— remove this filter</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Clear all
                  </button>
                </li>
              </ul>
            ) : null}

            {/* Count */}
            <p
              aria-live="polite"
              aria-atomic="true"
              className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground"
            >
              <span className="font-heading font-bold text-foreground">
                {results.length} {pluralise(results.length, 'tyre')}
              </span>{' '}
              {results.length === products.length
                ? 'in the range'
                : `of ${products.length} match`}
              {filters.q ? (
                <>
                  {' '}
                  for <span className="font-semibold text-foreground">“{filters.q}”</span>
                </>
              ) : null}
            </p>

            {/* Grid or empty state */}
            {results.length > 0 ? (
              <ProductGrid
                products={results}
                onQuickView={setQuickView}
                className="mt-6"
              />
            ) : (
              <EmptyState
                filters={filters}
                suggestions={suggestions}
                onChange={update}
                onClearAll={clearAll}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter sheet ----------------------------------- */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} side="left">
        <SheetHeader>
          <div>
            <SheetTitle>Filters</SheetTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeCount > 0
                ? `${activeCount} ${pluralise(activeCount, 'filter')} active`
                : 'Narrow the range'}
            </p>
          </div>
          <SheetClose />
        </SheetHeader>

        <div className="flex-1 p-5">
          <Filters
            filters={filters}
            onChange={update}
            onClearAll={clearAll}
            idPrefix="sheet"
          />
        </div>

        <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-card/95 p-4 backdrop-blur">
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={activeCount === 0 && !filters.q}
            className="flex-1"
          >
            Clear
          </Button>
          <SheetClose className={cn(buttonClasses('primary', 'md'), 'flex-[1.4]')}>
            Show {results.length} {pluralise(results.length, 'tyre')}
          </SheetClose>
        </div>
      </Sheet>

      <QuickView product={quickView} onClose={() => setQuickView(null)} />
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Active filter chips
 * ------------------------------------------------------------------ */

interface Chip {
  key: string
  label: string
  patch: Partial<ShopFilters>
}

function buildChips(filters: ShopFilters): Chip[] {
  const chips: Chip[] = []

  if (filters.q) {
    chips.push({ key: 'q', label: `“${filters.q}”`, patch: { q: '' } })
  }

  for (const brand of filters.brands) {
    chips.push({
      key: `brand-${brand}`,
      label: brand,
      patch: { brands: filters.brands.filter((value) => value !== brand) },
    })
  }

  for (const size of filters.sizes) {
    chips.push({
      key: `size-${size}`,
      label: size,
      patch: { sizes: filters.sizes.filter((value) => value !== size) },
    })
  }

  for (const rim of filters.rims) {
    chips.push({
      key: `rim-${rim}`,
      label: `${rim}in rim`,
      patch: { rims: filters.rims.filter((value) => value !== rim) },
    })
  }

  if (filters.position) {
    chips.push({
      key: 'position',
      label: `${POSITION_LABELS[filters.position]} axle`,
      patch: { position: null },
    })
  }

  for (const application of filters.applications) {
    chips.push({
      key: `application-${application}`,
      label: application,
      patch: {
        applications: filters.applications.filter((value) => value !== application),
      },
    })
  }

  if (filters.minPrice != null || filters.maxPrice != null) {
    const label =
      filters.minPrice != null && filters.maxPrice != null
        ? `${money(filters.minPrice)} – ${money(filters.maxPrice)}`
        : filters.minPrice != null
          ? `From ${money(filters.minPrice)}`
          : `Up to ${money(filters.maxPrice ?? 0)}`
    chips.push({ key: 'price', label, patch: { minPrice: null, maxPrice: null } })
  }

  if (filters.inStock) {
    chips.push({ key: 'inStock', label: 'In stock now', patch: { inStock: false } })
  }

  if (filters.retreadable) {
    chips.push({
      key: 'retreadable',
      label: 'Retreadable',
      patch: { retreadable: false },
    })
  }

  return chips
}

/* ------------------------------------------------------------------ *
 * Empty state
 *
 * "No results" on its own is a dead end. This names the filter that is
 * actually doing the excluding, offers to drop it, and — because the
 * catalogue genuinely does not cover every fitment — gives the phone
 * number for sizes we do not list.
 * ------------------------------------------------------------------ */

function EmptyState({
  filters,
  suggestions,
  onChange,
  onClearAll,
}: {
  filters: ShopFilters
  suggestions: Array<{ facet: FacetKey; label: string; count: number }>
  onChange: (patch: Partial<ShopFilters>) => void
  onClearAll: () => void
}) {
  const worst = suggestions[0]

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-6 sm:p-10">
      <Badge variant="warning">No matches</Badge>

      <h2 className="display-3 mt-4">
        {worst
          ? `Your ${worst.label.toLowerCase()} filter is excluding everything`
          : 'Nothing in the range matches that'}
      </h2>

      <p className="lede mt-3 max-w-2xl">
        {worst ? (
          <>
            Drop it and {worst.count} {pluralise(worst.count, 'tyre')} come back.
            Every other filter you have set still has matches on its own.
          </>
        ) : (
          <>
            We stock {products.length} lines across{' '}
            {formatNumber(new Set(products.map((product) => product.size)).size)} sizes,
            and nothing in them fits that combination.
          </>
        )}
      </p>

      {suggestions.length > 0 ? (
        <ul className="mt-6 flex flex-wrap gap-3">
          {suggestions.map((suggestion) => (
            <li key={suggestion.facet}>
              <Button
                variant={suggestion === worst ? 'primary' : 'outline'}
                onClick={() => onChange(clearedFacet(suggestion.facet))}
              >
                Remove {suggestion.label.toLowerCase()}
                <span className="ml-2 font-normal normal-case opacity-80">
                  ({suggestion.count} {pluralise(suggestion.count, 'tyre')})
                </span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <Button variant="outline" onClick={onClearAll}>
          Clear every filter
        </Button>
        <Button asChild variant="ghost">
          <a href={site.phone.href}>
            <Phone aria-hidden="true" className="mr-2 h-4 w-4" />
            {site.phone.display}
          </a>
        </Button>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {filters.sizes.length > 0 || filters.rims.length > 0
          ? 'If the size you need is not in our list at all, call us — '
          : 'Looking for a fitment we do not list? Call us — '}
        we can source most commercial sizes through {site.partner.name}, and we
        will tell you what is involved before you order. {site.hours.short}.
      </p>
    </section>
  )
}
