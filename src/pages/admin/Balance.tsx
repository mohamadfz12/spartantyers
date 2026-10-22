import { useMemo, useState } from 'react'
import {
  Download,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Scale,
  Settings2,
  Trash2,
  TrendingDown,
  TrendingUp,
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
  parseMoney,
  selectClass,
  td,
  th,
  useAdminAction,
} from '@/components/admin/AdminKit'
import { LedgerDialog } from '@/components/admin/LedgerDialog'
import { PeriodPicker } from '@/components/admin/PeriodPicker'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Checkbox, Field, Input, Label, Skeleton } from '@/components/ui'
import { EXPENSE_CATEGORIES } from '@/lib/admin-ledger'
import {
  SOURCE_LABELS,
  cashBalance,
  moneyRows,
  totalsFor,
  updateEntries,
  type MoneyRow,
} from '@/lib/admin-money'
import {
  PERIOD_LABELS,
  financialYearLabel,
  inRange,
  monthLabel,
  monthsBetween,
  periodRange,
  type DateRange,
  type PeriodKey,
} from '@/lib/admin-periods'
import { api, type LedgerEntry } from '@/lib/api'
import { cn, moneyExact } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Balance
 *
 * The money picture: what came in, what went out, what is left, what
 * should be in the bank, and roughly what the next BAS will ask for.
 * Income is the Payments page (website card payments plus anything
 * recorded by hand); expenses are entered here, or arrive on their own
 * from a stock delivery or a wages run.
 *
 * It is a running record for the owner, not an accounting system:
 * the GST figure is an estimate from the amounts entered, and the
 * accountant's books remain the official ones.
 * ------------------------------------------------------------------ */

export default function Balance() {
  const query = useAdminQuery('admin-ledger-balance', (token) => api.admin.ledger(token))
  const { run, busy } = useAdminAction()

  const [period, setPeriod] = useState<PeriodKey>('this-fy')
  const [custom, setCustom] = useState<DateRange>({ from: '', to: '' })
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dialog, setDialog] = useState<{ entry?: LedgerEntry } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const data = query.data
  const today = data?.today ?? ''
  const range = today ? periodRange(period, today, custom) : { from: '', to: '' }

  const rows = useMemo(() => (data ? moneyRows(data) : []), [data])
  const totals = totalsFor(rows, range)
  const balance = data ? cashBalance(rows, data) : 0

  const expenses = rows.filter(
    (r) => r.type === 'expense' && inRange(r.date, range) && (categoryFilter === 'all' || r.category === categoryFilter),
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of rows) {
      if (row.type !== 'expense' || !inRange(row.date, range)) continue
      map.set(row.category, (map.get(row.category) ?? 0) + row.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [rows, range.from, range.to])

  /** Month-by-month in and out. "All time" and open-ended ranges show the last 12 months. */
  const months = useMemo(() => {
    if (!today) return []
    const fallback = periodRange('last-12', today, custom)
    const from = (range.from || fallback.from).slice(0, 7)
    const to = (range.to || fallback.to).slice(0, 7)
    const list = monthsBetween(from, to).slice(-24)
    return list.map((month) => {
      const t = totalsFor(rows, { from: `${month}-01`, to: `${month}-31` })
      return { month, income: t.income, expenses: t.expenses, net: t.net }
    })
  }, [rows, today, range.from, range.to])

  const remove = async (row: MoneyRow) => {
    if (!row.entry) return
    const extra = row.source === 'wages' ? ' The hours it paid will go back to unpaid.' : ''
    if (!window.confirm(`Delete this expense of ${moneyExact(row.amount)}?${extra}`)) return
    const id = row.entry.id
    const result = await run((token) => api.admin.deleteLedgerEntry(token, id), {
      success: 'Expense deleted',
      successDetail: wagesDeleteNote(row),
      failure: 'Could not delete that expense',
    })
    if (result) query.reload()
  }

  if (query.notConfigured) return <AdminNotConfigured message={query.error ?? undefined} />

  return (
    <>
      <Seo title="Balance — Spartan Tyres admin" description="Income, expenses, profit, cash and GST." noIndex />

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
            <div className="flex flex-wrap items-end gap-3">
              <PeriodPicker id="bal-period" period={period} custom={custom} onPeriod={setPeriod} onCustom={setCustom} />
              {period === 'this-fy' || period === 'last-fy' ? (
                <span className="pb-2.5 text-sm text-muted-foreground">{financialYearLabel(range.from)}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
                <Settings2 aria-hidden="true" className="h-4 w-4" />
                Settings
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  exportSheet(
                    rows.filter((r) => inRange(r.date, range)),
                    ledgerColumns,
                    'Spartan-Ledger',
                    'Ledger',
                  )
                }
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Export ledger
              </Button>
              <Button onClick={() => setDialog({})}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add expense
              </Button>
            </div>
          </div>

          {settingsOpen ? (
            <BalanceSettings
              settings={data.settings}
              onSaved={(settings) => {
                query.patch((d) => ({ ...d, settings }))
                setSettingsOpen(false)
              }}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label={`Income · ${PERIOD_LABELS[period]}`} value={moneyExact(totals.income)} icon={TrendingUp} tone="good" hint="Payments received, less refunds" />
            <Tile label="Expenses" value={moneyExact(totals.expenses)} icon={TrendingDown} tone={totals.expenses ? 'bad' : 'default'} />
            <Tile label="Profit" value={moneyExact(totals.net)} icon={Scale} tone={totals.net >= 0 ? 'good' : 'bad'} hint="Income − expenses (GST included both sides)" />
            <Tile
              label="Cash balance"
              value={moneyExact(balance)}
              icon={Landmark}
              tone={balance >= 0 ? 'default' : 'bad'}
              hint={
                data.settings.openingDate
                  ? `${moneyExact(data.settings.openingBalance)} on ${dayLabel(data.settings.openingDate)}, plus everything since.`
                  : 'Set an opening balance in Settings to match your bank account.'
              }
            />
          </div>

          {data.settings.gstRegistered ? (
            <AdminPanel title="GST estimate" description="From the amounts entered, for checking against your BAS. Your accountant's figures are the official ones.">
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">GST collected on sales</dt>
                  <dd className="font-heading text-xl font-bold tabular-nums">{moneyExact(totals.gstCollected)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">GST paid on expenses (credits)</dt>
                  <dd className="font-heading text-xl font-bold tabular-nums">{moneyExact(totals.gstPaid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{totals.gstCollected - totals.gstPaid >= 0 ? 'Estimated GST to pay' : 'Estimated GST refund'}</dt>
                  <dd className={cn('font-heading text-xl font-bold tabular-nums', totals.gstCollected - totals.gstPaid >= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                    {moneyExact(Math.abs(totals.gstCollected - totals.gstPaid))}
                  </dd>
                </div>
              </dl>
            </AdminPanel>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
            <AdminPanel title="Month by month" description="Income and expenses each month.">
              <MonthChart months={months} />
            </AdminPanel>

            <AdminPanel title="Where the money went" description="Expenses by category, this period.">
              {byCategory.length ? (
                <ul className="flex flex-col gap-3">
                  {byCategory.map(([category, amount]) => (
                    <li key={category}>
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setCategoryFilter((c) => (c === category ? 'all' : category))}
                        aria-pressed={categoryFilter === category}
                      >
                        <div className="flex justify-between gap-2 text-sm">
                          <span className={cn(categoryFilter === category && 'font-semibold')}>{category}</span>
                          <span className="tabular-nums">
                            {moneyExact(amount)}
                            <span className="ml-1 text-xs text-muted-foreground">{totals.expenses ? Math.round((amount / totals.expenses) * 100) : 0}%</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-muted">
                          <div className="h-2 rounded-full bg-destructive/70" style={{ width: `${Math.max((amount / (byCategory[0]?.[1] || 1)) * 100, 2)}%` }} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No expenses this period.</p>
              )}
            </AdminPanel>
          </div>

          <AdminPanel
            title="Expenses"
            description="Stock deliveries and wages arrive here on their own; add everything else."
            bodyClassName="p-0 md:p-0"
            action={
              <div>
                <Label htmlFor="bal-category" className="sr-only">
                  Category
                </Label>
                <select id="bal-category" className={selectClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">All categories</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            }
          >
            {expenses.length === 0 ? (
              <AdminEmpty
                title="No expenses here"
                icon={Receipt}
                description="Add rent, fuel, wages, stock purchases and other costs to see the real profit."
                className="rounded-none border-0 bg-transparent"
                action={
                  <Button size="sm" onClick={() => setDialog({})}>
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    Add expense
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Expenses, newest first</caption>
                  <thead>
                    <tr>
                      <th className={th}>Date</th>
                      <th className={th}>Category</th>
                      <th className={th}>Paid to</th>
                      <th className={th}>Details</th>
                      <th className={cn(th, 'text-right')}>Amount</th>
                      <th className={cn(th, 'text-right')}>GST</th>
                      <th className={cn(th, 'text-right')}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className={cn(td, 'whitespace-nowrap')}>{dayLabel(row.date)}</td>
                        <td className={td}>
                          {row.category}
                          {row.source !== 'manual' ? (
                            <p>
                              <Badge size="sm" variant="outline">
                                {SOURCE_LABELS[row.source]}
                              </Badge>
                            </p>
                          ) : null}
                        </td>
                        <td className={td}>{row.counterparty || '—'}</td>
                        <td className={td}>
                          <p>{row.description || '—'}</p>
                          <p className="text-xs text-muted-foreground">
                            {[row.method, row.reference].filter(Boolean).join(' · ')}
                          </p>
                        </td>
                        <td className={cn(td, 'whitespace-nowrap text-right font-semibold tabular-nums')}>{moneyExact(row.amount)}</td>
                        <td className={cn(td, 'whitespace-nowrap text-right tabular-nums text-muted-foreground')}>{moneyExact(row.gst)}</td>
                        <td className={cn(td, 'text-right')}>
                          <div className="flex justify-end gap-1">
                            {row.source === 'manual' ? (
                              <Button size="sm" variant="ghost" onClick={() => setDialog({ entry: row.entry })} aria-label="Edit" title="Edit">
                                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(row)} aria-label="Delete" title="Delete">
                              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        </div>
      ) : null}

      {dialog && data ? (
        <LedgerDialog
          type="expense"
          entry={dialog.entry}
          today={data.today}
          onClose={() => setDialog(null)}
          onSaved={(entry, marked) => {
            query.patch((d) => updateEntries(d, entry, marked))
            setDialog(null)
          }}
        />
      ) : null}
    </>
  )
}

function wagesDeleteNote(row: MoneyRow): string | undefined {
  return row.source === 'wages' ? 'The hours it paid are back to unpaid on the Staff page.' : undefined
}

/* ------------------------------------------------------------------ */

function MonthChart({ months }: { months: Array<{ month: string; income: number; expenses: number; net: number }> }) {
  const max = Math.max(...months.map((m) => Math.max(m.income, m.expenses)), 1)
  if (!months.some((m) => m.income || m.expenses)) {
    return <p className="text-sm text-muted-foreground">Nothing recorded in these months yet.</p>
  }
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-destructive/70" aria-hidden="true" /> Expenses
        </span>
      </div>
      <div className="flex h-48 items-end gap-1.5 overflow-x-auto" role="img" aria-label="Income and expenses by month">
        {months.map((m) => (
          <div key={m.month} className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-1" title={`${monthLabel(m.month)}: in ${moneyExact(m.income)}, out ${moneyExact(m.expenses)}, net ${moneyExact(m.net)}`}>
            <div className="flex h-40 w-full items-end justify-center gap-0.5">
              <div className="w-1/2 max-w-[1rem] rounded-t bg-emerald-500" style={{ height: `${(m.income / max) * 100}%` }} />
              <div className="w-1/2 max-w-[1rem] rounded-t bg-destructive/70" style={{ height: `${(m.expenses / max) * 100}%` }} />
            </div>
            <span className="whitespace-nowrap text-[0.625rem] text-muted-foreground">{monthLabel(m.month)}</span>
          </div>
        ))}
      </div>
      {/* The same figures as a table, for screen readers and exact numbers. */}
      <table className="sr-only">
        <caption>Income and expenses by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Expenses</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{monthLabel(m.month)}</td>
              <td>{moneyExact(m.income)}</td>
              <td>{moneyExact(m.expenses)}</td>
              <td>{moneyExact(m.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function BalanceSettings({
  settings,
  onSaved,
}: {
  settings: { openingBalance: number; openingDate: string; gstRegistered: boolean; updatedAt: string }
  onSaved: (settings: { openingBalance: number; openingDate: string; gstRegistered: boolean; updatedAt: string }) => void
}) {
  const { run, busy } = useAdminAction()
  const [opening, setOpening] = useState(String(settings.openingBalance || ''))
  const [date, setDate] = useState(settings.openingDate)
  const [gst, setGst] = useState(settings.gstRegistered)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const value = opening.trim() ? parseMoney(opening) : 0
    if (value === null) return setError('Opening balance must be a dollar amount.')
    if (value !== 0 && !date) return setError('Pick the date that balance was correct on.')
    const result = await run(
      (token) => api.admin.saveFinanceSettings(token, { openingBalance: value, openingDate: date, gstRegistered: gst }),
      { success: 'Balance settings saved', failure: 'Could not save the settings' },
    )
    if (result) onSaved(result.settings)
  }

  return (
    <AdminPanel title="Balance settings" description="Match the cash balance to your bank: enter what the account held on a date, and everything from that day on is added to it.">
      <form onSubmit={submit} className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" noValidate>
        <Field label="Opening balance ($)" htmlFor="bal-opening" hint="Can be negative, e.g. an overdraft.">
          <Input id="bal-opening" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="As at" htmlFor="bal-date">
          <Input id="bal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy}>
          Save
        </Button>
        <div className="sm:col-span-3">
          <Checkbox id="bal-gst" checked={gst} onChange={(e) => setGst(e.target.checked)} label="The business is registered for GST (shows the GST estimate)" />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-3">
            {error}
          </p>
        ) : null}
      </form>
    </AdminPanel>
  )
}

const ledgerColumns = [
  { column: 'Date', width: 12, value: (r: MoneyRow) => r.date },
  { column: 'Type', width: 10, value: (r: MoneyRow) => (r.type === 'expense' ? 'Expense' : r.type === 'refund' ? 'Refund' : 'Payment') },
  { column: 'Category', width: 20, value: (r: MoneyRow) => r.category },
  { column: 'Customer / supplier', width: 26, value: (r: MoneyRow) => r.counterparty },
  { column: 'Method', width: 16, value: (r: MoneyRow) => r.method },
  { column: 'Reference', width: 18, value: (r: MoneyRow) => r.reference },
  { column: 'Description', width: 34, value: (r: MoneyRow) => r.description },
  {
    column: 'Money in',
    width: 12,
    number: true,
    format: '#,##0.00',
    value: (r: MoneyRow) => (r.type === 'payment' && r.counted ? r.amount : null),
  },
  {
    column: 'Money out',
    width: 12,
    number: true,
    format: '#,##0.00',
    value: (r: MoneyRow) => (r.type !== 'payment' ? r.amount : null),
  },
  { column: 'GST', width: 10, number: true, format: '#,##0.00', value: (r: MoneyRow) => r.gst },
  { column: 'Counted', width: 9, value: (r: MoneyRow) => (r.counted ? 'Yes' : 'No (cancelled)') },
  { column: 'Source', width: 16, value: (r: MoneyRow) => SOURCE_LABELS[r.source] },
]
