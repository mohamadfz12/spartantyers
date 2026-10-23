import { useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Boxes, Store, User } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { AccountPage, FormAlert, GuestOnly, Notice, Panel, PasswordInput, PasswordRules, useFormErrors } from '@/components/account/AccountUi'
import { AccountApiError, accountApi } from '@/lib/account-client'
import { LEVEL_LABEL, levelFromParam, passwordAcceptable, safeNext, type AccountLevel } from '@/lib/account-portal'
import { cn, isValidEmail } from '@/lib/utils'
import { useAccount } from '@/store/account'

/* /account/signup: three levels explained in plain words, then the form. Always opens a Customer account at once. */

const LEVELS: Array<{ id: AccountLevel; icon: typeof User; summary: string; points: string[] }> = [
  {
    id: 'customer',
    icon: User,
    summary: 'For anyone buying tyres.',
    points: ['Our normal shop prices', 'Pay by card at checkout', 'Opens straight away'],
  },
  {
    id: 'bulk',
    icon: Boxes,
    summary: 'For fleets and big buyers.',
    points: ['Prices agreed with our team', 'Our team checks and approves it', 'You can start as a Customer today'],
  },
  {
    id: 'wholesaler',
    icon: Store,
    summary: 'For tyre shops, workshops and dealers.',
    points: ['Trade prices', 'Our team checks and approves it', 'You can start as a Customer today'],
  },
]

export default function Signup() {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `${uid}-${name}`
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const setMe = useAccount((s) => s.setMe)
  const { formRef, errors, formError, fail, clear, clearField } = useFormErrors()

  const [level, setLevel] = useState<AccountLevel>(levelFromParam(params.get('level')))
  const [values, setValues] = useState({ name: '', company: '', email: '', phone: '', abn: '', address: '', message: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<AccountLevel | null>(null)
  const trade = level !== 'customer'
  const next = safeNext(params.get('next'))

  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((current) => ({ ...current, [key]: event.target.value }))
    clearField(key)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clear()
    const found: Record<string, string> = {}
    if (!values.name.trim()) found.name = 'Enter your name.'
    if (trade && !values.company.trim()) found.company = 'Enter your business name so our team can check the account.'
    if (!values.email.trim()) found.email = 'Enter your email address.'
    else if (!isValidEmail(values.email.trim())) found.email = 'That does not look like a valid email address.'
    if (!passwordAcceptable(values.password, values.email)) {
      found.password = 'Choose a password of at least 10 characters that is not your email address.'
    }
    if (Object.keys(found).length) return fail(found)

    setBusy(true)
    try {
      const account = await accountApi.signup({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
        requestedLevel: level,
        company: values.company.trim(),
        phone: values.phone.trim(),
        abn: values.abn.trim(),
        address: values.address.trim(),
        message: values.message.trim(),
      })
      setMe(account)
      setDone(level)
    } catch (error) {
      setBusy(false)
      if (error instanceof AccountApiError && error.field && error.field !== 'requestedLevel') {
        return fail({ [error.field]: error.message })
      }
      fail({}, error instanceof AccountApiError ? error.message : 'Something went wrong. Please try again.')
    }
  }

  if (done) {
    return (
      <AccountPage title="Account opened" heading={`Welcome, ${values.name.trim().split(/\s+/)[0]}`} lede="Your Customer account is open and you are signed in.">
        <div className="flex flex-col gap-5">
          {done !== 'customer' ? (
            <Notice tone="info" title={`Your ${LEVEL_LABEL[done]} request is with our team`}>
              We check every Bulk and Wholesaler account before it is switched on. Until then you can shop as a Customer at our normal prices. We will email you when it is approved.
            </Notice>
          ) : null}
          <div>
            <Button size="lg" onClick={() => navigate(next, { replace: true })}>
              {next === '/account' ? 'Go to my account' : 'Continue'}
            </Button>
          </div>
        </div>
      </AccountPage>
    )
  }

  return (
    <AccountPage
      title="Open an account"
      heading="Open a Spartan Tyres account"
      lede="Pick the account that fits. A Customer account opens as soon as you sign up. Bulk and Wholesaler accounts are checked by our team first."
      width="wide"
    >
      <GuestOnly hold={busy}>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-8">
          <FormAlert>{formError}</FormAlert>

          <fieldset className="min-w-0">
            <legend className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">Account type</legend>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {LEVELS.map((option) => {
                const selected = level === option.id
                const Icon = option.icon
                return (
                  <label
                    key={option.id}
                    className={cn(
                      'relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border bg-card p-4 transition-colors',
                      'hover:border-primary/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
                      selected ? 'border-primary bg-primary/[0.07]' : 'border-border',
                    )}
                  >
                    <input
                      type="radio"
                      name="level"
                      value={option.id}
                      checked={selected}
                      onChange={() => {
                        setLevel(option.id)
                        clearField('company')
                      }}
                      className="sr-only"
                    />
                    <span className="flex items-center gap-2.5">
                      <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border', selected ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-muted-foreground')}>
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <span className="font-heading text-base font-bold uppercase tracking-tight text-foreground">{LEVEL_LABEL[option.id]}</span>
                      <span
                        aria-hidden="true"
                        className={cn('ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-primary' : 'border-muted-foreground/60')}
                      >
                        {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                      </span>
                    </span>
                    <span className="text-sm font-medium text-foreground">{option.summary}</span>
                    <ul className="flex flex-col gap-1 text-xs leading-relaxed text-muted-foreground">
                      {option.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <Panel>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name" htmlFor={id('name')} required error={errors.name}>
                <Input id={id('name')} name="name" autoComplete="name" value={values.name} onChange={set('name')} />
              </Field>
              <Field label="Business name" htmlFor={id('company')} required={trade} error={errors.company}>
                <Input id={id('company')} name="company" autoComplete="organization" value={values.company} onChange={set('company')} />
              </Field>
              <Field label="Email" htmlFor={id('email')} required error={errors.email}>
                <Input id={id('email')} name="email" type="email" inputMode="email" autoComplete="email" value={values.email} onChange={set('email')} />
              </Field>
              <Field label="Phone" htmlFor={id('phone')} error={errors.phone}>
                <Input id={id('phone')} name="phone" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} />
              </Field>
              <Field label="ABN" htmlFor={id('abn')} error={errors.abn} hint={trade ? 'Helps us check your business faster.' : 'Optional.'}>
                <Input id={id('abn')} name="abn" inputMode="numeric" autoComplete="off" placeholder="12 345 678 901" value={values.abn} onChange={set('abn')} />
              </Field>
              <Field label="Address" htmlFor={id('address')} error={errors.address}>
                <Input id={id('address')} name="address" autoComplete="street-address" value={values.address} onChange={set('address')} />
              </Field>
              {trade ? (
                <Field
                  label="Tell us about your business"
                  htmlFor={id('message')}
                  error={errors.message}
                  hint="What you buy, roughly how many tyres a month, and the sizes you use most."
                  className="sm:col-span-2"
                >
                  <Textarea id={id('message')} name="message" rows={4} value={values.message} onChange={set('message')} />
                </Field>
              ) : null}
              <Field
                label="Password"
                htmlFor={id('password')}
                required
                error={errors.password}
                hint={<PasswordRules password={values.password} email={values.email} />}
                className="sm:col-span-2"
              >
                <PasswordInput id={id('password')} name="new-password" autoComplete="new-password" value={values.password} onChange={set('password')} />
              </Field>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <div>
              <Button type="submit" size="lg" loading={busy} className="w-full sm:w-auto">
                {trade ? `Open account and request ${LEVEL_LABEL[level]}` : 'Open my account'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to={next !== '/account' ? `/account/login?next=${encodeURIComponent(next)}` : '/account/login'} className="link-underline font-semibold text-primary">
                Log in
              </Link>
            </p>
          </div>
        </form>
      </GuestOnly>
    </AccountPage>
  )
}
