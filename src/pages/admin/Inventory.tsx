import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  Download,
  History,
  PackageCheck,
  PackageX,
  Search,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import {
  Tile,
  exportSheet,
  parseMoney,
  selectClass,
  stampLabel,
  td,
  th,
  useAdminAction,
} from '@/components/admin/AdminKit'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui'
import { effectivePrice } from '@/data/products'
import { can } from '@/lib/admin-roles'
import { api, type InventoryItem, type StockMove } from '@/lib/api'
import { cn, formatNumber, moneyExact } from '@/lib/utils'
import { useAdminSession } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * Inventory
 *
 * The stockroom view of the catalogue: what is on the shelf, what it
 * cost, where it lives, what needs reordering, and every movement with
 * who made it. Deliveries, write-offs and stocktake counts are entered
 * here; the count they produce is the one the shop sells from, so a
 * delivery is on sale the moment it is saved.
 * ------------------------------------------------------------------ */

type StockState = 'out' | 'low' | 'ok'
type DialogMode = 'receive' | 'adjust' | 'settings'

const MOVE_LABELS: Record<StockMove['type'], string> = {
  receive: 'Received',
  adjust: 'Adjusted',
  sale: 'Sold',
  count: 'Counted',
}

export default function Inventory() {
  const query = useAdminQuery('admin-inventory', (token) => api.admin.inventory(token))
  const { user } = useAdminSession()

  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<'all' | StockState>('all')
  const [moveSearch, setMoveSearch] = useState('')
  const [moveType, setMoveType] = useState<'all' | StockMove['type']>('all')
  const [dialog, setDialog] = useState<{ mode: DialogMode; item: InventoryItem } | null>(null)

  const data = query.data
  const defaultReorder = data?.defaultReorderLevel ?? 24

  const reorderOf = (item: InventoryItem) => item.settings?.reorderLevel ?? defaultReorder
  const stateOf = (item: InventoryItem): StockState =>
    item.product.stock <= 0 ? 'out' : item.product.stock <= reorderOf(item) ? 'low' : 'ok'

  const items = data?.items ?? []

  const totals = useMemo(() => {
    let units = 0
    let costValue = 0
    let retailValue = 0
    let missingCost = 0
    let low = 0
    let out = 0
    for (const item of items) {
      const { stock } = item.product
      units += stock
      const cost = item.settings?.costPrice
      if (cost != null) costValue += cost * stock
      else if (stock > 0) missingCost += 1
      const price = effectivePrice(item.product)
      if (price != null) retailValue += price * stock
      const state = stateOf(item)
      if (state === 'out') out += 1
      else if (state === 'low') low += 1
    }
    return { units, costValue, retailValue, missingCost, low, out }
  }, [items, defaultReorder])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items
      .filter((item) => stateFilter === 'all' || stateOf(item) === stateFilter)
      .filter(
        (item) =>
          !needle ||
          [item.product.sku, item.product.brand, item.product.model, item.product.size, item.settings?.location ?? '', item.settings?.supplier ?? '']
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => {
        const order = { out: 0, low: 1, ok: 2 }
        return order[stateOf(a)] - order[stateOf(b)] || a.product.sku.localeCompare(b.product.sku)
      })
  }, [items, search, stateFilter, defaultReorder])

  const moves = useMemo(() => {
    const needle = moveSearch.trim().toLowerCase()
    return (data?.moves ?? []).filter(
      (move) =>
        (moveType === 'all' || move.type === moveType) &&
        (!needle ||
          [move.sku, move.reason, move.note, move.reference ?? '', move.supplier ?? '', move.by]
            .join(' ')
            .toLowerCase()
            .includes(needle)),
    )
  }, [data, moveSearch, moveType])

  const applyResult = (result: { item: InventoryItem; move?: StockMove }) =>
    query.patch((previous) => ({
      ...previous,
      items: previous.items.map((item) =>
        item.product.id === result.item.product.id ? result.item : item,
      ),
      moves: result.move ? [result.move, ...previous.moves] : previous.moves,
      totalMoves: previous.totalMoves + (result.move ? 1 : 0),
    }))

  const exportReorder = () =>
    exportSheet(
      items.filter((item) => stateOf(item) !== 'ok'),
      [
        { column: 'SKU', width: 16, value: (i) => i.product.sku },
        { column: 'Brand', width: 14, value: (i) => i.product.brand },
        { column: 'Model', width: 22, value: (i) => i.product.model },
        { column: 'Size', width: 16, value: (i) => i.product.size },
        { column: 'On hand', width: 10, number: true, value: (i) => i.product.stock },
        { column: 'Reorder at', width: 11, number: true, value: (i) => reorderOf(i) },
        {
          column: 'Suggested order',
          width: 15,
          number: true,
          // Back up to twice the reorder level: one level of cover plus a buffer.
          value: (i) => Math.max(reorderOf(i) * 2 - i.product.stock, 0),
        },
        { column: 'Supplier', width: 24, value: (i) => i.settings?.supplier ?? '' },
        { column: 'Avg cost', width: 11, number: true, format: '#,##0.00', value: (i) => i.settings?.costPrice ?? null },
      ],
      'Spartan-Reorder-List',
      'Reorder',
    )

  const exportStock = () =>
    exportSheet(
      items,
      [
        { column: 'SKU', width: 16, value: (i) => i.product.sku },
        { column: 'Brand', width: 14, value: (i) => i.product.brand },
        { column: 'Model', width: 22, value: (i) => i.product.model },
        { column: 'Size', width: 16, value: (i) => i.product.size },
        { column: 'Location', width: 14, value: (i) => i.settings?.location ?? '' },
        { column: 'On hand', width: 10, number: true, value: (i) => i.product.stock },
        { column: 'Reorder at', width: 11, number: true, value: (i) => reorderOf(i) },
        { column: 'Avg cost', width: 11, number: true, format: '#,##0.00', value: (i) => i.settings?.costPrice ?? null },
        { column: 'Sell price', width: 11, number: true, format: '#,##0.00', value: (i) => effectivePrice(i.product) },
        {
          column: 'Value at cost',
          width: 14,
          number: true,
          format: '#,##0.00',
          value: (i) => (i.settings?.costPrice != null ? i.settings.costPrice * i.product.stock : null),
        },
        { column: 'Supplier', width: 24, value: (i) => i.settings?.supplier ?? '' },
      ],
      'Spartan-Stock',
      'Stock',
    )

  if (query.notConfigured) return <AdminNotConfigured message={query.error ?? undefined} />

  return (
    <>
      <Seo title="Inventory — Spartan Tyres admin" description="Stock on hand, deliveries and stock movements." noIndex />

      {query.loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : data ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Tyres on hand" value={formatNumber(totals.units)} icon={Boxes} hint={`${formatNumber(items.length)} lines in the catalogue`} />
            <Tile
              label="Stock value at cost"
              value={moneyExact(totals.costValue)}
              icon={PackageCheck}
              hint={
                totals.missingCost
                  ? `${totals.missingCost} lines in stock have no cost yet, so are not counted.`
                  : 'Average cost inc. GST × on hand.'
              }
            />
            <Tile label="Retail value" value={moneyExact(totals.retailValue)} hint="Sell price × on hand (priced lines only)." />
            <Tile
              label="Needs reordering"
              value={formatNumber(totals.low + totals.out)}
              icon={AlertTriangle}
              tone={totals.out ? 'bad' : totals.low ? 'warn' : 'good'}
              hint={`${totals.out} out of stock · ${totals.low} low`}
            />
          </div>

          <Tabs defaultValue="stock">
            <TabsList label="Inventory views">
              <TabsTrigger value="stock">Stock levels</TabsTrigger>
              <TabsTrigger value="moves">
                Movement history
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">
              <AdminPanel
                title="Stock levels"
                description="Receive a delivery, write off or correct stock, or set a reorder level and cost. Out-of-stock and low lines are listed first."
                bodyClassName="p-0 md:p-0"
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={exportReorder} disabled={!totals.low && !totals.out}>
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      Reorder list
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportStock}>
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      Stock sheet
                    </Button>
                  </div>
                }
              >
                <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 md:px-5">
                  <div className="relative w-full max-w-sm">
                    <Label htmlFor="inv-search" className="sr-only">
                      Search stock
                    </Label>
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="inv-search"
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="SKU, brand, size, location or supplier"
                      className="pl-9"
                    />
                  </div>
                  <div>
                    <Label htmlFor="inv-state" className="sr-only">
                      Stock status
                    </Label>
                    <select
                      id="inv-state"
                      className={selectClass}
                      value={stateFilter}
                      onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
                    >
                      <option value="all">All lines</option>
                      <option value="out">Out of stock</option>
                      <option value="low">Low stock</option>
                      <option value="ok">In stock</option>
                    </select>
                  </div>
                </div>

                {visible.length === 0 ? (
                  <AdminEmpty title="Nothing matches" icon={Search} description="Try a different search or status." className="rounded-none border-0 bg-transparent" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Stock levels by tyre</caption>
                      <thead>
                        <tr>
                          <th className={th}>Tyre</th>
                          <th className={th}>Location</th>
                          <th className={cn(th, 'text-right')}>On hand</th>
                          <th className={cn(th, 'text-right')}>Reorder at</th>
                          <th className={th}>Status</th>
                          <th className={cn(th, 'text-right')}>Avg cost</th>
                          <th className={cn(th, 'text-right')}>Sell</th>
                          <th className={cn(th, 'text-right')}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((item) => {
                          const state = stateOf(item)
                          const price = effectivePrice(item.product)
                          return (
                            <tr key={item.product.id} className="hover:bg-muted/30">
                              <td className={td}>
                                <p className="font-semibold">
                                  {item.product.brand} {item.product.model}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.product.size} · <span className="font-mono">{item.product.sku}</span>
                                </p>
                              </td>
                              <td className={cn(td, 'text-muted-foreground')}>{item.settings?.location || '—'}</td>
                              <td className={cn(td, 'text-right font-heading text-base font-bold tabular-nums')}>{formatNumber(item.product.stock)}</td>
                              <td className={cn(td, 'text-right tabular-nums text-muted-foreground')}>
                                {reorderOf(item)}
                                {item.settings?.reorderLevel == null ? <span className="sr-only"> (default)</span> : null}
                              </td>
                              <td className={td}>
                                <Badge variant={state === 'out' ? 'destructive' : state === 'low' ? 'warning' : 'success'} size="sm">
                                  {state === 'out' ? 'Out' : state === 'low' ? 'Low' : 'OK'}
                                </Badge>
                              </td>
                              <td className={cn(td, 'text-right tabular-nums')}>
                                {item.settings?.costPrice != null ? moneyExact(item.settings.costPrice) : '—'}
                              </td>
                              <td className={cn(td, 'text-right tabular-nums')}>{price != null ? moneyExact(price) : 'POA'}</td>
                              <td className={cn(td, 'text-right')}>
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="outline" onClick={() => setDialog({ mode: 'receive', item })}>
                                    <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5" />
                                    <span className="hidden xl:inline">Receive</span>
                                    <span className="sr-only xl:hidden">Receive delivery of {item.product.sku}</span>
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'adjust', item })} aria-label={`Adjust stock of ${item.product.sku}`} title="Adjust or count">
                                    <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'settings', item })} aria-label={`Stock settings for ${item.product.sku}`} title="Reorder level, cost, location">
                                    <Settings2 aria-hidden="true" className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminPanel>
            </TabsContent>

            <TabsContent value="moves" className="mt-4">
              <AdminPanel
                title="Movement history"
                description={`Every change to stock: deliveries, online sales, write-offs and counts. Showing ${formatNumber(moves.length)} of ${formatNumber(data.totalMoves)}.`}
                bodyClassName="p-0 md:p-0"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!moves.length}
                    onClick={() =>
                      exportSheet(
                        moves,
                        [
                          { column: 'When', width: 20, value: (m) => stampLabel(m.at) },
                          { column: 'SKU', width: 16, value: (m) => m.sku },
                          { column: 'Type', width: 11, value: (m) => MOVE_LABELS[m.type] },
                          { column: 'Change', width: 9, number: true, value: (m) => m.change },
                          { column: 'Before', width: 9, number: true, value: (m) => m.before },
                          { column: 'After', width: 9, number: true, value: (m) => m.after },
                          { column: 'Reason', width: 22, value: (m) => m.reason },
                          { column: 'Note', width: 30, value: (m) => m.note },
                          { column: 'Unit cost', width: 11, number: true, format: '#,##0.00', value: (m) => m.unitCost ?? null },
                          { column: 'Supplier', width: 20, value: (m) => m.supplier ?? '' },
                          { column: 'Reference', width: 18, value: (m) => m.reference ?? '' },
                          { column: 'By', width: 18, value: (m) => m.by },
                        ],
                        'Spartan-Stock-Movements',
                        'Movements',
                      )
                    }
                  >
                    <Download aria-hidden="true" className="h-3.5 w-3.5" />
                    Export
                  </Button>
                }
              >
                <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 md:px-5">
                  <div className="relative w-full max-w-sm">
                    <Label htmlFor="move-search" className="sr-only">
                      Search movements
                    </Label>
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="move-search" type="search" value={moveSearch} onChange={(e) => setMoveSearch(e.target.value)} placeholder="SKU, reason, supplier, invoice or person" className="pl-9" />
                  </div>
                  <div>
                    <Label htmlFor="move-type" className="sr-only">
                      Movement type
                    </Label>
                    <select id="move-type" className={selectClass} value={moveType} onChange={(e) => setMoveType(e.target.value as typeof moveType)}>
                      <option value="all">All movements</option>
                      {(Object.keys(MOVE_LABELS) as StockMove['type'][]).map((type) => (
                        <option key={type} value={type}>
                          {MOVE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {moves.length === 0 ? (
                  <AdminEmpty
                    title="No stock movements yet"
                    icon={History}
                    description="Deliveries, online sales and adjustments will be listed here as they happen."
                    className="rounded-none border-0 bg-transparent"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Stock movement history, newest first</caption>
                      <thead>
                        <tr>
                          <th className={th}>When</th>
                          <th className={th}>SKU</th>
                          <th className={th}>Type</th>
                          <th className={cn(th, 'text-right')}>Change</th>
                          <th className={cn(th, 'text-right')}>Stock</th>
                          <th className={th}>Reason</th>
                          <th className={th}>By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {moves.slice(0, 400).map((move) => (
                          <tr key={move.id} className="hover:bg-muted/30">
                            <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{stampLabel(move.at)}</td>
                            <td className={cn(td, 'font-mono text-xs')}>{move.sku}</td>
                            <td className={td}>
                              <Badge size="sm" variant={move.type === 'receive' ? 'success' : move.type === 'sale' ? 'primary' : 'outline'}>
                                {MOVE_LABELS[move.type]}
                              </Badge>
                            </td>
                            <td
                              className={cn(
                                td,
                                'text-right font-semibold tabular-nums',
                                move.change > 0 ? 'text-emerald-600 dark:text-emerald-400' : move.change < 0 ? 'text-destructive' : '',
                              )}
                            >
                              {move.change > 0 ? `+${move.change}` : move.change}
                            </td>
                            <td className={cn(td, 'whitespace-nowrap text-right tabular-nums text-muted-foreground')}>
                              {move.before} → {move.after}
                            </td>
                            <td className={td}>
                              <p>{move.reason}</p>
                              {[move.note, move.supplier, move.reference, move.unitCost != null ? `${moneyExact(move.unitCost)} each` : '']
                                .filter(Boolean)
                                .join(' · ') ? (
                                <p className="text-xs text-muted-foreground">
                                  {[move.note, move.supplier, move.reference, move.unitCost != null ? `${moneyExact(move.unitCost)} each` : '']
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              ) : null}
                            </td>
                            <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{move.by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {moves.length > 400 ? (
                      <p className="p-4 text-xs text-muted-foreground">Showing the newest 400 here; Export has all {formatNumber(moves.length)}.</p>
                    ) : null}
                  </div>
                )}
              </AdminPanel>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {dialog ? (
        <StockDialog
          key={`${dialog.mode}-${dialog.item.product.id}`}
          mode={dialog.mode}
          item={dialog.item}
          reasons={data?.reasons ?? []}
          defaultReorder={defaultReorder}
          canRecordExpense={can(user.role, 'finance')}
          onClose={() => setDialog(null)}
          onSaved={(result) => {
            applyResult(result)
            setDialog(null)
          }}
        />
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */

function StockDialog({
  mode,
  item,
  reasons,
  defaultReorder,
  canRecordExpense,
  onClose,
  onSaved,
}: {
  mode: DialogMode
  item: InventoryItem
  reasons: string[]
  defaultReorder: number
  canRecordExpense: boolean
  onClose: () => void
  onSaved: (result: { item: InventoryItem; move?: StockMove }) => void
}) {
  const { run, busy } = useAdminAction()
  const { product, settings } = item

  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(settings?.costPrice != null ? String(settings.costPrice) : '')
  const [supplier, setSupplier] = useState(settings?.supplier ?? '')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [recordExpense, setRecordExpense] = useState(canRecordExpense)
  const [adjustMode, setAdjustMode] = useState<'add' | 'remove' | 'set'>('set')
  const [reason, setReason] = useState(reasons[0] ?? 'Stocktake count')
  const [reorder, setReorder] = useState(settings?.reorderLevel != null ? String(settings.reorderLevel) : '')
  const [location, setLocation] = useState(settings?.location ?? '')
  const [error, setError] = useState<string | null>(null)

  const qty = Number(quantity)
  const cost = parseMoney(unitCost)

  const preview =
    mode === 'receive'
      ? product.stock + (Number.isInteger(qty) ? qty : 0)
      : adjustMode === 'add'
        ? product.stock + (Number.isInteger(qty) ? qty : 0)
        : adjustMode === 'remove'
          ? product.stock - (Number.isInteger(qty) ? qty : 0)
          : Number.isInteger(qty) && quantity !== ''
            ? qty
            : product.stock

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (mode === 'settings') {
      const level = reorder.trim() === '' ? null : Number(reorder)
      if (level !== null && (!Number.isInteger(level) || level < 0)) return setError('Reorder level must be a whole number.')
      if (unitCost.trim() && (cost === null || cost <= 0)) return setError('Cost must be a dollar amount.')
      const result = await run(
        (token) =>
          api.admin.inventoryAction(token, {
            action: 'settings',
            productId: product.id,
            reorderLevel: level,
            costPrice: unitCost.trim() ? cost : null,
            location,
            supplier,
          }),
        { success: `${product.sku} settings saved`, failure: `Could not save ${product.sku}` },
      )
      if (result) onSaved(result)
      return
    }

    if (!Number.isInteger(qty) || qty < 0 || quantity.trim() === '') return setError('Enter a whole number of tyres.')
    if (mode === 'receive' && qty < 1) return setError('Receive at least one tyre.')
    if (mode === 'adjust' && adjustMode !== 'set' && qty < 1) return setError('Enter how many tyres.')
    if (preview < 0) return setError(`Only ${product.stock} in stock.`)
    if (mode === 'receive' && unitCost.trim() && (cost === null || cost <= 0)) return setError('Cost must be a dollar amount.')
    if (mode === 'receive' && recordExpense && cost === null) return setError('Enter the cost per tyre to record it as an expense, or untick the box.')

    const result = await run(
      (token) =>
        mode === 'receive'
          ? api.admin.inventoryAction(token, {
              action: 'receive',
              productId: product.id,
              quantity: qty,
              ...(cost !== null ? { unitCost: cost } : {}),
              supplier,
              reference,
              note,
              recordExpense: recordExpense && cost !== null,
            })
          : api.admin.inventoryAction(token, {
              action: 'adjust',
              productId: product.id,
              mode: adjustMode,
              quantity: qty,
              reason,
              note,
            }),
      {
        success: mode === 'receive' ? `${qty} × ${product.sku} received` : `${product.sku} stock updated`,
        successDetail: `Now ${preview} on hand.${mode === 'receive' && recordExpense && cost !== null ? ' Cost recorded as an expense.' : ''}`,
        failure: `Could not update ${product.sku}`,
      },
    )
    if (result) onSaved(result)
  }

  const title = mode === 'receive' ? 'Receive delivery' : mode === 'adjust' ? 'Adjust or count stock' : 'Stock settings'

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {product.brand} {product.model} {product.size} · <span className="font-mono">{product.sku}</span> · {product.stock} on hand
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 py-4">
            {mode === 'adjust' ? (
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-2 text-sm font-semibold">What happened?</legend>
                {(
                  [
                    ['set', 'Counted: set to'],
                    ['add', 'Add'],
                    ['remove', 'Remove'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      'cursor-pointer rounded-md border px-3 py-2 text-sm',
                      adjustMode === value ? 'border-primary bg-primary/10 font-semibold' : 'border-border',
                    )}
                  >
                    <input type="radio" name="adjust-mode" value={value} checked={adjustMode === value} onChange={() => setAdjustMode(value)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {mode !== 'settings' ? (
              <Field label={mode === 'adjust' && adjustMode === 'set' ? 'Counted on the shelf' : 'Number of tyres'} htmlFor="stock-qty" hint={`Stock after this: ${preview}`} required>
                <Input id="stock-qty" type="number" inputMode="numeric" min={0} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
              </Field>
            ) : null}

            {mode === 'adjust' ? (
              <Field label="Reason" htmlFor="stock-reason" required>
                <select id="stock-reason" className={cn(selectClass, 'w-full')} value={reason} onChange={(e) => setReason(e.target.value)}>
                  {reasons.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {mode !== 'adjust' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Cost per tyre (inc. GST)" htmlFor="stock-cost" hint={mode === 'receive' ? 'Updates the average cost.' : 'Average cost of what is on the shelf.'}>
                  <Input id="stock-cost" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" />
                </Field>
                <Field label="Supplier" htmlFor="stock-supplier">
                  <Input id="stock-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
                </Field>
              </div>
            ) : null}

            {mode === 'receive' ? (
              <>
                <Field label="Invoice / delivery number" htmlFor="stock-ref">
                  <Input id="stock-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
                </Field>
                {canRecordExpense ? (
                  <Checkbox
                    id="stock-expense"
                    checked={recordExpense}
                    onChange={(e) => setRecordExpense(e.target.checked)}
                    label={
                      cost !== null && Number.isInteger(qty) && qty > 0
                        ? `Record ${moneyExact(cost * qty)} as a stock purchase expense on the Balance page`
                        : 'Record the cost as a stock purchase expense on the Balance page'
                    }
                  />
                ) : null}
              </>
            ) : null}

            {mode === 'settings' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Reorder when at or below" htmlFor="stock-reorder" hint={`Empty uses the default of ${defaultReorder}.`}>
                  <Input id="stock-reorder" type="number" inputMode="numeric" min={0} step={1} value={reorder} onChange={(e) => setReorder(e.target.value)} placeholder={String(defaultReorder)} />
                </Field>
                <Field label="Bin / shelf location" htmlFor="stock-location">
                  <Input id="stock-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={60} placeholder="e.g. Rack B3" />
                </Field>
              </div>
            ) : (
              <Field label="Note" htmlFor="stock-note">
                <Textarea id="stock-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              </Field>
            )}

            {error ? (
              <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
                <PackageX aria-hidden="true" className="h-4 w-4" />
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
