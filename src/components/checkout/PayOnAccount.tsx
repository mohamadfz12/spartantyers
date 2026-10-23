import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertCircle, CalendarClock, Landmark, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  AccountOrderError,
  creditView,
  dueDateFor,
  formatDueDate,
  placeAccountOrder,
  type AccountOrderInput,
  type AccountOrderResult,
} from '@/lib/account-checkout'
import { termsText } from '@/lib/account-portal'
import { cn, money } from '@/lib/utils'
import { useAccount } from '@/store/account'
import { useAccountPrices } from '@/store/account-prices'
import { useAccountPricesPending } from '@/store/cart'

/**
 * The payment step for a signed-in customer whose account may pay later. It tells them the terms, the credit left
 * and the due date, and places the order with POST /api/account/order. The server prices the order at the account's
 * prices and holds the credit; its plain-words refusals (over the limit, total changed) are shown as they come.
 */
export interface PayOnAccountProps {
  /** The total shown in the order summary (compared by the server, never used to price). */
  amount: number
  /** One key per checkout attempt; the same key is sent again on a retry. */
  idempotencyKey: string
  order: Omit<AccountOrderInput, 'idempotencyKey' | 'expectedTotal'>
  onPlaced: (result: AccountOrderResult) => void
}

export function PayOnAccount({ amount, idempotencyKey, order, onPlaced }: PayOnAccountProps) {
  const me = useAccount((s) => s.me)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useAccountPricesPending()

  if (!me) return null

  const credit = creditView(me.creditLimit, me.outstanding, amount)
  const due = dueDateFor(me.termsDays)

  async function place() {
    if (placing) return
    setPlacing(true)
    setError(null)
    try {
      const result = await placeAccountOrder({ ...order, idempotencyKey, expectedTotal: amount })
      onPlaced(result)
    } catch (caught) {
      setError(caught instanceof AccountOrderError ? caught.message : 'Something went wrong placing the order. Nothing has been charged. Please try again.')
      // The credit or the prices may have moved: show the latest.
      void useAccount.getState().refresh()
      void useAccountPrices.getState().reload()
      setPlacing(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 md:p-5" data-testid="pay-on-account">
      <h3 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
        <Landmark aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        Pay on account
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        No card needed. We invoice this order to your account at your account prices and you pay by the due date.
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-3">
          <dt className="text-xs font-semibold uppercase tracking-brand text-muted-foreground">Your terms</dt>
          <dd className="mt-1 font-semibold">{termsText(me.termsDays)}</dd>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-brand text-muted-foreground">
            <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
            Due date
          </dt>
          <dd className="mt-1 font-semibold" data-testid="account-due-date">
            {formatDueDate(due)}
          </dd>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <dt className="text-xs font-semibold uppercase tracking-brand text-muted-foreground">Credit available</dt>
          <dd className="mt-1 font-semibold tabular-nums" data-testid="account-credit-available">
            {money(credit.available)}
          </dd>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <dt className="text-xs font-semibold uppercase tracking-brand text-muted-foreground">This order</dt>
          <dd className="mt-1 font-semibold tabular-nums">{money(amount)}</dd>
        </div>
      </dl>

      {credit.overLimit ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm leading-relaxed" role="status">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <span>
            This order is more than the {money(credit.available)} of credit you have available, so it will probably be refused. You can pay by
            card instead, or call us to raise your limit.
          </span>
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Credit left after this order: {money(credit.afterOrder)}.</p>
      )}

      {error ? (
        <p role="alert" data-testid="account-order-error" className="mt-3 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm leading-relaxed text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className={cn('mt-4 w-full')}
        onClick={place}
        disabled={placing || pending}
        aria-busy={placing}
        data-testid="place-account-order"
      >
        {placing ? (
          <>
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            Placing your order
          </>
        ) : (
          `Place order on account (${money(amount)})`
        )}
      </Button>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Your statement and tax invoice are in{' '}
        <Link to="/account" className="font-medium text-primary underline-offset-4 hover:underline">
          My account
        </Link>
        .
      </p>
    </div>
  )
}

/**
 * A guest's small nudge: trade customers can log in for their own prices. Shown only to a visitor we know is signed
 * out (never while the sign-in check is still running, so a signed-in customer never sees it flash).
 */
export function TradeLoginLink({ className }: { className?: string }) {
  const ready = useAccount((s) => s.ready)
  const signedIn = useAccount((s) => s.me !== null)
  const { pathname, search } = useLocation()
  if (!ready || signedIn) return null
  return (
    <p className={cn('text-sm text-muted-foreground', className)} data-testid="trade-login-link">
      Have a trade account?{' '}
      <Link
        to={`/account/login?next=${encodeURIComponent(pathname + search)}`}
        className="rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Log in for your prices
      </Link>
    </p>
  )
}

/**
 * Stands in for the payment forms while a signed-in customer's prices are still loading (or could not load):
 * paying before then would send the server a total at shelf prices that it will not accept.
 */
export function PricesGate() {
  const status = useAccountPrices((s) => s.status)
  const ready = useAccount((s) => s.ready)
  if (status === 'error') {
    return (
      <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm leading-relaxed">
        <p>We could not load your account prices, so we cannot show your total yet.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void useAccountPrices.getState().reload()}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      {ready ? 'Loading your account prices' : 'Checking your sign-in'}
    </p>
  )
}
