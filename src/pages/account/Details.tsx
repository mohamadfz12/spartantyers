import { useId, useState } from 'react'
import { Button, Field, Input } from '@/components/ui'
import { AccountPage, FormAlert, Notice, Panel, PasswordInput, PasswordRules, RequireAccount, useFormErrors } from '@/components/account/AccountUi'
import { AccountApiError, accountApi, type CustomerAccount } from '@/lib/account-client'
import { LEVEL_LABEL, passwordAcceptable } from '@/lib/account-portal'
import { useAccount } from '@/store/account'

/* /account/details: edit your details, and change your password. */
export default function Details() {
  return (
    <RequireAccount>
      <Inner />
    </RequireAccount>
  )
}

function Inner() {
  const me = useAccount((s) => s.me)
  if (!me) return null
  return (
    <AccountPage title="Your details" heading="Your details" lede="Keep these up to date so orders and invoices go to the right place." width="wide">
      <div className="flex flex-col gap-8">
        <DetailsForm me={me} />
        <PasswordForm email={me.email} />
      </div>
    </AccountPage>
  )
}

function DetailsForm({ me }: { me: CustomerAccount }) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${uid}-${name}`
  const setMe = useAccount((s) => s.setMe)
  const { formRef, errors, formError, fail, clear, clearField } = useFormErrors()
  const [values, setValues] = useState({ name: me.name, company: me.company, phone: me.phone, abn: me.abn, address: me.address })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }))
    clearField(key)
    setSaved(false)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clear()
    setSaved(false)
    if (!values.name.trim()) return fail({ name: 'Enter your name.' })
    setBusy(true)
    try {
      const account = await accountApi.saveDetails({
        name: values.name.trim(),
        company: values.company.trim(),
        phone: values.phone.trim(),
        abn: values.abn.trim(),
        address: values.address.trim(),
      })
      setMe(account)
      setValues({ name: account.name, company: account.company, phone: account.phone, abn: account.abn, address: account.address })
      setSaved(true)
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) {
        // The session ended while the form was open: the guard sends them to log in.
        void useAccount.getState().refresh()
        return
      }
      if (error instanceof AccountApiError && error.field) fail({ [error.field]: error.message })
      else fail({}, error instanceof AccountApiError ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <h2 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">Contact and business details</h2>
      <form ref={formRef} noValidate onSubmit={submit} className="mt-5 flex flex-col gap-5">
        <FormAlert>{formError}</FormAlert>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email" htmlFor={id('email')} hint="To change your email address, please contact our team.">
            <Input id={id('email')} name="email" type="email" autoComplete="email" value={me.email} readOnly className="bg-muted/50" />
          </Field>
          <Field label="Account level" htmlFor={id('level')}>
            <Input id={id('level')} name="level" value={LEVEL_LABEL[me.level]} readOnly className="bg-muted/50" />
          </Field>
          <Field label="Your name" htmlFor={id('name')} required error={errors.name}>
            <Input id={id('name')} name="name" autoComplete="name" value={values.name} onChange={set('name')} />
          </Field>
          <Field label="Business name" htmlFor={id('company')} error={errors.company}>
            <Input id={id('company')} name="company" autoComplete="organization" value={values.company} onChange={set('company')} />
          </Field>
          <Field label="Phone" htmlFor={id('phone')} error={errors.phone}>
            <Input id={id('phone')} name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} />
          </Field>
          <Field label="ABN" htmlFor={id('abn')} error={errors.abn}>
            <Input id={id('abn')} name="abn" inputMode="numeric" autoComplete="off" placeholder="12 345 678 901" value={values.abn} onChange={set('abn')} />
          </Field>
          <Field label="Address" htmlFor={id('address')} error={errors.address} className="sm:col-span-2">
            <Input id={id('address')} name="address" autoComplete="street-address" value={values.address} onChange={set('address')} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" loading={busy}>
            Save details
          </Button>
          <span role="status" aria-live="polite" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            {saved ? 'Details saved.' : ''}
          </span>
        </div>
      </form>
    </Panel>
  )
}

function PasswordForm({ email }: { email: string }) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${uid}-${name}`
  const setMe = useAccount((s) => s.setMe)
  const { formRef, errors, formError, fail, clear, clearField } = useFormErrors()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [changed, setChanged] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clear()
    setChanged(false)
    const found: Record<string, string> = {}
    if (!current) found.current = 'Enter your current password.'
    if (!passwordAcceptable(next, email)) found.next = 'Choose a password of at least 10 characters that is not your email address.'
    else if (next === current) found.next = 'Choose a password different from your current one.'
    if (confirm !== next) found.confirm = 'The two passwords do not match.'
    if (Object.keys(found).length) return fail(found)

    setBusy(true)
    try {
      const account = await accountApi.changePassword(current, next)
      setMe(account)
      setCurrent('')
      setNext('')
      setConfirm('')
      setChanged(true)
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) {
        void useAccount.getState().refresh()
        return
      }
      if (error instanceof AccountApiError && error.field) fail({ [error.field]: error.message })
      else fail({}, error instanceof AccountApiError ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <h2 className="font-heading text-lg font-bold uppercase tracking-tight text-foreground">Change your password</h2>
      <p className="mt-2 text-sm text-muted-foreground">Changing your password signs you out on your other devices.</p>
      <form ref={formRef} noValidate onSubmit={submit} className="mt-5 flex max-w-xl flex-col gap-5">
        {changed ? (
          <Notice tone="success" title="Password changed">
            Your other devices have been signed out.
          </Notice>
        ) : null}
        <FormAlert>{formError}</FormAlert>
        <Field label="Current password" htmlFor={id('current')} required error={errors.current}>
          <PasswordInput
            id={id('current')}
            name="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value)
              clearField('current')
            }}
          />
        </Field>
        <Field label="New password" htmlFor={id('next')} required error={errors.next} hint={<PasswordRules password={next} email={email} />}>
          <PasswordInput
            id={id('next')}
            name="new-password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => {
              setNext(event.target.value)
              clearField('next')
            }}
          />
        </Field>
        <Field label="Confirm new password" htmlFor={id('confirm')} required error={errors.confirm}>
          <PasswordInput
            id={id('confirm')}
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value)
              clearField('confirm')
            }}
          />
        </Field>
        <div>
          <Button type="submit" size="lg" variant="outline" loading={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  )
}
