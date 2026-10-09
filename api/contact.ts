/**
 * POST /api/contact -> { ok: true }
 *
 * Validates and stores an enquiry for the admin inbox. No email provider is
 * wired up: persistence is the delivery mechanism, which means the endpoint
 * has no required environment variables. Without KV the enquiry lands in the
 * development-only in-memory store (see `_lib/store.ts`), so KV should be
 * provisioned before the contact form goes live.
 */

import {
  asEmail,
  asPhone,
  asString,
  fail,
  methodGuard,
  ok,
  readBody,
  safeMessage,
  withGuard,
} from './_lib/http'
import { newEnquiryId } from './_lib/ids'
import { saveEnquiry, type StoredEnquiry } from './_lib/store'

const ENQUIRY_TYPES = [
  'general',
  'quote',
  'fleet',
  'wholesale',
  'fitting',
  'delivery',
  'warranty',
  'other',
]

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  const body = readBody<Record<string, unknown>>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body.')
    return
  }

  const name = asString(body.name, 120)
  const email = asEmail(body.email)
  const message = asString(body.message, 5000)
  const enquiryTypeRaw = asString(body.enquiryType, 60)

  if (!name) {
    fail(res, 400, 'Please tell us your name.')
    return
  }
  if (!email) {
    fail(res, 400, 'Please enter a valid email address so we can reply.')
    return
  }
  if (!message || message.length < 10) {
    fail(res, 400, 'Please include a message of at least 10 characters.')
    return
  }

  // Unknown types are normalised rather than rejected — a new form option
  // should never start failing against an older deployment.
  const normalisedType = (enquiryTypeRaw ?? 'general').toLowerCase()
  const enquiryType = ENQUIRY_TYPES.includes(normalisedType)
    ? normalisedType
    : 'other'

  // Phone and company are optional; an invalid phone is dropped, not fatal.
  const phone = asPhone(body.phone) ?? undefined
  const company = asString(body.company, 120) ?? undefined

  const enquiry: StoredEnquiry = {
    id: newEnquiryId(),
    createdAt: new Date().toISOString(),
    name,
    email,
    ...(phone ? { phone } : {}),
    ...(company ? { company } : {}),
    enquiryType,
    message,
    handled: false,
  }

  try {
    await saveEnquiry(enquiry)
  } catch (error) {
    console.error(`[contact] could not persist enquiry: ${safeMessage(error)}`)
    fail(
      res,
      503,
      'We could not record your enquiry just now. Please call us or try again shortly.',
    )
    return
  }

  ok(res, { ok: true })
})
