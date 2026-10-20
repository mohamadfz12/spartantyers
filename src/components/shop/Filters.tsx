import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import type { AxlePosition, Product } from '@/data/types'
import {
  allApplications,
  allBrands,
  allRimDiameters,
  allSizes,
  comparePrice,
  effectivePrice,
  POSITION_LABELS,
  priceRange,
  products,
} from '@/data/products'
import { cn, money, pluralise } from '@/lib/utils'
import { Badge, Checkbox, Input, Label } from '@/components/ui'
import { AxleSelector } from './AxleSelector'

/* ------------------------------------------------------------------ *
 * The shop's filter model
 *
 * The URL is the source of truth for the whole browse experience, so the
 * parse/serialise pair below is the only place that knows the query-string
 * contract. Everything else — the rail, the mobile sheet, the chips, the
 * empty state — reads the same `ShopFilters` object.
 *
 *   q            free text (brand, model, size, application, SKU)
 *   brand        repeatable, comma-tolerant: Greforce | Lionshead
 *   size         repeatable, comma-tolerant, fuzzy on read: 11R22.5, 11r225 …
 *   position     single: steer | drive | trailer
 *   application  repeatable, comma-tolerant
 *   rim          repeatable, comma-tolerant rim diameters in inches
 *   minPrice     dollars, per tyre, inc. GST
 *   maxPrice     dollars, per tyre, inc. GST
 *   inStock      1 = exclude pre-order lines
 *   retreadable  1 = retreadable casings only
 *   sort         relevance | price-asc | price-desc | tread-desc |
 *                load-desc | rating-desc | newest
 * ------------------------------------------------------------------ */

export type SortKey =
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'tread-desc'
  | 'load-desc'
  | 'rating-desc'
  | 'newest'

export interface ShopFilters {
  q: string
  brands: string[]
  sizes: string[]
  position: AxlePosition | null
  applications: string[]
  rims: number[]
  minPrice: number | null
  maxPrice: number | null
  inStock: boolean
  retreadable: boolean
  sort: SortKey
}

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'relevance', label: 'Best match' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'tread-desc', label: 'Tread depth: deepest first' },
  { value: 'load-desc', label: 'Load rating: highest first' },
  { value: 'rating-desc', label: 'Customer rating: highest first' },
  { value: 'newest', label: 'Newest to the range' },
]

const SORT_KEYS = SORT_OPTIONS.map((option) => option.value)

/** Sort applied when the URL carries no `sort`. Relevance needs a query. */
export function defaultSort(q: string): SortKey {
  return q ? 'relevance' : 'price-asc'
}

/* ------------------------------------------------------------------ *
 * Size helpers
 *
 * `11R22.5`, `11 R 22.5` and `11r225` are the same tyre as far as a
 * customer is concerned, so every size comparison runs through this key.
 * ------------------------------------------------------------------ */

export function sizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface SizeFacet {
  size: string
  rimDiameterIn: number
  /** `295mm` for metric codes, `11in` for imperial ones. */
  widthLabel: string
  widthSort: number
  count: number
}

function widthToken(size: string): { label: string; sort: number } {
  const metric = size.match(/^(\d{3})\//)
  if (metric) return { label: `${metric[1]}mm`, sort: Number(metric[1]) }
  const imperial = size.match(/^(\d+(?:\.\d+)?)R/)
  if (imperial) return { label: `${imperial[1]}in`, sort: Number(imperial[1]) * 25.4 }
  return { label: size, sort: 0 }
}

export const SIZE_FACETS: SizeFacet[] = allSizes.map((size) => {
  const sample = products.find((product) => product.size === size)
  const width = widthToken(size)
  return {
    size,
    rimDiameterIn: sample?.rimDiameterIn ?? 0,
    widthLabel: width.label,
    widthSort: width.sort,
    count: products.filter((product) => product.size === size).length,
  }
})

export const SIZE_GROUPS: Array<{ rim: number; sizes: SizeFacet[] }> =
  allRimDiameters.map((rim) => ({
    rim,
    sizes: SIZE_FACETS.filter((facet) => facet.rimDiameterIn === rim),
  }))

/** Fuzzy size lookup used by the finder's type-ahead. Exact prefixes rank first. */
export function matchSizes(query: string): SizeFacet[] {
  const key = sizeKey(query)
  if (!key) return []
  return SIZE_FACETS.filter((facet) => sizeKey(facet.size).includes(key)).sort(
    (a, b) => {
      const aStarts = sizeKey(a.size).startsWith(key) ? 0 : 1
      const bStarts = sizeKey(b.size).startsWith(key) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return b.count - a.count
    },
  )
}

/* ------------------------------------------------------------------ *
 * URL ⇄ filters
 * ------------------------------------------------------------------ */

export const EMPTY_FILTERS: ShopFilters = {
  q: '',
  brands: [],
  sizes: [],
  position: null,
  applications: [],
  rims: [],
  minPrice: null,
  maxPrice: null,
  inStock: false,
  retreadable: false,
  sort: 'price-asc',
}

/** Reads a repeatable param, also accepting a single comma-separated value. */
function multi(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function numberParam(raw: string | null): number | null {
  if (raw == null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? Math.round(value) : null
}

function isTrue(raw: string | null): boolean {
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export function filtersFromParams(params: URLSearchParams): ShopFilters {
  const q = (params.get('q') ?? '').trim()

  const rawSort = params.get('sort')
  let sort: SortKey =
    rawSort && (SORT_KEYS as string[]).includes(rawSort)
      ? (rawSort as SortKey)
      : defaultSort(q)
  // Relevance is meaningless without something to be relevant to.
  if (sort === 'relevance' && !q) sort = 'price-asc'

  const rawPosition = params.get('position')
  const position: AxlePosition | null =
    rawPosition === 'steer' || rawPosition === 'drive' || rawPosition === 'trailer'
      ? rawPosition
      : null

  const sizes = unique(
    multi(params, 'size')
      .map((raw) => allSizes.find((size) => sizeKey(size) === sizeKey(raw)))
      .filter((size): size is string => Boolean(size)),
  )

  const minPrice = numberParam(params.get('minPrice'))
  const maxPrice = numberParam(params.get('maxPrice'))

  return {
    q,
    brands: unique(
      multi(params, 'brand').filter((brand) =>
        (allBrands as readonly string[]).includes(brand),
      ),
    ),
    sizes,
    position,
    applications: unique(
      multi(params, 'application').filter((application) =>
        (allApplications as readonly string[]).includes(application),
      ),
    ),
    rims: unique(
      multi(params, 'rim')
        .map(Number)
        .filter((rim) => allRimDiameters.includes(rim)),
    ),
    minPrice,
    maxPrice,
    inStock: isTrue(params.get('inStock')),
    retreadable: isTrue(params.get('retreadable')),
    sort,
  }
}

export function paramsFromFilters(filters: ShopFilters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.q) params.set('q', filters.q)
  filters.brands.forEach((brand) => params.append('brand', brand))
  filters.sizes.forEach((size) => params.append('size', size))
  if (filters.position) params.set('position', filters.position)
  filters.applications.forEach((application) =>
    params.append('application', application),
  )
  filters.rims.forEach((rim) => params.append('rim', String(rim)))
  if (filters.minPrice != null) params.set('minPrice', String(filters.minPrice))
  if (filters.maxPrice != null) params.set('maxPrice', String(filters.maxPrice))
  if (filters.inStock) params.set('inStock', '1')
  if (filters.retreadable) params.set('retreadable', '1')
  // Relevance cannot survive the search term being removed.
  const sort: SortKey =
    filters.sort === 'relevance' && !filters.q ? defaultSort('') : filters.sort
  // Omit the default so a plain browse URL stays clean and shareable.
  if (sort !== defaultSort(filters.q)) params.set('sort', sort)

  return params
}

/* ------------------------------------------------------------------ *
 * Matching
 *
 * Each facet is a separate predicate so the page can ask two useful
 * questions: "how many tyres would this checkbox add?" and "which of my
 * filters is the one excluding everything?"
 * ------------------------------------------------------------------ */

export type FacetKey =
  | 'q'
  | 'brand'
  | 'size'
  | 'position'
  | 'application'
  | 'rim'
  | 'price'
  | 'inStock'
  | 'retreadable'

export const FACET_ORDER: FacetKey[] = [
  'q',
  'brand',
  'size',
  'rim',
  'position',
  'application',
  'price',
  'inStock',
  'retreadable',
]

export const FACET_LABELS: Record<FacetKey, string> = {
  q: 'Search term',
  brand: 'Brand',
  size: 'Size',
  rim: 'Rim diameter',
  position: 'Axle position',
  application: 'Application',
  price: 'Price range',
  inStock: 'In stock only',
  retreadable: 'Retreadable only',
}

function tokens(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

function searchFields(product: Product): string[] {
  return [
    product.brand,
    product.model,
    product.size,
    product.application,
    product.positionLabel,
    product.sku,
    product.ply,
    product.headline,
    ...product.tags,
  ]
}

function matchesQuery(product: Product, query: string): boolean {
  const terms = tokens(query)
  if (terms.length === 0) return true

  const fields = searchFields(product)
  const lower = fields.map((field) => field.toLowerCase())
  const keys = fields.map(sizeKey)

  return terms.every((term) => {
    if (lower.some((field) => field.includes(term))) return true
    const key = sizeKey(term)
    return key.length >= 2 && keys.some((field) => field.includes(key))
  })
}

const MATCHERS: Record<FacetKey, (product: Product, filters: ShopFilters) => boolean> = {
  q: (product, filters) => matchesQuery(product, filters.q),
  brand: (product, filters) =>
    filters.brands.length === 0 || filters.brands.includes(product.brand),
  size: (product, filters) =>
    filters.sizes.length === 0 || filters.sizes.includes(product.size),
  rim: (product, filters) =>
    filters.rims.length === 0 || filters.rims.includes(product.rimDiameterIn),
  position: (product, filters) =>
    !filters.position || product.position.includes(filters.position),
  application: (product, filters) =>
    filters.applications.length === 0 ||
    filters.applications.includes(product.application),
  price: (product, filters) => {
    if (filters.minPrice == null && filters.maxPrice == null) return true
    // A price range is a question a price-on-application line cannot answer.
    const price = effectivePrice(product)
    if (price == null) return false
    if (filters.minPrice != null && price < filters.minPrice) return false
    if (filters.maxPrice != null && price > filters.maxPrice) return false
    return true
  },
  inStock: (product, filters) => !filters.inStock || product.stock > 0,
  retreadable: (product, filters) => !filters.retreadable || product.retreadable === true,
}

export function isFacetActive(facet: FacetKey, filters: ShopFilters): boolean {
  switch (facet) {
    case 'q':
      return filters.q.length > 0
    case 'brand':
      return filters.brands.length > 0
    case 'size':
      return filters.sizes.length > 0
    case 'rim':
      return filters.rims.length > 0
    case 'position':
      return filters.position != null
    case 'application':
      return filters.applications.length > 0
    case 'price':
      return filters.minPrice != null || filters.maxPrice != null
    case 'inStock':
      return filters.inStock
    case 'retreadable':
      return filters.retreadable
    default:
      return false
  }
}

/** The patch that switches a facet off again. */
export function clearedFacet(facet: FacetKey): Partial<ShopFilters> {
  switch (facet) {
    case 'q':
      return { q: '' }
    case 'brand':
      return { brands: [] }
    case 'size':
      return { sizes: [] }
    case 'rim':
      return { rims: [] }
    case 'position':
      return { position: null }
    case 'application':
      return { applications: [] }
    case 'price':
      return { minPrice: null, maxPrice: null }
    case 'inStock':
      return { inStock: false }
    case 'retreadable':
      return { retreadable: false }
    default:
      return {}
  }
}

export function applyFilters(
  filters: ShopFilters,
  skip: FacetKey[] = [],
): Product[] {
  return products.filter((product) =>
    FACET_ORDER.every(
      (facet) => skip.includes(facet) || MATCHERS[facet](product, filters),
    ),
  )
}

export function activeFilterCount(filters: ShopFilters): number {
  return (
    filters.brands.length +
    filters.sizes.length +
    filters.rims.length +
    filters.applications.length +
    (filters.position ? 1 : 0) +
    (filters.minPrice != null || filters.maxPrice != null ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.retreadable ? 1 : 0)
  )
}

/**
 * For an empty result set: every active facet, with how many tyres would come
 * back if it alone were dropped. Only facets that would actually help appear,
 * best first.
 */
export function blockingFacets(
  filters: ShopFilters,
): Array<{ facet: FacetKey; label: string; count: number }> {
  return FACET_ORDER.filter((facet) => isFacetActive(facet, filters))
    .map((facet) => ({
      facet,
      label: FACET_LABELS[facet],
      count: applyFilters(filters, [facet]).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
}

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

const FUEL_ORDER: Record<NonNullable<Product['fuelRating']>, number> = { A: 0, B: 1, C: 2, D: 3 }

/** Position in the published spec sheet — the only ordering the data carries. */
const CATALOGUE_INDEX = new Map(products.map((product, index) => [product.id, index]))

function cataloguePosition(product: Product): number {
  return CATALOGUE_INDEX.get(product.id) ?? 0
}

function relevanceScore(product: Product, query: string): number {
  const terms = tokens(query)
  if (terms.length === 0) return 0

  const size = sizeKey(product.size)
  const model = product.model.toLowerCase()
  let score = 0

  for (const term of terms) {
    const key = sizeKey(term)

    if (size === key) score += 60
    else if (key.length >= 2 && size.startsWith(key)) score += 38
    else if (key.length >= 2 && size.includes(key)) score += 22

    if (model === term) score += 50
    else if (model.startsWith(term)) score += 30
    else if (model.includes(term)) score += 16

    if (product.sku.toLowerCase().includes(term)) score += 24
    if (product.brand.toLowerCase().includes(term)) score += 14
    if (product.application.toLowerCase().includes(term)) score += 10
    if (product.positionLabel.toLowerCase().includes(term)) score += 8
    if (product.tags.some((tag) => tag.toLowerCase().includes(term))) score += 5
  }

  // Break genuine ties towards the better-reviewed, in-stock tyre.
  return score + product.rating + (product.stock > 0 ? 1 : 0)
}

export function sortProducts(list: Product[], filters: ShopFilters): Product[] {
  const sorted = [...list]
  // Price-on-application lines sort after every priced line, either direction.
  const byPrice = (a: Product, b: Product) => comparePrice(a, b)
  // An unpublished figure ranks below every published one.
  const known = (value: number | null) => value ?? -1

  switch (filters.sort) {
    case 'relevance':
      return sorted.sort(
        (a, b) =>
          relevanceScore(b, filters.q) - relevanceScore(a, filters.q) || byPrice(a, b),
      )
    case 'price-desc':
      return sorted.sort((a, b) => comparePrice(a, b, 'desc'))
    case 'tread-desc':
      return sorted.sort(
        (a, b) => known(b.treadDepthMm) - known(a.treadDepthMm) || byPrice(a, b),
      )
    case 'load-desc':
      return sorted.sort((a, b) => known(b.maxLoadKg) - known(a.maxLoadKg) || byPrice(a, b))
    case 'rating-desc':
      return sorted.sort(
        (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount || byPrice(a, b),
      )
    case 'newest':
      return sorted.sort((a, b) => cataloguePosition(b) - cataloguePosition(a))
    case 'price-asc':
    default:
      return sorted.sort(byPrice)
  }
}

/** Secondary ordering helper reused by the compare page's fuel column. */
export function fuelRank(rating: Product['fuelRating']): number | null {
  return rating == null ? null : FUEL_ORDER[rating]
}

/* ------------------------------------------------------------------ *
 * Live facet counts
 *
 * Standard facet counting: a checkbox shows how many tyres it would yield
 * with every *other* filter still applied, so the numbers never lie about
 * what clicking it will do.
 * ------------------------------------------------------------------ */

export interface FacetCounts {
  brand: Record<string, number>
  size: Record<string, number>
  rim: Record<string, number>
  application: Record<string, number>
  inStock: number
  retreadable: number
}

export function facetCounts(filters: ShopFilters): FacetCounts {
  const withoutBrand = applyFilters(filters, ['brand'])
  const withoutSize = applyFilters(filters, ['size'])
  const withoutRim = applyFilters(filters, ['rim'])
  const withoutApplication = applyFilters(filters, ['application'])
  const withoutStock = applyFilters(filters, ['inStock'])
  const withoutRetreadable = applyFilters(filters, ['retreadable'])

  const tally = <T extends string | number>(
    list: Product[],
    pick: (product: Product) => T,
  ): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const product of list) {
      const key = String(pick(product))
      out[key] = (out[key] ?? 0) + 1
    }
    return out
  }

  return {
    brand: tally(withoutBrand, (product) => product.brand),
    size: tally(withoutSize, (product) => product.size),
    rim: tally(withoutRim, (product) => product.rimDiameterIn),
    application: tally(withoutApplication, (product) => product.application),
    inStock: withoutStock.filter((product) => product.stock > 0).length,
    retreadable: withoutRetreadable.filter((product) => product.retreadable).length,
  }
}

/* ------------------------------------------------------------------ *
 * The filter rail
 *
 * One component serves both the sticky desktop rail and the mobile sheet —
 * `idPrefix` keeps the two mounted copies' control ids distinct.
 * ------------------------------------------------------------------ */

export interface FiltersProps {
  filters: ShopFilters
  onChange: (patch: Partial<ShopFilters>) => void
  onClearAll: () => void
  idPrefix: string
  className?: string
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function Filters({
  filters,
  onChange,
  onClearAll,
  idPrefix,
  className,
}: FiltersProps) {
  const counts = useMemo(() => facetCounts(filters), [filters])
  const activeCount = activeFilterCount(filters)

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-brand">
          Filters
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RotateCcw aria-hidden="true" className="h-3 w-3" />
            Clear all
          </button>
        ) : null}
      </div>

      {/* Brand ------------------------------------------------------- */}
      <Group id={`${idPrefix}-brand`} title="Brand">
        <ul className="flex flex-col gap-2.5">
          {allBrands.map((brand) => {
            const count = counts.brand[brand] ?? 0
            return (
              <li key={brand}>
                <Checkbox
                  id={`${idPrefix}-brand-${brand}`}
                  checked={filters.brands.includes(brand)}
                  onChange={() => onChange({ brands: toggleValue(filters.brands, brand) })}
                  wrapperClassName="w-full [&>span:last-child]:flex-1"
                  label={
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="font-medium">{brand}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {count}
                      </span>
                    </span>
                  }
                />
              </li>
            )
          })}
        </ul>
      </Group>

      {/* Size, grouped by rim diameter ------------------------------ */}
      <Group
        id={`${idPrefix}-size`}
        title="Size"
        hint="Grouped by rim diameter. Tick a whole rim size or individual fitments."
      >
        <div className="flex flex-col gap-4">
          {SIZE_GROUPS.map((group) => {
            const rimCount = counts.rim[String(group.rim)] ?? 0
            return (
              <div key={group.rim}>
                <Checkbox
                  id={`${idPrefix}-rim-${group.rim}`}
                  checked={filters.rims.includes(group.rim)}
                  onChange={() => onChange({ rims: toggleValue(filters.rims, group.rim) })}
                  wrapperClassName="w-full [&>span:last-child]:flex-1"
                  label={
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="font-heading text-xs font-bold uppercase tracking-wide">
                        {group.rim}in rim
                      </span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {rimCount}
                      </span>
                    </span>
                  }
                />

                <ul className="mt-2 flex flex-col gap-2 border-l border-border pl-3">
                  {group.sizes.map((facet) => {
                    const count = counts.size[facet.size] ?? 0
                    return (
                      <li key={facet.size}>
                        <Checkbox
                          id={`${idPrefix}-size-${sizeKey(facet.size)}`}
                          checked={filters.sizes.includes(facet.size)}
                          onChange={() =>
                            onChange({ sizes: toggleValue(filters.sizes, facet.size) })
                          }
                          wrapperClassName="w-full [&>span:last-child]:flex-1"
                          label={
                            <span className="flex w-full items-center justify-between gap-3">
                              <span className="font-mono text-xs font-semibold">
                                {facet.size}
                              </span>
                              <span className="tabular-nums text-xs text-muted-foreground">
                                {count}
                              </span>
                            </span>
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </Group>

      {/* Axle position --------------------------------------------- */}
      <Group
        id={`${idPrefix}-position`}
        title="Axle position"
        hint="Pick the axle you are buying for, or leave it clear to see everything."
      >
        <AxleSelector
          value={filters.position ?? 'drive'}
          onChange={(position) =>
            onChange({ position: filters.position === position ? null : position })
          }
          showDetail={false}
        />
        {filters.position ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="primary" size="sm">
              Filtering: {POSITION_LABELS[filters.position]}
            </Badge>
            <button
              type="button"
              onClick={() => onChange({ position: null })}
              className="rounded px-1 font-semibold underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show all axles
            </button>
          </p>
        ) : (
          /* The diagram always has to show an axle, so say plainly that no
             axle filter is applied — otherwise the default looks selected. */
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" size="sm">
              No axle filter
            </Badge>
            Showing steer, drive and trailer fitments.
          </p>
        )}
      </Group>

      {/* Application ----------------------------------------------- */}
      <Group id={`${idPrefix}-application`} title="Application">
        <ul className="flex flex-col gap-2.5">
          {allApplications.map((application) => {
            const count = counts.application[application] ?? 0
            return (
              <li key={application}>
                <Checkbox
                  id={`${idPrefix}-application-${sizeKey(application)}`}
                  checked={filters.applications.includes(application)}
                  onChange={() =>
                    onChange({
                      applications: toggleValue(filters.applications, application),
                    })
                  }
                  wrapperClassName="w-full [&>span:last-child]:flex-1"
                  label={
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="font-medium">{application}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {count}
                      </span>
                    </span>
                  }
                />
              </li>
            )
          })}
        </ul>
      </Group>

      {/* Price ------------------------------------------------------ */}
      <Group
        id={`${idPrefix}-price`}
        title="Price per tyre"
        hint={`Published prices run ${money(priceRange.min)} to ${money(priceRange.max)} per tyre, inc. GST. Price-on-application lines drop out while a price is set.`}
      >
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor={`${idPrefix}-min-price`}>Min</Label>
            <Input
              id={`${idPrefix}-min-price`}
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              placeholder={String(Math.floor(priceRange.min))}
              value={filters.minPrice ?? ''}
              onChange={(event) =>
                onChange({
                  minPrice:
                    event.target.value === '' ? null : Number(event.target.value),
                })
              }
              className="mt-1.5"
            />
          </div>
          <span aria-hidden="true" className="pb-3 text-muted-foreground">
            –
          </span>
          <div className="flex-1">
            <Label htmlFor={`${idPrefix}-max-price`}>Max</Label>
            <Input
              id={`${idPrefix}-max-price`}
              type="number"
              inputMode="numeric"
              min={0}
              step={5}
              placeholder={String(Math.ceil(priceRange.max))}
              value={filters.maxPrice ?? ''}
              onChange={(event) =>
                onChange({
                  maxPrice:
                    event.target.value === '' ? null : Number(event.target.value),
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
      </Group>

      {/* Availability ---------------------------------------------- */}
      <Group id={`${idPrefix}-availability`} title="Availability">
        <ul className="flex flex-col gap-3">
          <li>
            <Checkbox
              id={`${idPrefix}-in-stock`}
              checked={filters.inStock}
              onChange={(event) => onChange({ inStock: event.target.checked })}
              wrapperClassName="w-full [&>span:last-child]:flex-1"
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-medium">In stock now</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {counts.inStock}
                  </span>
                </span>
              }
            />
          </li>
          <li>
            <Checkbox
              id={`${idPrefix}-retreadable`}
              checked={filters.retreadable}
              onChange={(event) => onChange({ retreadable: event.target.checked })}
              wrapperClassName="w-full [&>span:last-child]:flex-1"
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-medium">Retreadable casing</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {counts.retreadable}
                  </span>
                </span>
              }
            />
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Out-of-stock lines stay listed so you can pre-order them, and
          built-to-order lines are quoted on request — {counts.inStock}{' '}
          {pluralise(counts.inStock, 'line ships', 'lines ship')} from Yennora today.
        </p>
      </Group>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Group({
  id,
  title,
  hint,
  children,
}: {
  id: string
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section
      role="group"
      aria-labelledby={`${id}-heading`}
      className="border-t border-border pt-5 first:border-t-0 first:pt-0"
    >
      <h3
        id={`${id}-heading`}
        className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
      >
        {title}
      </h3>
      {hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/80">{hint}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}
