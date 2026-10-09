/**
 * POST /api/newsletter -> { ok: true, alreadySubscribed? }
 *
 * Subscribers are keyed by lower-cased email, so re-submitting the same
 * address is idempotent and reported honestly via `alreadySubscribed`.
 * No environment variables are required.
 */

import {
  asEmail,
  fail,
  methodGuard,
  ok,
  readBody,
  safeMessage,
  withGuard,
} from './_lib/http'
import { saveSubscriber } from './_lib/store'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  const body = readBody<{ email?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with an "email" field.')
    return
  }

  const email = asEmail(body.email)
  if (!email) {
    fail(res, 400, 'Please enter a valid email address.')
    return
  }

  try {
    const { alreadySubscribed } = await saveSubscriber(email)
    ok(res, { ok: true, ...(alreadySubscribed ? { alreadySubscribed: true } : {}) })
  } catch (error) {
    console.error(`[newsletter] could not persist subscriber: ${safeMessage(error)}`)
    fail(res, 503, 'We could not sign you up just now. Please try again shortly.')
  }
})
