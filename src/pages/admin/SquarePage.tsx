import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Battery,
  BatteryCharging,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CreditCard,
  ExternalLink,
  Landmark,
  Link2,
  Package,
  Receipt,
  RefreshCw,
  Smartphone,
  Trash2,
  Undo2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import { AdminEmpty, AdminPanel } from '@/components/admin/AdminStates'
import { Tile, dayLabel, stampLabel, td, th, useAdminAction } from '@/components/admin/AdminKit'
import { TerminalCharge, Warn } from '@/components/admin/TerminalCharge'
import { Badge, Button, Field, Input, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { can } from '@/lib/admin-roles'
import { api, type TerminalDevice } from '@/lib/api'
import { cn, moneyExact } from '@/lib/utils'
import { adminToken, handleAdminError, useAdminSession } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * Square
 *
 * The Square account, live: sales today / this week / this month, a
 * 14-day chart, where sales came from (website, counter POS, Square's
 * own apps), and the payments, refunds, payouts, item library and
 * devices in the account. Read-only apart from pairing a Terminal and
 * sending it a charge; everything else is changed in the Square
 * Dashboard or on the device.
 * ------------------------------------------------------------------ */

interface Period {
  count: number
  gross: number
  fees: number
  refunded: number
  net: number
  average: number
}

interface Summary {
  business: string
  location: { name: string; status: string; currency: string; address: string }
  environment: 'sandbox' | 'production'
  asAt: string
  today: Period
  week: Period
  month: Period
  monthRefunds: { count: number; total: number }
  bySource: Record<string, { count: number; total: number }>
  days: Array<{ day: string; total: number; count: number }>
  capped: boolean
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

async function squareGet<T>(params: Record<string, string>): Promise<T> {
  const token = adminToken()
  if (!token) throw new Error('Signed out')
  return api.admin.square<T>(token, params)
}

export default function SquarePage() {
  const { user } = useAdminSession()
  const [fresh, setFresh] = useState(0)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [charging, setCharging] = useState(false)

  useEffect(() => {
    setSummary(null)
    setError('')
    squareGet<Summary>({ view: 'summary', ...(fresh ? { fresh: '1' } : {}) })
      .then(setSummary)
      .catch((e) => setError(handleAdminError(e).message))
  }, [fresh])

  return (
    <>
      <Seo title="Square — Spartan Tyres admin" description="Square sales, payments, payouts and the Terminal." noIndex />
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-extrabold uppercase">{summary?.business || 'Square'}</h2>
            <p className="text-xs text-muted-foreground">
              {summary
                ? `${summary.location.name}${summary.location.address ? `, ${summary.location.address}` : ''} · live from Square at ${stampLabel(summary.asAt)}${summary.environment === 'sandbox' ? ' · SANDBOX (test money)' : ''}`
                : error
                  ? 'Not connected'
                  : 'Reading from Square…'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCharging(true)} disabled={Boolean(error)}>
              <Smartphone aria-hidden="true" className="h-4 w-4" />
              Charge on Terminal
            </Button>
            <Button variant="outline" asChild>
              <a href="https://squareup.com/dashboard" target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                Square Dashboard
              </a>
            </Button>
            <Button variant="ghost" onClick={() => setFresh((n) => n + 1)}>
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <Warn>{error}</Warn>
        ) : !summary ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <SummaryView s={summary} />
        )}

        {!error ? (
          <>
            <TerminalPanel canPair={can(user.role, 'finance')} />
            <AdminPanel title="In Square" bodyClassName="p-0 md:p-0">
              <Tabs defaultValue="payments">
                <div className="border-b border-border p-4 md:px-5">
                  <TabsList label="Square lists">
                    <TabsTrigger value="payments">Payments</TabsTrigger>
                    <TabsTrigger value="refunds">Refunds</TabsTrigger>
                    <TabsTrigger value="payouts">Payouts</TabsTrigger>
                    <TabsTrigger value="items">Item library</TabsTrigger>
                    <TabsTrigger value="devices">Devices</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="payments">
                  <PaymentsList fresh={fresh} />
                </TabsContent>
                <TabsContent value="refunds">
                  <RefundsList fresh={fresh} />
                </TabsContent>
                <TabsContent value="payouts">
                  <PayoutsList fresh={fresh} />
                </TabsContent>
                <TabsContent value="items">
                  <ItemsList fresh={fresh} />
                </TabsContent>
                <TabsContent value="devices">
                  <DevicesList fresh={fresh} />
                </TabsContent>
              </Tabs>
            </AdminPanel>
          </>
        ) : null}
      </div>

      <TerminalCharge open={charging} kind="custom" label="Any amount, e.g. a fitting job" onClose={() => setCharging(false)} onPaid={() => setFresh((n) => n + 1)} />
    </>
  )
}

function SummaryView({ s }: { s: Summary }) {
  const max = Math.max(1, ...s.days.map((d) => d.total))
  const sources = Object.entries(s.bySource).sort((a, b) => b[1].total - a[1].total)
  const monthTotal = sources.reduce((a, [, v]) => a + v.total, 0) || 1
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Today" value={moneyExact(s.today.gross)} icon={CalendarClock} hint={`${plural(s.today.count, 'sale')} · ${moneyExact(s.today.net)} after fees`} />
        <Tile label="Last 7 days" value={moneyExact(s.week.gross)} icon={CalendarDays} hint={`${plural(s.week.count, 'sale')} · ${moneyExact(s.week.net)} after fees`} />
        <Tile label="This month" value={moneyExact(s.month.gross)} icon={CalendarRange} hint={`${plural(s.month.count, 'sale')} · ${moneyExact(s.month.fees)} fees · avg ${moneyExact(s.month.average)}`} />
        <Tile label="Refunds this month" value={moneyExact(s.monthRefunds.total)} icon={Undo2} tone={s.monthRefunds.count ? 'bad' : 'default'} hint={plural(s.monthRefunds.count, 'refund')} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <AdminPanel title="Sales per day" description="The last 14 days.">
          <div className="flex h-48 items-end gap-1.5" role="img" aria-label="Sales per day, last 14 days">
            {s.days.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${dayLabel(d.day)}: ${moneyExact(d.total)} from ${plural(d.count, 'sale')}`}>
                <div className="flex h-40 w-full items-end justify-center">
                  <div className="w-full max-w-[1.75rem] rounded-t bg-primary" style={{ height: `${Math.max(2, (d.total / max) * 100)}%` }} />
                </div>
                <span className="text-[0.625rem] text-muted-foreground">{new Date(`${d.day}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'narrow', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
          <table className="sr-only">
            <caption>Sales per day</caption>
            <tbody>
              {s.days.map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  <td>{moneyExact(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminPanel>
        <AdminPanel title="Where this month's sales came from" description="Website: a website order. Counter (POS): the till here. Counter: Square's own apps.">
          {sources.length ? (
            <ul className="flex flex-col gap-3">
              {sources.map(([name, v]) => (
                <li key={name}>
                  <div className="flex justify-between text-sm">
                    <span>
                      <span className="font-semibold">{name}</span> <span className="text-xs text-muted-foreground">{plural(v.count, 'sale')}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{moneyExact(v.total)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${(v.total / monthTotal) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No sales yet this month.</p>
          )}
          {s.capped ? <p className="mt-3 text-xs text-muted-foreground">More than 2,000 payments this month: the totals cover the latest 2,000.</p> : null}
        </AdminPanel>
      </div>
    </>
  )
}

/* ---- Terminal pairing ----------------------------------------------- */

function TerminalPanel({ canPair }: { canPair: boolean }) {
  const { run, busy } = useAdminAction()
  const [state, setState] = useState<{ devices: TerminalDevice[]; code: { code: string; name: string; pairBy: string | null } | null } | null>(null)
  const [name, setName] = useState('Front counter')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(() => {
    squareGet<NonNullable<typeof state>>({ view: 'terminal' })
      .then((r) => {
        setState(r)
        // While a code waits to be typed in, check every few seconds for the pairing.
        clearTimeout(timer.current)
        if (r.code) timer.current = setTimeout(load, 5000)
      })
      .catch((e) => handleAdminError(e))
  }, [])
  useEffect(() => {
    load()
    return () => clearTimeout(timer.current)
  }, [load])

  return (
    <AdminPanel
      title="Square Terminal"
      description="A paired Terminal takes card payments sent from the till and from here. To pair one: create a code, then on the Terminal sign out and choose “Use a device code”."
    >
      {!state ? (
        <Skeleton className="h-16" />
      ) : (
        <div className="flex flex-col gap-4">
          {state.devices.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {state.devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <span className="flex items-center gap-2">
                    <Smartphone aria-hidden="true" className="h-5 w-5 text-primary" />
                    <span>
                      <span className="block font-semibold">{d.name}</span>
                      <span className="text-xs text-muted-foreground">Paired {stampLabel(d.pairedAt)}</span>
                    </span>
                  </span>
                  {canPair ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${d.name}`}
                      title="Stop sending charges to it"
                      onClick={async () => {
                        if (!window.confirm(`Stop sending charges to ${d.name}?`)) return
                        const r = await run((token) => api.admin.squareAction<NonNullable<typeof state>>(token, { action: 'forget', deviceId: d.id }), {
                          success: 'Terminal removed',
                          failure: 'Could not remove it',
                        })
                        if (r) setState(r)
                      }}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No Terminal is paired yet.</p>
          )}

          {state.code ? (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm">On the Terminal, sign in with this device code:</p>
              <p className="my-2 font-mono text-3xl font-black tracking-[0.3em]">{state.code.code}</p>
              <p className="text-xs text-muted-foreground">
                For “{state.code.name}”{state.code.pairBy ? `, valid until ${stampLabel(state.code.pairBy)}` : ''}. This updates by itself once it is paired.
              </p>
            </div>
          ) : canPair ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Terminal name" htmlFor="term-name">
                <Input id="term-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </Field>
              <Button
                loading={busy}
                onClick={async () => {
                  const r = await run((token) => api.admin.squareAction(token, { action: 'pair', name }), { failure: 'Could not get a pairing code' })
                  if (r) load()
                }}
              >
                <Link2 aria-hidden="true" className="h-4 w-4" />
                Pair a Terminal
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </AdminPanel>
  )
}

/* ---- Lists ------------------------------------------------------------ */

function useSquareList<T>(view: string, params: Record<string, string>, fresh: number) {
  const [items, setItems] = useState<T[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)
  const seen = useRef(fresh)
  const key = JSON.stringify(params)

  useEffect(() => {
    let live = true
    setItems(null)
    const skip = fresh !== seen.current
    seen.current = fresh
    squareGet<{ items: T[]; cursor?: string | null }>({ view, ...params, ...(skip ? { fresh: '1' } : {}) })
      .then((r) => {
        if (!live) return
        setItems(r.items)
        setCursor(r.cursor ?? null)
        setError('')
      })
      .catch((e) => live && setError(handleAdminError(e).message))
    return () => {
      live = false
    }
  }, [view, key, fresh])

  const loadMore = async () => {
    if (!cursor) return
    setMore(true)
    try {
      const r = await squareGet<{ items: T[]; cursor?: string | null }>({ view, ...params, cursor })
      setItems((x) => [...(x ?? []), ...r.items])
      setCursor(r.cursor ?? null)
    } catch (e) {
      handleAdminError(e)
    } finally {
      setMore(false)
    }
  }
  return { items, error, hasMore: Boolean(cursor), loadMore, more }
}

function ListShell<T>({ list, empty, icon, children }: { list: ReturnType<typeof useSquareList<T>>; empty: string; icon: typeof CreditCard; children: (items: T[]) => React.ReactNode }) {
  if (list.error) return <div className="p-4 md:p-5"><Warn>{list.error}</Warn></div>
  if (!list.items) return <div className="p-4 md:p-5"><Skeleton className="h-40" /></div>
  if (!list.items.length) return <AdminEmpty title={empty} icon={icon} className="rounded-none border-0 bg-transparent" />
  return (
    <>
      <div className="overflow-x-auto">{children(list.items)}</div>
      {list.hasMore ? (
        <div className="flex justify-end p-4">
          <Button size="sm" variant="outline" onClick={list.loadMore} loading={list.more}>
            Load more
          </Button>
        </div>
      ) : null}
    </>
  )
}

const tone = (status: string) =>
  status === 'COMPLETED' || status === 'PAID' || status === 'AVAILABLE'
    ? 'success'
    : status === 'FAILED' || status === 'REJECTED' || status === 'OFFLINE'
      ? 'destructive'
      : 'warning'

const RANGES = [
  ['today', 'Today'],
  ['week', '7 days'],
  ['month', 'This month'],
  ['90', '90 days'],
] as const

interface PaymentRow {
  id: string
  at: string
  status: string
  amount: number
  tip: number
  refunded: number
  fee: number
  method: string
  source: string
  forRef: string | null
  note: string
  receiptNumber: string
  receiptUrl: string | null
}

function PaymentsList({ fresh }: { fresh: number }) {
  const [range, setRange] = useState<string>('week')
  const list = useSquareList<PaymentRow>('payments', { range }, fresh)
  return (
    <>
      <div className="flex flex-wrap gap-1.5 p-4 md:px-5" role="group" aria-label="Period">
        {RANGES.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={range === id} onClick={() => setRange(id)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', range === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}>
            {label}
          </button>
        ))}
      </div>
      <ListShell list={list} empty="No payments in this period" icon={CreditCard}>
        {(items) => (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Square payments</caption>
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>From</th>
                <th className={th}>Paid with</th>
                <th className={cn(th, 'text-right')}>Amount</th>
                <th className={cn(th, 'text-right')}>Fee</th>
                <th className={th}>Status</th>
                <th className={th}>
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className={cn(td, 'whitespace-nowrap text-xs')}>{stampLabel(p.at)}</td>
                  <td className={td}>
                    {p.source}
                    {p.forRef ? <p className="font-mono text-xs text-muted-foreground">{p.forRef}</p> : p.note ? <p className="text-xs text-muted-foreground">{p.note}</p> : null}
                  </td>
                  <td className={cn(td, 'text-xs')}>{p.method}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>
                    <span className="font-semibold">{moneyExact(p.amount)}</span>
                    {p.refunded ? <p className="text-xs text-destructive">{moneyExact(p.refunded)} refunded</p> : null}
                  </td>
                  <td className={cn(td, 'text-right text-xs tabular-nums')}>{p.fee ? moneyExact(p.fee) : '—'}</td>
                  <td className={td}>
                    <Badge size="sm" variant={tone(p.status)}>
                      {p.status.toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                    </Badge>
                  </td>
                  <td className={td}>
                    {p.receiptUrl ? (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={p.receiptUrl} target="_blank" rel="noreferrer" title={`Receipt ${p.receiptNumber}`}>
                          <Receipt aria-hidden="true" className="h-3.5 w-3.5" />
                          Receipt
                        </a>
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListShell>
    </>
  )
}

function RefundsList({ fresh }: { fresh: number }) {
  const list = useSquareList<{ id: string; at: string; status: string; amount: number; reason: string }>('refunds', {}, fresh)
  return (
    <ListShell list={list} empty="No refunds in the last 90 days" icon={Undo2}>
      {(items) => (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Square refunds</caption>
          <thead>
            <tr>
              <th className={th}>When</th>
              <th className={th}>Reason</th>
              <th className={cn(th, 'text-right')}>Amount</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td className={cn(td, 'text-xs')}>{stampLabel(r.at)}</td>
                <td className={td}>{r.reason || '—'}</td>
                <td className={cn(td, 'text-right font-semibold tabular-nums text-destructive')}>−{moneyExact(r.amount)}</td>
                <td className={td}>
                  <Badge size="sm" variant={tone(r.status)}>
                    {r.status.toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ListShell>
  )
}

function PayoutsList({ fresh }: { fresh: number }) {
  const list = useSquareList<{ id: string; status: string; amount: number; arrivalDate: string | null; createdAt: string; destination: string; type: string }>('payouts', {}, fresh)
  return (
    <ListShell list={list} empty="No payouts yet" icon={Landmark}>
      {(items) => (
        <>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Square payouts</caption>
            <thead>
              <tr>
                <th className={th}>Arrives</th>
                <th className={th}>To</th>
                <th className={th}>Type</th>
                <th className={cn(th, 'text-right')}>Amount</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className={td}>{p.arrivalDate ? dayLabel(p.arrivalDate) : stampLabel(p.createdAt)}</td>
                  <td className={td}>{p.destination}</td>
                  <td className={cn(td, 'text-xs')}>{p.type}</td>
                  <td className={cn(td, 'text-right font-semibold tabular-nums')}>{moneyExact(p.amount)}</td>
                  <td className={td}>
                    <Badge size="sm" variant={tone(p.status)}>
                      {p.status === 'PAID' ? 'Paid' : p.status === 'SENT' ? 'On its way' : p.status === 'FAILED' ? 'Failed' : p.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="p-4 text-xs text-muted-foreground md:px-5">A payout is what Square deposits into the bank after fees, usually covering several days of sales.</p>
        </>
      )}
    </ListShell>
  )
}

function ItemsList({ fresh }: { fresh: number }) {
  const list = useSquareList<{ id: string; name: string; description: string; variations: Array<{ name: string; price: number | null }> }>('items', {}, fresh)
  return (
    <ListShell list={list} empty="The Square item library is empty" icon={Package}>
      {(items) => (
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Square item library</caption>
          <thead>
            <tr>
              <th className={th}>Item</th>
              <th className={th}>Variations</th>
              <th className={cn(th, 'text-right')}>Price</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className={td}>
                  <p className="font-semibold">{i.name}</p>
                  {i.description ? <p className="text-xs text-muted-foreground">{i.description.slice(0, 120)}</p> : null}
                </td>
                <td className={cn(td, 'text-xs')}>{i.variations.map((v) => v.name).filter(Boolean).join(', ') || '—'}</td>
                <td className={cn(td, 'text-right tabular-nums')}>
                  {i.variations.some((v) => v.price !== null) ? [...new Set(i.variations.filter((v) => v.price !== null).map((v) => moneyExact(v.price!)))].join(' / ') : <span className="text-muted-foreground">Variable</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ListShell>
  )
}

function DevicesList({ fresh }: { fresh: number }) {
  const list = useSquareList<{
    id: string
    name: string
    model: string
    serial: string
    status: string
    battery: { percent: number | null; charging: boolean } | null
    wifi: { active: boolean; network: string } | null
    updatedAt: string | null
  }>('devices', {}, fresh)
  return (
    <ListShell list={list} empty="Square is not reporting any devices for this location" icon={Smartphone}>
      {(items) => (
        <ul className="grid gap-3 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-3">
          {items.map((d) => (
            <li key={d.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <Smartphone aria-hidden="true" className="h-4 w-4 text-primary" />
                  {d.name || d.model || 'Square device'}
                </span>
                <Badge size="sm" variant={tone(d.status)}>
                  {d.status === 'AVAILABLE' ? 'Online' : d.status === 'NEEDS_ATTENTION' ? 'Needs attention' : d.status === 'OFFLINE' ? 'Offline' : d.status || 'Unknown'}
                </Badge>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {d.model ? <li>Model: {d.model}</li> : null}
                {d.serial ? <li>Serial: <span className="font-mono">{d.serial}</span></li> : null}
                {d.battery ? (
                  <li className="flex items-center gap-1">
                    {d.battery.charging ? <BatteryCharging aria-hidden="true" className="h-3.5 w-3.5" /> : <Battery aria-hidden="true" className="h-3.5 w-3.5" />}
                    Battery {d.battery.percent ?? '?'}%{d.battery.charging ? ', charging' : ''}
                  </li>
                ) : null}
                {d.wifi ? (
                  <li className="flex items-center gap-1">
                    {d.wifi.active ? <Wifi aria-hidden="true" className="h-3.5 w-3.5" /> : <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />}
                    {d.wifi.active ? `Wi-Fi ${d.wifi.network}` : 'Wi-Fi off'}
                  </li>
                ) : null}
                {d.updatedAt ? <li>Last report {stampLabel(d.updatedAt)}</li> : null}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </ListShell>
  )
}
