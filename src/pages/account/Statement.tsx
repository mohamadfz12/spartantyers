import { useCallback, useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui'
import { AccountPage, FormAlert, Notice, RequireAccount } from '@/components/account/AccountUi'
import { AccountApiError, accountApi, type AccountStatement } from '@/lib/account-client'
import { formatDay } from '@/lib/account-orders'
import { printHtml, statementHtml } from '@/lib/account-print'
import { cn, moneyExact } from '@/lib/utils'
import { useAccount } from '@/store/account'

/* /account/statement: what is owing (overdue in red), payments received and a printable statement. */
export default function Statement() {
  return (
    <RequireAccount>
      <Inner />
    </RequireAccount>
  )
}

function Inner() {
  const me = useAccount((s) => s.me)
  const [data, setData] = useState<AccountStatement | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await accountApi.statement())
    } catch (err) {
      if (err instanceof AccountApiError && err.status === 401) {
        void useAccount.getState().refresh()
        return
      }
      setError(err instanceof AccountApiError ? err.message : 'Something went wrong. Please try again.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function print() {
    if (!me || !data) return
    if (!printHtml(statementHtml(data, me))) setError('Your browser blocked the print window. Allow pop-ups for this site and try again.')
  }

  return (
    <AccountPage title="Your statement" heading="Your statement" lede="What you owe, when it is due, and the payments we have received. All amounts include GST." width="wide">
      <div className="flex flex-col gap-6">
        <FormAlert>{error}</FormAlert>
        {!data && !error ? (
          <p role="status" className="animate-pulse text-sm text-muted-foreground">
            Loading your statement
          </p>
        ) : null}

        {data ? (
          <>
            {!data.linked ? (
              <Notice tone="info" title="Website orders only">
                This statement shows your pay later orders from the website. Our team can link your account to your counter account so sales made in store show here too.
              </Notice>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Tile label="Balance owing" value={moneyExact(data.balance.due)} />
              <Tile label="Overdue" value={moneyExact(data.balance.overdue)} bad={data.balance.overdue > 0} />
              <Tile label="Open items" value={String(data.balance.count)} />
            </div>

            <div>
              <Button variant="outline" onClick={print}>
                <Printer aria-hidden="true" className="h-4 w-4" />
                Print statement
              </Button>
            </div>

            <section aria-labelledby="stmt-open">
              <h2 id="stmt-open" className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                Open items
              </h2>
              {data.open.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing is owing.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.open.map((item) => (
                    <li key={`${item.kind}-${item.reference}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-4 text-sm">
                      <span className="min-w-0">
                        <span className="block break-all font-heading font-bold text-foreground">{item.reference}</span>
                        <span className="block text-muted-foreground">
                          {formatDay(item.date)}
                          {item.dueDate ? (
                            <>
                              {' · '}
                              <span className={cn(item.overdue && 'font-bold text-destructive')}>
                                {item.overdue ? 'Overdue, due ' : 'Due '}
                                {formatDay(item.dueDate)}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className={cn('block font-heading text-base font-black tabular-nums', item.overdue && 'text-destructive')}>{moneyExact(item.owing)}</span>
                        {item.paid > 0 ? <span className="block text-xs text-muted-foreground">of {moneyExact(item.total)}, {moneyExact(item.paid)} paid</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Tax invoices for website orders are on the Orders page. Counter sales appear on this statement only.
              </p>
            </section>

            <section aria-labelledby="stmt-paid">
              <h2 id="stmt-paid" className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">
                Payments received
              </h2>
              {data.payments.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.payments.map((payment) => (
                    <li key={payment.ref} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-4 text-sm">
                      <span className="min-w-0">
                        <span className="block break-all font-heading font-bold text-foreground">{payment.ref}</span>
                        <span className="block text-muted-foreground">
                          {formatDay(payment.date)} · {payment.method}
                          {payment.allocations.length ? ` · applied to ${payment.allocations.map((a) => a.ticketRef).join(', ')}` : ''}
                        </span>
                      </span>
                      <span className="font-heading text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">{moneyExact(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AccountPage>
  )
}

function Tile({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 font-heading text-2xl font-black tabular-nums', bad ? 'text-destructive' : 'text-foreground')}>{value}</p>
    </div>
  )
}
