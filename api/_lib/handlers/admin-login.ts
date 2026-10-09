/**
 * POST /api/admin/login -> { token, expiresAt }
 *
 * Returns 503 when `ADMIN_PASSWORD` is unset: an unconfigured admin surface
 * must never behave like an open one.
 */

import {
  asString,
  fail,
  methodGuard,
  ok,
  readBody,
  withGuard,
} from '../http'
import { checkPassword, isAdminConfigured, issueToken } from '../auth'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['POST'])) return

  res.setHeader('Cache-Control', 'private, no-store')

  if (!isAdminConfigured()) {
    fail(
      res,
      503,
      'Admin is not configured on this deployment. Set the ADMIN_PASSWORD environment variable.',
    )
    return
  }

  const body = readBody<{ password?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with a "password" field.')
    return
  }

  const password = asString(body.password, 512)

  // `checkPassword` is timing-safe; a missing field is rejected the same way a
  // wrong password is so neither case is distinguishable from the response.
  if (!password || !checkPassword(password)) {
    fail(res, 401, 'Incorrect password.')
    return
  }

  const issued = issueToken()
  if (!issued) {
    fail(res, 503, 'Admin session signing is not configured.')
    return
  }

  ok(res, issued)
})
