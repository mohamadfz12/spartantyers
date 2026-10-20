import { useId, useState } from 'react'
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react'
import { site } from '@/config/site'
import { api } from '@/lib/api'
import { cn, isValidAuPhone, isValidEmail } from '@/lib/utils'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'

/* ------------------------------------------------------------------ *
 * One enquiry form, three jobs
 *
 * /contact, /fleet-solutions and /wholesale all post to `api.contact`,
 * differing only in which enquiry type they tag and what extra context
 * they collect. The API body is fixed (name, email, phone, company,
 * enquiryType, message), so page-specific questions are declared as
 * `extras` and appended to the message as labelled lines rather than
 * invented as new API fields.
 * ------------------------------------------------------------------ */

export interface EnquiryExtra {
  id: string
  label: string
  kind: 'text' | 'select'
  options?: string[]
  placeholder?: string
  hint?: string
  required?: boolean
}

export interface EnquiryFormProps {
  /** A fixed tag, or a list to let the visitor choose. */
  enquiryType: string | string[]
  extras?: EnquiryExtra[]
  companyRequired?: boolean
  phoneRequired?: boolean
  /** Off for forms whose `messagePrefix` and extras already say what is needed. */
  messageRequired?: boolean
  messageLabel?: string
  messagePlaceholder?: string
  messageHint?: string
  submitLabel?: string
  successTitle?: string
  successBody?: string
  /** Starting values for any field, keyed like the state: `message`, an extra's id… */
  defaults?: Record<string, string>
  /**
   * A fixed first line for the message, sent however the visitor edits the
   * box — e.g. which product a quote is for.
   */
  messagePrefix?: string
  className?: string
}

type Errors = Record<string, string | undefined>

const GENERIC_FAILURE = `We could not send that just now. Please call ${site.phone.display} or email ${site.email.sales} and we will pick it up straight away.`

export function EnquiryForm({
  enquiryType,
  extras = [],
  companyRequired = false,
  phoneRequired = false,
  messageRequired = true,
  messageLabel = 'How can we help?',
  messagePlaceholder,
  messageHint,
  submitLabel = 'Send enquiry',
  successTitle = 'Enquiry received',
  successBody = `Thanks — we have your enquiry and will come back to you, usually within one business day. If it is urgent, call ${site.phone.display}.`,
  defaults,
  messagePrefix,
  className,
}: EnquiryFormProps) {
  const uid = useId().replace(/:/g, '')
  const field = (name: string) => `${uid}-${name}`

  const typeOptions = Array.isArray(enquiryType) ? enquiryType : null

  const [values, setValues] = useState<Record<string, string>>(() => ({
    name: '',
    email: '',
    phone: '',
    company: '',
    enquiryType: typeOptions ? '' : (enquiryType as string),
    message: '',
    ...Object.fromEntries(extras.map((extra) => [extra.id, ''])),
    ...defaults,
  }))

  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [failureMessage, setFailureMessage] = useState<string>(GENERIC_FAILURE)

  const set = (key: string) => (value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current))
  }

  function validate(): Errors {
    const next: Errors = {}

    if (!values.name.trim()) next.name = 'Please tell us your name.'

    if (!values.email.trim()) next.email = 'An email address is required so we can reply.'
    else if (!isValidEmail(values.email)) next.email = 'That does not look like a valid email address.'

    if (phoneRequired && !values.phone.trim()) {
      next.phone = 'A contact number is required for this enquiry.'
    } else if (values.phone.trim() && !isValidAuPhone(values.phone)) {
      next.phone = 'Enter an Australian number, for example 02 9000 0000 or 0400 000 000.'
    }

    if (companyRequired && !values.company.trim()) {
      next.company = 'Please tell us the business name.'
    }

    if (typeOptions && !values.enquiryType) {
      next.enquiryType = 'Choose the closest match so it reaches the right person.'
    }

    for (const extra of extras) {
      if (extra.required && !values[extra.id]?.trim()) {
        next[extra.id] = `${extra.label} is required.`
      }
    }

    const message = values.message.trim()
    if (messageRequired) {
      if (!message) next.message = 'Please add a few details so we can answer properly.'
      else if (message.length < 10) next.message = 'A little more detail will get you a better answer.'
    }

    return next
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const found = validate()
    setErrors(found)
    if (Object.values(found).some(Boolean)) {
      setStatus('idle')
      return
    }

    // Extras are folded into the message as labelled lines — the API body is fixed.
    const extraLines = extras
      .filter((extra) => values[extra.id]?.trim())
      .map((extra) => `${extra.label}: ${values[extra.id].trim()}`)

    const header = [messagePrefix, ...extraLines].filter(Boolean).join('\n')
    const body = values.message.trim()
    const message = header && body ? `${header}\n\n${body}` : header || body

    setStatus('sending')
    try {
      await api.contact({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        company: values.company.trim() || undefined,
        enquiryType: values.enquiryType,
        message,
      })
      setStatus('sent')
    } catch (error) {
      setFailureMessage(
        error instanceof Error && error.message ? error.message : GENERIC_FAILURE,
      )
      setStatus('failed')
    }
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'rounded-lg border border-primary/30 bg-primary/[0.07] p-6 md:p-8',
          className,
        )}
      >
        <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-primary" />
        <h3 className="mt-4 font-heading text-lg font-bold uppercase tracking-tight text-foreground">
          {successTitle}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{successBody}</p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => {
            setValues((current) =>
              Object.fromEntries(
                Object.keys(current).map((key) => [
                  key,
                  key === 'enquiryType' && !typeOptions
                    ? (enquiryType as string)
                    : (defaults?.[key] ?? ''),
                ]),
              ),
            )
            setStatus('idle')
          }}
        >
          Send another enquiry
        </Button>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-5', className)}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor={field('name')} required error={errors.name}>
          <Input
            id={field('name')}
            name="name"
            autoComplete="name"
            value={values.name}
            onChange={(event) => set('name')(event.target.value)}
          />
        </Field>

        <Field
          label="Business"
          htmlFor={field('company')}
          required={companyRequired}
          error={errors.company}
        >
          <Input
            id={field('company')}
            name="company"
            autoComplete="organization"
            value={values.company}
            onChange={(event) => set('company')(event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor={field('email')} required error={errors.email}>
          <Input
            id={field('email')}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => set('email')(event.target.value)}
          />
        </Field>

        <Field
          label="Phone"
          htmlFor={field('phone')}
          required={phoneRequired}
          error={errors.phone}
        >
          <Input
            id={field('phone')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => set('phone')(event.target.value)}
          />
        </Field>

        {typeOptions ? (
          <Field
            label="Enquiry type"
            htmlFor={field('enquiryType')}
            required
            error={errors.enquiryType}
            className="sm:col-span-2"
          >
            <Select
              id={field('enquiryType')}
              name="enquiryType"
              placeholder="Choose an enquiry type"
              value={values.enquiryType}
              onChange={(event) => set('enquiryType')(event.target.value)}
            >
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {extras.map((extra) => (
          <Field
            key={extra.id}
            label={extra.label}
            htmlFor={field(extra.id)}
            required={extra.required}
            hint={extra.hint}
            error={errors[extra.id]}
            className={extra.kind === 'select' ? undefined : 'sm:col-span-2'}
          >
            {extra.kind === 'select' ? (
              <Select
                id={field(extra.id)}
                name={extra.id}
                placeholder={extra.placeholder ?? 'Choose one'}
                value={values[extra.id]}
                onChange={(event) => set(extra.id)(event.target.value)}
              >
                {(extra.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={field(extra.id)}
                name={extra.id}
                placeholder={extra.placeholder}
                value={values[extra.id]}
                onChange={(event) => set(extra.id)(event.target.value)}
              />
            )}
          </Field>
        ))}
      </div>

      <Field
        label={messageLabel}
        htmlFor={field('message')}
        required={messageRequired}
        hint={messageHint}
        error={errors.message}
      >
        <Textarea
          id={field('message')}
          name="message"
          rows={6}
          placeholder={messagePlaceholder}
          value={values.message}
          onChange={(event) => set('message')(event.target.value)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" loading={status === 'sending'}>
          <Send aria-hidden="true" className="h-4 w-4" />
          {submitLabel}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Or call{' '}
          <a href={site.phone.href} className="link-underline font-semibold text-primary">
            {site.phone.display}
          </a>{' '}
          — {site.hours.short}.
        </p>
      </div>

      {/* Both outcomes are announced from one region so assistive tech reads
          whichever arrives, without two competing live regions. */}
      <div aria-live="polite" className="min-h-0">
        {status === 'failed' ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            />
            <span>{failureMessage}</span>
          </p>
        ) : null}
      </div>
    </form>
  )
}
