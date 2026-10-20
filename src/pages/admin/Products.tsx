import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PackageSearch, Search, X } from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import {
  EditableCell,
  validateDiscount,
  validatePrice,
  validateStock,
} from '@/components/admin/EditableCell'
import {
  PlainHeader,
  SortHeader,
  nextSort,
  type SortDirection,
  type SortState,
} from '@/components/admin/SortHeader'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Card, Input, Label, Skeleton } from '@/components/ui'
import { useIsMobile } from '@/hooks'
import { api } from '@/lib/api'
import { cn, formatNumber, moneyExact, priceLabel } from '@/lib/utils'
import type { Product } from '@/data/types'
import {
  SESSION_EXPIRED_MESSAGE,
  adminToken,
  handleAdminError,
  useAdmin,
} from '@/store/admin'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Products
 *
 * Only `price`, `discount` and `stock` are editable, because that is
 * all `PATCH /api/admin/products` accepts — the bundled specs stay
 * authoritative. Every other column is read-only on purpose rather
 * than by omission. Price-on-application lines keep price and discount
 * read-only too: they are quoted per order, so a price set here would
 * only ever apply at a checkout the shop never lets them reach.
 *
 * Writes are optimistic and roll back on failure. The alternative — a
 * spinner over the cell until the round trip lands — makes bulk
 * repricing feel broken on a slow connection, and the rollback means a
 * failed save is never silently kept.
 * ------------------------------------------------------------------ */

type SortKey =
  | 'sku'
  | 'brand'
  | 'model'
  | 'size'
  | 'position'
  | 'price'
  | 'discount'
  | 'effective'
  | 'stock'

type EditableField = 'price' | 'discount' | 'stock'

/** The exact shape `api.admin.updateProduct` accepts. */
type ProductPatch = Partial<Pick<Product, 'price' | 'discount' | 'stock'>>

const FIELD_LABELS: Record<EditableField, string> = {
  price: 'Price',
  discount: 'Discount',
  stock: 'Stock',
}

export default function Products() {
  const query = useAdminQuery('admin-products', (token) => api.admin.products(token))
  const isMobile = useIsMobile()
  const { hash } = useLocation()

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'sku', direction: 'asc' })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  // The dashboard's low-stock table links to `#product-<id>`.
  const focusId = hash.startsWith('#product-') ? hash.slice('#product-'.length) : null

  const products = query.data?.products ?? []

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()

    const filtered = needle
      ? products.filter((product) =>
          [product.brand, product.model, product.size, product.sku]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : products

    const factor = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => compare(a, b, sort.key) * factor)
  }, [products, search, sort])

  useEffect(() => {
    if (!focusId || !query.data) return
    const node = document.getElementById(`product-${focusId}`)
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusId, query.data])

  const onSort = (key: SortKey, defaultDirection: SortDirection) =>
    setSort((current) => nextSort(current, key, defaultDirection))

  /* ---- Save ----------------------------------------------------- */

  const save = async (product: Product, field: EditableField, raw: string) => {
    const token = adminToken()
    if (!token) {
      // The session died between render and keystroke. End it properly rather
      // than firing a request we already know carries no credential.
      useAdmin.getState().logout(SESSION_EXPIRED_MESSAGE)
      return
    }

    const previous = product
    const optimistic = applyLocally(product, field, raw)

    query.patch((data) => ({
      ...data,
      products: data.products.map((item) =>
        item.id === product.id ? optimistic : item,
      ),
    }))

    setSavingId(product.id)
    setStatus(`Saving ${FIELD_LABELS[field].toLowerCase()} for ${product.sku}…`)

    try {
      const { product: saved } = await api.admin.updateProduct(
        token,
        product.id,
        buildPatch(field, raw),
      )

      query.patch((data) => ({
        ...data,
        products: data.products.map((item) => (item.id === saved.id ? saved : item)),
      }))

      setStatus(`${FIELD_LABELS[field]} updated for ${product.sku}.`)
      toast({
        title: `${product.sku} updated`,
        description: describeChange(field, saved),
        variant: 'success',
      })
    } catch (error) {
      // Roll back to exactly what the server last confirmed.
      query.patch((data) => ({
        ...data,
        products: data.products.map((item) =>
          item.id === previous.id ? previous : item,
        ),
      }))

      const failure = handleAdminError(error)
      setStatus(`Could not update ${product.sku}. ${failure.message}`)
      toast({
        title: `Could not update ${product.sku}`,
        description: failure.message,
        variant: 'error',
      })
    } finally {
      setSavingId(null)
    }
  }

  /* ---- Render --------------------------------------------------- */

  if (query.notConfigured) {
    return (
      <>
        <Seo title="Products — Spartan Tyres admin" description="Catalogue pricing and stock." noIndex />
        <AdminNotConfigured message={query.error ?? undefined} />
      </>
    )
  }

  return (
    <>
      <Seo
        title="Products — Spartan Tyres admin"
        description="Catalogue pricing, discounts and stock levels."
        noIndex
      />

      {/* Save results are announced without moving focus out of the table. */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      <AdminPanel
        title="Catalogue"
        description={
          query.data
            ? `${formatNumber(visible.length)} of ${formatNumber(products.length)} lines. Price, discount and stock are editable — click a value, then Enter to save or Escape to cancel.`
            : 'Price, discount and stock are editable.'
        }
        bodyClassName="p-0 md:p-0"
      >
        <div className="border-b border-border p-4 md:px-5">
          <div className="relative max-w-sm">
            <Label htmlFor="product-search" className="sr-only">
              Search by brand, model, size or SKU
            </Label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="product-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Brand, model, size or SKU"
              className="pl-9"
            />
          </div>
        </div>

        {query.loading ? (
          <ProductsSkeleton />
        ) : query.error ? (
          <div className="p-4 md:p-5">
            <AdminError message={query.error} onRetry={query.reload} />
          </div>
        ) : products.length === 0 ? (
          <AdminEmpty
            title="No products"
            icon={PackageSearch}
            description="The catalogue came back empty. If this deployment has just gone live, check that the API is reachable."
            className="rounded-none border-0 bg-transparent"
            action={
              <Button variant="outline" size="sm" onClick={query.reload}>
                Reload
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <AdminEmpty
            title="No tyres match that search"
            icon={Search}
            description={`Nothing in the catalogue matches “${search.trim()}”.`}
            className="rounded-none border-0 bg-transparent"
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Clear search
              </Button>
            }
          />
        ) : isMobile ? (
          /* ---- Card per product, below md ------------------------ */
          <ul className="flex flex-col gap-3 p-4">
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                saving={savingId === product.id}
                focused={focusId === product.id}
                onSave={save}
              />
            ))}
          </ul>
        ) : (
          /* ---- Dense table, md and up --------------------------- */
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Catalogue pricing and stock. Price, discount and stock cells are
                editable.
              </caption>
              <thead>
                <tr>
                  <SortHeader sortKey="sku" label="SKU" sort={sort} onSort={onSort} />
                  <SortHeader sortKey="brand" label="Brand" sort={sort} onSort={onSort} />
                  <SortHeader sortKey="model" label="Model" sort={sort} onSort={onSort} />
                  <SortHeader sortKey="size" label="Size" sort={sort} onSort={onSort} />
                  <SortHeader
                    sortKey="position"
                    label="Position"
                    sort={sort}
                    onSort={onSort}
                  />
                  <SortHeader
                    sortKey="price"
                    label="Price"
                    sort={sort}
                    onSort={onSort}
                    defaultDirection="desc"
                    numeric
                    srHint="editable"
                  />
                  <SortHeader
                    sortKey="discount"
                    label="Disc."
                    sort={sort}
                    onSort={onSort}
                    defaultDirection="desc"
                    numeric
                    srHint="discount percentage, editable"
                  />
                  <SortHeader
                    sortKey="effective"
                    label="Effective"
                    sort={sort}
                    onSort={onSort}
                    defaultDirection="desc"
                    numeric
                    srHint="price after discount"
                  />
                  <SortHeader
                    sortKey="stock"
                    label="Stock"
                    sort={sort}
                    onSort={onSort}
                    numeric
                    srHint="editable"
                  />
                  <PlainHeader numeric>
                    <span className="sr-only">Stock status</span>
                  </PlainHeader>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => {
                  const effective = product.discountPrice ?? product.price

                  return (
                    <tr
                      key={product.id}
                      id={`product-${product.id}`}
                      className={cn(
                        'border-b border-border align-middle last:border-0',
                        rowTint(product),
                        focusId === product.id && 'ring-2 ring-inset ring-primary',
                      )}
                    >
                      <th
                        scope="row"
                        className="whitespace-nowrap px-2.5 py-1.5 text-left font-mono text-xs font-medium"
                      >
                        {product.sku}
                      </th>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-muted-foreground">
                        {product.brand}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs font-semibold">
                        {product.model}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-xs tabular-nums">
                        {product.size}
                      </td>
                      <td className="px-2.5 py-1.5 text-xs text-muted-foreground">
                        {product.positionLabel || product.position.join(' / ')}
                      </td>

                      {product.price == null ? (
                        <>
                          <td className="px-2.5 py-1.5 text-right text-xs font-semibold">
                            <span title="Price on application — quoted per order">POA</span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-xs text-muted-foreground">
                            —
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-1 py-1 text-right text-xs">
                            <EditableCell
                              label={`Price for ${product.sku}`}
                              initial={String(product.price)}
                              validate={validatePrice}
                              onCommit={(raw) => save(product, 'price', raw)}
                              saving={savingId === product.id}
                            >
                              {priceLabel(product.price)}
                            </EditableCell>
                          </td>

                          <td className="px-1 py-1 text-right text-xs">
                            <EditableCell
                              label={`Discount percentage for ${product.sku}`}
                              initial={product.discount != null ? String(product.discount) : ''}
                              validate={validateDiscount}
                              onCommit={(raw) => save(product, 'discount', raw)}
                              saving={savingId === product.id}
                              placeholder="none"
                              inputMode="numeric"
                            >
                              {product.discount != null ? (
                                <span className="font-semibold text-primary">
                                  {product.discount}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </EditableCell>
                          </td>
                        </>
                      )}

                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right text-xs font-semibold tabular-nums">
                        {product.discount != null ? (
                          <span className="text-primary">{priceLabel(effective)}</span>
                        ) : (
                          <span className="text-muted-foreground">{priceLabel(effective)}</span>
                        )}
                      </td>

                      <td className="px-1 py-1 text-right text-xs">
                        <EditableCell
                          label={`Stock for ${product.sku}`}
                          initial={String(product.stock)}
                          validate={validateStock}
                          onCommit={(raw) => save(product, 'stock', raw)}
                          saving={savingId === product.id}
                          inputMode="numeric"
                        >
                          {formatNumber(product.stock)}
                        </EditableCell>
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                        <StockBadge product={product} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Mobile card
 * ------------------------------------------------------------------ */

function ProductCard({
  product,
  saving,
  focused,
  onSave,
}: {
  product: Product
  saving: boolean
  focused: boolean
  onSave: (product: Product, field: EditableField, raw: string) => void
}) {
  const effective = product.discountPrice ?? product.price

  return (
    <li>
      <Card
        id={`product-${product.id}`}
        className={cn('p-4', rowTint(product), focused && 'ring-2 ring-primary')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-sm font-bold uppercase leading-tight">
              {product.brand} {product.model}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {product.size} &middot;{' '}
              {product.positionLabel || product.position.join(' / ')}
            </p>
            <p className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">
              {product.sku}
            </p>
          </div>
          <StockBadge product={product} />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
          <div>
            <dt className="font-heading text-[0.625rem] font-bold uppercase tracking-brand text-muted-foreground">
              Price
            </dt>
            <dd className="mt-1">
              {product.price == null ? (
                <span className="text-sm font-semibold">POA</span>
              ) : (
                <EditableCell
                  label={`Price for ${product.sku}`}
                  initial={String(product.price)}
                  validate={validatePrice}
                  onCommit={(raw) => onSave(product, 'price', raw)}
                  saving={saving}
                  numeric={false}
                  className="text-sm font-semibold"
                >
                  {priceLabel(product.price)}
                </EditableCell>
              )}
            </dd>
          </div>

          <div>
            <dt className="font-heading text-[0.625rem] font-bold uppercase tracking-brand text-muted-foreground">
              Discount
            </dt>
            <dd className="mt-1">
              {product.price == null ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
              <EditableCell
                label={`Discount percentage for ${product.sku}`}
                initial={product.discount != null ? String(product.discount) : ''}
                validate={validateDiscount}
                onCommit={(raw) => onSave(product, 'discount', raw)}
                saving={saving}
                numeric={false}
                placeholder="none"
                inputMode="numeric"
                className="text-sm font-semibold"
              >
                {product.discount != null ? (
                  <span className="text-primary">{product.discount}%</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </EditableCell>
              )}
            </dd>
          </div>

          <div>
            <dt className="font-heading text-[0.625rem] font-bold uppercase tracking-brand text-muted-foreground">
              Stock
            </dt>
            <dd className="mt-1">
              <EditableCell
                label={`Stock for ${product.sku}`}
                initial={String(product.stock)}
                validate={validateStock}
                onCommit={(raw) => onSave(product, 'stock', raw)}
                saving={saving}
                numeric={false}
                inputMode="numeric"
                className="text-sm font-semibold"
              >
                {formatNumber(product.stock)}
              </EditableCell>
            </dd>
          </div>
        </dl>

        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Effective price{' '}
          <span className="font-semibold tabular-nums text-foreground">
            {effective != null ? moneyExact(effective) : 'POA — quoted per order'}
          </span>
        </p>
      </Card>
    </li>
  )
}

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

function StockBadge({ product }: { product: Product }) {
  const { stock } = product
  if (product.price == null) {
    return (
      <Badge variant="outline" size="sm" className="text-muted-foreground">
        Built to order
      </Badge>
    )
  }
  if (stock === 0) {
    return (
      <Badge variant="destructive" size="sm">
        Pre-order
      </Badge>
    )
  }
  if (stock <= 5) {
    return (
      <Badge variant="warning" size="sm">
        Low
      </Badge>
    )
  }
  return (
    <Badge variant="outline" size="sm" className="text-muted-foreground">
      In stock
    </Badge>
  )
}

function rowTint(product: Product): string {
  // Built-to-order lines sit at zero stock by design; nothing to flag.
  if (product.price == null) return ''
  if (product.stock === 0) return 'bg-destructive/5'
  if (product.stock <= 5) return 'bg-muted/60'
  return ''
}

function ProductsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-2 p-4 md:p-5">
      <span className="sr-only">Loading the catalogue…</span>
      {Array.from({ length: 10 }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Sorting, patching
 * ------------------------------------------------------------------ */

function compare(a: Product, b: Product, key: SortKey): number {
  switch (key) {
    case 'sku':
      return a.sku.localeCompare(b.sku, 'en-AU')
    case 'brand':
      return a.brand.localeCompare(b.brand, 'en-AU') || a.model.localeCompare(b.model, 'en-AU')
    case 'model':
      return a.model.localeCompare(b.model, 'en-AU')
    case 'size':
      return a.size.localeCompare(b.size, 'en-AU', { numeric: true })
    case 'position':
      return (a.positionLabel || a.position.join()).localeCompare(
        b.positionLabel || b.position.join(),
        'en-AU',
      )
    // POA sorts as the lowest value, so it lands last in the default
    // high-to-low price sort and first when flipped — never mixed in.
    case 'price':
      return (a.price ?? -1) - (b.price ?? -1)
    case 'discount':
      return (a.discount ?? -1) - (b.discount ?? -1)
    case 'effective':
      return (a.discountPrice ?? a.price ?? -1) - (b.discountPrice ?? b.price ?? -1)
    case 'stock':
      return a.stock - b.stock
    default:
      return 0
  }
}

function buildPatch(field: EditableField, raw: string): ProductPatch {
  if (field === 'price') return { price: Number(raw) }
  if (field === 'stock') return { stock: Number(raw) }

  // An empty discount means "clear it", which the endpoint expresses as an
  // explicit null. The typed signature only models setting a number, and
  // `undefined` would be dropped by JSON.stringify — so widen here rather
  // than send a patch that silently does nothing.
  if (raw === '') return { discount: null } as unknown as ProductPatch

  return { discount: Number(raw) }
}

/** Mirrors `mergeOverride` in `api/_lib/catalogue.ts` for the optimistic row. */
function applyLocally(product: Product, field: EditableField, raw: string): Product {
  const price = field === 'price' ? Number(raw) : product.price
  const discount =
    field === 'discount'
      ? raw === ''
        ? undefined
        : Number(raw)
      : product.discount
  const stock = field === 'stock' ? Number(raw) : product.stock

  return {
    ...product,
    price,
    discount,
    stock,
    discountPrice:
      price != null && discount != null
        ? Math.round(price * (1 - discount / 100) * 100) / 100
        : undefined,
  }
}

function describeChange(field: EditableField, product: Product): string {
  if (field === 'price') return `Price is now ${priceLabel(product.price)}.`
  if (field === 'stock') return `${formatNumber(product.stock)} in stock.`
  const effective = product.discountPrice ?? product.price
  return product.discount != null && effective != null
    ? `${product.discount}% off — ${moneyExact(effective)}.`
    : 'Discount cleared.'
}
