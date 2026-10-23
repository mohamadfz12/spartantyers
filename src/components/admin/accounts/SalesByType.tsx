import { useState } from 'react'
import { Download } from 'lucide-react'
import { AdminError, AdminPanel } from '@/components/admin/AdminStates'
import { Tile, dayLabel, exportSheet, todayLocal } from '@/components/admin/AdminKit'
import { PeriodPicker } from '@/components/admin/PeriodPicker'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Button, Skeleton } from '@/components/ui'
import { PERIOD_LABELS, periodRange, type DateRange, type PeriodKey } from '@/lib/admin-periods'
import { accountsApi } from '@/lib/admin-accounts-api'
import {
  CHANNEL_KEYS,
  CHANNEL_LABELS,
  averageSale,
  channelRows,
  dollars,
  salesRange,
  type ChannelRow,
  type SalesSource,
} from '@/lib/admin-accounts-ui'
import { cn, formatNumber } from '@/lib/utils'

const SOURCES: Array<{ key: SalesSource; label: string }> = [
  { key: 'all', label: 'Website and till' },
  { key: 'website', label: 'Website' },
  { key: 'till', label: 'Till' },
]

const BAR_CLASS: Record<ChannelRow['key'], string> = {
  retail: 'bg-sky-500',
  bulk: 'bg-orange-500',
  wholesale: 'bg-violet-500',
}

/**
 * Sales by type (Retail / Bulk / Wholesale), for a period: a tile per type, a bar comparison and an
 * Excel export. Lives on the Balance page, which is for owners and managers (permission `finance`).
 */
export function SalesByType() {
  const [period, setPeriod] = useState<PeriodKey>('this-month')
  const [custom, setCustom] = useState<DateRange>({ from: '', to: '' })
  const [source, setSource] = useState<SalesSource>('all')

  const today = todayLocal()
  const range = salesRange(periodRange(period, today, custom), today)
  const query = useAdminQuery(`admin-sales-by-type-${range.from}-${range.to}`, (token) =>
    accountsApi.salesByChannel(token, range.from, range.to),
  )
  const data = query.data
  const rows = data ? channelRows(data, source) : []
  const all = data?.total[source]

  return (
    <AdminPanel
      title="Sales by type"
      description={
        data
          ? `Retail, Bulk and Wholesale sales, ${dayLabel(data.from)} to ${dayLabel(data.to)}. Website orders that are not cancelled, and till tickets that are paid or on account.`
          : 'Retail, Bulk and Wholesale sales for the period.'
      }
      action={
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={() =>
            data &&
            exportSheet(
              CHANNEL_KEYS.flatMap((key) =>
                (['website', 'till', 'all'] as const).map((src) => ({ key, src, part: data.channels[key][src] })),
              ),
              [
                { column: 'Type', width: 12, value: (r) => CHANNEL_LABELS[r.key] },
                { column: 'Where', width: 16, value: (r) => (r.src === 'all' ? 'Website and till' : r.src === 'website' ? 'Website' : 'Till') },
                { column: 'Sales', width: 9, number: true, value: (r) => r.part.count },
                { column: 'Total', width: 14, number: true, format: '#,##0.00', value: (r) => r.part.total },
                { column: 'Average sale', width: 14, number: true, format: '#,##0.00', value: (r) => averageSale(r.part) },
                { column: 'Paid', width: 14, number: true, format: '#,##0.00', value: (r) => r.part.paid },
                { column: 'Owing', width: 14, number: true, format: '#,##0.00', value: (r) => r.part.owing },
                { column: 'On account sales', width: 16, number: true, value: (r) => r.part.onAccount.count },
                { column: 'On account total', width: 16, number: true, format: '#,##0.00', value: (r) => r.part.onAccount.total },
                { column: 'From', width: 12, value: () => data.from },
                { column: 'To', width: 12, value: () => data.to },
              ],
              'Spartan-Sales-By-Type',
              'Sales by type',
            )
          }
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <PeriodPicker id="sbt-period" period={period} custom={custom} onPeriod={setPeriod} onCustom={setCustom} />
        <div role="group" aria-label="Where the sale was made" className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={source === s.key}
              onClick={() => setSource(s.key)}
              className={cn(
                'h-10 rounded-md border px-3 text-sm font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                source === s.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {range.clamped ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {PERIOD_LABELS[period]} is longer than the report allows, so it shows the last 400 days.
        </p>
      ) : null}

      <div className="mt-4">
        {query.loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : query.error || !data ? (
          <AdminError message={query.error ?? 'The report could not be loaded.'} onRetry={query.reload} />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              {rows.map((r) => (
                <Tile
                  key={r.key}
                  label={r.label}
                  value={dollars(r.total)}
                  hint={
                    <>
                      {formatNumber(r.count)} sale{r.count === 1 ? '' : 's'}, average {dollars(r.average)}
                      {r.owing > 0 ? <>, {dollars(r.owing)} still owing</> : null}
                    </>
                  }
                />
              ))}
            </div>

            <div>
              <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">Comparison</h3>
              {all && all.count > 0 ? (
                <ul className="mt-3 flex flex-col gap-3">
                  {rows.map((r) => (
                    <li key={r.key}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold">{r.label}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {dollars(r.total)} ({r.share}%)
                        </span>
                      </div>
                      <div className="mt-1 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.label}: ${dollars(r.total)}, ${r.share}% of sales`}>
                        <div className={cn('h-full rounded-full', BAR_CLASS[r.key])} style={{ width: `${r.bar}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No sales in this period.</p>
              )}
              {all ? (
                <p className="mt-4 text-sm">
                  All types: <span className="font-semibold tabular-nums">{dollars(all.total)}</span> from {formatNumber(all.count)} sale{all.count === 1 ? '' : 's'}
                  {all.onAccount.count ? `, ${formatNumber(all.onAccount.count)} of them on account (${dollars(all.onAccount.total)})` : ''}.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </AdminPanel>
  )
}
