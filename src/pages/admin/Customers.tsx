import { useMemo, useState } from 'react'
import { Download, Mail, Phone, Search, Users } from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import { Tile, exportSheet, selectClass, stampLabel, td, th } from '@/components/admin/AdminKit'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Input, Label, Skeleton } from '@/components/ui'
import { api, type Customer } from '@/lib/api'
import { cn, formatNumber, moneyExact } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Customers
 *
 * Everyone who has ordered, one row per email address, built from the
 * orders themselves, so there is no second copy of anyone's details to
 * keep in step. Spend counts paid orders only.
 * ------------------------------------------------------------------ */

type SortKey = 'recent' | 'spent' | 'orders' | 'name'

export default function Customers() {
  const query = useAdminQuery('admin-customers', (token) => api.admin.customers(token))
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')

  const customers = query.data?.customers ?? []

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = customers.filter(
      (c) =>
        !needle ||
        [c.name, c.email, c.phone, c.company, c.suburb, ...c.references].join(' ').toLowerCase().includes(needle),
    )
    const by: Record<SortKey, (a: Customer, b: Customer) => number> = {
      recent: (a, b) => b.lastOrder.localeCompare(a.lastOrder),
      spent: (a, b) => b.spent - a.spent,
      orders: (a, b) => b.orders - a.orders,
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return [...list].sort(by[sort])
  }, [customers, search, sort])

  const totalSpent = customers.reduce((s, c) => s + c.spent, 0)
  const repeat = customers.filter((c) => c.orders > 1).length

  if (query.notConfigured) return <AdminNotConfigured message={query.error ?? undefined} />

  return (
    <>
      <Seo title="Customers — Spartan Tyres admin" description="Everyone who has ordered." noIndex />

      {query.loading && !query.data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile label="Customers" value={formatNumber(customers.length)} icon={Users} />
            <Tile label="Repeat customers" value={formatNumber(repeat)} hint={customers.length ? `${Math.round((repeat / customers.length) * 100)}% ordered more than once` : undefined} />
            <Tile label="Average spend" value={moneyExact(customers.length ? totalSpent / customers.length : 0)} hint={`${moneyExact(totalSpent)} in total`} />
          </div>

          <AdminPanel
            title="Customer list"
            description={`${formatNumber(visible.length)} of ${formatNumber(customers.length)}.`}
            bodyClassName="p-0 md:p-0"
            action={
              <Button
                variant="outline"
                size="sm"
                disabled={!visible.length}
                onClick={() =>
                  exportSheet(
                    visible,
                    [
                      { column: 'Name', width: 24, value: (c) => c.name },
                      { column: 'Company', width: 24, value: (c) => c.company },
                      { column: 'Email', width: 30, value: (c) => c.email },
                      { column: 'Phone', width: 16, value: (c) => c.phone },
                      { column: 'Suburb', width: 16, value: (c) => c.suburb },
                      { column: 'Orders', width: 8, number: true, value: (c) => c.orders },
                      { column: 'Tyres', width: 8, number: true, value: (c) => c.tyres },
                      { column: 'Spent', width: 12, number: true, format: '#,##0.00', value: (c) => c.spent },
                      { column: 'First order', width: 20, value: (c) => stampLabel(c.firstOrder) },
                      { column: 'Last order', width: 20, value: (c) => stampLabel(c.lastOrder) },
                      { column: 'Newsletter', width: 11, value: (c) => (c.subscribed ? 'Yes' : 'No') },
                      { column: 'Order references', width: 40, value: (c) => c.references.join(', ') },
                    ],
                    'Spartan-Customers',
                    'Customers',
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
                <Label htmlFor="cust-search" className="sr-only">
                  Search customers
                </Label>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="cust-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, company, email, phone, order ref" className="pl-9" />
              </div>
              <Label htmlFor="cust-sort" className="sr-only">
                Sort
              </Label>
              <select id="cust-sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="recent">Most recent order</option>
                <option value="spent">Highest spend</option>
                <option value="orders">Most orders</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>

            {visible.length === 0 ? (
              <AdminEmpty
                title={customers.length ? 'No one matches' : 'No customers yet'}
                icon={Users}
                description={customers.length ? 'Try a different search.' : 'Everyone who orders through the website will be listed here.'}
                className="rounded-none border-0 bg-transparent"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Customers</caption>
                  <thead>
                    <tr>
                      <th className={th}>Customer</th>
                      <th className={th}>Contact</th>
                      <th className={cn(th, 'text-right')}>Orders</th>
                      <th className={cn(th, 'text-right')}>Tyres</th>
                      <th className={cn(th, 'text-right')}>Spent</th>
                      <th className={th}>Last order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((c) => (
                      <tr key={c.email} className="hover:bg-muted/30">
                        <td className={td}>
                          <p className="font-semibold">{c.name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{[c.company, c.suburb].filter(Boolean).join(' · ') || '—'}</p>
                          {c.subscribed ? (
                            <Badge size="sm" variant="outline" className="mt-1">
                              Newsletter
                            </Badge>
                          ) : null}
                        </td>
                        <td className={cn(td, 'text-xs')}>
                          <a className="flex items-center gap-1.5 hover:underline" href={`mailto:${c.email}`}>
                            <Mail aria-hidden="true" className="h-3 w-3" />
                            {c.email}
                          </a>
                          {c.phone ? (
                            <a className="mt-1 flex items-center gap-1.5 text-muted-foreground hover:underline" href={`tel:${c.phone.replace(/\s/g, '')}`}>
                              <Phone aria-hidden="true" className="h-3 w-3" />
                              {c.phone}
                            </a>
                          ) : null}
                        </td>
                        <td className={cn(td, 'text-right tabular-nums')}>{c.orders}</td>
                        <td className={cn(td, 'text-right tabular-nums')}>{c.tyres}</td>
                        <td className={cn(td, 'text-right font-semibold tabular-nums')}>{moneyExact(c.spent)}</td>
                        <td className={cn(td, 'whitespace-nowrap text-xs')}>
                          {stampLabel(c.lastOrder)}
                          <p className="font-mono text-muted-foreground">{c.references[0]}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        </div>
      )}
    </>
  )
}
