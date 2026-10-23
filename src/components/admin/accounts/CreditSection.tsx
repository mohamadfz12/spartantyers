import { useState } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { AdminPanel } from '@/components/admin/AdminStates'
import { Tile, selectClass, useAdminAction } from '@/components/admin/AdminKit'
import { Button, Checkbox, Field, Input } from '@/components/ui'
import { accountsApi, type PosCustomerSummary, type StaffAccount } from '@/lib/admin-accounts-api'
import {
  availableCredit,
  dollars,
  parseDollars,
  parseTermsDays,
  payLaterLabel,
  termsLabel,
} from '@/lib/admin-accounts-ui'
import { cn } from '@/lib/utils'
import { toast } from '@/store/ui'

const TERM_CHOICES = [0, 7, 14, 30, 60]

/**
 * Pay later and credit. Only staff with the `credit` permission (Owner, Manager) can change it; for
 * everyone else the section is read-only with a lock note. "Recalculate" works out what the customer owes
 * again from the till's open account tickets.
 */
export function CreditSection({
  account,
  posCustomer,
  needsLink,
  canEdit,
  onSaved,
}: {
  account: StaffAccount
  posCustomer: PosCustomerSummary | null
  /** The account is not linked to a till customer yet (pay later cannot be switched on). */
  needsLink: boolean
  canEdit: boolean
  onSaved: (account: StaffAccount) => void
}) {
  const { run, busy } = useAdminAction()
  const [payLater, setPayLater] = useState(account.payLater)
  const [termsChoice, setTermsChoice] = useState(
    TERM_CHOICES.includes(account.termsDays) ? String(account.termsDays) : 'other',
  )
  const [termsTyped, setTermsTyped] = useState(String(account.termsDays))
  const [limit, setLimit] = useState(account.creditLimit ? account.creditLimit.toFixed(2) : '')
  const [errors, setErrors] = useState<{ terms?: string; limit?: string }>({})

  const termsDays = termsChoice === 'other' ? parseTermsDays(termsTyped) : Number(termsChoice)
  const creditLimit = limit.trim() === '' ? 0 : parseDollars(limit)
  const dirty =
    payLater !== account.payLater || termsDays !== account.termsDays || creditLimit !== account.creditLimit

  const owing = account.outstanding
  const overdue = posCustomer?.balance.overdue ?? 0

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (termsDays === null) next.terms = 'Enter a whole number of days from 0 to 120.'
    if (creditLimit === null || creditLimit > 10_000_000) next.limit = 'Enter dollars from $0 to $10,000,000.'
    else if (payLater && creditLimit <= 0) next.limit = 'Set a credit limit above $0 to turn pay later on.'
    setErrors(next)
    if (Object.keys(next).length || termsDays === null || creditLimit === null) return

    const result = await run(
      (token) => accountsApi.setCredit(token, account.id, { payLater, termsDays, creditLimit }),
      {
        success: 'Pay later saved',
        successDetail: payLater ? `${termsLabel(termsDays)}, limit ${dollars(creditLimit)}.` : 'Pay later is off.',
        failure: 'Could not save pay later',
      },
    )
    if (result) onSaved(result.account)
  }

  const recalculate = async () => {
    const result = await run((token) => accountsApi.reconcile(token, account.id), {
      failure: 'Could not recalculate',
    })
    if (!result) return
    onSaved(result.account)
    if (result.reconciled?.deferred) {
      toast({ title: 'A sale was only just recorded', description: 'Look again in a couple of minutes.' })
    } else if (result.reconciled?.fixed) {
      toast({ title: 'Figure corrected', description: `Owing is now ${dollars(result.account.outstanding)}.`, variant: 'success' })
    } else {
      toast({ title: 'Already correct', description: `Owing is ${dollars(result.account.outstanding)}.`, variant: 'success' })
    }
  }

  const figures = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile label="Owing" value={dollars(owing)} tone={owing > 0 ? 'warn' : 'default'} hint="Open account sales, website and till" />
      <Tile label="Overdue" value={dollars(overdue)} tone={overdue > 0 ? 'bad' : 'default'} hint={posCustomer ? 'Past the due date' : 'Needs the till link'} />
      <Tile label="Available credit" value={account.payLater ? dollars(availableCredit(account)) : 'Off'} hint={account.payLater ? `Of ${dollars(account.creditLimit)}` : undefined} />
    </div>
  )

  return (
    <AdminPanel
      title="Pay later and credit"
      description="Lets this customer buy now and pay by the due date. The credit limit is checked on every sale, on the website and at the till."
      action={
        <Button type="button" variant="outline" size="sm" onClick={recalculate} loading={busy} disabled={!account.posCustomerId}>
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Recalculate
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {figures}

        {needsLink ? (
          <p role="note" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed">
            Pay later needs this account linked to its till customer first. Use the link banner at the top of this page.
          </p>
        ) : null}

        {!canEdit ? (
          <div className="flex flex-col gap-3">
            <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed">
              <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>Only an owner or manager can change pay later, payment terms or the credit limit.</span>
            </p>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Pay later</dt>
                <dd className="mt-1">{account.payLater ? 'On' : 'Off'}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Payment terms</dt>
                <dd className="mt-1">{termsLabel(account.termsDays)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Credit limit</dt>
                <dd className="mt-1 tabular-nums">{dollars(account.creditLimit)}</dd>
              </div>
            </dl>
            <p className="sr-only">{payLaterLabel(account)}</p>
          </div>
        ) : (
          <form onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Checkbox
                id="cr-paylater"
                checked={payLater}
                onChange={(e) => setPayLater(e.target.checked)}
                disabled={needsLink && !account.payLater}
                label="Pay later is on for this customer"
              />
            </div>
            <Field label="Payment terms" htmlFor="cr-terms" error={errors.terms} hint="Days from the sale until payment is due.">
              <div className="flex gap-2">
                <select
                  id="cr-terms"
                  className={cn(selectClass, 'min-w-0 flex-1')}
                  value={termsChoice}
                  onChange={(e) => setTermsChoice(e.target.value)}
                >
                  {TERM_CHOICES.map((d) => (
                    <option key={d} value={d}>
                      {termsLabel(d)}
                    </option>
                  ))}
                  <option value="other">Other number of days</option>
                </select>
                {termsChoice === 'other' ? (
                  <Input
                    aria-label="Number of days"
                    inputMode="numeric"
                    value={termsTyped}
                    onChange={(e) => setTermsTyped(e.target.value)}
                    className="w-24"
                    maxLength={3}
                  />
                ) : null}
              </div>
            </Field>
            <Field label="Credit limit ($)" htmlFor="cr-limit" error={errors.limit} hint="The most they can owe at one time.">
              <Input id="cr-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0.00" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" loading={busy} disabled={!dirty}>
                Save pay later
              </Button>
            </div>
          </form>
        )}
      </div>
    </AdminPanel>
  )
}
