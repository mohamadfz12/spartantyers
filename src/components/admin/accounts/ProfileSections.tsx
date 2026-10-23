import { useState } from 'react'
import { KeyRound, Power, PowerOff, Send } from 'lucide-react'
import { AdminPanel } from '@/components/admin/AdminStates'
import { selectClass, stampLabel, useAdminAction } from '@/components/admin/AdminKit'
import { InviteOutcome, StatusBadge } from '@/components/admin/accounts/parts'
import { Badge, Button, Field, Input, Textarea } from '@/components/ui'
import {
  accountsApi,
  type AccountLevel,
  type InviteResult,
  type StaffAccount,
} from '@/lib/admin-accounts-api'
import { LEVEL_HELP, LEVEL_LABELS, businessName, parsePercent, percentLabel } from '@/lib/admin-accounts-ui'
import { cn, isValidEmail } from '@/lib/utils'

const LEVELS: AccountLevel[] = ['customer', 'bulk', 'wholesaler']

/* ------------------------------------------------------------------ *
 * Details
 * ------------------------------------------------------------------ */

export function DetailsSection({
  account,
  onSaved,
}: {
  account: StaffAccount
  onSaved: (account: StaffAccount) => void
}) {
  const { run, busy } = useAdminAction()
  const initial = {
    email: account.email,
    name: account.name,
    company: account.company,
    phone: account.phone,
    abn: account.abn,
    address: account.address,
    notes: account.notes,
  }
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<'email' | 'name' | 'abn', string>>>({})

  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some((key) => form[key] !== initial[key])
  const set =
    (key: keyof typeof initial) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    const email = form.email.trim().toLowerCase()
    if (!isValidEmail(email)) next.email = 'Enter a valid email address.'
    if (!form.name.trim()) next.name = 'Enter the contact name.'
    if (form.abn.trim() && form.abn.replace(/\D/g, '').length !== 11) next.abn = 'An ABN has 11 digits.'
    setErrors(next)
    if (Object.keys(next).length) return

    const emailChanged = email !== account.email
    if (
      emailChanged &&
      !window.confirm(
        `Change the sign-in email from ${account.email} to ${email}?\n\nThe customer is signed out, must confirm the new address again, and any link already sent stops working.`,
      )
    ) {
      return
    }
    const result = await run(
      (token) =>
        accountsApi.update(token, account.id, {
          name: form.name.trim(),
          company: form.company.trim(),
          phone: form.phone.trim(),
          abn: form.abn.trim(),
          address: form.address.trim(),
          notes: form.notes,
          ...(emailChanged ? { email } : {}),
        }),
      {
        success: 'Details saved',
        successDetail: emailChanged ? 'The customer is signed out and needs a new link.' : undefined,
        failure: 'Could not save the details',
      },
    )
    if (result) onSaved(result.account)
  }

  return (
    <AdminPanel title="Details" description="Who the account belongs to. The till customer is kept in step.">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Email (sign-in)" htmlFor="ad-email" required error={errors.email}>
          <Input id="ad-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
        </Field>
        <Field label="Contact name" htmlFor="ad-name" required error={errors.name}>
          <Input id="ad-name" value={form.name} onChange={set('name')} maxLength={120} />
        </Field>
        <Field label="Company" htmlFor="ad-company">
          <Input id="ad-company" value={form.company} onChange={set('company')} maxLength={160} />
        </Field>
        <Field label="Phone" htmlFor="ad-phone">
          <Input id="ad-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={40} />
        </Field>
        <Field label="ABN" htmlFor="ad-abn" error={errors.abn}>
          <Input id="ad-abn" inputMode="numeric" value={form.abn} onChange={set('abn')} placeholder="12 345 678 901" maxLength={20} />
        </Field>
        <Field label="Address" htmlFor="ad-address">
          <Input id="ad-address" value={form.address} onChange={set('address')} maxLength={300} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes (staff only)" htmlFor="ad-notes">
            <Textarea id="ad-notes" rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!dirty}>
            Save details
          </Button>
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => (setForm(initial), setErrors({}))}>
              Discard changes
            </Button>
          ) : null}
        </div>
      </form>
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ *
 * Level and agreed discount
 * ------------------------------------------------------------------ */

export function LevelSection({
  account,
  onSaved,
}: {
  account: StaffAccount
  onSaved: (account: StaffAccount) => void
}) {
  const { run, busy } = useAdminAction()
  const [level, setLevel] = useState<AccountLevel>(account.level)
  const [discount, setDiscount] = useState(String(account.discountPct))
  const [error, setError] = useState<string | null>(null)

  const parsed = parsePercent(discount)
  const dirty = level !== account.level || parsed !== account.discountPct

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (parsed === null) return setError('Enter a percentage from 0 to 60.')
    setError(null)
    const result = await run((token) => accountsApi.setLevel(token, account.id, level, parsed), {
      success: 'Level and discount saved',
      successDetail: `${businessName(account)}: ${LEVEL_LABELS[level]}, ${percentLabel(parsed)} off.`,
      failure: 'Could not save the level',
    })
    if (result) onSaved(result.account)
  }

  return (
    <AdminPanel
      title="Level and agreed discount"
      description="The customer pays the lower of their account price and the normal price. A special price wins over the discount."
    >
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Level" htmlFor="al-level" hint={LEVEL_HELP[level]}>
          <select id="al-level" className={cn(selectClass, 'w-full')} value={level} onChange={(e) => setLevel(e.target.value as AccountLevel)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agreed discount (%)" htmlFor="al-discount" hint="0 to 60. Off the normal price." error={error ?? undefined}>
          <Input id="al-discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!dirty}>
            Save level and discount
          </Button>
        </div>
      </form>
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ *
 * Sign-in: links, last login, suspend / activate
 * ------------------------------------------------------------------ */

export function SignInSection({
  account,
  onSaved,
}: {
  account: StaffAccount
  onSaved: (account: StaffAccount) => void
}) {
  const { run, busy } = useAdminAction()
  const [outcome, setOutcome] = useState<InviteResult | null>(null)
  const suspended = account.status === 'suspended'

  const sendLink = async () => {
    setOutcome(null)
    const result = await run((token) => accountsApi.invite(token, account.id), {
      failure: 'Could not make the link',
    })
    if (!result) return
    setOutcome(result)
    onSaved(result.account)
  }

  const toggle = async () => {
    const next = suspended ? 'active' : 'suspended'
    if (
      !suspended &&
      !window.confirm(
        `Suspend ${businessName(account)}?\n\nThey are signed out at once, cannot log in or order, and any link waiting stops working.`,
      )
    ) {
      return
    }
    setOutcome(null)
    const result = await run((token) => accountsApi.setStatus(token, account.id, next), {
      success: suspended ? 'Account activated' : 'Account suspended',
      successDetail: suspended ? 'They can log in again.' : 'They are signed out.',
      failure: suspended ? 'Could not activate the account' : 'Could not suspend the account',
    })
    if (result) onSaved(result.account)
  }

  return (
    <AdminPanel title="Sign-in" description="How the customer gets into their account.">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Status</dt>
          <dd className="mt-1">
            <StatusBadge status={account.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Last login</dt>
          <dd className="mt-1">{account.lastLoginAt ? stampLabel(account.lastLoginAt) : 'Never'}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Email confirmed</dt>
          <dd className="mt-1">
            {account.emailVerified ? (
              <Badge size="sm" variant="success">
                Yes
              </Badge>
            ) : (
              <Badge size="sm" variant="outline">
                Not yet
              </Badge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-brand text-muted-foreground">Password</dt>
          <dd className="mt-1">{account.hasPassword ? 'Set by the customer' : 'Not set yet'}</dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={sendLink} loading={busy} disabled={suspended}>
          {account.hasPassword ? <KeyRound aria-hidden="true" className="h-4 w-4" /> : <Send aria-hidden="true" className="h-4 w-4" />}
          {account.hasPassword ? 'Send reset link' : 'Send set-password link'}
        </Button>
        <Button type="button" variant={suspended ? 'primary' : 'destructive'} onClick={toggle} disabled={busy}>
          {suspended ? <Power aria-hidden="true" className="h-4 w-4" /> : <PowerOff aria-hidden="true" className="h-4 w-4" />}
          {suspended ? 'Activate account' : 'Suspend account'}
        </Button>
      </div>
      {suspended ? <p className="mt-2 text-xs text-muted-foreground">Activate the account before sending a link.</p> : null}

      {outcome ? (
        <div className="mt-4">
          <InviteOutcome result={outcome} email={account.email} onDismiss={() => setOutcome(null)} />
        </div>
      ) : null}
    </AdminPanel>
  )
}
