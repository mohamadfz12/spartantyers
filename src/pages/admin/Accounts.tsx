import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Download, Plus, Search, Unlink } from 'lucide-react'
import { Seo } from '@/components/Seo'
import { AdminEmpty, AdminError, AdminPanel } from '@/components/admin/AdminStates'
import { Tile, exportSheet, stampLabel, td } from '@/components/admin/AdminKit'
import { SortHeader, PlainHeader, nextSort, type SortState } from '@/components/admin/SortHeader'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { LevelBadge, StatusBadge } from '@/components/admin/accounts/parts'
import { NewAccountDialog } from '@/components/admin/accounts/NewAccountDialog'
import { Badge, Button, Input, Label, Skeleton } from '@/components/ui'
import { accountsApi, type StaffAccount } from '@/lib/admin-accounts-api'
import {
  FILTER_KEYS,
  FILTER_LABELS,
  LEVEL_LABELS,
  availableCredit,
  businessName,
  dollars,
  filterAccounts,
  filterCounts,
  payLaterLabel,
  percentLabel,
  sortAccounts,
  type AccountFilter,
  type AccountSortKey,
} from '@/lib/admin-accounts-ui'
import { cn, formatNumber } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Customer accounts
 *
 * Every customer who has a log-in to the website, at any level. Staff open
 * accounts, approve Bulk and Wholesaler requests and set agreed prices
 * here. Mohammad's "Customers" page (everyone who has ordered) is separate.
 * ------------------------------------------------------------------ */

const SORT_LABELS: Record<AccountSortKey, string> = {
  business: 'Business',
  email: 'Email',
  level: 'Level',
  requested: 'Requested',
  discount: 'Discount',
  payLater: 'Pay later',
  owing: 'Owing',
  status: 'Status',
  lastLogin: 'Last login',
}

const lastLogin = (a: StaffAccount) => (a.lastLoginAt ? stampLabel(a.lastLoginAt) : 'Never')

export default function Accounts() {
  const query = useAdminQuery('admin-accounts', (token) => accountsApi.list(token))
  const [filter, setFilter] = useState<AccountFilter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState<AccountSortKey>>({ key: 'business', direction: 'asc' })
  const [creating, setCreating] = useState(false)

  const accounts = query.data?.accounts ?? []
  const counts = useMemo(() => filterCounts(accounts), [accounts])

  const visible = useMemo(
    () => sortAccounts(filterAccounts(accounts, filter, search), sort.key, sort.direction),
    [accounts, filter, search, sort],
  )

  const onSort = (key: AccountSortKey, defaultDirection: 'asc' | 'desc') =>
    setSort((current) => nextSort(current, key, defaultDirection))

  const owingTotal = accounts.reduce((s, a) => s + a.outstanding, 0)
  const payLaterCount = accounts.filter((a) => a.payLater && a.status === 'active').length

  return (
    <>
      <Seo title="Customer accounts | Spartan Tyres admin" description="Customer accounts, levels, agreed prices and pay later." noIndex />

      {query.loading && !query.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Accounts" value={formatNumber(accounts.length)} icon={BadgeCheck} />
            <Tile
              label="Waiting for approval"
              value={formatNumber(counts.pending)}
              tone={counts.pending ? 'warn' : 'default'}
              hint={counts.pending ? 'Customers asking for Bulk or Wholesaler' : 'Nothing waiting'}
            />
            <Tile label="Pay later accounts" value={formatNumber(payLaterCount)} hint="Active accounts that can buy on account" />
            <Tile label="Owed on account" value={dollars(owingTotal)} tone={owingTotal ? 'warn' : 'default'} hint="Across every account" />
          </div>

          <AdminPanel
            title="Accounts"
            description={`${formatNumber(visible.length)} of ${formatNumber(accounts.length)}.`}
            bodyClassName="p-0 md:p-0"
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!visible.length}
                  onClick={() =>
                    exportSheet(
                      visible,
                      [
                        { column: 'Business', width: 28, value: (a) => businessName(a) },
                        { column: 'Contact', width: 22, value: (a) => a.name },
                        { column: 'Email', width: 30, value: (a) => a.email },
                        { column: 'Phone', width: 16, value: (a) => a.phone },
                        { column: 'ABN', width: 16, value: (a) => a.abn },
                        { column: 'Level', width: 12, value: (a) => LEVEL_LABELS[a.level] },
                        { column: 'Requested', width: 12, value: (a) => (a.requestedLevel ? LEVEL_LABELS[a.requestedLevel] : '') },
                        { column: 'Discount %', width: 10, number: true, format: '0.00', value: (a) => a.discountPct },
                        { column: 'Pay later', width: 12, value: (a) => (a.payLater ? 'On' : 'Off') },
                        { column: 'Terms (days)', width: 12, number: true, value: (a) => (a.payLater ? a.termsDays : null) },
                        { column: 'Credit limit', width: 13, number: true, format: '#,##0.00', value: (a) => (a.payLater ? a.creditLimit : null) },
                        { column: 'Owing', width: 12, number: true, format: '#,##0.00', value: (a) => a.outstanding },
                        { column: 'Available credit', width: 15, number: true, format: '#,##0.00', value: (a) => (a.payLater ? availableCredit(a) : null) },
                        { column: 'Status', width: 11, value: (a) => (a.status === 'active' ? 'Active' : 'Suspended') },
                        { column: 'Linked to till', width: 13, value: (a) => (a.posCustomerId ? 'Yes' : 'No') },
                        { column: 'Last login', width: 20, value: (a) => (a.lastLoginAt ? stampLabel(a.lastLoginAt) : 'Never') },
                      ],
                      'Spartan-Customer-Accounts',
                      'Accounts',
                    )
                  }
                >
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                  New account
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-3 border-b border-border p-4 md:px-5">
              <div role="group" aria-label="Filter accounts" className="flex flex-wrap gap-2">
                {FILTER_KEYS.map((key) => {
                  const active = filter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(key)}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
                      )}
                    >
                      {FILTER_LABELS[key]}
                      {key === 'all' || counts[key] > 0 ? (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none tabular-nums',
                            key === 'pending' && !active ? 'bg-amber-500 text-white' : active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                          )}
                          aria-label={`${counts[key]} accounts`}
                        >
                          {counts[key]}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="relative w-full max-w-sm">
                  <Label htmlFor="acct-search" className="sr-only">
                    Search accounts
                  </Label>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="acct-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, company, email, phone, ABN" className="pl-9" />
                </div>
                <div className="md:hidden">
                  <Label htmlFor="acct-sort" className="sr-only">
                    Sort accounts
                  </Label>
                  <select
                    id="acct-sort"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={`${sort.key}:${sort.direction}`}
                    onChange={(e) => {
                      const [key, direction] = e.target.value.split(':') as [AccountSortKey, 'asc' | 'desc']
                      setSort({ key, direction })
                    }}
                  >
                    {(Object.keys(SORT_LABELS) as AccountSortKey[]).flatMap((key) => [
                      <option key={`${key}:asc`} value={`${key}:asc`}>
                        {SORT_LABELS[key]} (A to Z)
                      </option>,
                      <option key={`${key}:desc`} value={`${key}:desc`}>
                        {SORT_LABELS[key]} (Z to A)
                      </option>,
                    ])}
                  </select>
                </div>
              </div>
            </div>

            {visible.length === 0 ? (
              <AdminEmpty
                title={accounts.length ? 'No accounts match' : 'No customer accounts yet'}
                icon={BadgeCheck}
                description={
                  accounts.length
                    ? 'Try a different filter or search.'
                    : 'Open one for a customer, or wait for customers to sign up on the website.'
                }
                action={
                  accounts.length ? undefined : (
                    <Button size="sm" onClick={() => setCreating(true)}>
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                      New account
                    </Button>
                  )
                }
                className="rounded-none border-0 bg-transparent"
              />
            ) : (
              <>
                {/* Phones: one card per account. */}
                <ul className="divide-y divide-border md:hidden">
                  {visible.map((a) => (
                    <li key={a.id}>
                      <Link
                        to={`/admin/accounts/${a.id}`}
                        className="flex flex-col gap-2 p-4 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words font-semibold">{businessName(a)}</p>
                            {a.company && a.name ? <p className="break-words text-xs text-muted-foreground">{a.name}</p> : null}
                            <p className="break-all text-xs text-muted-foreground">{a.email}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <LevelBadge level={a.level} />
                            <StatusBadge status={a.status} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {a.requestedLevel && a.requestedLevel !== a.level ? (
                            <Badge size="sm" variant="warning">
                              Wants {LEVEL_LABELS[a.requestedLevel]}
                            </Badge>
                          ) : null}
                          {!a.posCustomerId ? <NotLinked /> : null}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">Discount</dt>
                          <dd className="text-right tabular-nums">{percentLabel(a.discountPct)}</dd>
                          <dt className="text-muted-foreground">Pay later</dt>
                          <dd className="text-right">{payLaterLabel(a)}</dd>
                          <dt className="text-muted-foreground">Owing</dt>
                          <dd className="text-right tabular-nums">{dollars(a.outstanding)}</dd>
                          {a.payLater ? (
                            <>
                              <dt className="text-muted-foreground">Available</dt>
                              <dd className="text-right tabular-nums">{dollars(availableCredit(a))}</dd>
                            </>
                          ) : null}
                          <dt className="text-muted-foreground">Last login</dt>
                          <dd className="text-right">{lastLogin(a)}</dd>
                        </dl>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/* Tablets and desktops: a sortable table. */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">Customer accounts</caption>
                    <thead>
                      <tr>
                        <SortHeader sortKey="business" label="Business" sort={sort} onSort={onSort} />
                        <SortHeader sortKey="email" label="Email" sort={sort} onSort={onSort} />
                        <SortHeader sortKey="level" label="Level" sort={sort} onSort={onSort} />
                        <SortHeader sortKey="requested" label="Requested" sort={sort} onSort={onSort} />
                        <SortHeader sortKey="discount" label="Discount" sort={sort} onSort={onSort} defaultDirection="desc" numeric />
                        <SortHeader sortKey="payLater" label="Pay later" sort={sort} onSort={onSort} defaultDirection="desc" />
                        <SortHeader sortKey="owing" label="Owing" sort={sort} onSort={onSort} defaultDirection="desc" numeric srHint="and available credit" />
                        <SortHeader sortKey="status" label="Status" sort={sort} onSort={onSort} />
                        <SortHeader sortKey="lastLogin" label="Last login" sort={sort} onSort={onSort} defaultDirection="desc" />
                        <PlainHeader>
                          <span className="sr-only">Open</span>
                        </PlainHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((a) => (
                        <tr key={a.id} className="hover:bg-muted/30">
                          <td className={td}>
                            <Link
                              to={`/admin/accounts/${a.id}`}
                              className="font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {businessName(a)}
                            </Link>
                            {a.company && a.name ? <p className="text-xs text-muted-foreground">{a.name}</p> : null}
                            {!a.posCustomerId ? (
                              <div className="mt-1">
                                <NotLinked />
                              </div>
                            ) : null}
                          </td>
                          <td className={cn(td, 'break-all text-xs')}>{a.email}</td>
                          <td className={td}>
                            <LevelBadge level={a.level} />
                          </td>
                          <td className={td}>
                            {a.requestedLevel && a.requestedLevel !== a.level ? (
                              <Badge size="sm" variant="warning">
                                {LEVEL_LABELS[a.requestedLevel]}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </td>
                          <td className={cn(td, 'text-right tabular-nums')}>{percentLabel(a.discountPct)}</td>
                          <td className={cn(td, 'whitespace-nowrap text-xs')}>{payLaterLabel(a)}</td>
                          <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>
                            <span className={a.outstanding > 0 ? 'font-semibold' : undefined}>{dollars(a.outstanding)}</span>
                            {a.payLater ? <p className="text-xs text-muted-foreground">{dollars(availableCredit(a))} available</p> : null}
                          </td>
                          <td className={td}>
                            <StatusBadge status={a.status} />
                          </td>
                          <td className={cn(td, 'whitespace-nowrap text-xs')}>{lastLogin(a)}</td>
                          {/* Pinned to the right edge, so Open stays in view when the table scrolls sideways. */}
                          <td className={cn(td, 'sticky right-0 bg-card shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.45)]')}>
                            <Button variant="outline" size="sm" asChild>
                              <Link to={`/admin/accounts/${a.id}`} aria-label={`Open ${businessName(a)}`}>
                                Open
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </AdminPanel>
        </div>
      )}

      {creating ? <NewAccountDialog onClose={() => setCreating(false)} onCreated={query.reload} /> : null}
    </>
  )
}

function NotLinked() {
  return (
    <Badge size="sm" variant="outline" title="Not linked to a till customer yet">
      <Unlink aria-hidden="true" className="h-3 w-3" />
      Not linked
    </Badge>
  )
}
