import { useId, useState } from 'react'
import { Button, Field, Input } from '@/components/ui'
import { AccountPage, BackLink, FormAlert, GuestOnly, Notice, Panel, useFormErrors } from '@/components/account/AccountUi'
import { AccountApiError, accountApi } from '@/lib/account-client'
import { isValidEmail } from '@/lib/utils'

/* /account/forgot: always the same answer, whether or not the email has an account. */
export default function Forgot() {
  const uid = useId().replace(/:/g, '')
  const { formRef, errors, formError, fail, clear, clearField } = useFormErrors()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clear()
    if (!email.trim()) return fail({ email: 'Enter your email address.' })
    if (!isValidEmail(email.trim())) return fail({ email: 'That does not look like a valid email address.' })
    setBusy(true)
    try {
      await accountApi.forgot(email.trim())
      setSent(true)
    } catch (error) {
      fail({}, error instanceof AccountApiError ? error.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccountPage title="Reset your password" heading="Reset your password" lede="Enter your email address and we will send you a link to choose a new password.">
      <GuestOnly>
        {sent ? (
          <Notice tone="success" title="Check your email">
            If an account exists for that address, we have emailed a link. It works once and expires in one hour. If nothing arrives in a few minutes, check your spam folder.
          </Notice>
        ) : (
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
              <Button type="submit" size="lg" loading={busy} className="w-full">
                Email me a link
              </Button>
            </form>
          </Panel>
        )}
        <p className="mt-6 text-center text-sm">
          <BackLink to="/account/login">Back to log in</BackLink>
        </p>
      </GuestOnly>
    </AccountPage>
  )
}
