/**
 * The quote and "talk to a person" cards are short forms. This checks them the way `/api/contact`
 * does (so the customer hears about a problem before sending, not after) and builds the body the
 * browser posts there.
 *
 * React-free so the tests can run it.
 */
import { isEmail } from '../email.js'
import type { HandoverCard, QuoteCard } from './protocol.js'

export type EnquiryFields = {
  name: string
  email: string
  phone: string
  company: string
  message: string
}

export type EnquiryErrors = Partial<Record<keyof EnquiryFields, string>>

/** The same limits as `/api/contact`. */
export const FIELD_MAX = { name: 120, company: 120, phone: 40, message: 5000 } as const

/** The longest part of the message the customer may write; the rest of the room is for the details added below it. */
const MESSAGE_ROOM = 4600

/** The card's own words, ready to edit. */
export function fieldsFromCard(card: QuoteCard | HandoverCard): EnquiryFields {
  return {
    name: card.name ?? '',
    email: card.email ?? '',
    phone: card.phone ?? '',
    company: card.kind === 'quote' ? (card.company ?? '') : '',
    message: card.message,
  }
}

/** Problems with the form, in plain words; empty when it can be sent. */
export function validateEnquiry(f: EnquiryFields, opts: { company: boolean }): EnquiryErrors {
  const errors: EnquiryErrors = {}
  const name = f.name.trim()
  if (!name) errors.name = 'Please tell us your name.'
  else if (name.length > FIELD_MAX.name) errors.name = `Please keep your name to ${FIELD_MAX.name} characters or fewer.`

  if (!isEmail(f.email.trim())) errors.email = 'Please enter a valid email address so we can reply.'

  const message = f.message.trim()
  if (message.length < 10) errors.message = 'Please include a message of at least 10 characters.'
  else if (message.length > MESSAGE_ROOM) errors.message = `Please keep the message to ${MESSAGE_ROOM} characters or fewer.`

  const phone = f.phone.trim()
  if (phone) {
    if (phone.length > FIELD_MAX.phone) errors.phone = `Please keep the phone number to ${FIELD_MAX.phone} characters or fewer.`
    else if (phone.replace(/\D/g, '').length < 8) errors.phone = 'That phone number looks too short.'
  }

  if (opts.company && f.company.trim().length > FIELD_MAX.company) {
    errors.company = `Please keep the company name to ${FIELD_MAX.company} characters or fewer.`
  }
  return errors
}

/** What `/api/contact` is sent. `detail` is the tyre the quote is about, for the team's inbox. */
export function enquiryBody(
  card: QuoteCard | HandoverCard,
  f: EnquiryFields,
  detail?: { product?: string },
) {
  const extras: string[] = []
  if (card.kind === 'quote') {
    if (detail?.product) extras.push(`Tyre: ${detail.product}`)
    else if (card.size) extras.push(`Size: ${card.size}`)
    if (card.quantity) extras.push(`Quantity: ${card.quantity}`)
  }
  const footer = `Sent from the website assistant${extras.length ? `. ${extras.join('. ')}` : ''}.`
  const company = f.company.trim()
  const phone = f.phone.trim()
  return {
    name: f.name.trim(),
    email: f.email.trim(),
    ...(phone ? { phone } : {}),
    ...(card.kind === 'quote' && company ? { company } : {}),
    enquiryType: card.kind === 'quote' ? card.enquiryType : 'general',
    message: `${f.message.trim()}\n\n${footer}`,
  }
}
