import { useMemo, useState } from 'react'
import { Plus, Search, Tag, X } from 'lucide-react'
import { AdminPanel } from '@/components/admin/AdminStates'
import { useAdminAction } from '@/components/admin/AdminKit'
import { Badge, Button, Input, Label } from '@/components/ui'
import { products } from '@/data/products'
import { accountsApi, type SpecialPrice } from '@/lib/admin-accounts-api'
import {
  WINNER_LABELS,
  dollars,
  parsePrice,
  percentLabel,
  priceChanges,
  priceRow,
  searchProducts,
  type PriceDraft,
} from '@/lib/admin-accounts-ui'
import { cn } from '@/lib/utils'

/**
 * An account's special prices. Staff search the catalogue, type a price inc. GST, and see beside it
 * the normal price, what the agreed % alone would give, and which one the customer pays. Everything is
 * saved together in one batch.
 */
export function SpecialPrices({
  accountId,
  discountPct,
  saved,
  onSaved,
}: {
  accountId: string
  discountPct: number
  saved: SpecialPrice[]
  onSaved: (prices: SpecialPrice[]) => void
}) {
  const { run, busy } = useAdminAction()
  const [ids, setIds] = useState<string[]>(() => saved.map((p) => p.productId))
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(saved.map((p) => [p.productId, p.price.toFixed(2)])),
  )
  const [search, setSearch] = useState('')

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [])
  const results = useMemo(
    () => searchProducts(products, search, 8).filter((p) => !ids.includes(p.id)),
    [search, ids],
  )

  // What would be sent: a typed price per row; a saved price whose row was removed goes as null.
  const invalid = ids.filter((id) => parsePrice(inputs[id] ?? '') === null)
  const draft: PriceDraft = {}
  for (const id of ids) {
    const price = parsePrice(inputs[id] ?? '')
    if (price !== null) draft[id] = price
  }
  for (const p of saved) if (!ids.includes(p.productId)) draft[p.productId] = null
  const changes = priceChanges(saved, draft)
  const dirty = changes.length > 0

  const add = (id: string) => {
    setIds((list) => [id, ...list])
    setInputs((m) => ({ ...m, [id]: m[id] ?? '' }))
    setSearch('')
  }
  const remove = (id: string) => setIds((list) => list.filter((x) => x !== id))
  const reset = () => {
    setIds(saved.map((p) => p.productId))
    setInputs(Object.fromEntries(saved.map((p) => [p.productId, p.price.toFixed(2)])))
  }

  const save = async () => {
    if (invalid.length) return
    const result = await run((token) => accountsApi.setPrices(token, accountId, changes), {
      success: 'Special prices saved',
      successDetail: `${changes.length} change${changes.length === 1 ? '' : 's'}.`,
      failure: 'Could not save the special prices',
    })
    if (result) {
      setIds(result.prices.map((p) => p.productId))
      setInputs(Object.fromEntries(result.prices.map((p) => [p.productId, p.price.toFixed(2)])))
      onSaved(result.prices)
    }
  }

  return (
    <AdminPanel
      title="Special prices"
      description="A price for one tyre, inc. GST. It wins over the agreed % for that tyre, and is used only when it is lower than the normal price."
      action={<Badge variant="outline">{saved.length} saved</Badge>}
    >
      <div className="relative">
        <Label htmlFor="sp-search" className="sr-only">
          Search the catalogue
        </Label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="sp-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Add a tyre: name, size or SKU"
          className="pl-9"
          autoComplete="off"
        />
      </div>

      {search.trim() ? (
        results.length ? (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border" aria-label="Catalogue results">
            {results.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-2.5 pl-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">
                    {p.brand} {p.model}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.size} <span className="font-mono">{p.sku}</span>
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => add(p.id)} aria-label={`Add ${p.brand} ${p.model} ${p.size}`}>
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No tyre matches that, or it is already in the list.</p>
        )
      ) : null}

      {ids.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
          <Tag aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No special prices yet. Search for a tyre above to add one.</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {ids.map((id) => {
            const product = byId.get(id)
            const typed = inputs[id] ?? ''
            const price = parsePrice(typed)
            const row = product ? priceRow(product, discountPct, price) : null
            const bad = typed.trim() !== '' && price === null
            return (
              <li key={id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{product ? `${product.brand} ${product.model}` : id}</p>
                    <p className="break-words text-xs text-muted-foreground">
                      {product ? product.size : 'No longer in the catalogue'} <span className="font-mono">{product?.sku}</span>
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(id)} aria-label={`Remove the special price for ${product ? `${product.brand} ${product.model} ${product.size}` : id}`}>
                    <X aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr] sm:items-end">
                  <div>
                    <Label htmlFor={`sp-${id}`}>Special price</Label>
                    <div className="relative mt-1.5">
                      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <Input
                        id={`sp-${id}`}
                        inputMode="decimal"
                        value={typed}
                        onChange={(e) => setInputs((m) => ({ ...m, [id]: e.target.value }))}
                        aria-invalid={bad || undefined}
                        className={cn('pl-7', bad && 'border-destructive')}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Normal price</dt>
                      <dd className="font-semibold tabular-nums">{row?.retail != null ? dollars(row.retail) : 'On application'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{percentLabel(discountPct)} off</dt>
                      <dd className="font-semibold tabular-nums">{row?.percentPrice != null ? dollars(row.percentPrice) : 'None'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Customer pays</dt>
                      <dd>
                        {row ? (
                          <>
                            <span className="font-semibold tabular-nums">{row.accountPrice != null ? dollars(row.accountPrice) : row.retail != null ? dollars(row.retail) : 'Quote'}</span>
                            <Badge size="sm" variant={row.pays === 'retail' ? 'warning' : 'success'} className="ml-1.5">
                              {WINNER_LABELS[row.pays]}
                            </Badge>
                          </>
                        ) : null}
                      </dd>
                    </div>
                  </dl>
                </div>
                {bad ? (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    Enter a price over $0 and up to $100,000.
                  </p>
                ) : price !== null && row && row.pays === 'retail' && row.retail !== null ? (
                  <p className="mt-2 text-xs text-muted-foreground">This is not lower than the normal price, so it will not be used.</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} loading={busy} disabled={!dirty || invalid.length > 0}>
          Save special prices
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" onClick={reset}>
            Discard changes
          </Button>
        ) : null}
        {invalid.length ? <span className="text-xs text-destructive">{invalid.length} row{invalid.length === 1 ? '' : 's'} need a price or removing.</span> : null}
      </div>
    </AdminPanel>
  )
}
