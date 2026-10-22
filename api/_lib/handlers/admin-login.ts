/**
 * POST /api/admin/login { password, email? } -> { token, expiresAt, user }
 *
 * - No email: the owner password (`ADMIN_PASSWORD`). Always available, so a
 *   staff database problem can never lock the owner out.
 * - With an email: that staff member's own password.
 *
 * Every failure gets the same message and takes the same time, so the form
 * never reveals whether an email belongs to a staff member.
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
} from '../http.js'
import { audit } from '../audit.js'
import {
  OWNER_ACTOR,
  actorFor,
  burnPasswordCheck,
  checkPassword,
  isAdminConfigured,
  issueToken,
  verifyStaffPassword,
  type Actor,
} from '../auth.js'
import { findStaffByEmail } from '../store.js'

const WRONG = 'Incorrect email or password.'

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

  const body = readBody<{ password?: unknown; email?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with a "password" field.')
    return
  }

  const password = asString(body.password, 512)
  const email = asString(body.email, 254)?.toLowerCase() ?? null

  /* ---- Owner: the deployment password ------------------------- */

  if (!email) {
    // `checkPassword` is timing-safe; a missing field is rejected the same way
    // a wrong password is so neither case is distinguishable from the response.
    if (!password || !checkPassword(password)) {
      fail(res, 401, 'Incorrect password.')
      return
    }
    const issued = issueToken()
    if (!issued) {
      fail(res, 503, 'Admin session signing is not configured.')
      return
    }
    await audit(OWNER_ACTOR, 'auth.login', 'Owner signed in with the owner password')
    ok(res, { ...issued, user: publicUser(OWNER_ACTOR) })
    return
  }

  /* ---- Staff: their own email and password --------------------- */

  if (!password) {
    fail(res, 401, WRONG)
    return
  }

  const staff = await findStaffByEmail(email)
  const usable = staff && staff.active && staff.passwordHash ? staff : null

  if (!usable) {
    await burnPasswordCheck(password)
    fail(res, 401, WRONG)
    return
  }

  if (!(await verifyStaffPassword(password, usable.passwordHash))) {
    fail(res, 401, WRONG)
    return
  }

  const issued = issueToken(Date.now(), usable)
  if (!issued) {
    fail(res, 503, 'Admin session signing is not configured.')
    return
  }

  const actor = actorFor(usable)
  await audit(actor, 'auth.login', `${actor.name} signed in`)
  ok(res, { ...issued, user: publicUser(actor) })
})

function publicUser(actor: Actor) {
  return { id: actor.id, name: actor.name, role: actor.role, email: actor.email }
}
