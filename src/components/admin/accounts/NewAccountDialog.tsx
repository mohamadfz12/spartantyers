import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAction } from '@/components/admin/AdminKit'
import { InviteOutcome } from '@/components/admin/accounts/parts'
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
  Textarea,
} from '@/components/ui'
import { accountsApi, type AccountLevel, type InviteResult } from '@/lib/admin-accounts-api'
import { LEVEL_HELP, LEVEL_LABELS, parsePercent } from '@/lib/admin-accounts-ui'
import { cn, isValidEmail } from '@/lib/utils'
import { selectClass } from '@/components/admin/AdminKit'

const LEVELS: AccountLevel[] = ['customer', 'bulk', 'wholesaler']

type Errors = Partial<Record<'email' | 'name' | 'abn' | 'discount', string>>

/**
 * Opens an account for a customer (any level) and sends the single-use set-password link. When email is
 * not set up the link is shown here, with a Copy button.
 */
export function NewAccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { run, busy } = useAdminAction()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    name: '',
    company: '',
    phone: '',
    abn: '',
    address: '',
    level: 'wholesaler' as AccountLevel,
    discount: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [created, setCreated] = useState<InviteResult | null>(null)

  const set =
    (key: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: Errors = {}
    const email = form.email.trim().toLowerCase()
    if (!isValidEmail(email)) next.email = 'Enter a valid email address.'
    if (!form.name.trim()) next.name = 'Enter the contact name.'
    const abnDigits = form.abn.replace(/\D/g, '')
    if (form.abn.trim() && abnDigits.length !== 11) next.abn = 'An ABN has 11 digits.'
    const discountPct = parsePercent(form.discount)
    if (discountPct === null) next.discount = 'Enter a percentage from 0 to 60.'
    setErrors(next)
    if (Object.keys(next).length || discountPct === null) return

    const result = await run(
      (token) =>
        accountsApi.create(token, {
          email,
          name: form.name.trim(),
          level: form.level,
          company: form.company.trim(),
          phone: form.phone.trim(),
          abn: form.abn.trim(),
          address: form.address.trim(),
          discountPct,
          notes: form.notes.trim(),
        }),
      {
        success: 'Account opened',
        successDetail: `${form.company.trim() || form.name.trim()} is now a ${LEVEL_LABELS[form.level]} account.`,
        failure: 'Could not open that account',
      },
    )
    if (result) {
      setCreated(result)
      onCreated()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Account opened</DialogTitle>
              <DialogDescription>
                {created.account.company || created.account.name} can set their password with the single-use link.
              </DialogDescription>
            </DialogHeader>
            <div className="px-6 py-4">
              <InviteOutcome result={created} email={created.account.email} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button type="button" onClick={() => navigate(`/admin/accounts/${created.account.id}`)}>
                Open the account
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>New customer account</DialogTitle>
              <DialogDescription>
                The customer gets an email with a link to choose their own password. Prices and pay later are set on the account page.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="na-email" required error={errors.email}>
                <Input id="na-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" autoFocus />
              </Field>
              <Field label="Contact name" htmlFor="na-name" required error={errors.name}>
                <Input id="na-name" value={form.name} onChange={set('name')} maxLength={120} />
              </Field>
              <Field label="Company" htmlFor="na-company">
                <Input id="na-company" value={form.company} onChange={set('company')} maxLength={160} />
              </Field>
              <Field label="Phone" htmlFor="na-phone">
                <Input id="na-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={40} />
              </Field>
              <Field label="ABN" htmlFor="na-abn" error={errors.abn}>
                <Input id="na-abn" inputMode="numeric" value={form.abn} onChange={set('abn')} placeholder="12 345 678 901" maxLength={20} />
              </Field>
              <Field label="Level" htmlFor="na-level" hint={LEVEL_HELP[form.level]}>
                <select id="na-level" className={cn(selectClass, 'w-full')} value={form.level} onChange={set('level')}>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {LEVEL_LABELS[level]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Agreed discount (%)" htmlFor="na-discount" error={errors.discount} hint="0 to 60. Off the normal price.">
                <Input id="na-discount" inputMode="decimal" value={form.discount} onChange={set('discount')} placeholder="0" />
              </Field>
              <Field label="Address" htmlFor="na-address">
                <Input id="na-address" value={form.address} onChange={set('address')} maxLength={300} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes (staff only)" htmlFor="na-notes">
                  <Textarea id="na-notes" rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Open account and send invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
