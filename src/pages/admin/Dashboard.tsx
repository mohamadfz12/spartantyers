import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  BadgeDollarSign,
  Boxes,
  PackageSearch,
  Receipt,
  TrendingUp,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import { RevenueChart } from '@/components/admin/RevenueChart'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Counter } from '@/components/motion'
import { Badge, Card, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { cn, formatNumber, money, moneyExact } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Dashboard
 *
 * Every figure here is derived server-side from stored orders, so a
 * deployment with no orders yet legitimately reports zero everywhere.
 * That is exactly the case worth being careful about: four tiles reading
 * "$0" look like a reporting fault. When there are no orders we say so
 * instead, and still show low stock — that comes from the catalogue and
 * is genuinely useful on day one.
 * ------------------------------------------------------------------ */

export default function Dashboard() {
  const stats = useAdminQuery('admin-stats', (token) => api.admin.stats(token))

  return (
    <>
      <Seo
        title="Dashboard — Spartan Tyres admin"
        description="Revenue, orders and stock overview."
        noIndex
      />

      {stats.notConfigured ? (
        <AdminNotConfigured message={stats.error ?? undefined} />
      ) : stats.loading ? (
        <DashboardSkeleton />
      ) : stats.error ? (
        <AdminError message={stats.error} onRetry={stats.reload} />
      ) : !stats.data ? (
        <AdminError message="No data was returned." onRetry={stats.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <StorageStatus storage={stats.data.storage} />

          {stats.data.orderCount === 0 ? (
            <AdminEmpty
              title="No orders yet"
              icon={Receipt}
              description="Revenue, units sold and average order value appear here as soon as the first order is paid. Nothing below is being hidden — there is simply nothing to report."
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  label="Revenue"
                  icon={BadgeDollarSign}
                  value={stats.data.revenue}
                  prefix="$"
                  screenReaderValue={money(stats.data.revenue)}
                  hint={`${moneyExact(stats.data.revenue)} banked, excluding cancelled orders`}
                />
                <StatTile
                  label="Orders"
                  icon={Receipt}
                  value={stats.data.orderCount}
                  screenReaderValue={formatNumber(stats.data.orderCount)}
                  hint="Paid, packing, dispatched and collected"
                />
                <StatTile
                  label="Tyres sold"
                  icon={Boxes}
                  value={stats.data.unitsSold}
                  screenReaderValue={formatNumber(stats.data.unitsSold)}
                  hint="Total units across all order lines"
                />
                <StatTile
                  label="Average order"
                  icon={TrendingUp}
                  value={stats.data.averageOrderValue}
                  prefix="$"
                  screenReaderValue={money(stats.data.averageOrderValue)}
                  hint={`${moneyExact(stats.data.averageOrderValue)} per order`}
                />
              </div>

              <AdminPanel
                title="Revenue by day"
                description="The last 14 days. Cancelled orders are excluded."
              >
                <RevenueChart data={stats.data.revenueByDay} />
              </AdminPanel>
            </>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            {/* ---- Low stock -------------------------------------- */}
            <AdminPanel
              title="Low stock"
              description={
                stats.data.lowStock.length > 0
                  ? `${formatNumber(stats.data.lowStock.length)} ${stats.data.lowStock.length === 1 ? 'line' : 'lines'} at or below the reorder threshold.`
                  : undefined
              }
              bodyClassName="p-0 md:p-0"
            >
              {stats.data.lowStock.length === 0 ? (
                <AdminEmpty
                  title="Stock is healthy"
                  icon={PackageSearch}
                  description="Nothing is at or below the reorder threshold."
                  className="rounded-none border-0 border-t bg-transparent"
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      Products at or below the low-stock threshold
                    </caption>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="border-b border-border bg-muted/50 px-4 py-2.5 text-left font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground"
                        >
                          Product
                        </th>
                        <th
                          scope="col"
                          className="border-b border-border bg-muted/50 px-4 py-2.5 text-left font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground"
                        >
                          Size
                        </th>
                        <th
                          scope="col"
                          className="border-b border-border bg-muted/50 px-4 py-2.5 text-right font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground"
                        >
                          In stock
                        </th>
                        <th scope="col" className="border-b border-border bg-muted/50 px-4 py-2.5">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.data.lowStock.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border last:border-0 hover:bg-muted/40"
                        >
                          <th
                            scope="row"
                            className="px-4 py-2.5 text-left font-medium text-foreground"
                          >
                            {item.model}
                          </th>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                            {item.size}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="inline-flex items-center gap-2">
                              <span className="font-semibold tabular-nums">
                                {formatNumber(item.stock)}
                              </span>
                              {item.stock === 0 ? (
                                <Badge variant="destructive" size="sm">
                                  Pre-order
                                </Badge>
                              ) : item.stock <= 5 ? (
                                <Badge variant="warning" size="sm">
                                  Low
                                </Badge>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              to={`/admin/products#product-${item.id}`}
                              className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                              Edit
                              <span className="sr-only"> {item.model} stock</span>
                              <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminPanel>

            {/* ---- Top products ----------------------------------- */}
            <AdminPanel title="Top products" description="By units sold, all time.">
              {stats.data.topProducts.length === 0 ? (
                <AdminEmpty
                  title="Nothing sold yet"
                  icon={Boxes}
                  description="The best sellers appear here after the first order."
                />
              ) : (
                <ol className="flex flex-col gap-3">
                  {stats.data.topProducts.map((item, index) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 font-heading text-xs font-bold text-primary"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {item.model}
                        </span>
                        {item.size ? (
                          <span className="block text-xs tabular-nums text-muted-foreground">
                            {item.size}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-heading text-sm font-bold tabular-nums">
                          {formatNumber(item.units)}
                        </span>
                        <span className="block text-[0.625rem] uppercase tracking-brand text-muted-foreground">
                          {item.units === 1 ? 'tyre' : 'tyres'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </AdminPanel>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  icon: Icon,
  prefix,
  hint,
  screenReaderValue,
}: {
  label: string
  value: number
  icon: typeof TrendingUp
  prefix?: string
  hint?: string
  /**
   * The canonical, fully formatted figure. The animated Counter is
   * decoration; this is what assistive tech is given.
   */
  screenReaderValue: string
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground">
          {label}
        </p>
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
      </div>

      <p className="mt-2 font-heading text-3xl font-black tabular-nums leading-none">
        <span aria-hidden="true">
          <Counter value={value} prefix={prefix} decimals={0} />
        </span>
        <span className="sr-only">{screenReaderValue}</span>
      </p>

      {hint ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading the dashboard…</span>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-4 md:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-3 h-3 w-full" />
          </Card>
        ))}
      </div>

      <Card className="p-4 md:p-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-[14rem] w-full" />
      </Card>

      <div className={cn('grid gap-6 xl:grid-cols-[1.4fr_1fr]')}>
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="p-4 md:p-5">
            <Skeleton className="h-3 w-28" />
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 5 }).map((__, row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

/**
 * Whether orders, enquiries and edits are actually being kept.
 *
 * Without a database the store falls back to temporary memory that Vercel
 * wipes whenever it recycles a function — often within minutes. That failure
 * is silent everywhere else, so it is stated plainly at the top of the
 * dashboard: staff should never discover it by losing an order.
 */
function StorageStatus({ storage }: { storage: 'connected' | 'memory' }) {
  if (storage === 'connected') {
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
        Database connected — orders, enquiries and edits are being saved.
      </p>
    )
  }

  return (
    <div
      role="alert"
      className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-4 text-sm"
    >
      <p className="font-heading font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
        No database connected — nothing is being kept
      </p>
      <p className="mt-1.5 leading-relaxed text-foreground/85">
        Orders, enquiries, newsletter sign-ups and any price or stock edits are
        held in temporary memory and will disappear when the site restarts. In
        the Vercel project, open Storage, connect an Upstash Redis (KV)
        database to this project, then redeploy.
      </p>
    </div>
  )
}
