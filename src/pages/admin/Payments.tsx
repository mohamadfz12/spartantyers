import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Download,
  Globe,
  Hourglass,
  Pencil,
  Plus,
  Search,
  Trash2,
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
  dayLabel,
  exportSheet,
  selectClass,
  td,
  th,
  useAdminAction,
} from '@/components/admin/AdminKit'
import { LedgerDialog, type LedgerPreset } from '@/components/admin/LedgerDialog'
import { PeriodPicker } from '@/components/admin/PeriodPicker'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Input, Label, Skeleton } from '@/components/ui'
import { ONLINE_METHOD, PAYMENT_METHODS } from '@/lib/admin-ledger'
import { SOURCE_LABELS, moneyRows, totalsFor, updateEntries, type MoneyRow } from '@/lib/admin-money'
import { PERIOD_LABELS, inRange, periodRange, type DateRange, type PeriodKey } from '@/lib/admin-periods'
import { api, type LedgerEntry, type LedgerType } from '@/lib/api'
import { cn, formatNumber, moneyExact } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Payments
 *
 * Every dollar that came in or went back to a customer: card payments
 * taken by the website (read straight from the orders, so they can't
 * disagree with Square), and anything else — bank transfers, cash,
 * in-store card, refunds — recorded here by hand. Orders waiting on a
 * payment are listed so a bank transfer can be matched to its order.
 * ------------------------------------------------------------------ */

export default function Payments() {
  const query = useAdminQuery('admin-ledger-payments', (token) => api.admin.ledger(token))
  const { run, busy } = useAdminAction()

  const [period, setPeriod] = useState<PeriodKey>('this-month')
  const [custom, setCustom] = useState<DateRange>({ from: '', to: '' })
  const [methodFilter, setMethodFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'payment' | 'refund'>('all')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<{ type: LedgerType; entry?: LedgerEntry; preset?: LedgerPreset } | null>(null)

  const data = query.data
  const today = data?.today ?? ''
  const range = today ? periodRange(period, today, custom) : { from: '', to: '' }

  const rows = useMemo(() => (data ? moneyRows(data).filter((r) => r.type !== 'expense') : []), [data])
  const totals = totalsFor(rows, range)

  const visible = rows.filter((row) => {
    if (!inRange(row.date, range)) return false
    if (typeFilter !== 'all' && row.type !== typeFilter) return false
    if (methodFilter !== 'all' && row.method !== methodFilter) return false
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return [row.counterparty, row.reference, row.description, row.category, row.online?.email ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  const byMethod = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (!row.counted || !inRange(row.date, range)) continue
      const sign = row.type === 'refund' ? -1 : 1
      map.set(row.method, (map.get(row.method) ?? 0) + sign * row.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [rows, range.from, range.to])

  const saved = (entry: LedgerEntry, orderMarkedPaid: boolean) => {
    query.patch((d) => updateEntries(d, entry, orderMarkedPaid))
    setDialog(null)
  }

  const remove = async (row: MoneyRow) => {
    if (!row.entry) return
    if (!window.confirm(`Delete this ${row.type} of ${moneyExact(row.amount)}?`)) return
    const id = row.entry.id
    const result = await run((token) => api.admin.deleteLedgerEntry(token, id), {
      success: 'Deleted',
      failure: 'Could not delete that',
    })
    if (result) query.reload()
  }

  if (query.notConfigured) return <AdminNotConfigured message={query.error ?? undefined} />

  return (
    <>
      <Seo title="Payments — Spartan Tyres admin" description="Money received and refunded." noIndex />

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
          <div className="flex flex-wrap items-end justify-between gap-3">
            <PeriodPicker id="pay-period" period={period} custom={custom} onPeriod={setPeriod} onCustom={setCustom} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDialog({ type: 'refund' })}>
                <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                Record refund
              </Button>
              <Button onClick={() => setDialog({ type: 'payment' })}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Record payment
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label={`Received · ${PERIOD_LABELS[period]}`} value={moneyExact(totals.income)} icon={ArrowDownLeft} tone="good" hint={totals.refunds ? `${moneyExact(totals.received)} in, ${moneyExact(totals.refunds)} refunded` : 'After refunds'} />
            <Tile label="Website card payments" value={moneyExact(totals.online)} icon={Globe} hint="Through Square at checkout" />
            <Tile label="Other payments" value={moneyExact(totals.manualIn)} icon={CreditCard} hint="Bank, cash, in-store card and more" />
            <Tile
              label="Awaiting payment"
              value={moneyExact(data.unpaidOrders.reduce((s, o) => s + Math.max(o.total - o.paidSoFar, 0), 0))}
              icon={Hourglass}
              tone={data.unpaidOrders.length ? 'warn' : 'default'}
              hint={`${data.unpaidOrders.length} order${data.unpaidOrders.length === 1 ? '' : 's'} not yet paid`}
            />
          </div>

          {data.unpaidOrders.length ? (
            <AdminPanel title="Orders awaiting payment" description="When a bank transfer or cash payment arrives for one of these, record it here and the order is marked paid.">
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.unpaidOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold">{order.reference}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {order.customer} · {dayLabel(order.date)} · {moneyExact(order.total)}
                        {order.paidSoFar ? ` · ${moneyExact(order.paidSoFar)} paid` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        setDialog({
                          type: 'payment',
                          preset: {
                            orderId: order.id,
                            amount: Math.max(Math.round((order.total - order.paidSoFar) * 100) / 100, 0),
                            counterparty: order.customer,
                            reference: order.reference,
                            category: 'Online sales',
                          },
                        })
                      }
                    >
                      Record
                    </Button>
                  </li>
                ))}
              </ul>
            </AdminPanel>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <AdminPanel
              title="Payments and refunds"
              description={`${formatNumber(visible.length)} in ${PERIOD_LABELS[period].toLowerCase()}.`}
              bodyClassName="p-0 md:p-0"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!visible.length}
                  onClick={() => exportSheet(visible, sheetColumns, 'Spartan-Payments', 'Payments')}
                >
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  Export
                </Button>
              }
            >
              <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 md:px-5">
                <div className="relative w-full max-w-xs">
                  <Label htmlFor="pay-search" className="sr-only">
                    Search payments
                  </Label>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="pay-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer, reference, email" className="pl-9" />
                </div>
                <Label htmlFor="pay-type" className="sr-only">
                  Type
                </Label>
                <select id="pay-type" className={selectClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
                  <option value="all">Payments and refunds</option>
                  <option value="payment">Payments only</option>
                  <option value="refund">Refunds only</option>
                </select>
                <Label htmlFor="pay-method" className="sr-only">
                  Method
                </Label>
                <select id="pay-method" className={selectClass} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
                  <option value="all">Every method</option>
                  {[ONLINE_METHOD, ...PAYMENT_METHODS].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>

              {visible.length === 0 ? (
                <AdminEmpty
                  title="No payments in this period"
                  icon={CreditCard}
                  description="Website card payments appear here automatically. Record bank transfers and cash with “Record payment”."
                  className="rounded-none border-0 bg-transparent"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">Payments and refunds, newest first</caption>
                    <thead>
                      <tr>
                        <th className={th}>Date</th>
                        <th className={th}>From / to</th>
                        <th className={th}>Method</th>
                        <th className={th}>Details</th>
                        <th className={cn(th, 'text-right')}>Amount</th>
                        <th className={cn(th, 'text-right')}>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.id} className={cn('hover:bg-muted/30', !row.counted && 'opacity-60')}>
                          <td className={cn(td, 'whitespace-nowrap')}>{dayLabel(row.date)}</td>
                          <td className={td}>
                            <p className="font-semibold">{row.counterparty || '—'}</p>
                            {row.online ? <p className="text-xs text-muted-foreground">{row.online.email}</p> : null}
                          </td>
                          <td className={cn(td, 'whitespace-nowrap')}>
                            {row.method}
                            <p className="text-xs text-muted-foreground">{SOURCE_LABELS[row.source]}</p>
                          </td>
                          <td className={td}>
                            <p>{row.description || row.category}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.online ? (
                                <Link className="hover:underline" to="/admin/orders">
                                  {row.reference}
                                </Link>
                              ) : (
                                row.reference || row.category
                              )}
                              {!row.counted ? ' · not counted' : ''}
                            </p>
                          </td>
                          <td
                            className={cn(
                              td,
                              'whitespace-nowrap text-right font-semibold tabular-nums',
                              row.type === 'refund' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                            )}
                          >
                            {row.type === 'refund' ? '−' : '+'}
                            {moneyExact(row.amount)}
                            {row.type === 'refund' ? (
                              <p>
                                <Badge size="sm" variant="outline">
                                  Refund
                                </Badge>
                              </p>
                            ) : null}
                          </td>
                          <td className={cn(td, 'text-right')}>
                            {row.entry && row.source === 'manual' ? (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setDialog({ type: row.type, entry: row.entry })} aria-label="Edit" title="Edit">
                                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(row)} aria-label="Delete" title="Delete">
                                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminPanel>

            <AdminPanel title="By method" description="Net of refunds, this period.">
              {byMethod.length ? (
                <ul className="flex flex-col gap-3">
                  {byMethod.map(([method, amount]) => {
                    const max = Math.max(...byMethod.map(([, a]) => Math.abs(a)), 1)
                    return (
                      <li key={method}>
                        <div className="flex justify-between text-sm">
                          <span>{method}</span>
                          <span className="font-semibold tabular-nums">{moneyExact(amount)}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max((Math.abs(amount) / max) * 100, 2)}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing yet this period.</p>
              )}
            </AdminPanel>
          </div>
        </div>
      ) : null}

      {dialog && data ? (
        <LedgerDialog
          type={dialog.type}
          entry={dialog.entry}
          preset={dialog.preset}
          unpaidOrders={data.unpaidOrders}
          today={data.today}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      ) : null}
    </>
  )
}

const sheetColumns = [
  { column: 'Date', width: 12, value: (r: MoneyRow) => r.date },
  { column: 'Type', width: 10, value: (r: MoneyRow) => (r.type === 'refund' ? 'Refund' : 'Payment') },
  { column: 'Customer', width: 26, value: (r: MoneyRow) => r.counterparty },
  { column: 'Method', width: 16, value: (r: MoneyRow) => r.method },
  { column: 'Category', width: 16, value: (r: MoneyRow) => r.category },
  { column: 'Reference', width: 18, value: (r: MoneyRow) => r.reference },
  { column: 'Description', width: 34, value: (r: MoneyRow) => r.description },
  {
    column: 'Amount',
    width: 12,
    number: true,
    format: '#,##0.00',
    value: (r: MoneyRow) => (r.type === 'refund' ? -r.amount : r.amount),
  },
  { column: 'GST', width: 10, number: true, format: '#,##0.00', value: (r: MoneyRow) => (r.type === 'refund' ? -r.gst : r.gst) },
  { column: 'Counted', width: 9, value: (r: MoneyRow) => (r.counted ? 'Yes' : 'No (cancelled)') },
  { column: 'Source', width: 16, value: (r: MoneyRow) => SOURCE_LABELS[r.source] },
]
