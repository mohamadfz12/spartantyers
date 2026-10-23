import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Receipt } from 'lucide-react'
import { AdminEmpty, AdminError, AdminPanel } from '@/components/admin/AdminStates'
import { dayLabel, stampLabel, td, th, todayLocal } from '@/components/admin/AdminKit'
import { ChannelBadge } from '@/components/admin/accounts/parts'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { Badge, Button, Skeleton } from '@/components/ui'
import { api, type PosCustomer, type PosTicket } from '@/lib/api'
import type { Order } from '@/data/types'
import { dollars, isOverdue, orderChannelOf, ticketChannelOf } from '@/lib/admin-accounts-ui'
import type { PosCustomerSummary, SaleChannelKey } from '@/lib/admin-accounts-api'
import { cn } from '@/lib/utils'

interface ActivityRow {
  key: string
  at: string
  ref: string
  source: 'Website' | 'Till'
  channel: SaleChannelKey
  total: number
  status: string
  /** Still to be paid. */
  open: boolean
  due: string | null
  href: string
}

const ORDER_STATUS: Record<Order['status'], string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  account: 'On account',
  packing: 'Packing',
  dispatched: 'Dispatched',
  collected: 'Collected',
  cancelled: 'Cancelled',
}

const TICKET_STATUS: Record<PosTicket['status'], string> = {
  open: 'Open',
  paid: 'Paid',
  account: 'On account',
  void: 'Void',
}

function orderRow(o: Order): ActivityRow {
  return {
    key: `o-${o.id}`,
    at: o.createdAt,
    ref: o.reference,
    source: 'Website',
    channel: orderChannelOf(o),
    total: o.total,
    status: ORDER_STATUS[o.status] ?? o.status,
    open: o.status === 'account' && !o.accountPaidAt,
    due: o.dueDate ?? null,
    href: `/admin/orders?search=${encodeURIComponent(o.reference)}`,
  }
}

function ticketRow(t: PosTicket): ActivityRow {
  return {
    key: `t-${t.ref}`,
    at: t.createdAt,
    ref: t.ref,
    source: 'Till',
    channel: ticketChannelOf(t),
    total: t.total,
    status: TICKET_STATUS[t.status] ?? t.status,
    open: t.status === 'account' && t.amountPaid < t.total,
    due: t.dueDate,
    href: '/admin/pos',
  }
}

/**
 * Website orders and till tickets for one account. A pay-later website order also has a till ticket;
 * only the order is listed (the ticket carries `orderId`).
 */
export function ActivitySection({
  accountId,
  posCustomer,
}: {
  accountId: string
  posCustomer: PosCustomerSummary | null
}) {
  const orders = useAdminQuery(`admin-account-orders-${accountId}`, (token) => api.admin.orders(token))
  const tickets = useAdminQuery(`admin-account-tickets-${accountId}-${posCustomer?.id ?? 'none'}`, (token) =>
    posCustomer
      ? api.admin.pos<{ tickets: Array<PosTicket & { customer?: PosCustomer | null }> }>(token, {
          view: 'customer',
          id: posCustomer.id,
        })
      : Promise.resolve({ tickets: [] }),
  )

  const today = todayLocal()
  const rows = useMemo(() => {
    const fromOrders = (orders.data?.orders ?? []).filter((o) => o.accountId === accountId).map(orderRow)
    const fromTickets = (tickets.data?.tickets ?? []).filter((t) => !t.orderId).map(ticketRow)
    return [...fromOrders, ...fromTickets].sort((a, b) => b.at.localeCompare(a.at))
  }, [orders.data, tickets.data, accountId])

  const loading = (orders.loading && !orders.data) || (tickets.loading && !tickets.data)
  const error = orders.error ?? tickets.error

  return (
    <AdminPanel
      title="Activity"
      description="Website orders and till tickets for this account."
      bodyClassName="p-0 md:p-0"
      action={
        posCustomer ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/pos">
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              Open the till
            </Link>
          </Button>
        ) : undefined
      }
    >
      {posCustomer ? (
        <p className="border-b border-border px-4 py-3 text-sm md:px-5">
          Till customer: <span className="font-semibold">{posCustomer.company || posCustomer.name}</span>. Owing at the till{' '}
          <span className="font-semibold tabular-nums">{dollars(posCustomer.balance.due)}</span>
          {posCustomer.balance.overdue > 0 ? (
            <>
              , of which <span className="font-semibold tabular-nums text-destructive">{dollars(posCustomer.balance.overdue)}</span> is overdue
            </>
          ) : null}
          .
        </p>
      ) : null}

      {loading ? (
        <div className="p-4 md:p-5">
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <div className="p-4 md:p-5">
          <AdminError
            message={error}
            onRetry={() => {
              orders.reload()
              tickets.reload()
            }}
          />
        </div>
      ) : rows.length === 0 ? (
        <AdminEmpty
          title="No sales yet"
          icon={Receipt}
          description="Website orders and till tickets for this customer will be listed here."
          className="rounded-none border-0 bg-transparent"
        />
      ) : (
        <>
          <ul className="divide-y divide-border md:hidden">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-col gap-1.5 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <Link to={r.href} className="font-mono font-semibold hover:underline">
                    {r.ref}
                  </Link>
                  <span className="font-semibold tabular-nums">{dollars(r.total)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.source} · {stampLabel(r.at)}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ChannelBadge channel={r.channel} />
                  <Badge size="sm" variant={r.open ? 'warning' : 'default'}>
                    {r.status}
                  </Badge>
                  {r.due ? (
                    <span className={cn('text-xs', r.open && isOverdue(r.due, today) && 'font-semibold text-destructive')}>
                      Due {dayLabel(r.due)}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Orders and till tickets</caption>
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Where</th>
                  <th className={th}>Type</th>
                  <th className={cn(th, 'text-right')}>Total</th>
                  <th className={th}>Status</th>
                  <th className={th}>Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-muted/30">
                    <td className={cn(td, 'whitespace-nowrap text-xs')}>{stampLabel(r.at)}</td>
                    <td className={td}>
                      <Link to={r.href} className="font-mono font-semibold hover:underline">
                        {r.ref}
                      </Link>
                    </td>
                    <td className={td}>{r.source}</td>
                    <td className={td}>
                      <ChannelBadge channel={r.channel} />
                    </td>
                    <td className={cn(td, 'text-right font-semibold tabular-nums')}>{dollars(r.total)}</td>
                    <td className={td}>
                      <Badge size="sm" variant={r.open ? 'warning' : 'default'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-xs', r.open && isOverdue(r.due, today) && 'font-semibold text-destructive')}>
                      {r.due ? dayLabel(r.due) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminPanel>
  )
}
