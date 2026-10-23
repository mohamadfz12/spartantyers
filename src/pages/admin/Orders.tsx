import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Search,
  Store,
  Truck,
  X,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import {
  PlainHeader,
  SortHeader,
  nextSort,
  type SortDirection,
  type SortState,
} from '@/components/admin/SortHeader'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  Select,
  Skeleton,
  type BadgeVariant,
} from '@/components/ui'
import { useIsMobile } from '@/hooks'
import { ChannelBadge } from '@/components/admin/accounts/parts'
import { CHANNEL_KEYS, CHANNEL_LABELS, orderChannelOf } from '@/lib/admin-accounts-ui'
import type { SaleChannelKey } from '@/lib/admin-accounts-api'
import { api } from '@/lib/api'
import { cn, formatNumber, moneyExact } from '@/lib/utils'
import type { Order } from '@/data/types'
import {
  SESSION_EXPIRED_MESSAGE,
  adminToken,
  handleAdminError,
  useAdmin,
} from '@/store/admin'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Orders
 *
 * Status is the only mutable field — money and line items are whatever
 * the payment recorded, and editing them client-side would break
 * reconciliation against Square. So the detail dialog is a reader with
 * exactly one control.
 *
 * Transitions are filtered to the ones that make sense for the order in
 * front of you: a delivery order is never offered `collected`, and a
 * cancelled order is offered nothing at all. An impossible option in a
 * dropdown is a bug waiting for a busy afternoon.
 * ------------------------------------------------------------------ */

type SortKey = 'date' | 'total'

const STATUS_VARIANT: Record<Order['status'], BadgeVariant> = {
  pending: 'warning',
  paid: 'primary',
  account: 'warning',
  packing: 'default',
  dispatched: 'success',
  collected: 'success',
  cancelled: 'destructive',
}

const STATUS_LABEL: Record<Order['status'], string> = {
  pending: 'Pending',
  paid: 'Paid',
  account: 'On account',
  packing: 'Packing',
  dispatched: 'Dispatched',
  collected: 'Collected',
  cancelled: 'Cancelled',
}

const ALL_STATUSES = Object.keys(STATUS_LABEL) as Order['status'][]

/** Transitions that are actually reachable from the current state. */
function allowedTransitions(order: Order): Order['status'][] {
  const pickup = order.fulfilment === 'pickup'

  switch (order.status) {
    case 'pending':
      return ['paid', 'cancelled']
    case 'paid':
      return ['packing', 'cancelled']
    // Pay later: the goods go out as for a paid order. It becomes 'paid' by itself when the customer's
    // balance is paid at the till, never from here.
    case 'account':
      return ['packing', 'cancelled']
    case 'packing':
      return pickup ? ['collected', 'cancelled'] : ['dispatched', 'cancelled']
    // Dispatched and collected are the end of the line, and a cancelled
    // order cannot be walked forward again.
    case 'dispatched':
    case 'collected':
    case 'cancelled':
      return []
    default:
      return []
  }
}

export default function Orders() {
  const query = useAdminQuery('admin-orders', (token) => api.admin.orders(token))
  const isMobile = useIsMobile()

  // The AI assistant's conversations link here with the order's reference.
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => (params.get('search') ?? '').slice(0, 100))
  const [statusFilter, setStatusFilter] = useState<'all' | Order['status']>('all')
  const [channelFilter, setChannelFilter] = useState<'all' | SaleChannelKey>('all')
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'date', direction: 'desc' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const orders = query.data?.orders ?? []
  const selected = orders.find((order) => order.id === selectedId) ?? null

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()

    const filtered = orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (channelFilter !== 'all' && orderChannelOf(order) !== channelFilter) return false
      if (!needle) return true
      return [order.reference, order.customer.email, order.customer.name]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })

    const factor = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const value =
        sort.key === 'total'
          ? a.total - b.total
          : Date.parse(a.createdAt) - Date.parse(b.createdAt)
      return value * factor
    })
  }, [orders, search, statusFilter, channelFilter, sort])

  const onSort = (key: SortKey, defaultDirection: SortDirection) =>
    setSort((current) => nextSort(current, key, defaultDirection))

  /* ---- Status write --------------------------------------------- */

  const [saving, setSaving] = useState(false)

  const changeStatus = async (order: Order, status: Order['status']) => {
    const token = adminToken()
    if (!token) {
      // Session died between opening the dialog and pressing Save.
      useAdmin.getState().logout(SESSION_EXPIRED_MESSAGE)
      return
    }

    setSaving(true)
    setAnnouncement(`Updating ${order.reference}…`)

    try {
      const { order: saved } = await api.admin.updateOrder(token, order.id, status)

      query.patch((data) => ({
        ...data,
        orders: data.orders.map((item) => (item.id === saved.id ? saved : item)),
      }))

      setAnnouncement(`${saved.reference} is now ${STATUS_LABEL[saved.status]}.`)
      toast({
        title: `${saved.reference} → ${STATUS_LABEL[saved.status]}`,
        variant: 'success',
      })
    } catch (error) {
      const failure = handleAdminError(error)
      setAnnouncement(`Could not update ${order.reference}. ${failure.message}`)
      toast({
        title: `Could not update ${order.reference}`,
        description: failure.message,
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  /* ---- Render --------------------------------------------------- */

  if (query.notConfigured) {
    return (
      <>
        <Seo title="Orders — Spartan Tyres admin" description="Order fulfilment." noIndex />
        <AdminNotConfigured message={query.error ?? undefined} />
      </>
    )
  }

  const filtering = statusFilter !== 'all' || channelFilter !== 'all' || search.trim().length > 0

  return (
    <>
      <Seo
        title="Orders — Spartan Tyres admin"
        description="Order fulfilment and status."
        noIndex
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <AdminPanel
        title="Orders"
        description={
          query.data
            ? `${formatNumber(visible.length)} of ${formatNumber(orders.length)} orders.`
            : undefined
        }
        bodyClassName="p-0 md:p-0"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end md:px-5">
          <div className="relative flex-1 sm:max-w-sm">
            <Label htmlFor="order-search" className="sr-only">
              Search by reference, email or name
            </Label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="order-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, email or name"
              className="pl-9"
            />
          </div>

          <Field label="Status" htmlFor="order-status-filter" className="sm:w-48">
            <Select
              id="order-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'all' | Order['status'])
              }
            >
              <option value="all">All statuses</option>
              {ALL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type" htmlFor="order-channel-filter" className="sm:w-40">
            <Select
              id="order-channel-filter"
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value as 'all' | SaleChannelKey)}
            >
              <option value="all">All types</option>
              {CHANNEL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {CHANNEL_LABELS[key]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {query.loading ? (
          <OrdersSkeleton />
        ) : query.error ? (
          <div className="p-4 md:p-5">
            <AdminError message={query.error} onRetry={query.reload} />
          </div>
        ) : orders.length === 0 ? (
          <AdminEmpty
            title="No orders yet"
            icon={Receipt}
            description="Paid orders appear here the moment checkout completes. Nothing is being filtered out."
            className="rounded-none border-0 bg-transparent"
          />
        ) : visible.length === 0 ? (
          <AdminEmpty
            title="No orders match these filters"
            icon={Search}
            description="Try a different status, or clear the search."
            className="rounded-none border-0 bg-transparent"
            action={
              filtering ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setStatusFilter('all')
                    setChannelFilter('all')
                  }}
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : isMobile ? (
          <ul className="flex flex-col gap-3 p-4">
            {visible.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  className="w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Card className="p-4" interactive>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold">
                          {order.reference}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dateTime(order.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={STATUS_VARIANT[order.status]} size="sm">
                          {STATUS_LABEL[order.status]}
                        </Badge>
                        <ChannelBadge channel={orderChannelOf(order)} />
                      </div>
                    </div>

                    <p className="mt-3 truncate text-sm font-medium">
                      {order.customer.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.customer.email}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FulfilmentIcon fulfilment={order.fulfilment} />
                        {order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
                        {' · '}
                        {formatNumber(itemCount(order))}{' '}
                        {itemCount(order) === 1 ? 'tyre' : 'tyres'}
                      </span>
                      <span className="font-heading text-sm font-bold tabular-nums">
                        {moneyExact(order.total)}
                      </span>
                    </div>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Orders. Activate a reference to open the full order.
              </caption>
              <thead>
                <tr>
                  <PlainHeader>Reference</PlainHeader>
                  <SortHeader
                    sortKey="date"
                    label="Date"
                    sort={sort}
                    onSort={onSort}
                    defaultDirection="desc"
                  />
                  <PlainHeader>Customer</PlainHeader>
                  <PlainHeader>Fulfilment</PlainHeader>
                  <PlainHeader numeric>Tyres</PlainHeader>
                  <SortHeader
                    sortKey="total"
                    label="Total"
                    sort={sort}
                    onSort={onSort}
                    defaultDirection="desc"
                    numeric
                  />
                  <PlainHeader>Type</PlainHeader>
                  <PlainHeader>Status</PlainHeader>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedId(order.id)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <th scope="row" className="px-2.5 py-2 text-left">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(order.id)
                        }}
                        className="inline-flex items-center gap-1 rounded-sm font-mono text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {order.reference}
                        <span className="sr-only"> — open full order</span>
                        <ChevronRight aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </th>
                    <td className="whitespace-nowrap px-2.5 py-2 text-xs tabular-nums text-muted-foreground">
                      {dateTime(order.createdAt)}
                    </td>
                    <td className="px-2.5 py-2 text-xs">
                      <span className="block font-medium">{order.customer.name}</span>
                      <span className="block text-muted-foreground">
                        {order.customer.email}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <FulfilmentIcon fulfilment={order.fulfilment} />
                        {order.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right text-xs tabular-nums">
                      {formatNumber(itemCount(order))}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right text-xs font-semibold tabular-nums">
                      {moneyExact(order.total)}
                    </td>
                    <td className="px-2.5 py-2">
                      <ChannelBadge channel={orderChannelOf(order)} />
                    </td>
                    <td className="px-2.5 py-2">
                      <Badge variant={STATUS_VARIANT[order.status]} size="sm">
                        {STATUS_LABEL[order.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected ? (
          <DialogContent size="lg">
            <OrderDetail
              // Remount on a status change so the transition Select cannot keep
              // a draft value that is no longer a legal next step.
              key={`${selected.id}-${selected.status}`}
              order={selected}
              saving={saving}
              onChangeStatus={changeStatus}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

function OrderDetail({
  order,
  saving,
  onChangeStatus,
}: {
  order: Order
  saving: boolean
  onChangeStatus: (order: Order, status: Order['status']) => void
}) {
  const transitions = allowedTransitions(order)
  const [draft, setDraft] = useState<Order['status'] | ''>('')
  const [confirming, setConfirming] = useState(false)

  const cancelling = draft === 'cancelled'

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono">{order.reference}</span>
          <Badge variant={STATUS_VARIANT[order.status]}>
            {STATUS_LABEL[order.status]}
          </Badge>
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          Placed {dateTime(order.createdAt)} &middot;{' '}
          {order.fulfilment === 'delivery' ? 'Delivery' : 'Warehouse pickup'}
        </p>
      </DialogHeader>

      <div className="flex flex-col gap-6 px-6 pb-6">
        {/* ---- Customer ------------------------------------------- */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
              Customer
            </h3>
            <p className="mt-2 text-sm font-semibold">{order.customer.name}</p>
            {order.customer.company ? (
              <p className="text-sm text-muted-foreground">{order.customer.company}</p>
            ) : null}
            <p className="mt-1.5 flex items-center gap-1.5 text-sm">
              <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={`mailto:${order.customer.email}`}
                className="break-all text-primary hover:underline"
              >
                {order.customer.email}
              </a>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={`tel:${order.customer.phone.replace(/\s+/g, '')}`}
                className="text-primary hover:underline"
              >
                {order.customer.phone}
              </a>
            </p>
          </div>

          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
              {order.fulfilment === 'delivery' ? (
                <>
                  <Truck aria-hidden="true" className="h-3.5 w-3.5" />
                  Delivery address
                </>
              ) : (
                <>
                  <Store aria-hidden="true" className="h-3.5 w-3.5" />
                  Pickup
                </>
              )}
            </h3>

            {order.fulfilment === 'delivery' ? (
              order.address ? (
                <address className="mt-2 text-sm not-italic leading-relaxed">
                  {order.address.line1}
                  <br />
                  {order.address.suburb} {order.address.state} {order.address.postcode}
                </address>
              ) : (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  No address was recorded against this delivery order.
                </p>
              )
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Collection from the warehouse.
                {order.fittingTyres > 0
                  ? ` ${formatNumber(order.fittingTyres)} ${order.fittingTyres === 1 ? 'tyre' : 'tyres'} booked in for fitting.`
                  : ' No fitting booked.'}
              </p>
            )}
          </div>
        </section>

        {/* ---- Lines ---------------------------------------------- */}
        <section>
          <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Items
          </h3>

          <div className="mt-2 overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Order line items</caption>
              <thead>
                <tr>
                  <PlainHeader>Item</PlainHeader>
                  <PlainHeader>Size</PlainHeader>
                  <PlainHeader numeric>Qty</PlainHeader>
                  <PlainHeader numeric>Unit</PlainHeader>
                  <PlainHeader numeric>Line</PlainHeader>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr
                    key={`${line.sku}-${line.size}`}
                    className="border-b border-border last:border-0"
                  >
                    <th scope="row" className="px-2.5 py-2 text-left text-xs">
                      <span className="block font-medium">{line.name}</span>
                      <span className="block font-mono text-[0.6875rem] text-muted-foreground">
                        {line.sku}
                      </span>
                    </th>
                    <td className="whitespace-nowrap px-2.5 py-2 text-xs tabular-nums">
                      {line.size}
                    </td>
                    <td className="px-2.5 py-2 text-right text-xs tabular-nums">
                      {formatNumber(line.quantity)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right text-xs tabular-nums">
                      {moneyExact(line.unitPrice)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right text-xs font-semibold tabular-nums">
                      {moneyExact(line.unitPrice * line.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Money ---------------------------------------------- */}
        <section>
          <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Totals
          </h3>

          <dl className="mt-2 flex flex-col gap-1.5 text-sm">
            <Money label="Subtotal" value={order.subtotal} />
            {order.fittingTyres > 0 || order.fittingTotal > 0 ? (
              <Money
                label={`Fitting (${formatNumber(order.fittingTyres)} ${order.fittingTyres === 1 ? 'tyre' : 'tyres'})`}
                value={order.fittingTotal}
              />
            ) : null}
            {order.discount > 0 ? (
              <Money label="Discount" value={-order.discount} tone="primary" />
            ) : null}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2">
              <dt className="font-heading text-sm font-bold uppercase tracking-wide">
                Total
              </dt>
              <dd className="font-heading text-lg font-black tabular-nums">
                {moneyExact(order.total)}
              </dd>
            </div>
          </dl>

          <dl className="mt-4 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-heading font-bold uppercase tracking-brand text-muted-foreground">
                Promo code
              </dt>
              <dd className="mt-0.5 font-mono">{order.promoCode || '—'}</dd>
            </div>
            <div>
              <dt className="font-heading font-bold uppercase tracking-brand text-muted-foreground">
                Payment id
              </dt>
              <dd className="mt-0.5 break-all font-mono">{order.paymentId || '—'}</dd>
            </div>
            {order.payment === 'account' ? (
              <div className="sm:col-span-2">
                <dt className="font-heading font-bold uppercase tracking-brand text-muted-foreground">
                  Pay later, on the customer account
                </dt>
                <dd className="mt-0.5">
                  {order.accountPaidAt
                    ? `Paid off on the customer account.`
                    : `Still owing${order.dueDate ? `, due ${order.dueDate}` : ''}. Take the payment in the till's customer account (Till, Customers).`}
                  {order.posTicketRef ? <span className="ml-1 font-mono">{order.posTicketRef}</span> : null}
                </dd>
              </div>
            ) : null}
          </dl>

          {order.notes ? (
            <div className="mt-4">
              <h4 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Customer notes
              </h4>
              <p className="mt-1.5 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed">
                {order.notes}
              </p>
            </div>
          ) : null}
        </section>

        {/* ---- Status ---------------------------------------------- */}
        <section className="rounded-md border border-border bg-muted/30 p-4">
          <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Fulfilment status
          </h3>

          {transitions.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {order.status === 'cancelled'
                ? 'This order is cancelled. Cancelled orders cannot be reopened from here.'
                : `This order is ${STATUS_LABEL[order.status].toLowerCase()} — there are no further status changes available.`}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field
                  label="Move to"
                  htmlFor={`status-${order.id}`}
                  className="flex-1"
                  hint={`Currently ${STATUS_LABEL[order.status]}.`}
                >
                  <Select
                    id={`status-${order.id}`}
                    value={draft}
                    disabled={saving}
                    onChange={(event) => {
                      setDraft(event.target.value as Order['status'] | '')
                      setConfirming(false)
                    }}
                  >
                    <option value="">Choose a status…</option>
                    {transitions.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </Select>
                </Field>

                {!cancelling ? (
                  <Button
                    size="sm"
                    disabled={!draft || saving}
                    loading={saving}
                    onClick={() => draft && onChangeStatus(order, draft)}
                  >
                    Save status
                  </Button>
                ) : null}
              </div>

              {/* Cancelling is destructive and irreversible here, so it
                  takes a second, explicit confirmation. */}
              {cancelling ? (
                <div
                  role="group"
                  aria-label="Confirm cancellation"
                  className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3.5"
                >
                  <p className="flex items-start gap-2 text-sm leading-relaxed">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                    />
                    <span>
                      Cancelling removes {order.reference} from revenue and cannot
                      be undone from this panel. Any refund must be issued in
                      Square separately.
                    </span>
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {confirming ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={saving}
                        onClick={() => onChangeStatus(order, 'cancelled')}
                      >
                        Yes, cancel {order.reference}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving}
                        onClick={() => setConfirming(true)}
                      >
                        Cancel this order
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => {
                        setDraft('')
                        setConfirming(false)
                      }}
                    >
                      Keep the order
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

function Money({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'primary'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn('tabular-nums', tone === 'primary' && 'font-semibold text-primary')}
      >
        {moneyExact(value)}
      </dd>
    </div>
  )
}

function FulfilmentIcon({ fulfilment }: { fulfilment: Order['fulfilment'] }) {
  const Icon = fulfilment === 'delivery' ? Truck : Store
  return <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
}

function itemCount(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0)
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

function OrdersSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-2 p-4 md:p-5"
    >
      <span className="sr-only">Loading orders…</span>
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  )
}
