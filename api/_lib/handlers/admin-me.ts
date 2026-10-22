/**
 * GET /api/admin/me -> { user }
 *
 * Who the current session belongs to, re-read from the staff record so a role
 * change shows up in the menu without signing out and back in.
 */

import { authorize } from '../auth.js'
import { methodGuard, ok, withGuard } from '../http.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  const actor = await authorize(req, res, 'dashboard')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')
  ok(res, { user: { id: actor.id, name: actor.name, role: actor.role, email: actor.email } })
})
