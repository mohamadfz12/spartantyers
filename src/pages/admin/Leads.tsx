import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
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
  Input,
  Label,
  Progress,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { fieldSkin } from '@/components/ui/input'
import { useEscapeKey, useOnClickOutside, useReducedMotion } from '@/hooks'
import {
  ApiError,
  api,
  type Lead,
  type LeadCategory,
  type LeadRegion,
  type LeadStatus,
  type LeadStatusPatch,
  type LeadStatusValue,
} from '@/lib/api'
import {
  PLAN_DAYS,
  PLAN_LIMITS,
  addDays,
  dayLabel,
  isDay,
  isPlanDay,
  leadsInTowns,
  listNames,
  nextMonday,
  planProgress,
  sortPlans,
  sortTowns,
  sydneyToday,
  townClashes,
  weekLabel,
  weekStart,
  type LeadPlan,
  type LeadPlanInput,
} from '@/lib/lead-plans'
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
  /** Towns ticked in the City / town box; empty means every town. */
  cities: string[]
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
  cities: [],
  size: '',
  employees: '',
  priority: '',
  status: 'all',
  contact: 'any',
  sort: 'priority',
}

const NEW_STATUS: LeadStatus = { status: 'New', notes: '', updatedAt: '' }

/** What the plan window opens with: a new plan, or one being changed (`id`). */
interface PlanDraft extends LeadPlanInput {
  id?: string
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function Leads() {
  const query = useAdminQuery('admin-leads', (token) => api.admin.leads(token))
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const reduced = useReducedMotion()

  const today = sydneyToday()
  /** The day plan being worked through; its towns are the town filter while it is open. */
  const [planId, setPlanId] = useState<string | null>(null)
  /** The Monday of the week shown in the work plan. */
  const [weekOf, setWeekOf] = useState(() => weekStart(sydneyToday()))
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  /** New on every opening, so the form inside always starts from its draft. */
  const [draftKey, setDraftKey] = useState(0)
  /** A save or delete is on its way: the plan window cannot be closed until it answers. */
  const [planBusy, setPlanBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  /** The current open plan, for answers that arrive after a re-render. */
  const planIdRef = useRef(planId)
  planIdRef.current = planId
  /** The day whose column takes focus when the plan window closes and its opener has gone. */
  const focusDayAfterClose = useRef<string | null>(null)

  const leads = query.data?.leads ?? []
  const statuses = query.data?.statuses ?? {}
  const statusOf = (key: string) => statuses[key] ?? NEW_STATUS
  const plans = query.data?.plans ?? []
  const people = query.data?.people ?? []
  const activePlan = planId ? plans.find((plan) => plan.id === planId) ?? null : null

  // Runs after the window has given focus back to the button that opened it. When that
  // button no longer exists (its plan was deleted, or the day view replaced it), focus
  // goes to the plan's day in the work plan instead of being lost.
  useEffect(() => {
    const day = focusDayAfterClose.current
    if (planDialogOpen || !day) return
    focusDayAfterClose.current = null
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active && active !== document.body) return
      const target =
        document.querySelector<HTMLElement>(`[data-plan-day="${day}"]`) ??
        document.getElementById('lead-work-plan-week')
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [planDialogOpen])

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
    setOpen(null)
    // Changing where you look means you are no longer working through the day.
    if ('cities' in patch || 'region' in patch || 'area' in patch || 'category' in patch) setPlanId(null)
  }

  /* ---- day plans -------------------------------------------------- */

  function openPlan(plan: LeadPlan) {
    if (plan.id === planId) {
      closePlan()
      return
    }
    setFilters((current) => ({ ...EMPTY_FILTERS, sort: current.sort, cities: plan.towns }))
    setPlanId(plan.id)
    setPage(0)
    setOpen(null)
    requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }),
    )
  }

  function closePlan() {
    setFilters((current) => ({ ...EMPTY_FILTERS, sort: current.sort }))
    setPlanId(null)
    setPage(0)
    setOpen(null)
  }

  function startPlan(next: PlanDraft) {
    setDraft(next)
    setDraftKey((n) => n + 1)
    setPlanDialogOpen(true)
  }

  /**
   * Saves the plan; returns a message to show in the window when it fails. A new plan
   * for exactly the towns already ticked opens straight away: the list already shows
   * its leads, and the day banner replaces the "Plan a day" bar, so it cannot be
   * planned twice by accident.
   */
  async function savePlan(input: PlanDraft): Promise<string | null> {
    const token = adminToken()
    if (!token) return 'Your session has ended. Sign in again.'
    setPlanBusy(true)
    try {
      const { plan } = await api.admin.saveLeadPlan(token, input)
      query.patch((data) => ({
        ...data,
        plans: sortPlans([...data.plans.filter((p) => p.id !== plan.id), plan]),
      }))
      setWeekOf(weekStart(plan.date))
      const sameTowns = sameList(plan.towns, filters.cities)
      if (plan.id === planIdRef.current) {
        setFilters((current) => ({ ...current, cities: plan.towns }))
        setPage(0)
      } else if (!input.id && !planIdRef.current && sameTowns) {
        setFilters((current) => ({ ...current, cities: plan.towns }))
        setPlanId(plan.id)
        setPage(0)
        setOpen(null)
      }
      focusDayAfterClose.current = plan.date
      setPlanDialogOpen(false)
      toast({
        title: input.id ? 'Plan changed' : 'Day planned',
        description: `${dayLabel(plan.date, 'long')}: ${listNames(plan.towns)}`,
        variant: 'success',
      })
      return null
    } catch (error) {
      return handleAdminError(error).message
    } finally {
      setPlanBusy(false)
    }
  }

  async function deletePlan(plan: LeadPlan): Promise<string | null> {
    const token = adminToken()
    if (!token) return 'Your session has ended. Sign in again.'
    setPlanBusy(true)
    try {
      await api.admin.deleteLeadPlan(token, plan.id)
    } catch (error) {
      // Already gone (someone else deleted it): the result is the same.
      if (!(error instanceof ApiError && error.status === 404)) {
        setPlanBusy(false)
        return handleAdminError(error).message
      }
    }
    query.patch((data) => ({ ...data, plans: data.plans.filter((p) => p.id !== plan.id) }))
    if (plan.id === planIdRef.current) closePlan()
    focusDayAfterClose.current = plan.date
    setPlanBusy(false)
    setPlanDialogOpen(false)
    toast({ title: 'Plan deleted', description: dayLabel(plan.date, 'long'), variant: 'success' })
    return null
  }

  /* ---- filtering ------------------------------------------------- */

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase()
    const digits = term.replace(/\D/g, '')
    const towns = new Set(filters.cities)

    const rows = leads.filter((lead) => {
      if (filters.category !== 'all' && lead.category !== filters.category) return false
      if (filters.region !== 'all' && lead.region !== filters.region) return false
      if (filters.area && lead.area !== filters.area) return false
      if (towns.size && !towns.has(lead.city)) return false
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
  /** Every town on the list, for the plan window, which is not limited by the filters. */
  const allTowns = useMemo(() => tally(leads.map((l) => l.city)), [leads])

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
      await exportLeads(filtered, statusOf, activePlan ? `Spartan-Tyres-Plan-${activePlan.date}` : undefined)
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
        {!query.loading && leads.length ? (
          <WorkPlan
            plans={plans}
            leads={leads}
            isDone={(lead) => statusOf(lead.key).status !== 'New'}
            today={today}
            weekOf={weekOf}
            onWeek={setWeekOf}
            activeId={planId}
            onOpen={openPlan}
            onAdd={(date) =>
              // Towns ticked in the filter come along, so "tick towns, then + on a day" works too.
              startPlan({ date, towns: activePlan ? [] : filters.cities, who: '', note: '' })
            }
          />
        ) : null}

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
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <RegionMap
              leads={leads}
              filters={filters}
              onPick={(region) =>
                update({ region: filters.region === region ? 'all' : region, area: '', cities: [] })
              }
            />
            <RegionGrid
              leads={leads}
              filters={filters}
              onPick={(category, region) => update({ category, region, area: '', cities: [] })}
            />
          </div>
        ) : null}

        {/* overflow-visible: the town list may open past the bottom of a short list. */}
        <div ref={listRef} className="scroll-mt-24">
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
            className="overflow-visible"
            bodyClassName="p-0 md:p-0"
          >
            {activePlan ? (
              <PlanBanner
                plan={activePlan}
                progress={planProgress(activePlan.towns, leads, (lead) => statusOf(lead.key).status !== 'New')}
                onEdit={() =>
                  startPlan({
                    id: activePlan.id,
                    date: activePlan.date,
                    towns: activePlan.towns,
                    who: activePlan.who,
                    note: activePlan.note,
                  })
                }
                onClose={closePlan}
              />
            ) : null}

            <FilterBar
              filters={filters}
              update={update}
              areas={areas}
              cities={cities}
              activeFilters={activeFilters}
              onClear={() => update(EMPTY_FILTERS)}
              planOpen={Boolean(activePlan)}
              onPlan={() =>
                startPlan({ date: nextMonday(today), towns: filters.cities, who: '', note: '' })
              }
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

                {/* The card does not clip (see overflow-visible above), so the last row rounds itself. */}
                <ul className="divide-y divide-border [&>li:last-child]:rounded-b-lg">
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
      </div>

      <Dialog
        open={planDialogOpen}
        onOpenChange={(next) => {
          // Escape, the backdrop and × wait while a save or delete is on its way.
          if (!next && planBusy) return
          setPlanDialogOpen(next)
        }}
      >
        {draft ? (
          <DialogContent size="lg" hideClose={planBusy}>
            <PlanForm
              key={draftKey}
              draft={draft}
              towns={allTowns}
              leads={leads}
              plans={plans}
              people={people}
              today={today}
              onCancel={() => setPlanDialogOpen(false)}
              onSave={savePlan}
              onDelete={deletePlan}
            />
          </DialogContent>
        ) : null}
      </Dialog>
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

  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-border bg-card p-4">
          <dt className="text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
            {tile.label}
          </dt>
          <dd className="mt-1 font-heading text-2xl font-black">{formatNumber(tile.value)}</dd>
          <dd className="text-xs text-muted-foreground">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ------------------------------------------------------------------ *
 * Region × category grid — click a cell to filter
 * ------------------------------------------------------------------ */

/* NSW, simplified (longitude, latitude), and the four lead regions drawn over it. */
const NSW_OUTLINE: Array<[number, number]> = [
  [141, -29], [141, -34], [142.4, -34.8], [143.5, -35.4], [144.8, -36.1], [146.9, -36.1], [148.2, -36.8],
  [149.98, -37.5], [150.2, -36.3], [150.5, -35.3], [150.9, -34.4], [151.3, -33.9], [151.6, -33.0],
  [152.2, -32.7], [152.9, -31.4], [153.1, -30.3], [153.6, -28.6], [153.55, -28.2], [152.0, -28.5],
  [151.0, -28.9], [149.5, -28.6], [148.9, -29.0], [141, -29],
]
const REGION_ZONES: Record<LeadRegion, Array<[number, number]>> = {
  'N NSW': [[148.3, -27.5], [154.5, -27.5], [154.5, -33.25], [151.25, -33.4], [149.6, -32.9], [148.3, -32.3]],
  'W NSW': [
    [140, -27.5], [148.3, -27.5], [148.3, -32.3], [149.6, -32.9], [150.5, -33.5], [150.45, -34.15],
    [148.5, -34.0], [145, -33.85], [140, -33.85],
  ],
  'S NSW': [[140, -33.85], [145, -33.85], [148.5, -34.0], [150.45, -34.15], [151.6, -34.2], [152, -38], [140, -38]],
  Metro: [[150.5, -33.5], [151.25, -33.4], [151.6, -33.55], [151.6, -34.2], [150.45, -34.15]],
}
const ZONE_LABEL_AT: Record<LeadRegion, [number, number]> = {
  'N NSW': [151.2, -30.3],
  'W NSW': [145.2, -31.4],
  'S NSW': [146.6, -35.1],
  Metro: [150.95, -33.83],
}
const MAP_TOWNS: Array<[string, number, number]> = [
  ['Newcastle', 151.78, -32.93], ['Tamworth', 150.93, -31.09], ['Coffs Hbr', 153.11, -30.3],
  ['Dubbo', 148.6, -32.25], ['Orange', 149.1, -33.28], ['Broken Hill', 141.47, -31.95],
  ['Wagga', 147.37, -35.11], ['Albury', 146.92, -36.08], ['Wollongong', 150.89, -34.42],
  ['Moree', 149.84, -29.47], ['Griffith', 146.05, -34.29],
]
const toMap = (lon: number, lat: number): [number, number] => [(lon - 140.6) * 38, (-lat - 27.8) * 44]
const points = (ring: Array<[number, number]>) =>
  ring.map(([lon, lat]) => toMap(lon, lat).map((n) => n.toFixed(1)).join(',')).join(' ')

function RegionMap({
  leads,
  filters,
  onPick,
}: {
  leads: Lead[]
  filters: Filters
  onPick: (region: LeadRegion) => void
}) {
  const counts = useMemo(() => {
    const c = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<LeadRegion, number>
    for (const l of leads) if (filters.category === 'all' || l.category === filters.category) c[l.region] += 1
    return c
  }, [leads, filters.category])
  const max = Math.max(1, ...Object.values(counts))

  return (
    <AdminPanel title="Map" description="Darker regions hold more leads. Click a region to show only its leads.">
      <svg viewBox="0 0 520 440" role="img" aria-label="Leads by NSW region" className="h-auto w-full">
        <defs>
          <clipPath id="leads-nsw">
            <polygon points={points(NSW_OUTLINE)} />
          </clipPath>
        </defs>
        <g clipPath="url(#leads-nsw)">
          {(['W NSW', 'N NSW', 'S NSW', 'Metro'] as LeadRegion[]).map((region) => {
            const share = counts[region] / max
            const active = filters.region === region
            return (
              <polygon
                key={region}
                points={points(REGION_ZONES[region])}
                onClick={() => onPick(region)}
                className="cursor-pointer stroke-card transition-[fill] hover:brightness-110"
                strokeWidth={2}
                fill={
                  active
                    ? 'hsl(var(--primary))'
                    : `color-mix(in srgb, hsl(var(--primary)) ${counts[region] ? Math.round(15 + share * 55) : 0}%, hsl(var(--muted)))`
                }
              >
                <title>
                  {REGION_LABEL[region]}: {formatNumber(counts[region])} leads
                </title>
              </polygon>
            )
          })}
        </g>
        <polygon points={points(NSW_OUTLINE)} fill="none" className="stroke-muted-foreground" strokeWidth={1} opacity={0.5} />
        {MAP_TOWNS.map(([name, lon, lat]) => {
          const [x, y] = toMap(lon, lat)
          return (
            <g key={name} className="pointer-events-none">
              <circle cx={x} cy={y} r={2} className="fill-muted-foreground" />
              <text x={x + 4} y={y + 3} className="fill-muted-foreground text-[9px]">
                {name}
              </text>
            </g>
          )
        })}
        {REGIONS.map((region) => {
          const [x, y] = toMap(...ZONE_LABEL_AT[region])
          const label = (lx: number, ly: number, size: number) => (
            <g className="pointer-events-none font-heading font-bold" textAnchor="middle">
              <text x={lx} y={ly} className="fill-foreground text-[15px]">
                {region}
              </text>
              <text x={lx} y={ly + 26} className="fill-foreground" style={{ fontSize: size }}>
                {formatNumber(counts[region])}
              </text>
            </g>
          )
          if (region === 'Metro') {
            return (
              <g key={region}>
                <line x1={x + 8} y1={y} x2={x + 42} y2={y + 10} className="stroke-muted-foreground" />
                {label(x + 68, y + 6, 22)}
              </g>
            )
          }
          return <g key={region}>{label(x, y - 10, 26)}</g>
        })}
      </svg>
    </AdminPanel>
  )
}

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
  planOpen,
  onPlan,
}: {
  filters: Filters
  update: (patch: Partial<Filters>) => void
  areas: Array<[string, number]>
  cities: Array<[string, number]>
  activeFilters: boolean
  onClear: () => void
  /** A day plan is open: its banner already lists the towns. */
  planOpen: boolean
  /** Opens the plan window for the ticked towns. */
  onPlan: () => void
}) {
  const ticked = filters.cities.length
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
              onClick={() => update({ category, area: '', cities: [] })}
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
          onChange={(v) => update({ region: (v || 'all') as Filters['region'], area: '', cities: [] })}
          options={REGIONS.map((r) => [r, REGION_LABEL[r]])}
          all="All regions"
        />
        <FilterSelect
          label="Area"
          value={filters.area}
          onChange={(v) => update({ area: v, cities: [] })}
          options={areas.map(([a, c]) => [a, `${a} (${c})`])}
          all="All areas"
        />
        <TownFilter selected={filters.cities} options={cities} onChange={(next) => update({ cities: next })} />
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

      {ticked && !planOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <ul aria-label="Towns ticked" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {filters.cities.map((town) => (
              <li key={town}>
                <button
                  type="button"
                  onClick={() => update({ cities: filters.cities.filter((t) => t !== town) })}
                  aria-label={`Remove ${town}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-background px-2.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  <span className="truncate">{town}</span>
                  <X aria-hidden="true" className="h-3 w-3 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" onClick={onPlan} className="w-full sm:w-auto">
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            Plan a day for {ticked === 1 ? 'this town' : `these ${ticked} towns`}
          </Button>
        </div>
      ) : null}

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

/**
 * The City / town filter: tick any number of towns. Every tick applies at
 * once, so the list behind it updates as you go; Done only closes the list.
 */
function TownFilter({
  selected,
  options,
  onChange,
}: {
  selected: string[]
  options: Array<[string, number]>
  onChange: (towns: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const panelId = `${uid}-towns`

  const close = useCallback(() => setOpen(false), [])
  const closeAndFocus = useCallback(() => {
    setOpen(false)
    buttonRef.current?.focus()
  }, [])
  useOnClickOutside(rootRef, close, open)
  useEscapeKey(closeAndFocus, open)

  useEffect(() => {
    if (!open) return
    setSearch('')
    // A phone keyboard would cover the list, so only a mouse/keyboard user starts in the search box.
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus()
  }, [open])

  const chosen = new Set(selected)
  const term = search.trim().toLowerCase()
  const shown = term ? options.filter(([town]) => town.toLowerCase().includes(term)) : options
  const leadCount = options.reduce((sum, [town, count]) => (chosen.has(town) ? sum + count : sum), 0)
  const toggle = (town: string) =>
    onChange(chosen.has(town) ? selected.filter((t) => t !== town) : sortTowns([...selected, town]))
  const tick = (town: string) => {
    if (!chosen.has(town)) onChange(sortTowns([...selected, town]))
  }
  const allShownTicked = shown.every(([town]) => chosen.has(town))

  return (
    <div
      ref={rootRef}
      className="relative min-w-0"
      onBlur={(event) => {
        // Tabbing on past the list closes it. A click on a bare part of the list moves
        // focus nowhere (relatedTarget is null) and must not close it.
        const next = event.relatedTarget as Node | null
        if (open && next && !rootRef.current?.contains(next)) setOpen(false)
      }}
    >
      <Label
        id={`${uid}-label`}
        htmlFor="lead-filter-city-town"
        className="mb-1 block text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground"
      >
        City / town
      </Label>
      <button
        ref={buttonRef}
        id="lead-filter-city-town"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${uid}-label ${uid}-value`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          fieldSkin,
          'flex h-9 items-center justify-between gap-2 py-0 text-left',
          selected.length && 'border-primary',
        )}
      >
        <span id={`${uid}-value`} className="truncate">
          {selected.length === 0 ? 'All towns' : selected.length === 1 ? selected[0] : `${selected.length} towns`}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label="Choose towns"
          className="absolute left-0 top-full z-30 mt-1 w-full min-w-[17rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lift"
        >
          <div className="p-2">
            <Label htmlFor={`${uid}-search`} className="sr-only">
              Search towns
            </Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchRef}
                id={`${uid}-search`}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => townSearchKeys(event, search, setSearch, shown, tick)}
                placeholder="Search a town…"
                autoComplete="off"
                className="h-9 pl-9"
              />
            </div>
          </div>

          <div className="flex min-h-[1.75rem] items-center justify-between gap-2 px-3 pb-1.5 text-xs">
            {term && shown.length ? (
              <button
                type="button"
                onClick={() => onChange(sortTowns([...new Set([...selected, ...shown.map(([town]) => town)])]))}
                disabled={allShownTicked}
                className="font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              >
                Tick all {shown.length} shown
              </button>
            ) : (
              <span className="text-muted-foreground">Tick as many towns as you need</span>
            )}
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={!selected.length}
              className="font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Clear
            </button>
          </div>

          {shown.length ? (
            <ul className="max-h-64 overflow-y-auto overscroll-contain border-t border-border py-1">
              {shown.map(([town, count]) => (
                <li key={town}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent',
                      chosen.has(town) && 'bg-primary/5 font-semibold',
                    )}
                  >
                    <Checkbox checked={chosen.has(town)} onChange={() => toggle(town)} />
                    <span className="min-w-0 flex-1 truncate">{town}</span>
                    <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No town matches “{search.trim()}”.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-semibold" aria-live="polite">
              {selected.length
                ? `${selected.length} ${selected.length === 1 ? 'town' : 'towns'} ticked · ${formatNumber(leadCount)} ${leadCount === 1 ? 'lead' : 'leads'}`
                : 'No town ticked: all towns shown'}
            </span>
            <Button size="sm" onClick={closeAndFocus}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Work plan: the team's week, one column per day
 * ------------------------------------------------------------------ */

function WorkPlan({
  plans,
  leads,
  isDone,
  today,
  weekOf,
  onWeek,
  activeId,
  onOpen,
  onAdd,
}: {
  plans: LeadPlan[]
  leads: Lead[]
  isDone: (lead: Lead) => boolean
  today: string
  /** The Monday of the week shown. */
  weekOf: string
  onWeek: (monday: string) => void
  activeId: string | null
  onOpen: (plan: LeadPlan) => void
  onAdd: (day: string) => void
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekOf, i)), [weekOf])
  const byDay = useMemo(() => {
    const map = new Map<string, LeadPlan[]>()
    for (const plan of plans) {
      if (plan.date < days[0] || plan.date > days[6]) continue
      map.set(plan.date, [...(map.get(plan.date) ?? []), plan])
    }
    return map
  }, [plans, days])

  // Monday to Friday always; Saturday or Sunday only when something is planned on it.
  const shown = days.filter((day, i) => i < 5 || byDay.has(day))
  const thisWeek = weekStart(today)
  const when =
    weekOf === thisWeek
      ? 'This week'
      : weekOf === addDays(thisWeek, 7)
        ? 'Next week'
        : weekOf === addDays(thisWeek, -7)
          ? 'Last week'
          : null
  const planned = days.reduce((sum, day) => sum + (byDay.get(day)?.length ?? 0), 0)

  return (
    <AdminPanel
      title="Work plan"
      description="The team's plan for the week. Tick towns in the lead list and press Plan a day, or press + on a day. Open a plan to work through its leads."
      action={
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" aria-label="Previous week" onClick={() => onWeek(addDays(weekOf, -7))} className="px-2.5">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button size="sm" variant={weekOf === thisWeek ? 'secondary' : 'outline'} onClick={() => onWeek(thisWeek)}>
            This week
          </Button>
          <Button size="sm" variant="outline" aria-label="Next week" onClick={() => onWeek(addDays(weekOf, 7))} className="px-2.5">
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <p
        id="lead-work-plan-week"
        tabIndex={-1}
        aria-live="polite"
        className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm focus:outline-none"
      >
        <span className="font-heading font-bold">{weekLabel(weekOf)}</span>
        {when ? <span className="text-muted-foreground">{when}</span> : null}
        <span className="text-muted-foreground">
          · {planned ? `${planned} ${planned === 1 ? 'plan' : 'plans'}` : 'nothing planned yet'}
        </span>
      </p>

      <div className={cn('grid gap-3 sm:grid-cols-2', shown.length > 5 ? 'lg:grid-cols-4 2xl:grid-cols-7' : 'lg:grid-cols-5')}>
        {shown.map((day) => {
          const dayPlans = byDay.get(day) ?? []
          const isToday = day === today
          return (
            <section
              key={day}
              aria-label={dayLabel(day, 'long')}
              data-plan-day={day}
              tabIndex={-1}
              className={cn(
                'flex min-w-0 flex-col gap-2 rounded-lg border p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isToday ? 'border-primary/60 bg-primary/5' : 'border-border bg-muted/20',
              )}
            >
              <h3 className="flex items-center justify-between gap-2 font-heading text-xs font-bold uppercase tracking-wide">
                <span className={cn(day < today && 'text-muted-foreground')}>{dayLabel(day)}</span>
                {isToday ? (
                  <Badge size="sm" variant="primary">
                    Today
                  </Badge>
                ) : null}
              </h3>

              {dayPlans.map((plan) => {
                const { total, done } = planProgress(plan.towns, leads, isDone)
                const active = plan.id === activeId
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => onOpen(plan)}
                    aria-pressed={active}
                    className={cn(
                      'w-full rounded-md border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary',
                      active ? 'border-primary ring-2 ring-primary/30' : 'border-border',
                    )}
                  >
                    {/* line-clamp sets its own display: adding `block` would switch the clamp off. */}
                    <span className="line-clamp-3 break-words text-sm font-bold leading-snug" title={plan.towns.join(', ')}>
                      {plan.towns.join(', ')}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatNumber(total)} {total === 1 ? 'lead' : 'leads'}
                      {plan.who ? ` · ${plan.who}` : ''}
                    </span>
                    {/* Spans, not <Progress>: a button may only hold phrasing content. */}
                    <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }}
                      />
                    </span>
                    <span className="mt-1 block text-xs font-semibold">
                      {done} of {total} done
                    </span>
                  </button>
                )
              })}

              <button
                type="button"
                onClick={() => onAdd(day)}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary',
                  dayPlans.length ? 'py-1.5' : 'min-h-[3rem] flex-1 py-3 sm:min-h-[6rem]',
                )}
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                {dayPlans.length ? 'Add a plan' : 'Plan this day'}
                <span className="sr-only">, {dayLabel(day, 'long')}</span>
              </button>
            </section>
          )
        })}
      </div>
    </AdminPanel>
  )
}

/** The day being worked through, above the lead list. */
function PlanBanner({
  plan,
  progress,
  onEdit,
  onClose,
}: {
  plan: LeadPlan
  progress: { total: number; done: number }
  onEdit: () => void
  onClose: () => void
}) {
  const { total, done } = progress
  return (
    <div className="border-b border-border bg-primary/5 p-4 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            {dayLabel(plan.date, 'long')}
          </p>
          <p className="mt-1 break-words text-sm">
            <span className="font-semibold">{plan.towns.join(', ')}</span>
            {plan.who ? <span className="text-muted-foreground"> · {plan.who}</span> : null}
          </p>
          {plan.note ? (
            <p className="mt-1 whitespace-pre-line break-words text-xs text-muted-foreground">Note: {plan.note}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit plan
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Close day
          </Button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress
          value={done}
          max={Math.max(total, 1)}
          label="Leads worked on"
          className="h-2.5 flex-1"
          barClassName="bg-emerald-500"
        />
        <span className="shrink-0 text-xs font-bold tabular-nums">
          {done} of {total} done
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {total
          ? 'A lead counts as done once its status is no longer “New”.'
          : 'There are no leads in these towns any more. Edit the plan to choose other towns.'}
      </p>
    </div>
  )
}

/** The plan window: make a day plan, or change or delete one. */
function PlanForm({
  draft,
  towns,
  leads,
  plans,
  people,
  today,
  onCancel,
  onSave,
  onDelete,
}: {
  draft: PlanDraft
  /** Every town on the list, with its number of leads. */
  towns: Array<[string, number]>
  leads: Lead[]
  plans: LeadPlan[]
  people: string[]
  today: string
  onCancel: () => void
  /** Returns a message to show when saving failed. */
  onSave: (input: PlanDraft) => Promise<string | null>
  onDelete: (plan: LeadPlan) => Promise<string | null>
}) {
  const uid = useId()
  const [date, setDate] = useState(draft.date)
  const [chosen, setChosen] = useState<string[]>(draft.towns)
  const [who, setWho] = useState(draft.who)
  const [note, setNote] = useState(draft.note)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  const keepRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const askedToDelete = useRef(false)

  // The delete question replaces the button that asked it: keep keyboard focus on the
  // safe answer while it shows, and back on "Delete plan" when it goes.
  useEffect(() => {
    if (confirmDelete) {
      askedToDelete.current = true
      keepRef.current?.focus()
    } else if (askedToDelete.current) {
      deleteRef.current?.focus()
    }
  }, [confirmDelete])

  const existing = draft.id ? plans.find((plan) => plan.id === draft.id) ?? null : null
  const dateOk = isPlanDay(date)
  const picked = new Set(chosen)
  const leadCount = useMemo(() => leadsInTowns(chosen, leads).length, [chosen, leads])
  const clashes = dateOk ? townClashes(plans, date, chosen, draft.id) : []
  const clashPlans = [...new Set(clashes.map((clash) => clash.plan))]
  const tooMany = chosen.length > PLAN_LIMITS.towns
  const term = search.trim().toLowerCase()
  const shown = term ? towns.filter(([town]) => town.toLowerCase().includes(term)) : towns
  const suggestions = useMemo(
    () => sortTowns([...new Set([...people, ...plans.map((plan) => plan.who)].filter(Boolean))]),
    [people, plans],
  )

  const toggle = (town: string) =>
    setChosen((current) => (current.includes(town) ? current.filter((t) => t !== town) : sortTowns([...current, town])))
  const tick = (town: string) =>
    setChosen((current) => (current.includes(town) ? current : sortTowns([...current, town])))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (!dateOk || chosen.length === 0 || tooMany) return
    setBusy('save')
    setError(null)
    const failure = await onSave({ id: draft.id, date, towns: chosen, who: who.trim(), note: note.trim() })
    // On success the window closes; only a failure needs the form back.
    if (failure) {
      setError(failure)
      setBusy(null)
    }
  }

  async function remove() {
    if (!existing) return
    setBusy('delete')
    setError(null)
    const failure = await onDelete(existing)
    if (failure) {
      setError(failure)
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  // Labels already wear the field-label type; the Towns legend copies it.
  const fieldLabel = 'mb-1.5 block'
  const optional = <span className="font-normal normal-case tracking-normal">(optional)</span>

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>{draft.id ? 'Change plan' : 'Plan a day'}</DialogTitle>
        <DialogDescription>
          Choose the day and the towns. Every lead in those towns is part of the plan, and leads added to those towns later
          join it by themselves.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 px-6 pb-6">
        <div>
          <Label htmlFor={`${uid}-date`} className={fieldLabel}>
            Day
          </Label>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Input
              id={`${uid}-date`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              min={PLAN_DAYS.first}
              max={PLAN_DAYS.last}
              aria-invalid={tried && !dateOk}
              aria-describedby={`${uid}-date-hint`}
              className="w-auto min-w-[11rem]"
            />
            <span id={`${uid}-date-hint`} className={cn('text-sm font-semibold', tried && !dateOk && 'text-destructive')}>
              {dateOk
                ? dayLabel(date, 'long')
                : tried
                  ? isDay(date)
                    ? `Choose a day from ${PLAN_DAYS.first.slice(0, 4)} to ${PLAN_DAYS.last.slice(0, 4)}.`
                    : 'Choose a day.'
                  : ''}
              {dateOk && date < today ? <span className="ml-1 font-normal text-muted-foreground">(in the past)</span> : null}
            </span>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 block font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Towns
          </legend>
          {chosen.length ? (
            <ul aria-label="Towns in this plan" className="mb-2 flex flex-wrap gap-1.5">
              {chosen.map((town) => (
                <li key={town}>
                  <button
                    type="button"
                    onClick={() => toggle(town)}
                    aria-label={`Remove ${town}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                  >
                    <span className="truncate">{town}</span>
                    <X aria-hidden="true" className="h-3 w-3 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p aria-live="polite" className={cn('mb-2 text-sm', tried && !chosen.length ? 'font-semibold text-destructive' : 'font-semibold')}>
            {chosen.length
              ? `${chosen.length} ${chosen.length === 1 ? 'town' : 'towns'} · ${formatNumber(leadCount)} ${leadCount === 1 ? 'lead' : 'leads'}`
              : tried
                ? 'Choose at least one town.'
                : 'No town chosen yet. Tick the towns below.'}
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border p-2">
              <Label htmlFor={`${uid}-search`} className="sr-only">
                Search towns
              </Label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id={`${uid}-search`}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => townSearchKeys(event, search, setSearch, shown, tick)}
                  placeholder="Search a town…"
                  autoComplete="off"
                  className="h-9 pl-9"
                />
              </div>
            </div>
            {shown.length ? (
              <ul className="max-h-52 overflow-y-auto overscroll-contain py-1">
                {shown.map(([town, count]) => (
                  <li key={town}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent',
                        picked.has(town) && 'bg-primary/5 font-semibold',
                      )}
                    >
                      <Checkbox checked={picked.has(town)} onChange={() => toggle(town)} />
                      <span className="min-w-0 flex-1 truncate">{town}</span>
                      <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No town matches “{search.trim()}”.</p>
            )}
          </div>
          {tooMany ? (
            <p className="mt-1.5 text-xs font-semibold text-destructive">
              A plan can hold at most {PLAN_LIMITS.towns} towns. Remove {chosen.length - PLAN_LIMITS.towns}.
            </p>
          ) : null}
        </fieldset>

        {clashPlans.length ? (
          <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Already planned on {dayLabel(date)}:</p>
              <ul className="mt-1 space-y-0.5">
                {clashPlans.map((plan) => (
                  <li key={plan.id} className="break-words">
                    {listNames(clashes.filter((clash) => clash.plan === plan).map((clash) => clash.town))}
                    {plan.who ? ` (${plan.who})` : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">You can still save, for example when two people go together.</p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${uid}-who`} className={fieldLabel}>
              Who will do it {optional}
            </Label>
            <Input
              id={`${uid}-who`}
              list={`${uid}-people`}
              value={who}
              onChange={(event) => setWho(event.target.value)}
              maxLength={PLAN_LIMITS.who}
              autoComplete="off"
              placeholder="Name of the person doing the day"
            />
            <datalist id={`${uid}-people`}>
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor={`${uid}-note`} className={fieldLabel}>
              Note {optional}
            </Label>
            <Textarea
              id={`${uid}-note`}
              rows={3}
              maxLength={PLAN_LIMITS.note}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="For example: which town to start in, who to see first"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter className="sm:items-center sm:justify-between">
        {existing ? (
          confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Delete this plan?</span>
              <Button type="button" size="sm" variant="destructive" loading={busy === 'delete'} disabled={busy !== null} onClick={remove}>
                Yes, delete
              </Button>
              <Button
                ref={keepRef}
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(false)}
              >
                Keep it
              </Button>
            </div>
          ) : (
            <Button
              ref={deleteRef}
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setConfirmDelete(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete plan
            </Button>
          )
        ) : (
          <span aria-hidden="true" className="hidden sm:block" />
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={busy === 'save'} disabled={busy !== null}>
            {draft.id ? 'Save changes' : 'Save plan'}
          </Button>
        </div>
      </DialogFooter>
    </form>
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
              <Badge variant="outline" size="sm" title="Time spent researching this company">
                <Clock aria-hidden="true" className="h-3 w-3" />
                {hoursLabel(researchHoursOf(lead, status))} research
              </Badge>
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
        <div id={panelId} className="grid gap-5 px-4 pb-5 [overflow-wrap:anywhere] md:grid-cols-[1.4fr_1fr] md:px-5">
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

          <SalesBox
            status={status}
            estimate={estimateResearchHours(lead)}
            onStatus={onStatus}
            onNotes={onNotes}
            onResearch={onResearch}
          />
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
  estimate,
  onStatus,
  onNotes,
  onResearch,
}: {
  status: LeadStatus
  /** Shown when no figure has been entered for this lead. */
  estimate: number
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
            placeholder={String(estimate)}
            aria-invalid={!hoursValid}
            aria-describedby="lead-research-hint"
          />
          <Button size="sm" variant="outline" className="h-10 shrink-0" disabled={!hoursDirty || !hoursValid} onClick={() => onResearch(parsedHours)}>
            Save
          </Button>
        </div>
        <p id="lead-research-hint" className="mt-1 text-xs text-muted-foreground">
          {!hoursValid
            ? 'Enter hours between 0.25 and 1000.'
            : status.researchHours != null
              ? `Entered by hand. Clear it and save to go back to the estimate of ${hoursLabel(estimate)}.`
              : `${hoursLabel(estimate)}, estimated from what was found on this company. Enter a figure to replace it.`}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Research time for a lead: the figure entered on it, otherwise an estimate.
 *
 * The research did not time each company, so the estimate is worked out from
 * how much was found on it: every website, contact page, phone line, email,
 * named contact and size assessment is something that had to be looked up
 * and checked. A bare single-listing lead comes out at 2 hours; a large,
 * fully documented operator at 8. Half-hour steps.
 */
function estimateResearchHours(lead: Lead): number {
  let hours = 2
  if (lead.website) hours += 1
  if (lead.contact_page && lead.contact_page !== lead.website) hours += 0.5
  hours += Math.min(Math.max(lead.phones.length - 1, 0) * 0.5, 1.5)
  if (lead.emails.length) hours += 0.75 + Math.min((lead.emails.length - 1) * 0.25, 0.75)
  if (lead.other_contacts) hours += 0.5
  if (lead.size === 'Large') hours += 1.5
  else if (lead.size === 'Medium') hours += 0.75
  if (lead.employees === '50+') hours += 0.5
  else if (lead.employees === '30–50' || lead.employees === '30-50') hours += 0.25
  if (lead.fleet) hours += 0.25
  if (lead.description.length > 150) hours += 0.25
  return Math.min(Math.max(Math.round(hours * 2) / 2, 2), 8)
}

function researchHoursOf(lead: Lead, status: LeadStatus): number {
  return status.researchHours ?? estimateResearchHours(lead)
}

/** "8 hrs", "1 hr", "2.5 hrs", "0 hrs". */
function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 100) / 100
  return `${formatNumber(rounded)} ${rounded === 1 ? 'hr' : 'hrs'}`
}

/** The same names, in any order. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const names = new Set(b)
  return a.every((name) => names.has(name))
}

/**
 * Keys for a town search box: Enter ticks the town when exactly one matches (and
 * never submits the form around it); Escape first clears the search, and only a
 * second Escape closes whatever the box sits in.
 */
function townSearchKeys(
  event: React.KeyboardEvent<HTMLInputElement>,
  search: string,
  setSearch: (value: string) => void,
  matches: Array<[string, number]>,
  tick: (town: string) => void,
) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (matches.length === 1) {
      tick(matches[0][0])
      setSearch('')
    }
  } else if (event.key === 'Escape' && search) {
    event.preventDefault()
    event.stopPropagation()
    setSearch('')
  }
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
async function exportLeads(rows: Lead[], statusOf: (key: string) => LeadStatus, name?: string) {
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
    col('Research hours', 14, (l) => String(researchHoursOf(l, statusOf(l.key)))),
    col('Source', 34, (l) => l.source),
  ]

  // Local date, not UTC: in Sydney the UTC date is yesterday until 10–11am.
  const now = new Date()
  const stamp = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')
  await writeXlsxFile(rows, {
    schema,
    fileName: `${name ?? `Spartan-Tyres-NSW-Leads-${stamp}`}.xlsx`,
    sheet: 'Leads',
    stickyRowsCount: 1,
    getHeaderStyle: () => ({
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#1a1a1a',
    }),
  })
}
