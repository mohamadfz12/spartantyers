import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Search,
  Target,
  Users,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Input, Label, Select, Skeleton, Textarea } from '@/components/ui'
import {
  api,
  type Lead,
  type LeadCategory,
  type LeadRegion,
  type LeadStatus,
  type LeadStatusPatch,
  type LeadStatusValue,
} from '@/lib/api'
import { cn, formatDate, formatNumber } from '@/lib/utils'
import { adminToken, handleAdminError } from '@/store/admin'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

const REGIONS: LeadRegion[] = ['Metro', 'N NSW', 'W NSW', 'S NSW']
const REGION_LABEL: Record<LeadRegion, string> = {
  Metro: 'Sydney Metro',
  'N NSW': 'Northern NSW',
  'W NSW': 'Western NSW',
  'S NSW': 'Southern NSW',
}
const CATEGORIES: LeadCategory[] = ['Transport', 'Truck Tyre Reseller']
const SIZES = ['Large', 'Medium', 'Small'] as const
const EMPLOYEES = ['50+', '30–50', '10–30', '<10'] as const
const PRIORITIES = ['A', 'B', 'C'] as const
const STATUSES: LeadStatusValue[] = [
  'New',
  'Called',
  'Interested',
  'Quote sent',
  'Customer',
  'Not interested',
  'Wrong number',
]

const STATUS_TONE: Record<LeadStatusValue, 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  New: 'outline',
  Called: 'default',
  Interested: 'primary',
  'Quote sent': 'warning',
  Customer: 'success',
  'Not interested': 'destructive',
  'Wrong number': 'destructive',
}

const PAGE_SIZE = 50

type ContactFilter = 'any' | 'email' | 'phone' | 'both'
type SortKey = 'priority' | 'name' | 'location' | 'size'

interface Filters {
  search: string
  category: LeadCategory | 'all'
  region: LeadRegion | 'all'
  area: string
  city: string
  size: string
  employees: string
  priority: string
  status: LeadStatusValue | 'all' | 'contacted'
  contact: ContactFilter
  sort: SortKey
}

const EMPTY_FILTERS: Filters = {
  search: '',
  category: 'all',
  region: 'all',
  area: '',
  city: '',
  size: '',
  employees: '',
  priority: '',
  status: 'all',
  contact: 'any',
  sort: 'priority',
}

const NEW_STATUS: LeadStatus = { status: 'New', notes: '', updatedAt: '' }

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function Leads() {
  const query = useAdminQuery('admin-leads', (token) => api.admin.leads(token))
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const leads = query.data?.leads ?? []
  const statuses = query.data?.statuses ?? {}
  const statusOf = (key: string) => statuses[key] ?? NEW_STATUS

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
    setOpen(null)
  }

  /* ---- filtering ------------------------------------------------- */

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')

    const rows = leads.filter((lead) => {
      if (filters.category !== 'all' && lead.category !== filters.category) return false
      if (filters.region !== 'all' && lead.region !== filters.region) return false
      if (filters.area && lead.area !== filters.area) return false
      if (filters.city && lead.city !== filters.city) return false
      if (filters.size && lead.size !== filters.size) return false
      if (filters.employees && lead.employees !== filters.employees) return false
      if (filters.priority && lead.priority !== filters.priority) return false

      const status = (statuses[lead.key] ?? NEW_STATUS).status
      if (filters.status === 'contacted' && status === 'New') return false
      if (filters.status !== 'all' && filters.status !== 'contacted' && status !== filters.status) {
        return false
      }

      const hasEmail = lead.emails.length > 0
      const hasPhone = lead.phones.length > 0
      if (filters.contact === 'email' && !hasEmail) return false
      if (filters.contact === 'phone' && !hasPhone) return false
      if (filters.contact === 'both' && !(hasEmail && hasPhone)) return false

      if (term) {
        const haystack = [
          lead.name, lead.subtype, lead.city, lead.area, lead.description, lead.website,
          lead.address, lead.other_contacts, ...lead.emails, statuses[lead.key]?.notes ?? '',
        ]
          .join(' ')
          .toLowerCase()
        const phoneHit =
          digits.length >= 4 && lead.phones.some((p) => p.replace(/\D/g, '').includes(digits))
        if (!haystack.includes(term) && !phoneHit) return false
      }
      return true
    })

    const sizeRank = (s: string) => (s === 'Large' ? 0 : s === 'Medium' ? 1 : s === 'Small' ? 2 : 3)
    return rows.sort((a, b) => {
      switch (filters.sort) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'location':
          return (
            REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) ||
            a.area.localeCompare(b.area) ||
            a.city.localeCompare(b.city) ||
            a.name.localeCompare(b.name)
          )
        case 'size':
          return sizeRank(a.size) - sizeRank(b.size) || a.name.localeCompare(b.name)
        default:
          return (
            a.priority.localeCompare(b.priority) ||
            sizeRank(a.size) - sizeRank(b.size) ||
            b.emails.length - a.emails.length ||
            a.name.localeCompare(b.name)
          )
      }
    })
  }, [leads, statuses, filters])

  /* ---- facets: counts reflect every filter except their own ------ */

  const scope = useMemo(
    () =>
      leads.filter(
        (lead) =>
          (filters.category === 'all' || lead.category === filters.category) &&
          (filters.region === 'all' || lead.region === filters.region),
      ),
    [leads, filters.category, filters.region],
  )

  const areas = useMemo(() => tally(scope.map((l) => l.area)), [scope])
  const cities = useMemo(
    () => tally(scope.filter((l) => !filters.area || l.area === filters.area).map((l) => l.city)),
    [scope, filters.area],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const activeFilters =
    JSON.stringify({ ...filters, sort: 'priority' }) !== JSON.stringify(EMPTY_FILTERS)

  /* ---- status + notes -------------------------------------------- */

  async function saveStatus(lead: Lead, patch: LeadStatusPatch) {
    const token = adminToken()
    if (!token) return
    const previous = statuses[lead.key]
    const { researchHours, ...rest } = patch
    const optimistic: LeadStatus = {
      ...(previous ?? NEW_STATUS),
      ...rest,
      updatedAt: new Date().toISOString(),
    }
    if (researchHours === null) delete optimistic.researchHours
    else if (researchHours !== undefined) optimistic.researchHours = researchHours
    query.patch((data) => ({ ...data, statuses: { ...data.statuses, [lead.key]: optimistic } }))
    try {
      const { status } = await api.admin.updateLead(token, lead.key, patch)
      query.patch((data) => ({ ...data, statuses: { ...data.statuses, [lead.key]: status } }))
      toast({
        title:
          patch.researchHours !== undefined
            ? status.researchHours
              ? `Research time: ${hoursLabel(status.researchHours)}`
              : 'Research time cleared'
            : patch.notes !== undefined
              ? 'Notes saved'
              : `Marked “${status.status}”`,
        description: lead.name,
        variant: 'success',
      })
    } catch (error) {
      // Roll back to exactly what was there before the edit.
      query.patch((data) => {
        const next = { ...data.statuses }
        if (previous) next[lead.key] = previous
        else delete next[lead.key]
        return { ...data, statuses: next }
      })
      const failure = handleAdminError(error)
      toast({ title: 'Not saved', description: failure.message, variant: 'error' })
    }
  }

  async function exportExcel() {
    setExporting(true)
    try {
      await exportLeads(filtered, statusOf)
      toast({
        title: 'Excel file downloaded',
        description: `${formatNumber(filtered.length)} leads`,
        variant: 'success',
      })
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  /* ---- render ---------------------------------------------------- */

  const seo = (
    <Seo
      title="Leads — Spartan Tyres admin"
      description="NSW transport operators and truck tyre resellers."
      noIndex
    />
  )

  if (query.notConfigured) {
    return (
      <>
        {seo}
        <AdminNotConfigured message={query.error ?? undefined} />
      </>
    )
  }

  return (
    <>
      {seo}

      <div className="flex flex-col gap-6">
        {/* Summary */}
        {query.loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : leads.length ? (
          <Summary leads={leads} statusOf={statusOf} />
        ) : null}

        {!query.loading && leads.length ? (
          <RegionGrid
            leads={leads}
            filters={filters}
            onPick={(category, region) => update({ category, region, area: '', city: '' })}
          />
        ) : null}

        <AdminPanel
          title="NSW leads"
          description={
            query.data
              ? `${formatNumber(filtered.length)} of ${formatNumber(leads.length)} leads${
                  query.data.importedAt ? ` · list imported ${formatDate(query.data.importedAt)}` : ''
                }. Open a lead for every phone number and email; set its status as you work through it.`
              : 'Transport operators and truck tyre resellers across NSW.'
          }
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={exportExcel}
              loading={exporting}
              disabled={!filtered.length}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export to Excel
            </Button>
          }
          bodyClassName="p-0 md:p-0"
        >
          <FilterBar
            filters={filters}
            update={update}
            areas={areas}
            cities={cities}
            activeFilters={activeFilters}
            onClear={() => update(EMPTY_FILTERS)}
          />

          {query.loading ? (
            <div className="space-y-2 p-4 md:p-5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : query.error ? (
            <div className="p-4 md:p-5">
              <AdminError message={query.error} onRetry={query.reload} />
            </div>
          ) : leads.length === 0 ? (
            <AdminEmpty
              title="No leads loaded yet"
              icon={Target}
              description="The lead list is loaded into the database from the research files on the office computer: run “npm run import:leads” in the project folder, then refresh this page."
            />
          ) : filtered.length === 0 ? (
            <AdminEmpty
              title="No leads match these filters"
              icon={Search}
              description="Loosen a filter or clear them all to see the full list."
              action={
                <Button size="sm" variant="outline" onClick={() => update(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <p aria-live="polite" className="sr-only">
                {formatNumber(filtered.length)} leads shown
              </p>

              <ul className="divide-y divide-border">
                {visible.map((lead) => (
                  <LeadRow
                    key={lead.key}
                    lead={lead}
                    status={statusOf(lead.key)}
                    expanded={open === lead.key}
                    onToggle={() => setOpen((current) => (current === lead.key ? null : lead.key))}
                    onStatus={(status) => saveStatus(lead, { status })}
                    onNotes={(notes) => saveStatus(lead, { notes })}
                    onResearch={(researchHours) => saveStatus(lead, { researchHours })}
                  />
                ))}
              </ul>

              {pageCount > 1 ? (
                <nav
                  aria-label="Lead pages"
                  className="flex items-center justify-between gap-3 border-t border-border p-4 md:px-5"
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => {
                      setPage((p) => p - 1)
                      setOpen(null)
                    }}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Page {page + 1} of {pageCount} · leads {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, filtered.length)}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= pageCount - 1}
                    onClick={() => {
                      setPage((p) => p + 1)
                      setOpen(null)
                    }}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </AdminPanel>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Summary tiles
 * ------------------------------------------------------------------ */

function Summary({
  leads,
  statusOf,
}: {
  leads: Lead[]
  statusOf: (key: string) => LeadStatus
}) {
  const count = (pred: (l: Lead) => boolean) => leads.filter(pred).length
  const tiles = [
    { label: 'Total leads', value: leads.length, hint: 'Across all of NSW' },
    { label: 'Transport', value: count((l) => l.category === 'Transport'), hint: 'Operators running trucks' },
    {
      label: 'Tyre resellers',
      value: count((l) => l.category === 'Truck Tyre Reseller'),
      hint: 'Shops, chains, retreaders',
    },
    { label: 'Priority A', value: count((l) => l.priority === 'A'), hint: 'Best potential, reachable' },
    { label: 'With email', value: count((l) => l.emails.length > 0), hint: 'Ready for an email campaign' },
    {
      label: 'Contacted',
      value: count((l) => statusOf(l.key).status !== 'New'),
      hint: `${count((l) => statusOf(l.key).status === 'Customer')} now customers`,
    },
  ]
  const researched = leads.filter((l) => statusOf(l.key).researchHours)
  const researchTotal = researched.reduce((sum, l) => sum + (statusOf(l.key).researchHours ?? 0), 0)

  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border bg-card p-4">
          <dt className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
            {tile.label}
          </dt>
          <dd className="mt-1 font-heading text-2xl font-black">{formatNumber(tile.value)}</dd>
          <dd className="text-xs text-muted-foreground">{tile.hint}</dd>
        </div>
      ))}
      <div className="rounded-lg border border-border bg-card p-4">
        <dt className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
          Research time
        </dt>
        <dd className="mt-1 font-heading text-2xl font-black">{hoursLabel(researchTotal)}</dd>
        <dd className="text-xs text-muted-foreground">
          {researched.length
            ? `Across ${formatNumber(researched.length)} ${researched.length === 1 ? 'company' : 'companies'}`
            : 'Add it on a lead, under Sales progress'}
        </dd>
      </div>
    </dl>
  )
}

/* ------------------------------------------------------------------ *
 * Region × category grid — click a cell to filter
 * ------------------------------------------------------------------ */

function RegionGrid({
  leads,
  filters,
  onPick,
}: {
  leads: Lead[]
  filters: Filters
  onPick: (category: Filters['category'], region: Filters['region']) => void
}) {
  const n = (category: LeadCategory | 'all', region: LeadRegion | 'all') =>
    leads.filter(
      (l) => (category === 'all' || l.category === category) && (region === 'all' || l.region === region),
    ).length

  const cell = (category: Filters['category'], region: Filters['region']) => {
    const active = filters.category === category && filters.region === region
    return (
      <button
        type="button"
        onClick={() => onPick(category, region)}
        aria-pressed={active}
        className={cn(
          'w-full rounded-md px-2 py-2 text-right font-heading text-sm font-bold tabular-nums transition-colors',
          active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
        )}
      >
        {formatNumber(n(category, region))}
      </button>
    )
  }

  return (
    <AdminPanel
      title="By region"
      description="Click any number to show exactly those leads."
      bodyClassName="overflow-x-auto"
    >
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Category
            </th>
            {REGIONS.map((region) => (
              <th key={region} scope="col" className="px-1 py-2 text-right font-semibold">
                {REGION_LABEL[region]}
              </th>
            ))}
            <th scope="col" className="px-1 py-2 text-right font-semibold">
              All NSW
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {[...CATEGORIES, 'all' as const].map((category) => (
            <tr key={category}>
              <th scope="row" className="py-1 pr-3 text-left font-semibold">
                {category === 'all' ? 'All leads' : category === 'Transport' ? 'Transport' : 'Truck tyre resellers'}
              </th>
              {REGIONS.map((region) => (
                <td key={region} className="px-1 py-1">
                  {cell(category, region)}
                </td>
              ))}
              <td className="px-1 py-1">{cell(category, 'all')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

function FilterBar({
  filters,
  update,
  areas,
  cities,
  activeFilters,
  onClear,
}: {
  filters: Filters
  update: (patch: Partial<Filters>) => void
  areas: Array<[string, number]>
  cities: Array<[string, number]>
  activeFilters: boolean
  onClear: () => void
}) {
  return (
    <div className="space-y-3 border-b border-border p-4 md:px-5">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Label htmlFor="lead-search" className="sr-only">
            Search leads
          </Label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="lead-search"
            type="search"
            value={filters.search}
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Company, town, phone, email, type, notes…"
            className="pl-9"
          />
        </div>

        <div role="group" aria-label="Category" className="flex shrink-0 rounded-md border border-border p-0.5">
          {(['all', ...CATEGORIES] as const).map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={filters.category === category}
              onClick={() => update({ category, area: '', city: '' })}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors',
                filters.category === category
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {category === 'all' ? 'All' : category === 'Transport' ? 'Transport' : 'Tyre resellers'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <FilterSelect
          label="Region"
          value={filters.region === 'all' ? '' : filters.region}
          onChange={(v) => update({ region: (v || 'all') as Filters['region'], area: '', city: '' })}
          options={REGIONS.map((r) => [r, REGION_LABEL[r]])}
          all="All regions"
        />
        <FilterSelect
          label="Area"
          value={filters.area}
          onChange={(v) => update({ area: v, city: '' })}
          options={areas.map(([a, c]) => [a, `${a} (${c})`])}
          all="All areas"
        />
        <FilterSelect
          label="City / town"
          value={filters.city}
          onChange={(v) => update({ city: v })}
          options={cities.map(([c, n]) => [c, `${c} (${n})`])}
          all="All towns"
        />
        <FilterSelect
          label="Potential"
          value={filters.size}
          onChange={(v) => update({ size: v })}
          options={SIZES.map((s) => [s, s])}
          all="Any size"
        />
        <FilterSelect
          label="Employees"
          value={filters.employees}
          onChange={(v) => update({ employees: v })}
          options={EMPLOYEES.map((e) => [e, e])}
          all="Any"
        />
        <FilterSelect
          label="Priority"
          value={filters.priority}
          onChange={(v) => update({ priority: v })}
          options={PRIORITIES.map((p) => [p, `Priority ${p}`])}
          all="Any priority"
        />
        <FilterSelect
          label="Contact details"
          value={filters.contact === 'any' ? '' : filters.contact}
          onChange={(v) => update({ contact: (v || 'any') as ContactFilter })}
          options={[
            ['email', 'Has email'],
            ['phone', 'Has phone'],
            ['both', 'Phone + email'],
          ]}
          all="Any"
        />
        <FilterSelect
          label="Sales status"
          value={filters.status === 'all' ? '' : filters.status}
          onChange={(v) => update({ status: (v || 'all') as Filters['status'] })}
          options={[['contacted', 'Any contacted'], ...STATUSES.map((s) => [s, s] as [string, string])]}
          all="Any status"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="lead-sort" className="text-xs text-muted-foreground">
            Sort
          </Label>
          <Select
            id="lead-sort"
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value as SortKey })}
            className="h-8 w-auto py-0 text-xs"
          >
            <option value="priority">Best prospects first</option>
            <option value="size">Biggest first</option>
            <option value="location">By location</option>
            <option value="name">A–Z</option>
          </Select>
        </div>
        {activeFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Clear all filters
          </button>
        ) : null}
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
  all: string
}) {
  const id = `lead-filter-${label.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-9 w-full text-sm', value && 'border-primary')}
      >
        <option value="">{all}</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </Select>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * One lead
 * ------------------------------------------------------------------ */

function LeadRow({
  lead,
  status,
  expanded,
  onToggle,
  onStatus,
  onNotes,
  onResearch,
}: {
  lead: Lead
  status: LeadStatus
  expanded: boolean
  onToggle: () => void
  onStatus: (status: LeadStatusValue) => void
  onNotes: (notes: string) => void
  onResearch: (hours: number | null) => void
}) {
  const panelId = `lead-${lead.key}`

  return (
    <li className={cn(expanded && 'bg-muted/40')}>
      <div className="flex items-start gap-3 p-4 md:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            aria-label={`Priority ${lead.priority}`}
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-heading text-xs font-black',
              lead.priority === 'A'
                ? 'bg-primary text-primary-foreground'
                : lead.priority === 'B'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {lead.priority}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-heading text-sm font-bold">{lead.name}</span>
              <Badge variant="outline" size="sm">
                {lead.category === 'Transport' ? 'Transport' : 'Tyre reseller'}
              </Badge>
              {lead.size ? (
                <Badge variant={lead.size === 'Large' ? 'primary' : 'default'} size="sm">
                  {lead.size}
                </Badge>
              ) : null}
              {status.researchHours ? (
                <Badge variant="outline" size="sm" title="Time spent researching this company">
                  <Clock aria-hidden="true" className="h-3 w-3" />
                  {hoursLabel(status.researchHours)} research
                </Badge>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {lead.subtype}
              {lead.subtype ? ' · ' : ''}
              {lead.city}, {lead.area} · {lead.region}
              {lead.employees ? ` · ${lead.employees} staff` : ''}
            </span>
            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              {lead.phones[0] ? (
                <span className="flex items-center gap-1">
                  <Phone aria-hidden="true" className="h-3 w-3 text-primary" />
                  {lead.phones[0]}
                  {lead.phones.length > 1 ? (
                    <span className="text-muted-foreground"> +{lead.phones.length - 1}</span>
                  ) : null}
                </span>
              ) : null}
              {lead.emails[0] ? (
                <span className="flex min-w-0 items-center gap-1">
                  <Mail aria-hidden="true" className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">{lead.emails[0]}</span>
                  {lead.emails.length > 1 ? (
                    <span className="text-muted-foreground"> +{lead.emails.length - 1}</span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={STATUS_TONE[status.status]} size="sm">
            {status.status}
          </Badge>
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </div>

      {expanded ? (
        <div id={panelId} className="grid gap-5 px-4 pb-5 md:grid-cols-[1.4fr_1fr] md:px-5">
          <div className="space-y-4 text-sm">
            {lead.description ? <p className="leading-relaxed">{lead.description}</p> : null}

            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <Detail label="Phone numbers">
                {lead.phones.length ? (
                  <ul className="space-y-0.5">
                    {lead.phones.map((phone) => (
                      <li key={phone}>
                        <a
                          className="font-semibold text-primary hover:underline"
                          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                        >
                          {phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">None found</span>
                )}
              </Detail>

              <Detail label="Emails">
                {lead.emails.length ? (
                  <ul className="space-y-0.5">
                    {lead.emails.map((email) => (
                      <li key={email} className="break-all">
                        <a className="font-semibold text-primary hover:underline" href={`mailto:${email}`}>
                          {email}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">None found</span>
                )}
              </Detail>

              {lead.address ? (
                <Detail label="Address">
                  <a
                    className="inline-flex items-start gap-1 hover:text-primary"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {lead.address}
                  </a>
                </Detail>
              ) : null}

              <Detail label="Location">
                {lead.city} · {lead.area} · {REGION_LABEL[lead.region]}
              </Detail>

              {lead.other_contacts ? <Detail label="People / other contacts">{lead.other_contacts}</Detail> : null}

              <Detail label="Potential">
                {[lead.size, lead.employees && `${lead.employees} employees`, lead.fleet]
                  .filter(Boolean)
                  .join(' · ') || 'Not assessed'}
                {lead.size_basis ? (
                  <span className="block text-xs text-muted-foreground">Basis: {lead.size_basis}</span>
                ) : null}
              </Detail>
            </dl>

            <div className="flex flex-wrap gap-2">
              {lead.website ? (
                <Button asChild size="sm" variant="outline">
                  <a href={lead.website} target="_blank" rel="noopener noreferrer">
                    Website
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : null}
              {lead.contact_page && lead.contact_page !== lead.website ? (
                <Button asChild size="sm" variant="outline">
                  <a href={lead.contact_page} target="_blank" rel="noopener noreferrer">
                    Contact page
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : null}
              {lead.source && lead.source !== lead.website ? (
                <Button asChild size="sm" variant="ghost">
                  <a href={lead.source} target="_blank" rel="noopener noreferrer">
                    Source
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <SalesBox status={status} onStatus={onStatus} onNotes={onNotes} onResearch={onResearch} />
        </div>
      ) : null}
    </li>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

function SalesBox({
  status,
  onStatus,
  onNotes,
  onResearch,
}: {
  status: LeadStatus
  onStatus: (status: LeadStatusValue) => void
  onNotes: (notes: string) => void
  onResearch: (hours: number | null) => void
}) {
  const [draft, setDraft] = useState(status.notes)
  const dirty = draft !== status.notes
  const [hours, setHours] = useState(status.researchHours != null ? String(status.researchHours) : '')
  const parsedHours = hours.trim() === '' ? null : Number(hours)
  const hoursValid = parsedHours === null || (Number.isFinite(parsedHours) && parsedHours > 0 && parsedHours <= 1000)
  const hoursDirty = parsedHours !== (status.researchHours ?? null)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Users aria-hidden="true" className="h-4 w-4 text-primary" />
        <h3 className="font-heading text-xs font-bold uppercase tracking-wide">Sales progress</h3>
      </div>

      <div>
        <Label htmlFor="lead-status" className="mb-1 block text-xs text-muted-foreground">
          Status
        </Label>
        <Select
          id="lead-status"
          value={status.status}
          onChange={(event) => onStatus(event.target.value as LeadStatusValue)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="lead-notes" className="mb-1 block text-xs text-muted-foreground">
          Notes
        </Label>
        <Textarea
          id="lead-notes"
          rows={4}
          maxLength={4000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Who you spoke to, what they run, when to follow up…"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {status.updatedAt ? `Updated ${formatDate(status.updatedAt)}` : 'Not contacted yet'}
          </span>
          <Button size="sm" disabled={!dirty} onClick={() => onNotes(draft)}>
            Save notes
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="lead-research" className="mb-1 block text-xs text-muted-foreground">
          Research time (hours)
        </Label>
        <div className="flex items-start gap-2">
          <Input
            id="lead-research"
            type="number"
            inputMode="decimal"
            min={0.25}
            max={1000}
            step={0.25}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="e.g. 8"
            aria-invalid={!hoursValid}
            aria-describedby="lead-research-hint"
          />
          <Button size="sm" variant="outline" className="h-10 shrink-0" disabled={!hoursDirty || !hoursValid} onClick={() => onResearch(parsedHours)}>
            Save
          </Button>
        </div>
        <p id="lead-research-hint" className="mt-1 text-xs text-muted-foreground">
          {hoursValid ? 'How long researching this company took. Leave empty to clear.' : 'Enter hours between 0.25 and 1000.'}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** "8 hrs", "1 hr", "2.5 hrs", "0 hrs". */
function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100
  return `${formatNumber(rounded)} ${rounded === 1 ? 'hr' : 'hrs'}`
}

function tally(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

/**
 * Downloads exactly the filtered leads as a real .xlsx. The writer is loaded
 * only now, so the admin bundle does not carry it until someone exports.
 */
async function exportLeads(rows: Lead[], statusOf: (key: string) => LeadStatus) {
  const { default: writeXlsxFile } = await import('write-excel-file')
  const col = (column: string, width: number, value: (l: Lead) => string, wrap = false) => ({
    column,
    width,
    type: String,
    wrap,
    value: (l: Lead) => value(l) || null,
  })

  const schema = [
    col('Company', 34, (l) => l.name),
    col('Category', 18, (l) => l.category),
    col('Type', 24, (l) => l.subtype),
    col('Region', 10, (l) => l.region),
    col('Area', 22, (l) => l.area),
    col('City / Suburb', 20, (l) => l.city),
    col('Address', 38, (l) => l.address, true),
    col('Potential', 10, (l) => l.size),
    col('Employees', 11, (l) => l.employees),
    col('Fleet / Scale', 22, (l) => l.fleet, true),
    col('Priority', 9, (l) => l.priority),
    col('Phone 1', 18, (l) => l.phones[0] ?? ''),
    col('Phone 2', 18, (l) => l.phones[1] ?? ''),
    col('Other phones', 26, (l) => l.phones.slice(2).join(' · ')),
    col('Email 1', 32, (l) => l.emails[0] ?? ''),
    col('Other emails', 36, (l) => l.emails.slice(1).join(' · ')),
    col('Website', 34, (l) => l.website),
    col('Contact page', 34, (l) => l.contact_page),
    col('Description', 60, (l) => l.description, true),
    col('Other contacts / people', 40, (l) => l.other_contacts, true),
    col('Status', 14, (l) => statusOf(l.key).status),
    col('Notes', 40, (l) => statusOf(l.key).notes, true),
    col('Research hours', 14, (l) => {
      const hours = statusOf(l.key).researchHours
      return hours ? String(hours) : ''
    }),
    col('Source', 34, (l) => l.source),
  ]

  // Local date, not UTC: in Sydney the UTC date is yesterday until 10–11am.
  const now = new Date()
  const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')
  await writeXlsxFile(rows, {
    schema,
    fileName: `Spartan-Tyres-NSW-Leads-${stamp}.xlsx`,
    sheet: 'Leads',
    stickyRowsCount: 1,
    getHeaderStyle: () => ({
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#1a1a1a',
    }),
  })
}
