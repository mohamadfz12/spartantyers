import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Mail,
  MessageSquare,
  Phone,
  Search,
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
  Field,
  Input,
  Label,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { useCopyToClipboard } from '@/hooks'
import { api } from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Enquiries & newsletter subscribers
 *
 * `GET /api/admin/enquiries` is the whole contract — there is no PATCH.
 * So the `handled` flag is displayed and never offered as a control: a
 * "Mark handled" button that silently did nothing would be worse than
 * no button at all. It is explained in the panel description instead.
 * ------------------------------------------------------------------ */

type EnquiriesResponse = Awaited<ReturnType<typeof api.admin.enquiries>>
type Enquiry = EnquiriesResponse['enquiries'][number]
type Subscriber = EnquiriesResponse['subscribers'][number]

type HandledFilter = 'all' | 'unhandled' | 'handled'

export default function Enquiries() {
  const query = useAdminQuery('admin-enquiries', (token) => api.admin.enquiries(token))

  if (query.notConfigured) {
    return (
      <>
        <Seo
          title="Enquiries — Spartan Tyres admin"
          description="Contact enquiries and newsletter subscribers."
          noIndex
        />
        <AdminNotConfigured message={query.error ?? undefined} />
      </>
    )
  }

  const enquiries = query.data?.enquiries ?? []
  const subscribers = query.data?.subscribers ?? []

  return (
    <>
      <Seo
        title="Enquiries — Spartan Tyres admin"
        description="Contact enquiries and newsletter subscribers."
        noIndex
      />

      {query.loading ? (
        <ListSkeleton label="Loading enquiries…" />
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : (
        <Tabs defaultValue="enquiries">
          <TabsList label="Enquiries and subscribers">
            <TabsTrigger value="enquiries">
              Enquiries
              <span className="ml-2 font-sans text-xs font-semibold tabular-nums text-muted-foreground">
                {formatNumber(enquiries.length)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="subscribers">
              Newsletter
              <span className="ml-2 font-sans text-xs font-semibold tabular-nums text-muted-foreground">
                {formatNumber(subscribers.length)}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="enquiries">
            <EnquiriesTab enquiries={enquiries} onRetry={query.reload} />
          </TabsContent>

          <TabsContent value="subscribers">
            <SubscribersTab subscribers={subscribers} />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Enquiries tab
 * ------------------------------------------------------------------ */

function EnquiriesTab({
  enquiries,
  onRetry,
}: {
  enquiries: Enquiry[]
  onRetry: () => void
}) {
  const [typeFilter, setTypeFilter] = useState('all')
  const [handledFilter, setHandledFilter] = useState<HandledFilter>('all')
  const [search, setSearch] = useState('')

  const types = useMemo(() => {
    const set = new Set(enquiries.map((item) => item.enquiryType).filter(Boolean))
    return [...set].sort((a, b) => a.localeCompare(b, 'en-AU'))
  }, [enquiries])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return enquiries
      .filter((item) => {
        if (typeFilter !== 'all' && item.enquiryType !== typeFilter) return false
        if (handledFilter === 'handled' && !item.handled) return false
        if (handledFilter === 'unhandled' && item.handled) return false
        if (!needle) return true
        return [item.name, item.email, item.company ?? '', item.message]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      // Unhandled first — then newest, because that is the order you work in.
      .sort(
        (a, b) =>
          Number(a.handled) - Number(b.handled) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )
  }, [enquiries, typeFilter, handledFilter, search])

  const filtering =
    typeFilter !== 'all' || handledFilter !== 'all' || search.trim().length > 0

  return (
    <AdminPanel
      title="Contact enquiries"
      description="Unhandled first, then newest. The handled flag is set server-side when an enquiry is processed — it is read-only here because the API exposes no way to change it."
      bodyClassName="p-0 md:p-0"
    >
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end md:px-5">
        <div className="relative flex-1 sm:max-w-xs">
          <Label htmlFor="enquiry-search" className="sr-only">
            Search enquiries
          </Label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="enquiry-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email, company or message"
            className="pl-9"
          />
        </div>

        <Field label="Type" htmlFor="enquiry-type" className="sm:w-44">
          <Select
            id="enquiry-type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">All types</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Handled" htmlFor="enquiry-handled" className="sm:w-44">
          <Select
            id="enquiry-handled"
            value={handledFilter}
            onChange={(event) => setHandledFilter(event.target.value as HandledFilter)}
          >
            <option value="all">All enquiries</option>
            <option value="unhandled">Unhandled only</option>
            <option value="handled">Handled only</option>
          </Select>
        </Field>
      </div>

      {enquiries.length === 0 ? (
        <AdminEmpty
          title="No enquiries yet"
          icon={MessageSquare}
          description="Messages from the contact form arrive here. Nothing is being filtered out."
          className="rounded-none border-0 bg-transparent"
          action={
            <Button variant="outline" size="sm" onClick={onRetry}>
              Reload
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <AdminEmpty
          title="No enquiries match these filters"
          icon={Search}
          className="rounded-none border-0 bg-transparent"
          action={
            filtering ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setTypeFilter('all')
                  setHandledFilter('all')
                }}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((enquiry) => (
            <EnquiryRow key={enquiry.id} enquiry={enquiry} />
          ))}
        </ul>
      )}
    </AdminPanel>
  )
}

function EnquiryRow({ enquiry }: { enquiry: Enquiry }) {
  const [expanded, setExpanded] = useState(false)
  const long = enquiry.message.length > 190

  return (
    <li className={cn('p-4 md:px-5', !enquiry.handled && 'bg-primary/[0.03]')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{enquiry.name}</span>
            {enquiry.company ? (
              <span className="text-sm text-muted-foreground">
                {enquiry.company}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dateTime(enquiry.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {enquiry.enquiryType ? (
            <Badge variant="outline" size="sm">
              {enquiry.enquiryType}
            </Badge>
          ) : null}
          {/* Read-only: the API has no PATCH for enquiries. */}
          {enquiry.handled ? (
            <Badge variant="success" size="sm">
              <Check aria-hidden="true" className="h-3 w-3" />
              Handled
            </Badge>
          ) : (
            <Badge variant="warning" size="sm">
              Unhandled
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a
          href={`mailto:${enquiry.email}?subject=${encodeURIComponent(`Re: your Spartan Tyres enquiry`)}`}
          className="inline-flex items-center gap-1.5 break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {enquiry.email}
        </a>

        {enquiry.phone ? (
          <a
            href={`tel:${enquiry.phone.replace(/\s+/g, '')}`}
            className="inline-flex items-center gap-1.5 rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {enquiry.phone}
          </a>
        ) : null}
      </div>

      <p
        id={`enquiry-message-${enquiry.id}`}
        className={cn(
          'mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground',
          long && !expanded && 'line-clamp-3',
        )}
      >
        {enquiry.message}
      </p>

      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={`enquiry-message-${enquiry.id}`}
          className="mt-1.5 inline-flex items-center gap-1 rounded-sm font-heading text-xs font-bold uppercase tracking-wide text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {expanded ? 'Show less' : 'Read full message'}
          <ChevronDown
            aria-hidden="true"
            className={cn('h-3 w-3 transition-transform duration-200', expanded && 'rotate-180')}
          />
        </button>
      ) : null}
    </li>
  )
}

/* ------------------------------------------------------------------ *
 * Subscribers tab
 * ------------------------------------------------------------------ */

function SubscribersTab({ subscribers }: { subscribers: Subscriber[] }) {
  const { copied, copy } = useCopyToClipboard()

  const sorted = useMemo(
    () =>
      [...subscribers].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [subscribers],
  )

  const copyAll = async () => {
    const ok = await copy(sorted.map((item) => item.email).join('\n'))
    toast({
      title: ok
        ? `Copied ${formatNumber(sorted.length)} ${sorted.length === 1 ? 'address' : 'addresses'}`
        : 'Could not copy',
      description: ok
        ? 'One address per line, ready to paste.'
        : 'The browser blocked clipboard access. Download the CSV instead.',
      variant: ok ? 'success' : 'error',
    })
  }

  const downloadCsv = () => {
    const rows = [
      ['Email', 'Subscribed'],
      ...sorted.map((item) => [item.email, item.createdAt]),
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')

    // A BOM keeps Excel from mangling non-ASCII addresses.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `spartan-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    toast({
      title: 'CSV downloaded',
      description: `${formatNumber(sorted.length)} ${sorted.length === 1 ? 'subscriber' : 'subscribers'}.`,
      variant: 'success',
    })
  }

  return (
    <AdminPanel
      title="Newsletter subscribers"
      description={`${formatNumber(sorted.length)} ${sorted.length === 1 ? 'address' : 'addresses'} collected from the storefront sign-up form.`}
      bodyClassName="p-0 md:p-0"
      action={
        sorted.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyAll}>
              {copied ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Clipboard aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy all emails'}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download aria-hidden="true" className="h-3.5 w-3.5" />
              Download CSV
            </Button>
          </div>
        ) : undefined
      }
    >
      {sorted.length === 0 ? (
        <AdminEmpty
          title="No subscribers yet"
          icon={Users}
          description="Addresses from the storefront newsletter form appear here."
          className="rounded-none border-0 bg-transparent"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Newsletter subscribers, newest first</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="border-b border-border bg-muted/50 px-4 py-2.5 text-left font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground"
                >
                  Email
                </th>
                <th
                  scope="col"
                  className="border-b border-border bg-muted/50 px-4 py-2.5 text-left font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground"
                >
                  Subscribed
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((subscriber) => (
                <tr
                  key={`${subscriber.email}-${subscriber.createdAt}`}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <a
                      href={`mailto:${subscriber.email}`}
                      className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {subscriber.email}
                    </a>
                  </th>
                  <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-muted-foreground">
                    {dateTime(subscriber.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * RFC 4180 quoting: a field containing a comma, a quote or a newline is
 * wrapped in quotes, and any inner quote is doubled. Without this, one
 * address with a comma in it silently shifts every column after it.
 */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function dateTime(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return iso
  return new Date(parsed).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-10 w-64" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  )
}
