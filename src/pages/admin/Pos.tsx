import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Banknote,
  CircleCheck,
  CreditCard,
  FileText,
  ListChecks,
  Minus,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  ShoppingCart,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import { AdminEmpty, AdminPanel } from '@/components/admin/AdminStates'
import { dayLabel, selectClass, stampLabel, td, th, useAdminAction } from '@/components/admin/AdminKit'
import { TerminalCharge, Warn } from '@/components/admin/TerminalCharge'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui'
import { PAYMENT_METHODS } from '@/lib/admin-ledger'
import { can } from '@/lib/admin-roles'
import {
  api,
  type AccountPreview,
  type PosAccountPayment,
  type PosBalance,
  type PosCustomer,
  type PosItem,
  type PosLine,
  type PosTicket,
} from '@/lib/api'
import { printTicket } from '@/lib/pos-print'
import { cn, moneyExact } from '@/lib/utils'
import { adminToken, handleAdminError, useAdminSession } from '@/store/admin'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * POS — the counter till
 *
 * Sell: pick tyres, services, Square items or type a line; choose the
 * customer (or walk-in); then take payment on the Square Terminal, in
 * cash, another way, or put it on the customer's account to pay later.
 * Every payment lands on the Payments and Balance pages and tyres sold
 * come off the website's stock (see api/_lib/pos.ts).
 * ------------------------------------------------------------------ */

const round2 = (n: number) => Math.round(Number(n || 0) * 100) / 100
const OTHER_METHODS = PAYMENT_METHODS.filter((m) => m !== 'Cash')

const STATUS_LABEL: Record<PosTicket['status'], string> = {
  open: 'Open',
  paid: 'Paid',
  account: 'On account',
  void: 'Cancelled',
}
const STATUS_TONE: Record<PosTicket['status'], 'warning' | 'success' | 'primary' | 'outline'> = {
  open: 'warning',
  paid: 'success',
  account: 'primary',
  void: 'outline',
}

const SOURCES = [
  ['all', 'All'],
  ['tyre', 'Tyres'],
  ['service', 'Services'],
  ['square', 'Square items'],
] as const

interface Draft {
  ref: string | null
  status: PosTicket['status']
  customer: PosCustomer | null
  lines: Array<PosLine & { key: string }>
  discount: number
  note: string
  saved: PosTicket | null
}

const blank = (customer: PosCustomer | null = null): Draft => ({
  ref: null,
  status: 'open',
  customer,
  lines: [],
  discount: 0,
  note: '',
  saved: null,
})

const fromTicket = (t: PosTicket): Draft => ({
  ref: t.ref,
  status: t.status,
  customer: t.customer,
  lines: t.lines.map((l, i) => ({ ...l, key: `${l.source}:${l.itemId || i}:${i}` })),
  discount: t.discount,
  note: t.note,
  saved: t,
})

const who = (c: PosCustomer | null) => (c ? c.company || c.name : 'Walk-in')

/** A GET against the till, with session handling. */
async function posGet<T>(params: Record<string, string>): Promise<T> {
  const token = adminToken()
  if (!token) throw new Error('Signed out')
  return api.admin.pos<T>(token, params)
}

export default function Pos() {
  const [tab, setTab] = useState('sell')
  const [draft, setDraft] = useState<Draft>(blank())
  const [items, setItems] = useState<PosItem[] | null>(null)
  const [itemsNote, setItemsNote] = useState('')
  const [squareReady, setSquareReady] = useState(false)

  const loadItems = useCallback(() => {
    posGet<{ items: PosItem[]; squareError: string; squareReady: boolean }>({ view: 'items' })
      .then((r) => {
        setItems(r.items)
        setItemsNote(r.squareError)
        setSquareReady(r.squareReady)
      })
      .catch((e) => {
        setItems([])
        setItemsNote(handleAdminError(e).message)
      })
  }, [])
  useEffect(loadItems, [loadItems])

  const openTicket = (t: PosTicket) => {
    setDraft(fromTicket(t))
    setTab('sell')
  }

  return (
    <>
      <Seo title="Till (POS) — Spartan Tyres admin" description="Sell at the counter and take payment." noIndex />
      <Tabs value={tab} onValueChange={setTab} defaultValue="sell">
        <TabsList label="Till sections" className="max-w-full overflow-x-auto">
          <TabsTrigger value="sell">
            <ShoppingCart aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Sell
          </TabsTrigger>
          <TabsTrigger value="tickets">
            <ListChecks aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Tickets
          </TabsTrigger>
          <TabsTrigger value="customers">
            <Users aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Customers
          </TabsTrigger>
          <TabsTrigger value="items">
            <Package aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Items
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sell" className="mt-4">
          <SellTab draft={draft} setDraft={setDraft} items={items} itemsNote={itemsNote} onItemsChanged={loadItems} />
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          {tab === 'tickets' ? <TicketsTab onOpen={openTicket} /> : null}
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          {tab === 'customers' ? (
            <CustomersTab
              onNewTicket={(c) => {
                setDraft(blank(c))
                setTab('sell')
              }}
              onOpenTicket={openTicket}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="items" className="mt-4">
          <ItemsTab items={items} note={itemsNote} squareReady={squareReady} reload={loadItems} />
        </TabsContent>
      </Tabs>
    </>
  )
}

/* ================================================================== *
 * Sell
 * ================================================================== */

function ItemPicker({ items, note, onPick, disabled }: { items: PosItem[] | null; note: string; onPick: (i: PosItem) => void; disabled: boolean }) {
  const [q, setQ] = useState('')
  const [src, setSrc] = useState<(typeof SOURCES)[number][0]>('all')
  const term = q.trim().toLowerCase()
  const shown = (items ?? []).filter(
    (i) => (src === 'all' || i.source === src) && (!term || `${i.name} ${i.variation} ${i.sku}`.toLowerCase().includes(term)),
  )
  return (
    <AdminPanel title="Items" bodyClassName="flex flex-col gap-3">
      <div className="relative">
        <Label htmlFor="pos-find" className="sr-only">
          Find an item
        </Label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="pos-find" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tyre size, model, SKU or service…" className="pl-9" autoFocus />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Item type">
        {SOURCES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSrc(id)}
            aria-pressed={src === id}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              src === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {note ? <Warn>{note}</Warn> : null}
      {!items ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !shown.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No items match. Add a custom line on the ticket.</p>
      ) : (
        <div className="grid max-h-[34rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 2xl:grid-cols-3">
          {shown.slice(0, 150).map((i) => (
            <button
              key={i.key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(i)}
              className="flex min-h-[5rem] flex-col justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-semibold leading-snug">{i.name}</span>
                {i.variation ? <span className="block text-xs text-muted-foreground">{i.variation}</span> : null}
              </span>
              <span className="mt-2 flex items-end justify-between gap-2">
                <span className="font-heading text-base font-bold tabular-nums text-primary">{i.price === null ? 'Enter price' : moneyExact(i.price)}</span>
                {i.source === 'tyre' && i.stock !== null ? (
                  <span className={cn('text-[0.6875rem]', i.stock > 0 ? 'text-muted-foreground' : 'font-semibold text-destructive')}>
                    {i.stock > 0 ? `${i.stock} in stock` : 'Out of stock'}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
      {shown.length > 150 ? <p className="text-xs text-muted-foreground">Showing the first 150: search to narrow it down.</p> : null}
    </AdminPanel>
  )
}

function CustomerPicker({ customer, onChange }: { customer: PosCustomer | null; onChange: (c: PosCustomer | null) => void }) {
  const [list, setList] = useState<PosCustomer[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (open && !list) {
      posGet<{ customers: PosCustomer[] }>({ view: 'customers' })
        .then((r) => setList(r.customers))
        .catch(() => setList([]))
    }
  }, [open, list])

  const term = q.trim().toLowerCase()
  const shown = (list ?? []).filter((c) => !term || `${c.name} ${c.company} ${c.email} ${c.phone}`.toLowerCase().includes(term)).slice(0, 30)

  if (customer) {
    return (
      <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
        <div>
          <p className="font-semibold">{who(customer)}</p>
          <p className="text-xs text-muted-foreground">{[customer.company && customer.name !== customer.company ? customer.name : '', customer.phone, customer.email].filter(Boolean).join(' · ')}</p>
          {customer.balance?.due ? <p className="text-xs font-semibold text-destructive">Owes {moneyExact(customer.balance.due)}</p> : null}
        </div>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)} aria-label="Remove customer">
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Label htmlFor="pos-customer" className="sr-only">
            Customer
          </Label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="pos-customer"
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            placeholder="Walk-in, or find a customer…"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <Button variant="outline" onClick={() => setAdding(true)} aria-label="New customer" title="New customer">
          <UserPlus aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lift">
          {!list ? <li className="p-2 text-xs text-muted-foreground">Loading…</li> : !shown.length ? <li className="p-2 text-xs text-muted-foreground">No match. Use + to add a customer.</li> : null}
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                  setQ('')
                }}
              >
                <span className="font-semibold">{who(c)}</span>{' '}
                <span className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                {c.balance?.due ? <span className="text-xs font-semibold text-destructive"> owes {moneyExact(c.balance.due)}</span> : null}
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted" onClick={() => setOpen(false)}>
              Close
            </button>
          </li>
        </ul>
      ) : null}
      <CustomerForm
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(c) => {
          onChange(c)
          setList(null)
        }}
      />
    </div>
  )
}

function SellTab({
  draft,
  setDraft,
  items,
  itemsNote,
  onItemsChanged,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  items: PosItem[] | null
  itemsNote: string
  onItemsChanged: () => void
}) {
  const { run, busy } = useAdminAction()
  const [dirty, setDirty] = useState(false)
  const [custom, setCustom] = useState({ name: '', price: '' })
  const [pricing, setPricing] = useState<PosItem | null>(null)
  const [pay, setPay] = useState<'' | 'card' | 'cash' | 'other' | 'account' | 'account-pay'>('')
  const done = draft.status !== 'open'

  const subtotal = round2(draft.lines.reduce((a, l) => a + l.qty * l.price, 0))
  const discount = Math.min(round2(draft.discount), subtotal)
  const total = round2(subtotal - discount)

  const change = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setDirty(true)
  }
  const setLine = (i: number, patch: Partial<PosLine>) => change({ lines: draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const removeLine = (i: number) => change({ lines: draft.lines.filter((_, j) => j !== i) })

  const addItem = (item: PosItem, price: number) => {
    const same = draft.lines.findIndex((l) => l.key.startsWith(`${item.source}:${item.itemId}:`) && l.price === price)
    if (same >= 0) return setLine(same, { qty: draft.lines[same]!.qty + 1 })
    change({
      lines: [
        ...draft.lines,
        { key: `${item.source}:${item.itemId}:${Date.now()}`, source: item.source, itemId: item.itemId, name: item.name, variation: item.variation, qty: 1, price },
      ],
    })
  }
  const pick = (item: PosItem) => {
    if (item.price === null) return setPricing(item)
    addItem(item, item.price)
  }
  const addCustom = () => {
    const price = round2(Number(custom.price))
    if (!custom.name.trim() || custom.price === '' || !(price >= 0)) return
    change({ lines: [...draft.lines, { key: `custom::${Date.now()}`, source: 'custom', itemId: '', name: custom.name.trim(), variation: '', qty: 1, price }] })
    setCustom({ name: '', price: '' })
  }

  /** Save (create or update) the ticket; returns it, or null if it could not be saved. */
  const save = async (quiet: boolean): Promise<PosTicket | null> => {
    if (!dirty && draft.saved) return draft.saved
    const r = await run(
      (token) =>
        api.admin.posAction<{ ticket: PosTicket }>(token, {
          action: 'ticket-save',
          ref: draft.ref,
          customerId: draft.customer?.id ?? null,
          lines: draft.lines,
          discount,
          note: draft.note,
        }),
      { success: quiet ? undefined : 'Ticket saved', failure: 'Could not save the ticket' },
    )
    if (!r) return null
    const t = { ...r.ticket, customer: draft.customer }
    setDraft({ ...fromTicket(t) })
    setDirty(false)
    return t
  }

  const startPay = async (kind: typeof pay) => {
    const t = await save(true)
    if (!t) return
    if (kind === 'account' && !t.customerId) {
      toast({ title: 'Choose a customer first', description: 'Only a known customer can pay later on account.', variant: 'error' })
      return
    }
    setPay(kind)
  }

  const refresh = async (ref: string) => {
    try {
      const r = await posGet<{ ticket: PosTicket }>({ view: 'ticket', ref })
      setDraft(fromTicket({ ...r.ticket, customer: r.ticket.customer ?? draft.customer }))
      setDirty(false)
      onItemsChanged()
    } catch (e) {
      handleAdminError(e)
    }
  }

  const settled = (t: PosTicket | null | undefined) => {
    if (!t) return
    setDraft(fromTicket({ ...t, customer: t.customer ?? draft.customer }))
    setDirty(false)
    setPay('')
    onItemsChanged()
  }

  const print = async () => {
    const t = done ? draft.saved : await save(true)
    if (t && !printTicket({ ...t, customer: draft.customer })) {
      toast({ title: 'Allow pop-ups for this site to print', variant: 'error' })
    }
  }

  const fresh = () => {
    setDraft(blank())
    setDirty(false)
  }

  const owing = draft.saved ? round2(draft.saved.total - draft.saved.amountPaid) : 0

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
      <ItemPicker items={items} note={itemsNote} onPick={pick} disabled={done} />

      <AdminPanel
        title={draft.ref ?? 'New ticket'}
        description={draft.ref ? <Badge size="sm" variant={STATUS_TONE[draft.status]}>{STATUS_LABEL[draft.status]}</Badge> : 'Pick items, then take payment.'}
        action={
          <Button size="sm" variant="ghost" onClick={fresh}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            New
          </Button>
        }
        bodyClassName="flex flex-col gap-4"
      >
        {done ? (
          <p className="font-semibold">{who(draft.customer)}</p>
        ) : (
          <CustomerPicker customer={draft.customer} onChange={(c) => change({ customer: c })} />
        )}

        {draft.lines.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {draft.lines.map((l, i) => (
              <li key={l.key} className="flex flex-wrap items-center gap-x-2 gap-y-2 p-2.5">
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{l.name}</p>
                    {l.variation ? <p className="text-xs text-muted-foreground">{l.variation}</p> : null}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{moneyExact(l.qty * l.price)}</span>
                </div>
                {done ? (
                  <span className="text-xs text-muted-foreground">
                    {l.qty} × {moneyExact(l.price)}
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => (l.qty > 1 ? setLine(i, { qty: l.qty - 1 }) : removeLine(i))} aria-label={`One less ${l.name}`}>
                      <Minus aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                    <input
                      className="h-8 w-12 rounded-md border border-input bg-background text-center text-sm tabular-nums"
                      type="number"
                      min={1}
                      max={999}
                      value={l.qty}
                      onChange={(e) => setLine(i, { qty: Math.max(1, Math.min(999, Math.round(Number(e.target.value) || 1))) })}
                      aria-label={`Quantity of ${l.name}`}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setLine(i, { qty: l.qty + 1 })} aria-label={`One more ${l.name}`}>
                      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-1 text-xs text-muted-foreground">×</span>
                    <input
                      className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
                      type="number"
                      min={0}
                      step={0.01}
                      value={l.price}
                      onChange={(e) => setLine(i, { price: e.target.value === '' ? 0 : Number(e.target.value) })}
                      aria-label={`Price of ${l.name}`}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLine(i)} aria-label={`Remove ${l.name}`}>
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Pick items on the left, or add a custom line.</p>
        )}

        {!done ? (
          <div className="flex gap-2">
            <Label htmlFor="pos-custom-name" className="sr-only">
              Custom line
            </Label>
            <Input id="pos-custom-name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Custom line, e.g. Labour 1 hr" onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
            <Label htmlFor="pos-custom-price" className="sr-only">
              Custom line price
            </Label>
            <Input id="pos-custom-price" type="number" min={0} step={0.01} value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} placeholder="$" className="w-28" onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
            <Button variant="outline" onClick={addCustom} disabled={!custom.name.trim() || custom.price === ''}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add
            </Button>
          </div>
        ) : null}

        <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{moneyExact(subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              <label htmlFor="pos-discount">Discount</label>
            </dt>
            <dd>
              {done ? (
                discount ? `−${moneyExact(discount)}` : '—'
              ) : (
                <input id="pos-discount" type="number" min={0} step={0.01} value={draft.discount || ''} onChange={(e) => change({ discount: Number(e.target.value) || 0 })} placeholder="0.00" className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums" />
              )}
            </dd>
          </div>
          <div className="flex justify-between font-heading text-2xl font-black">
            <dt>Total</dt>
            <dd className="tabular-nums">{moneyExact(total)}</dd>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <dt>GST included</dt>
            <dd className="tabular-nums">{moneyExact(total / 11)}</dd>
          </div>
        </dl>

        {!done ? (
          <Textarea rows={2} value={draft.note} onChange={(e) => change({ note: e.target.value })} placeholder="Note (rego, job number…)" aria-label="Ticket note" maxLength={500} />
        ) : draft.note ? (
          <p className="text-sm text-muted-foreground">{draft.note}</p>
        ) : null}

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-sm font-semibold">
              <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {draft.status === 'paid'
                ? `Paid${draft.saved?.paymentMethod ? `: ${draft.saved.paymentMethod}` : ''}.`
                : draft.status === 'account'
                  ? `On account: ${moneyExact(owing)} to pay${draft.saved?.dueDate ? ` by ${dayLabel(draft.saved.dueDate)}` : ''}.`
                  : 'Cancelled.'}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {draft.status === 'account' && owing > 0 ? (
                <Button variant="outline" onClick={() => setPay('account-pay')}>
                  <Wallet aria-hidden="true" className="h-4 w-4" />
                  Take payment
                </Button>
              ) : null}
              <Button variant="outline" onClick={print}>
                <Printer aria-hidden="true" className="h-4 w-4" />
                Print
              </Button>
              <Button onClick={fresh}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                New ticket
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => save(false)} disabled={!draft.lines.length} loading={busy}>
                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                Save for later
              </Button>
              <Button variant="ghost" size="sm" onClick={print} disabled={!draft.lines.length}>
                <Printer aria-hidden="true" className="h-3.5 w-3.5" />
                Print quote
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" onClick={() => startPay('card')} disabled={!draft.lines.length || !(total > 0)}>
                <Smartphone aria-hidden="true" className="h-5 w-5" />
                Terminal
              </Button>
              <Button size="lg" variant="outline" onClick={() => startPay('cash')} disabled={!draft.lines.length}>
                <Banknote aria-hidden="true" className="h-5 w-5" />
                Cash
              </Button>
              <Button size="lg" variant="outline" onClick={() => startPay('other')} disabled={!draft.lines.length}>
                <CreditCard aria-hidden="true" className="h-5 w-5" />
                Other
              </Button>
              <Button size="lg" variant="outline" onClick={() => startPay('account')} disabled={!draft.lines.length} title="The customer pays later, by a due date">
                <FileText aria-hidden="true" className="h-5 w-5" />
                On account
              </Button>
            </div>
          </div>
        )}
      </AdminPanel>

      <PriceDialog item={pricing} onClose={() => setPricing(null)} onPrice={(p) => pricing && addItem(pricing, p)} />

      <TerminalCharge
        open={pay === 'card'}
        kind="ticket"
        payload={{ ref: draft.ref }}
        amount={total}
        label={`Ticket ${draft.ref ?? ''}`}
        onClose={() => setPay('')}
        onPaid={() => draft.ref && refresh(draft.ref)}
      />
      <CashDialog
        open={pay === 'cash'}
        total={total}
        label={`Ticket ${draft.ref ?? ''}`}
        onClose={() => setPay('')}
        onPay={async (tendered) => {
          const r = await run(
            (token) => api.admin.posAction<{ ticket: PosTicket; change: number }>(token, { action: 'ticket-cash', ref: draft.ref, tendered }),
            { failure: 'Could not record the cash' },
          )
          if (r) {
            toast({ title: r.change ? `Paid. Change: ${moneyExact(r.change)}` : 'Paid in cash', variant: 'success' })
            settled(r.ticket)
          }
        }}
      />
      <OtherDialog
        open={pay === 'other'}
        total={total}
        onClose={() => setPay('')}
        onPay={async (method) => {
          const r = await run(
            (token) => api.admin.posAction<{ ticket: PosTicket }>(token, { action: 'ticket-other', ref: draft.ref, method }),
            { success: `Paid: ${method}`, failure: 'Could not record the payment' },
          )
          if (r) settled(r.ticket)
        }}
      />
      <AccountDialog
        open={pay === 'account'}
        total={total}
        customer={draft.customer}
        onClose={() => setPay('')}
        onConfirm={async (dueDays) => {
          const r = await run(
            (token) => api.admin.posAction<{ ticket: PosTicket; dueDate: string }>(token, { action: 'ticket-account', ref: draft.ref, dueDays }),
            { failure: 'Could not put it on account' },
          )
          if (r) {
            toast({ title: `On ${who(draft.customer)}'s account`, description: `Due ${dayLabel(r.dueDate)}`, variant: 'success' })
            settled(r.ticket)
          }
        }}
      />
      {draft.customer && draft.saved ? (
        <AccountPayment
          open={pay === 'account-pay'}
          customer={draft.customer}
          ticket={draft.saved.ref}
          onClose={() => setPay('')}
          onPaid={() => draft.ref && refresh(draft.ref)}
        />
      ) : null}
    </div>
  )
}

/* ---- Small payment dialogs ---------------------------------------- */

function PriceDialog({ item, onClose, onPrice }: { item: PosItem | null; onClose: () => void; onPrice: (price: number) => void }) {
  const [value, setValue] = useState('')
  useEffect(() => setValue(''), [item])
  const price = round2(Number(value))
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value === '' || !(price >= 0)) return
            onPrice(price)
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Price for {item?.name}</DialogTitle>
            <DialogDescription>{item?.variation || 'Enter what to charge, GST included.'}</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2">
            <Field label="Price (inc. GST)" htmlFor="pos-price-input" required>
              <Input id="pos-price-input" type="number" min={0} step={0.01} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={value === '' || !(price >= 0)}>
              Add to ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CashDialog({ open, total, label, onClose, onPay }: { open: boolean; total: number; label: string; onClose: () => void; onPay: (tendered: number | undefined) => Promise<void> }) {
  const [cash, setCash] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setCash(''), [open])
  const tendered = cash === '' ? total : Number(cash)
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (tendered < total) return
            setBusy(true)
            await onPay(cash === '' ? undefined : Number(cash))
            setBusy(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Cash payment</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-2">
            <p className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4 font-heading text-3xl font-black tabular-nums">
              <Banknote aria-hidden="true" className="h-6 w-6 text-primary" />
              {moneyExact(total)}
            </p>
            <Field label="Cash given (leave empty if exact)" htmlFor="pos-cash">
              <Input id="pos-cash" type="number" min={0} step={0.01} inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={total.toFixed(2)} autoFocus />
            </Field>
            {cash !== '' ? (
              <p className={cn('text-lg font-bold', tendered >= total ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                {tendered >= total ? `Change: ${moneyExact(tendered - total)}` : 'Less than the total'}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={busy} disabled={tendered < total}>
              <Banknote aria-hidden="true" className="h-4 w-4" />
              Paid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function OtherDialog({ open, total, onClose, onPay }: { open: boolean; total: number; onClose: () => void; onPay: (method: string) => Promise<void> }) {
  const [method, setMethod] = useState<string>(OTHER_METHODS[0]!)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            await onPay(method)
            setBusy(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Paid another way</DialogTitle>
            <DialogDescription>{moneyExact(total)}: card on another machine, bank transfer, cheque…</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2">
            <Field label="How it was paid" htmlFor="pos-other-method">
              <select id="pos-other-method" className={cn(selectClass, 'w-full')} value={method} onChange={(e) => setMethod(e.target.value)}>
                {OTHER_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={busy}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AccountDialog({ open, total, customer, onClose, onConfirm }: { open: boolean; total: number; customer: PosCustomer | null; onClose: () => void; onConfirm: (dueDays: number) => Promise<void> }) {
  const [days, setDays] = useState(customer?.termsDays ?? 14)
  const [busy, setBusy] = useState(false)
  useEffect(() => setDays(customer?.termsDays ?? 14), [customer, open])
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            await onConfirm(days)
            setBusy(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Pay later, on account</DialogTitle>
            <DialogDescription>
              {who(customer)} takes the goods now and pays {moneyExact(total)} later. It adds to what they owe on the Customers tab.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-2">
            <Field label="Payment due" htmlFor="pos-due">
              <select id="pos-due" className={cn(selectClass, 'w-full')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[...new Set([0, 7, 14, 30, 60, customer?.termsDays ?? 14])].sort((a, b) => a - b).map((d) => (
                  <option key={d} value={d}>
                    {d ? `In ${d} days` : 'Today'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={busy}>
              <FileText aria-hidden="true" className="h-4 w-4" />
              Put on account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Take money towards what a customer owes: any amount, split across their
 * account tickets most overdue first (or one ticket only), by Terminal,
 * cash or another way. Shows what it pays off before it is taken.
 */
function AccountPayment({ open, customer, ticket, onClose, onPaid }: { open: boolean; customer: PosCustomer; ticket?: string; onClose: () => void; onPaid: () => void }) {
  const { run, busy } = useAdminAction()
  const [amount, setAmount] = useState('')
  const [preview, setPreview] = useState<AccountPreview | null>(null)
  const [error, setError] = useState('')
  const [method, setMethod] = useState<'' | 'card' | 'cash' | 'other'>('')
  const [cash, setCash] = useState('')
  const [other, setOther] = useState<string>(OTHER_METHODS[0]!)

  useEffect(() => {
    if (!open) return
    setAmount('')
    setMethod('')
    setCash('')
    setError('')
    setPreview(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      posGet<AccountPreview>({ view: 'account-preview', id: customer.id, amount: String(Number(amount) || 0), ...(ticket ? { ticket } : {}) })
        .then((r) => {
          setPreview(r)
          setError('')
          // A single ticket: start at what it still owes.
          if (ticket && amount === '' && r.owed) setAmount(String(r.owed))
        })
        .catch((e) => setError(handleAdminError(e).message))
    }, 300)
    return () => clearTimeout(timer)
  }, [open, customer.id, amount, ticket])

  const amt = round2(Number(amount))
  const owed = preview?.owed ?? 0
  const ready = amt > 0 && amt <= owed && Boolean(preview?.allocations.length) && !error

  const finish = (detail?: string) => {
    toast({ title: `${moneyExact(amt)} taken`, description: detail, variant: 'success' })
    onPaid()
    onClose()
  }

  return (
    <>
      <Dialog open={open && method !== 'card'} onOpenChange={(o) => (!o ? onClose() : undefined)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Take a payment · {who(customer)}</DialogTitle>
            <DialogDescription>{ticket ? `Towards ticket ${ticket}.` : 'Paid off oldest due first.'}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-2">
            <p className="text-sm">
              Owes <span className="font-heading text-xl font-black">{moneyExact(owed)}</span>
              {preview ? <span className="text-muted-foreground"> across {preview.tickets.length} ticket{preview.tickets.length === 1 ? '' : 's'}</span> : null}
            </p>
            <Field label="Amount to pay now" htmlFor="acct-amount" required>
              <Input id="acct-amount" type="number" min={0.01} step={0.01} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </Field>
            {owed > 0 && !ticket ? (
              <div>
                <Button size="sm" variant="outline" onClick={() => setAmount(String(owed))}>
                  Everything {moneyExact(owed)}
                </Button>
              </div>
            ) : null}
            {error ? <Warn>{error}</Warn> : null}
            {ready && preview ? (
              <div className="rounded-md border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">What this payment pays off</caption>
                  <thead>
                    <tr>
                      <th className={th}>Ticket</th>
                      <th className={cn(th, 'text-right')}>Paid now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.allocations.map((a) => (
                      <tr key={a.ticketRef}>
                        <td className={cn(td, 'font-mono text-xs')}>{a.ticketRef}</td>
                        <td className={cn(td, 'text-right font-semibold tabular-nums')}>
                          {moneyExact(a.amount)} <span className="text-xs font-normal text-muted-foreground">{a.settles ? 'paid off' : 'part'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="p-3 text-xs text-muted-foreground">After this, {who(customer)} owes {moneyExact(preview.left)}.</p>
              </div>
            ) : null}
            {method === 'cash' ? (
              <Field label="Cash given (leave empty if exact)" htmlFor="acct-cash">
                <Input id="acct-cash" type="number" min={0} step={0.01} value={cash} onChange={(e) => setCash(e.target.value)} placeholder={amt.toFixed(2)} />
              </Field>
            ) : null}
            {method === 'cash' && cash !== '' && Number(cash) >= amt ? <p className="font-bold text-emerald-600 dark:text-emerald-400">Change: {moneyExact(Number(cash) - amt)}</p> : null}
            {method === 'other' ? (
              <Field label="How it was paid" htmlFor="acct-other">
                <select id="acct-other" className={cn(selectClass, 'w-full')} value={other} onChange={(e) => setOther(e.target.value)}>
                  {OTHER_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
          <DialogFooter>
            {method ? (
              <>
                <Button variant="ghost" onClick={() => setMethod('')}>
                  Back
                </Button>
                <Button
                  loading={busy}
                  disabled={!ready || (method === 'cash' && cash !== '' && Number(cash) < amt)}
                  onClick={async () => {
                    const r = await run(
                      (token) =>
                        api.admin.posAction<{ detail: string; change?: number }>(token, {
                          action: method === 'cash' ? 'account-cash' : 'account-other',
                          customerId: customer.id,
                          amount: amt,
                          ticket,
                          ...(method === 'cash' ? { tendered: cash === '' ? undefined : Number(cash) } : { method: other }),
                        }),
                      { failure: 'Could not record the payment' },
                    )
                    if (r) finish(r.detail)
                  }}
                >
                  Paid {moneyExact(amt)}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button variant="outline" disabled={!ready} onClick={() => setMethod('other')}>
                  Other
                </Button>
                <Button variant="outline" disabled={!ready} onClick={() => setMethod('cash')}>
                  <Banknote aria-hidden="true" className="h-4 w-4" />
                  Cash
                </Button>
                <Button disabled={!ready} onClick={() => setMethod('card')}>
                  <Smartphone aria-hidden="true" className="h-4 w-4" />
                  Terminal
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TerminalCharge
        open={open && method === 'card'}
        kind="account"
        payload={{ customerId: customer.id, amount: amt, ticket }}
        amount={amt}
        label={`Towards ${who(customer)}'s account`}
        onClose={() => {
          setMethod('')
          onClose()
        }}
        onPaid={() => onPaid()}
      />
    </>
  )
}

/* ================================================================== *
 * Tickets
 * ================================================================== */

const TICKET_FILTERS = [
  ['open', 'Open'],
  ['account', 'On account'],
  ['paid', 'Paid'],
  ['void', 'Cancelled'],
  ['', 'All'],
] as const

function TicketsTab({ onOpen }: { onOpen: (t: PosTicket) => void }) {
  const { run } = useAdminAction()
  const [status, setStatus] = useState<string>('open')
  const [list, setList] = useState<PosTicket[] | null>(null)
  const [paying, setPaying] = useState<PosTicket | null>(null)

  const load = useCallback(() => {
    setList(null)
    posGet<{ tickets: PosTicket[] }>({ view: 'tickets', status })
      .then((r) => setList(r.tickets))
      .catch((e) => {
        handleAdminError(e)
        setList([])
      })
  }, [status])
  useEffect(load, [load])

  const cancel = async (t: PosTicket) => {
    if (!window.confirm(`Cancel ticket ${t.ref}?`)) return
    const r = await run((token) => api.admin.posAction(token, { action: 'ticket-void', ref: t.ref }), { success: `Ticket ${t.ref} cancelled`, failure: 'Could not cancel' })
    if (r) load()
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <AdminPanel title="Tickets" bodyClassName="p-0 md:p-0">
      <div className="flex flex-wrap gap-1.5 border-b border-border p-4 md:px-5" role="group" aria-label="Ticket status">
        {TICKET_FILTERS.map(([id, label]) => (
          <button
            key={id || 'all'}
            type="button"
            onClick={() => setStatus(id)}
            aria-pressed={status === id}
            className={cn('rounded-full border px-3 py-1 text-xs font-semibold', status === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
          >
            {label}
          </button>
        ))}
      </div>
      {!list ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : !list.length ? (
        <AdminEmpty title="No tickets here" icon={ListChecks} className="rounded-none border-0 bg-transparent" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Tickets</caption>
            <thead>
              <tr>
                <th className={th}>Ticket</th>
                <th className={th}>Customer</th>
                <th className={th}>Items</th>
                <th className={cn(th, 'text-right')}>Total</th>
                <th className={th}>Status</th>
                <th className={th}>Updated</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const owing = round2(t.total - t.amountPaid)
                return (
                  <tr key={t.ref} className="hover:bg-muted/30">
                    <td className={cn(td, 'font-mono text-xs')}>{t.ref}</td>
                    <td className={td}>{t.customer ? who(t.customer) : <span className="text-muted-foreground">Walk-in</span>}</td>
                    <td className={cn(td, 'max-w-xs text-xs')}>{t.lines.map((l) => `${l.qty} × ${l.name}`).join(', ').slice(0, 90)}</td>
                    <td className={cn(td, 'text-right font-semibold tabular-nums')}>{moneyExact(t.total)}</td>
                    <td className={td}>
                      <Badge size="sm" variant={STATUS_TONE[t.status]}>
                        {STATUS_LABEL[t.status]}
                      </Badge>
                      {t.status === 'paid' && t.paymentMethod ? <p className="text-xs text-muted-foreground">{t.paymentMethod}</p> : null}
                      {t.status === 'account' ? (
                        <p className={cn('text-xs', t.dueDate && t.dueDate < today ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                          {moneyExact(owing)} due {t.dueDate ? dayLabel(t.dueDate) : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-xs text-muted-foreground')}>{stampLabel(t.updatedAt)}</td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <Button size="sm" variant="ghost" onClick={() => onOpen(t)}>
                        {t.status === 'open' ? 'Open' : 'View'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => printTicket(t)} aria-label={`Print ${t.ref}`} title="Print">
                        <Printer aria-hidden="true" className="h-3.5 w-3.5" />
                      </Button>
                      {t.status === 'open' ? (
                        <Button size="sm" variant="ghost" onClick={() => cancel(t)} aria-label={`Cancel ${t.ref}`} title="Cancel">
                          <Ban aria-hidden="true" className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {t.status === 'account' && owing > 0 && t.customer ? (
                        <Button size="sm" onClick={() => setPaying(t)}>
                          <Wallet aria-hidden="true" className="h-3.5 w-3.5" />
                          Pay
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {paying?.customer ? (
        <AccountPayment open customer={paying.customer} ticket={paying.ref} onClose={() => setPaying(null)} onPaid={load} />
      ) : null}
    </AdminPanel>
  )
}

/* ================================================================== *
 * Customers
 * ================================================================== */

const EMPTY_CUSTOMER = { name: '', company: '', email: '', phone: '', address: '', notes: '', termsDays: 14 }

function CustomerForm({ open, initial, onClose, onSaved }: { open: boolean; initial?: PosCustomer | null; onClose: () => void; onSaved?: (c: PosCustomer) => void }) {
  const { run, busy } = useAdminAction()
  const [c, setC] = useState(EMPTY_CUSTOMER)
  useEffect(() => {
    if (open) setC({ ...EMPTY_CUSTOMER, ...(initial ?? {}) })
  }, [open, initial])

  const field = (key: keyof typeof EMPTY_CUSTOMER, label: string, type = 'text', wide = false) => (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <Field label={label} htmlFor={`cust-${key}`}>
        {key === 'notes' ? (
          <Textarea id={`cust-${key}`} rows={2} value={String(c[key])} onChange={(e) => setC({ ...c, [key]: e.target.value })} />
        ) : (
          <Input id={`cust-${key}`} type={type} value={String(c[key])} onChange={(e) => setC({ ...c, [key]: type === 'number' ? Number(e.target.value) : e.target.value })} />
        )}
      </Field>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="lg">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await run((token) => api.admin.posAction<{ customer: PosCustomer }>(token, { action: 'customer-save', customer: { ...c, id: initial?.id } }), {
              success: 'Customer saved',
              failure: 'Could not save the customer',
            })
            if (r) {
              onSaved?.(r.customer)
              onClose()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial?.id ? 'Edit customer' : 'New customer'}</DialogTitle>
            <DialogDescription>Counter customers: fleets, workshops and regulars. A name or a company is enough.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-2 sm:grid-cols-2">
            {field('name', 'Name')}
            {field('company', 'Company')}
            {field('email', 'Email', 'email')}
            {field('phone', 'Phone', 'tel')}
            {field('address', 'Address', 'text', true)}
            {field('termsDays', 'Days to pay on account', 'number')}
            {field('notes', 'Notes', 'text', true)}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={busy} disabled={!(c.name.trim() || c.company.trim())}>
              <Save aria-hidden="true" className="h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CustomerDetail({ id, onClose, onChanged, onNewTicket, onOpenTicket }: { id: string | null; onClose: () => void; onChanged: () => void; onNewTicket: (c: PosCustomer) => void; onOpenTicket: (t: PosTicket) => void }) {
  const [d, setD] = useState<{ customer: PosCustomer; balance: PosBalance; tickets: PosTicket[]; payments: PosAccountPayment[] } | null>(null)
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    posGet<typeof d & object>({ view: 'customer', id })
      .then(setD)
      .catch((e) => handleAdminError(e))
  }, [id])
  useEffect(() => {
    setD(null)
    load()
  }, [load])

  const c = d?.customer
  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{c ? who(c) : 'Customer'}</DialogTitle>
          <DialogDescription>{c ? [c.company && c.name !== c.company ? c.name : '', c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details' : 'Loading…'}</DialogDescription>
        </DialogHeader>
        {!d || !c ? (
          <div className="px-6 pb-6">
            <Skeleton className="h-40" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-6 pb-6">
            {c.address ? <p className="text-sm text-muted-foreground">{c.address}</p> : null}
            {c.notes ? <p className="text-sm">{c.notes}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onNewTicket(c)}>
                <ShoppingCart aria-hidden="true" className="h-3.5 w-3.5" />
                New ticket
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                Edit
              </Button>
              {d.balance.due > 0 ? (
                <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
                  <Wallet aria-hidden="true" className="h-3.5 w-3.5" />
                  Take a payment
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Owes on account</p>
                <p className="font-heading text-2xl font-black tabular-nums">{moneyExact(d.balance.due)}</p>
                <p className="text-xs text-muted-foreground">{d.balance.count} ticket{d.balance.count === 1 ? '' : 's'}</p>
              </div>
              <div className={cn('rounded-lg border p-4', d.balance.overdue ? 'border-destructive/50 bg-destructive/5' : 'border-border')}>
                <p className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Overdue</p>
                <p className={cn('font-heading text-2xl font-black tabular-nums', d.balance.overdue && 'text-destructive')}>{moneyExact(d.balance.overdue)}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Terms</p>
                <p className="font-heading text-2xl font-black">{c.termsDays} days</p>
              </div>
            </div>

            <section>
              <h3 className="mb-2 font-heading text-xs font-bold uppercase tracking-brand">Tickets</h3>
              {d.tickets.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">This customer's tickets</caption>
                    <thead>
                      <tr>
                        <th className={th}>Ticket</th>
                        <th className={th}>When</th>
                        <th className={cn(th, 'text-right')}>Total</th>
                        <th className={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.tickets.map((t) => (
                        <tr key={t.ref} className="cursor-pointer hover:bg-muted/30" onClick={() => onOpenTicket(t)}>
                          <td className={cn(td, 'font-mono text-xs')}>{t.ref}</td>
                          <td className={cn(td, 'text-xs')}>{stampLabel(t.paidAt || t.updatedAt)}</td>
                          <td className={cn(td, 'text-right tabular-nums')}>{moneyExact(t.total)}</td>
                          <td className={td}>
                            <Badge size="sm" variant={STATUS_TONE[t.status]}>
                              {STATUS_LABEL[t.status]}
                            </Badge>
                            {t.status === 'account' ? <span className="ml-1 text-xs text-muted-foreground">{moneyExact(t.total - t.amountPaid)} due {t.dueDate ? dayLabel(t.dueDate) : ''}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tickets yet.</p>
              )}
            </section>

            {d.payments.length ? (
              <section>
                <h3 className="mb-2 font-heading text-xs font-bold uppercase tracking-brand">Account payments</h3>
                <ul className="divide-y divide-border rounded-md border border-border text-sm">
                  {d.payments.map((p) => (
                    <li key={p.ref} className="flex flex-wrap justify-between gap-2 p-2.5">
                      <span>
                        <span className="font-semibold">{moneyExact(p.amount)}</span> {p.methodLabel}{' '}
                        <span className="text-xs text-muted-foreground">
                          {stampLabel(p.paidAt ?? p.createdAt)} · {p.allocations.map((a) => a.ticketRef).join(', ')}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{p.ref}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <CustomerForm
              open={editing}
              initial={c}
              onClose={() => setEditing(false)}
              onSaved={() => {
                load()
                onChanged()
              }}
            />
            <AccountPayment
              open={paying}
              customer={c}
              onClose={() => setPaying(false)}
              onPaid={() => {
                load()
                onChanged()
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CustomersTab({ onNewTicket, onOpenTicket }: { onNewTicket: (c: PosCustomer) => void; onOpenTicket: (t: PosTicket) => void }) {
  const [list, setList] = useState<PosCustomer[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    posGet<{ customers: PosCustomer[] }>({ view: 'customers' })
      .then((r) => setList(r.customers))
      .catch((e) => {
        handleAdminError(e)
        setList([])
      })
  }, [])
  useEffect(load, [load])

  const term = q.trim().toLowerCase()
  const shown = (list ?? []).filter((c) => !term || `${c.name} ${c.company} ${c.email} ${c.phone}`.toLowerCase().includes(term))
  const owing = (list ?? []).filter((c) => (c.balance?.due ?? 0) > 0)
  const totalOwed = owing.reduce((a, c) => a + (c.balance?.due ?? 0), 0)
  const totalOverdue = owing.reduce((a, c) => a + (c.balance?.overdue ?? 0), 0)

  return (
    <AdminPanel
      title="Counter customers"
      description={
        owing.length
          ? `${owing.length} customer${owing.length === 1 ? ' owes' : 's owe'} ${moneyExact(totalOwed)} in total${totalOverdue ? `, ${moneyExact(totalOverdue)} of it overdue` : ''}.`
          : 'Fleets, workshops and regulars who buy at the counter.'
      }
      bodyClassName="p-0 md:p-0"
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus aria-hidden="true" className="h-3.5 w-3.5" />
          New customer
        </Button>
      }
    >
      <div className="border-b border-border p-4 md:px-5">
        <div className="relative max-w-sm">
          <Label htmlFor="cust-search" className="sr-only">
            Search customers
          </Label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="cust-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, email, phone" className="pl-9" />
        </div>
      </div>
      {!list ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : !shown.length ? (
        <AdminEmpty title={list.length ? 'No one matches' : 'No counter customers yet'} icon={Users} className="rounded-none border-0 bg-transparent" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Counter customers</caption>
            <thead>
              <tr>
                <th className={th}>Customer</th>
                <th className={th}>Email</th>
                <th className={th}>Phone</th>
                <th className={cn(th, 'text-right')}>Owes</th>
                <th className={cn(th, 'text-right')}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpen(c.id)}>
                  <td className={td}>
                    <button type="button" className="text-left font-semibold hover:underline" onClick={() => setOpen(c.id)}>
                      {who(c)}
                    </button>
                    {c.company && c.name !== c.company ? <p className="text-xs text-muted-foreground">{c.name}</p> : null}
                  </td>
                  <td className={cn(td, 'text-xs')}>{c.email}</td>
                  <td className={cn(td, 'text-xs')}>{c.phone}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{c.balance?.due ? <span className="font-semibold">{moneyExact(c.balance.due)}</span> : '—'}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{c.balance?.overdue ? <span className="font-semibold text-destructive">{moneyExact(c.balance.overdue)}</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CustomerForm
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(c) => {
          load()
          setOpen(c.id)
        }}
      />
      <CustomerDetail
        id={open}
        onClose={() => setOpen(null)}
        onChanged={load}
        onNewTicket={(c) => {
          setOpen(null)
          onNewTicket(c)
        }}
        onOpenTicket={(t) => {
          setOpen(null)
          onOpenTicket(t)
        }}
      />
    </AdminPanel>
  )
}

/* ================================================================== *
 * Items
 * ================================================================== */

function ItemsTab({ items, note, squareReady, reload }: { items: PosItem[] | null; note: string; squareReady: boolean; reload: () => void }) {
  const { user } = useAdminSession()
  const canEdit = squareReady && can(user.role, 'pricing')
  const [q, setQ] = useState('')
  const [src, setSrc] = useState<(typeof SOURCES)[number][0]>('all')
  const [edit, setEdit] = useState<PosItem | 'new' | null>(null)
  const term = q.trim().toLowerCase()
  const shown = useMemo(
    () => (items ?? []).filter((i) => (src === 'all' || i.source === src) && (!term || `${i.name} ${i.variation} ${i.sku}`.toLowerCase().includes(term))),
    [items, src, term],
  )

  return (
    <AdminPanel
      title="Items"
      description="Everything the till can sell: the website's tyres (prices and stock from Products and Inventory), the service price list, and the Square item library."
      bodyClassName="p-0 md:p-0"
      action={
        canEdit ? (
          <Button size="sm" onClick={() => setEdit('new')}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            New Square item
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4 md:px-5">
        <div className="relative w-full max-w-sm">
          <Label htmlFor="items-search" className="sr-only">
            Search items
          </Label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="items-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item" className="pl-9" />
        </div>
        <Label htmlFor="items-src" className="sr-only">
          Item type
        </Label>
        <select id="items-src" className={selectClass} value={src} onChange={(e) => setSrc(e.target.value as typeof src)}>
          {SOURCES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {note ? (
        <div className="p-4 md:px-5">
          <Warn>{note}</Warn>
        </div>
      ) : null}
      {!squareReady ? (
        <p className="px-4 pt-4 text-xs text-muted-foreground md:px-5">Square is not set up on this server, so the Square item library is not shown.</p>
      ) : null}
      {!items ? (
        <div className="p-5">
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Items the till can sell</caption>
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Where</th>
                <th className={cn(th, 'text-right')}>Price</th>
                <th className={cn(th, 'text-right')}>Stock</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.key} className="hover:bg-muted/30">
                  <td className={td}>
                    <p className="font-semibold">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{[i.variation, i.sku].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className={cn(td, 'text-xs')}>{i.source === 'tyre' ? 'Website tyre' : i.source === 'service' ? 'Service price list' : 'Square'}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{i.price === null ? <span className="text-muted-foreground">Enter at sale</span> : moneyExact(i.price)}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>{i.source === 'tyre' ? i.stock : ''}</td>
                  <td className={cn(td, 'text-right')}>
                    {i.source === 'square' && i.singlePrice && canEdit ? (
                      <Button size="sm" variant="ghost" onClick={() => setEdit(i)}>
                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SquareItemForm item={edit} onClose={() => setEdit(null)} onSaved={reload} />
    </AdminPanel>
  )
}

function SquareItemForm({ item, onClose, onSaved }: { item: PosItem | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const { run, busy } = useAdminAction()
  const existing = item && item !== 'new' ? item : null
  const [f, setF] = useState({ name: '', price: '', description: '' })
  useEffect(() => {
    if (item) setF({ name: existing?.name ?? '', price: existing?.price != null ? String(existing.price) : '', description: '' })
  }, [item])
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent size="md">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const r = await run(
              (token) =>
                api.admin.posAction<{ item: { name: string } }>(token, {
                  action: 'item-save',
                  id: existing?.squareItemId,
                  name: f.name,
                  price: f.price === '' ? null : Number(f.price),
                  description: f.description,
                }),
              { success: 'Saved in Square', failure: 'Could not save the item' },
            )
            if (r) {
              onSaved()
              onClose()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{existing ? 'Change Square item' : 'New Square item'}</DialogTitle>
            <DialogDescription>Saved in the Square item library, so it also shows on the Square Terminal and in the Square Dashboard.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-2">
            <Field label="Name" htmlFor="sq-name" required>
              <Input id="sq-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Price inc. GST" htmlFor="sq-price" hint="Leave empty to enter the price when selling.">
              <Input id="sq-price" type="number" min={0} step={0.01} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            </Field>
            {!existing ? (
              <Field label="Description (optional)" htmlFor="sq-desc">
                <Input id="sq-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              </Field>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={busy} disabled={!f.name.trim()}>
              <Save aria-hidden="true" className="h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
