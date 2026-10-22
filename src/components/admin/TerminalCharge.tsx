import { useEffect, useRef, useState } from 'react'
import { CircleCheck, LoaderCircle, Smartphone, TriangleAlert, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from '@/components/ui'
import { selectClass } from '@/components/admin/AdminKit'
import { api, type TerminalCheckout, type TerminalDevice } from '@/lib/api'
import { cn, moneyExact } from '@/lib/utils'
import { adminToken, handleAdminError } from '@/store/admin'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Charge on the Square Terminal
 *
 * Sends an amount to the paired Terminal and follows it until the
 * customer has paid, or it is cancelled or times out (five minutes).
 * The window polls every two seconds; the server records the payment
 * once, however many windows are watching.
 *
 *   kind 'ticket'  — a POS ticket            payload { ref }
 *   kind 'account' — towards a customer's account   payload { customerId, amount, ticket? }
 *   kind 'custom'  — any amount typed here (Square page)
 * ------------------------------------------------------------------ */

type Kind = 'ticket' | 'account' | 'custom'

const WAITING: Record<string, string> = {
  PENDING: 'Sending to the Terminal…',
  IN_PROGRESS: 'On the Terminal: waiting for the customer to pay…',
  CANCEL_REQUESTED: 'Cancelling…',
}

export function TerminalCharge({
  open,
  kind,
  payload = {},
  amount,
  label,
  onClose,
  onPaid,
}: {
  open: boolean
  kind: Kind
  payload?: Record<string, unknown>
  amount?: number
  label: string
  onClose: () => void
  onPaid?: (checkout: TerminalCheckout) => void
}) {
  const [devices, setDevices] = useState<TerminalDevice[] | null>(null)
  const [deviceId, setDeviceId] = useState('')
  const [custom, setCustom] = useState({ amount: '', description: '' })
  const [checkout, setCheckout] = useState<TerminalCheckout | null>(null)
  const [busy, setBusy] = useState<'' | 'send' | 'cancel'>('')
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const live = useRef(false)

  useEffect(() => {
    if (!open) return
    live.current = true
    setCheckout(null)
    setError('')
    setCustom({ amount: '', description: '' })
    const token = adminToken()
    if (!token) return
    api.admin
      .pos<{ devices: TerminalDevice[]; squareReady: boolean }>(token, { view: 'terminal' })
      .then((r) => {
        setDevices(r.devices)
        setDeviceId(r.devices[0]?.id ?? '')
        if (!r.squareReady) setError('Square is not set up on this server, so the Terminal cannot be used.')
      })
      .catch((e: unknown) => {
        setDevices([])
        setError(handleAdminError(e).message)
      })
    return () => {
      live.current = false
      clearTimeout(timer.current)
    }
  }, [open])

  const follow = (id: string) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const token = adminToken()
      if (!token || !live.current) return
      try {
        const { checkout: next } = await api.admin.pos<{ checkout: TerminalCheckout }>(token, { view: 'checkout', id })
        if (!live.current) return
        setCheckout(next)
        if (next.status === 'COMPLETED') {
          toast({ title: `${moneyExact(next.amount)} paid on the Terminal`, description: next.detail, variant: 'success' })
          onPaid?.(next)
        } else if (next.status !== 'CANCELED') follow(id)
      } catch {
        follow(id)
      }
    }, 2000)
  }

  const send = async () => {
    const token = adminToken()
    if (!token) return
    setError('')
    setBusy('send')
    try {
      const { checkout: started } =
        kind === 'custom'
          ? await api.admin.squareAction<{ checkout: TerminalCheckout }>(token, {
              action: 'charge',
              amount: Number(custom.amount),
              description: custom.description,
              deviceId,
            })
          : await api.admin.posAction<{ checkout: TerminalCheckout }>(token, {
              action: kind === 'ticket' ? 'ticket-charge' : 'account-charge',
              ...payload,
              deviceId,
            })
      setCheckout(started)
      follow(started.id)
    } catch (e) {
      setError(handleAdminError(e).message)
    } finally {
      setBusy('')
    }
  }

  const cancel = async () => {
    const token = adminToken()
    if (!token || !checkout) return
    setBusy('cancel')
    try {
      const r = await api.admin.posAction<{ checkout: TerminalCheckout }>(token, { action: 'terminal-cancel', id: checkout.id })
      setCheckout(r.checkout)
    } catch (e) {
      toast({ title: 'Could not cancel', description: handleAdminError(e).message, variant: 'error' })
    } finally {
      setBusy('')
    }
  }

  const close = () => {
    clearTimeout(timer.current)
    onClose()
  }

  const status = checkout?.status
  const shown = kind === 'custom' ? Number(custom.amount) || 0 : amount ?? 0
  const running = checkout && status !== 'COMPLETED' && status !== 'CANCELED'

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !running ? close() : undefined)}>
      <DialogContent size="sm" hideClose={Boolean(running)}>
        <DialogHeader>
          <DialogTitle>Charge on Square Terminal</DialogTitle>
          <DialogDescription>{checkout?.note || label}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 pb-2">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
            <Smartphone aria-hidden="true" className="h-6 w-6 text-primary" />
            <p className="font-heading text-3xl font-black tabular-nums">{moneyExact(checkout?.amount ?? shown)}</p>
          </div>

          {!checkout ? (
            <>
              {kind === 'custom' ? (
                <>
                  <Field label="Amount (inc. GST)" htmlFor="tc-amount" required>
                    <Input id="tc-amount" inputMode="decimal" type="number" min={0.01} step={0.01} value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value })} placeholder="0.00" autoFocus />
                  </Field>
                  <Field label="What it is for (shows on the receipt)" htmlFor="tc-desc" required>
                    <Input id="tc-desc" value={custom.description} maxLength={120} onChange={(e) => setCustom({ ...custom, description: e.target.value })} placeholder="e.g. Tyre fitting, rego ABC123" />
                  </Field>
                </>
              ) : null}
              {devices && devices.length > 1 ? (
                <Field label="Terminal" htmlFor="tc-device">
                  <select id="tc-device" className={cn(selectClass, 'w-full')} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {devices && !devices.length && !error ? (
                <Warn>No Terminal is paired yet. An owner or manager can pair one on the Square page.</Warn>
              ) : null}
              {error ? <Warn>{error}</Warn> : null}
            </>
          ) : running ? (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />
                {WAITING[status ?? ''] ?? 'Waiting…'}
              </p>
              <p className="text-xs text-muted-foreground">
                The customer taps, inserts or swipes their card on the Terminal. This updates by itself; the charge expires after 5 minutes.
              </p>
            </>
          ) : status === 'COMPLETED' ? (
            <p className="flex items-start gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              Paid. {checkout.detail}
            </p>
          ) : (
            <Warn>Not paid: the charge was cancelled or timed out. Nothing was taken.</Warn>
          )}
        </div>

        <DialogFooter>
          {!checkout ? (
            <>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button
                onClick={send}
                loading={busy === 'send'}
                disabled={!devices?.length || (kind === 'custom' && (!(Number(custom.amount) > 0) || !custom.description.trim()))}
              >
                <Smartphone aria-hidden="true" className="h-4 w-4" />
                Send to Terminal
              </Button>
            </>
          ) : running ? (
            <Button variant="outline" onClick={cancel} loading={busy === 'cancel'} disabled={status === 'CANCEL_REQUESTED'}>
              <X aria-hidden="true" className="h-4 w-4" />
              Cancel charge
            </Button>
          ) : status === 'COMPLETED' ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                Close
              </Button>
              <Button onClick={() => setCheckout(null)}>Try again</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
