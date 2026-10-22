import { useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from '@/components/ui'
import { parseMoney, selectClass, todayLocal, useAdminAction } from '@/components/admin/AdminKit'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  gstInside,
} from '@/lib/admin-ledger'
import { api, type LedgerEntry, type LedgerType, type UnpaidOrder } from '@/lib/api'
import { cn, moneyExact } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Record or edit a payment, refund or expense
 *
 * Amounts are entered as the full amount that moved, GST included, and
 * the GST inside it is worked out (one eleventh) unless the box says it
 * was GST-free — the way Australian receipts and BAS both read.
 * ------------------------------------------------------------------ */

export interface LedgerPreset {
  orderId?: string
  amount?: number
  counterparty?: string
  reference?: string
  category?: string
}

const TITLES: Record<LedgerType, string> = {
  payment: 'Record a payment received',
  refund: 'Record a refund',
  expense: 'Record an expense',
}

export function LedgerDialog({
  type: initialType,
  entry,
  preset,
  unpaidOrders = [],
  today,
  onClose,
  onSaved,
}: {
  type: LedgerType
  entry?: LedgerEntry
  preset?: LedgerPreset
  unpaidOrders?: UnpaidOrder[]
  today?: string
  onClose: () => void
  onSaved: (entry: LedgerEntry, orderMarkedPaid: boolean) => void
}) {
  const { run, busy } = useAdminAction()
  const type = entry?.type ?? initialType
  const categories: readonly string[] = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  const [date, setDate] = useState(entry?.date ?? today ?? todayLocal())
  const [amount, setAmount] = useState(
    entry ? String(entry.amount) : preset?.amount != null ? String(preset.amount) : '',
  )
  const [hasGst, setHasGst] = useState(entry ? entry.gst > 0 : preset?.category !== 'Wages')
  const [category, setCategory] = useState(
    entry?.category ?? preset?.category ?? (type === 'expense' ? 'Other expense' : 'In-store sales'),
  )
  const [method, setMethod] = useState(entry?.method ?? 'Bank transfer')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [reference, setReference] = useState(entry?.reference ?? preset?.reference ?? '')
  const [counterparty, setCounterparty] = useState(entry?.counterparty ?? preset?.counterparty ?? '')
  const [orderId, setOrderId] = useState(entry?.orderId ?? preset?.orderId ?? '')
  const [markPaid, setMarkPaid] = useState(Boolean(preset?.orderId))
  const [error, setError] = useState<string | null>(null)

  const value = parseMoney(amount)
  const gst = value && hasGst ? gstInside(value) : 0

  const pickOrder = (id: string) => {
    setOrderId(id)
    const order = unpaidOrders.find((o) => o.id === id)
    if (!order) return
    const remaining = Math.max(Math.round((order.total - order.paidSoFar) * 100) / 100, 0)
    if (!amount && remaining) setAmount(String(remaining))
    if (!counterparty) setCounterparty(order.customer)
    if (!reference) setReference(order.reference)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!date) return setError('Pick the date the money moved.')
    if (value === null || value <= 0) return setError('Enter an amount more than $0.')

    const input = {
      type,
      date,
      amount: value,
      gst,
      category,
      method,
      description: description.trim(),
      reference: reference.trim(),
      counterparty: counterparty.trim(),
      ...(type !== 'expense' && orderId ? { orderId } : { orderId: '' }),
    }

    const result = await run(
      (token) =>
        entry
          ? api.admin.updateLedgerEntry(token, entry.id, input)
          : api.admin.createLedgerEntry(token, { ...input, markOrderPaid: type === 'payment' && Boolean(orderId) && markPaid }),
      {
        success: entry ? 'Saved' : `${type === 'expense' ? 'Expense' : type === 'refund' ? 'Refund' : 'Payment'} of ${moneyExact(value)} recorded`,
        failure: 'Could not save that',
      },
    )
    if (result) onSaved(result.entry, result.orderMarkedPaid)
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{entry ? `Edit ${type}` : TITLES[type]}</DialogTitle>
            <DialogDescription>
              {type === 'expense'
                ? 'Money the business paid out. Enter the full amount including any GST.'
                : type === 'refund'
                  ? 'Money given back to a customer outside the website. Website card refunds are made in Square and show automatically when the order is cancelled.'
                  : 'Money received outside the website checkout: bank transfer, cash, in-store card, fleet accounts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
            <Field label="Date" htmlFor="ledger-date" required>
              <Input id="ledger-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Amount (inc. GST)" htmlFor="ledger-amount" required hint={value ? `GST inside: ${moneyExact(gst)}` : undefined}>
              <Input id="ledger-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox id="ledger-gst" checked={hasGst} onChange={(e) => setHasGst(e.target.checked)} label="Includes 10% GST (untick for GST-free items such as wages and bank fees)" />
            </div>
            <Field label="Category" htmlFor="ledger-category">
              <select id="ledger-category" className={cn(selectClass, 'w-full')} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Paid by" htmlFor="ledger-method">
              <select id="ledger-method" className={cn(selectClass, 'w-full')} value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label={type === 'expense' ? 'Paid to (supplier)' : 'Customer'} htmlFor="ledger-party">
              <Input id="ledger-party" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={120} />
            </Field>
            <Field label={type === 'expense' ? 'Invoice / receipt number' : 'Reference'} htmlFor="ledger-ref">
              <Input id="ledger-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="ledger-desc">
                <Input id="ledger-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
              </Field>
            </div>

            {type !== 'expense' && (unpaidOrders.length || orderId) ? (
              <div className="sm:col-span-2">
                <Field label="For a website order awaiting payment" htmlFor="ledger-order">
                  <select id="ledger-order" className={cn(selectClass, 'w-full')} value={orderId} onChange={(e) => pickOrder(e.target.value)}>
                    <option value="">Not linked to an order</option>
                    {unpaidOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.reference} · {o.customer} · {moneyExact(o.total)}
                        {o.paidSoFar ? ` (${moneyExact(o.paidSoFar)} paid)` : ''}
                      </option>
                    ))}
                    {orderId && !unpaidOrders.some((o) => o.id === orderId) ? <option value={orderId}>Linked order</option> : null}
                  </select>
                </Field>
                {type === 'payment' && orderId && !entry ? (
                  <Checkbox id="ledger-markpaid" wrapperClassName="mt-2" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} label="Mark the order as paid" />
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {entry ? 'Save changes' : 'Record'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
