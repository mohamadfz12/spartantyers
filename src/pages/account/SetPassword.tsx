import { useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field } from '@/components/ui'
import { AccountPage, FormAlert, Notice, Panel, PasswordInput, PasswordRules, useFormErrors } from '@/components/account/AccountUi'
import { AccountApiError, accountApi } from '@/lib/account-client'
import { passwordAcceptable } from '@/lib/account-portal'
import { useAccount } from '@/store/account'

/* /account/set-password?token=: the link in an invite or a reset email. Choosing a password signs the customer in. */
export default function SetPassword() {
  const uid = useId().replace(/:/g, '')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const setMe = useAccount((s) => s.setMe)
  const { formRef, errors, formError, fail, clear, clearField } = useFormErrors()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [badLink, setBadLink] = useState(!token)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clear()
    const found: Record<string, string> = {}
    if (!passwordAcceptable(password)) found.password = 'Choose a password of at least 10 characters that is not your email address.'
    if (confirm !== password) found.confirm = 'The two passwords do not match.'
    if (Object.keys(found).length) return fail(found)

    setBusy(true)
    try {
      const account = await accountApi.setPassword(token, password)
      setMe(account)
      navigate('/account', { replace: true })
    } catch (error) {
      setBusy(false)
      if (error instanceof AccountApiError && error.field === 'token') return setBadLink(true)
      if (error instanceof AccountApiError && error.field === 'password') return fail({ password: error.message })
      fail({}, error instanceof AccountApiError ? error.message : 'Something went wrong. Please try again.')
    }
  }

  if (badLink) {
    return (
      <AccountPage title="Link expired" heading="This link has expired" lede="Password links work once and do not last long.">
        <Notice tone="warning" title="Ask for a new link">
          This link has expired or was already used.{' '}
          <Link to="/account/forgot" className="link-underline font-semibold text-primary">
            Request a new link
          </Link>{' '}
          and we will email you another.
        </Notice>
      </AccountPage>
    )
  }

  return (
    <AccountPage title="Choose a password" heading="Choose your password" lede="Pick a password for your Spartan Tyres account. You will be signed in straight after.">
      <Panel>
        <form ref={formRef} noValidate onSubmit={submit} className="flex flex-col gap-5">
          <FormAlert>{formError}</FormAlert>
          <Field label="New password" htmlFor={`${uid}-password`} error={errors.password} hint={<PasswordRules password={password} />}>
            <PasswordInput
              id={`${uid}-password`}
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                clearField('password')
              }}
            />
          </Field>
          <Field label="Confirm password" htmlFor={`${uid}-confirm`} error={errors.confirm}>
            <PasswordInput
              id={`${uid}-confirm`}
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value)
                clearField('confirm')
              }}
            />
          </Field>
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Save password and sign in
          </Button>
        </form>
      </Panel>
    </AccountPage>
  )
}
