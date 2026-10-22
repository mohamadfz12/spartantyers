import { useMemo, useState } from 'react'
import { Download, History, Search } from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import { exportSheet, selectClass, stampLabel, td, th } from '@/components/admin/AdminKit'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Input, Label, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Activity log
 *
 * Who did what, and when: sign-ins, price and stock changes, order
 * status, money recorded, staff changes. Written by the server as each
 * change is saved, so nobody can leave a change out of it.
 * ------------------------------------------------------------------ */

const AREAS: Record<string, string> = {
  auth: 'Sign-in',
  product: 'Products',
  order: 'Orders',
  stock: 'Inventory',
  ledger: 'Money',
  finance: 'Money',
  timesheet: 'Hours',
  staff: 'Staff',
}

const areaOf = (action: string) => AREAS[action.split('.')[0] ?? ''] ?? 'Other'

export default function Activity() {
  const query = useAdminQuery('admin-activity', (token) => api.admin.activity(token))
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('all')
  const [person, setPerson] = useState('all')

  const entries = query.data?.entries ?? []
  const people = useMemo(() => [...new Set(entries.map((e) => e.actorName))].sort(), [entries])
  const areas = useMemo(() => [...new Set(entries.map((e) => areaOf(e.action)))].sort(), [entries])

  const visible = entries.filter((entry) => {
    if (area !== 'all' && areaOf(entry.action) !== area) return false
    if (person !== 'all' && entry.actorName !== person) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${entry.detail} ${entry.actorName}`.toLowerCase().includes(needle)
  })

  if (query.notConfigured) return <AdminNotConfigured message={query.error ?? undefined} />

  return (
    <>
      <Seo title="Activity log — Spartan Tyres admin" description="Who changed what, and when." noIndex />

      {query.loading && !query.data ? (
        <Skeleton className="h-64" />
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : (
        <AdminPanel
          title="Activity log"
          description={
            query.data && query.data.total > entries.length
              ? `The newest ${formatNumber(entries.length)} of ${formatNumber(query.data.total)} changes.`
              : `${formatNumber(entries.length)} changes recorded.`
          }
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
                    { column: 'When', width: 22, value: (e) => stampLabel(e.at) },
                    { column: 'Who', width: 20, value: (e) => e.actorName },
                    { column: 'Area', width: 12, value: (e) => areaOf(e.action) },
                    { column: 'What', width: 70, value: (e) => e.detail },
                  ],
                  'Spartan-Activity',
                  'Activity',
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
              <Label htmlFor="act-search" className="sr-only">
                Search the log
              </Label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="act-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="SKU, order ref, name…" className="pl-9" />
            </div>
            <Label htmlFor="act-area" className="sr-only">
              Area
            </Label>
            <select id="act-area" className={selectClass} value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="all">Every area</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <Label htmlFor="act-person" className="sr-only">
              Person
            </Label>
            <select id="act-person" className={selectClass} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

          {visible.length === 0 ? (
            <AdminEmpty title="Nothing logged here" icon={History} description="Changes made in the admin are recorded here as they happen." className="rounded-none border-0 bg-transparent" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">Activity, newest first</caption>
                <thead>
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Who</th>
                    <th className={th}>Area</th>
                    <th className={th}>What</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/30">
                      <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{stampLabel(entry.at)}</td>
                      <td className={cn(td, 'whitespace-nowrap font-semibold')}>{entry.actorName}</td>
                      <td className={td}>
                        <Badge size="sm" variant="outline">
                          {areaOf(entry.action)}
                        </Badge>
                      </td>
                      <td className={td}>{entry.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      )}
    </>
  )
}
