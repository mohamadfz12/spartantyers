import { useId, useState } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { Button, Field, Input, Textarea } from '@/components/ui'
import { site } from '@/config/site'
import { getProduct } from '@/data/products'
import { ApiError, api } from '@/lib/api'
import { enquiryBody, fieldsFromCard, validateEnquiry, FIELD_MAX, type EnquiryErrors, type EnquiryFields } from '@/lib/ai/cardForm'
import type { HandoverCard, QuoteCard } from '@/lib/ai/protocol'
import { clearDraft, finishCard, keepDraft, reportOutcome, useAssistant, type CardView } from '@/store/assistant'

// 16px on phones: iOS zooms the page in on any smaller text box.
const FIELD = 'text-base sm:text-sm'

/**
 * A quote request or a message for the sales team, as a short form the customer checks, edits and
 * sends. It goes to the same inbox as the Contact page's form (`/api/contact`); nothing is sent
 * until the customer taps Send.
 *
 * In the chat the card acts on the chat's messages; on a call (src/store/call.ts) the call hands in
 * what to do when it is sent, fails or is dismissed, and the same card is shown.
 */
export function EnquiryCardView({
  messageId,
  card,
  view,
  onSent,
  onFailed,
  onDismiss,
}: {
  messageId: number
  card: QuoteCard | HandoverCard
  view: CardView
  onSent?: () => void
  onFailed?: (message: string) => void
  onDismiss?: () => void
}) {
  const uid = useId()
  // What was typed is kept in the store (by card id), so closing and opening the panel or the call screen does not lose it.
  const [fields, setFields] = useState<EnquiryFields>(() => useAssistant.getState().drafts[card.id] ?? fieldsFromCard(card))
  const [errors, setErrors] = useState<EnquiryErrors>({})
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')

  const quote = card.kind === 'quote'
  const title = quote ? 'Request a quote' : 'Message for our team'
  const sendLabel = quote ? 'Send quote request' : 'Ask someone to get back to me'
  const id = (key: keyof EnquiryFields) => `${uid}-${key}`
  const product = quote && card.productId ? getProduct(card.productId) : undefined
  const productLabel = product ? `${product.brand} ${product.model} ${product.size}` : undefined

  if (view.state === 'done') {
    return (
      <div role="status" className="flex w-full items-start gap-3 rounded-xl border border-green-500/50 bg-green-500/10 p-3.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-600 text-white">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-sm leading-snug">
          <span className="font-semibold">Sent.</span> Our team will be in touch.
        </p>
      </div>
    )
  }

  if (view.state === 'dismissed') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Not sent: {title.toLowerCase()}
      </p>
    )
  }

  if (view.state === 'failed') {
    return (
      <div role="alert" className="flex w-full items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="text-sm leading-snug">
          {view.message ?? `That did not send. Please call ${site.phone.display} and the team will help.`}
        </p>
      </div>
    )
  }

  const bind = (key: keyof EnquiryFields) => ({
    id: id(key),
    name: key,
    value: fields[key],
    onChange: (event: { target: { value: string } }) => {
      const next = { ...fields, [key]: event.target.value }
      setFields(next)
      keepDraft(card.id, next)
      if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
    },
  })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (sending) return
    const found = validateEnquiry(fields, { company: quote })
    setErrors(found)
    const first = (['name', 'email', 'phone', 'company', 'message'] as const).find((key) => found[key])
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    setSending(true)
    setFormError('')
    try {
      await api.contact(enquiryBody(card, fields, { product: productLabel }))
      clearDraft(card.id)
      if (onSent) onSent()
      else finishCard(messageId, card, 'sent')
    } catch (caught) {
      const message =
        caught instanceof ApiError && caught.status >= 400 && caught.status < 500 && caught.status !== 404
          ? caught.message
          : `That did not send. Please try again, or call ${site.phone.display}.`
      setFormError(message)
      if (onFailed) onFailed(message)
      else reportOutcome({ cardId: card.id, outcome: 'failed', detail: message.slice(0, 200) })
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={title}
      className="w-full rounded-xl border border-primary/40 bg-card p-4 text-card-foreground shadow-sm"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-brand text-primary">{title}</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">Check it, change anything, then send.</p>

      {quote && (productLabel || card.size || card.quantity) ? (
        <p className="mt-3 rounded-md bg-muted px-2.5 py-1.5 text-xs leading-snug [overflow-wrap:anywhere]">
          {[productLabel ?? card.size, card.quantity ? `${card.quantity} tyres` : null].filter(Boolean).join(', ')}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3.5">
        <Field label="Your message" htmlFor={id('message')} required error={errors.message}>
          <Textarea {...bind('message')} rows={4} maxLength={FIELD_MAX.message} className={FIELD} />
        </Field>
        <Field label="Name" htmlFor={id('name')} required error={errors.name}>
          <Input {...bind('name')} autoComplete="name" maxLength={FIELD_MAX.name} className={FIELD} />
        </Field>
        <Field label="Email" htmlFor={id('email')} required error={errors.email}>
          <Input {...bind('email')} type="email" inputMode="email" autoComplete="email" className={FIELD} />
        </Field>
        <Field label="Phone (optional)" htmlFor={id('phone')} error={errors.phone}>
          <Input {...bind('phone')} type="tel" inputMode="tel" autoComplete="tel" maxLength={FIELD_MAX.phone} className={FIELD} />
        </Field>
        {quote ? (
          <Field label="Company (optional)" htmlFor={id('company')} error={errors.company}>
            <Input {...bind('company')} autoComplete="organization" maxLength={FIELD_MAX.company} className={FIELD} />
          </Field>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm font-medium text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {formError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        <Button type="submit" loading={sending} className="w-full">
          {sendLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={sending}
          onClick={() => {
            clearDraft(card.id)
            if (onDismiss) onDismiss()
            else finishCard(messageId, card, 'dismissed')
          }}
          className="w-full"
        >
          Not now
        </Button>
      </div>
    </form>
  )
}
