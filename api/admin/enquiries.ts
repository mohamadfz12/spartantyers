/**
 * GET /api/admin/enquiries -> { enquiries, subscribers }
 *
 * Both collections in one round trip — the admin inbox screen shows them side
 * by side, and two lambdas for one screen is two cold starts.
 */

import { requireAdmin } from '../_lib/auth'
import { methodGuard, ok, withGuard } from '../_lib/http'
import { listEnquiries, listSubscribers } from '../_lib/store'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  if (!requireAdmin(req, res)) return

  res.setHeader('Cache-Control', 'private, no-store')

  const [enquiries, subscribers] = await Promise.all([
    listEnquiries(),
    listSubscribers(),
  ])

  ok(res, { enquiries, subscribers })
})
