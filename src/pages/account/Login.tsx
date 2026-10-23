import { useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, Input } from '@/components/ui'
import { AccountPage, FormAlert, GuestOnly, PasswordInput, Panel, useFormErrors } from '@/components/account/AccountUi'
import { AccountApiError, accountApi } from '@/lib/account-client'
import { safeNext } from '@/lib/account-portal'
import { isValidEmail } from '@/lib/utils'
import { useAccount } from '@/store/account'

/* /account/login: email and password. The error text is the server's own and never says which part was wrong. */
export default function Login() {
  const uid = useId().replace(/:/g, '')
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const setMe = useAccount((s) => s.setMe)
  const { formRef, errors, formError, fail, clear, clearField } = useFormErrors()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const signupHref = next !== '/account' ? `/account/signup?next=${encodeURIComponent(next)}` : '/account/signup'

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clear()
    const found: Record<string, string> = {}
    if (!email.trim()) found.email = 'Enter your email address.'
    else if (!isValidEmail(email.trim())) found.email = 'That does not look like a valid email address.'
    if (!password) found.password = 'Enter your password.'
    if (Object.keys(found).length) return fail(found)

    setBusy(true)
    try {
      const account = await accountApi.login(email.trim(), password)
      setMe(account)
      navigate(next, { replace: true })
    } catch (error) {
      const message = error instanceof AccountApiError ? error.message : 'Something went wrong. Please try again.'
      fail({}, message)
      setBusy(false)
    }
  }

  return (
    <AccountPage title="Log in" heading="Log in to your account" lede="See your details, your account level and your pay later terms.">
      <GuestOnly>
        <Panel>
          <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-5">
            <FormAlert>{formError}</FormAlert>
            <Field label="Email" htmlFor={`${uid}-email`} error={errors.email}>
              <Input
                id={`${uid}-email`}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clearField('email')
                }}
              />
            </Field>
            <Field label="Password" htmlFor={`${uid}-password`} error={errors.password}>
              <PasswordInput
                id={`${uid}-password`}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  clearField('password')
                }}
              />
            </Field>
            <Button type="submit" size="lg" loading={busy} className="w-full">
              Log in
            </Button>
            <p className="text-center text-sm">
              <Link to="/account/forgot" className="link-underline font-semibold text-primary">
                Forgot password?
              </Link>
            </p>
          </form>
        </Panel>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Spartan Tyres?{' '}
          <Link to={signupHref} className="link-underline font-semibold text-primary">
            Open an account
          </Link>
        </p>
      </GuestOnly>
    </AccountPage>
  )
}
