/**
 * GET /api/admin/enquiries -> { enquiries, subscribers }
 *
 * Both collections in one round trip — the admin inbox screen shows them side
 * by side, and two lambdas for one screen is two cold starts.
 */

import { authorize } from '../auth.js'
import { methodGuard, ok, withGuard } from '../http.js'
import { listEnquiries, listSubscribers } from '../store.js'

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  const actor = await authorize(req, res, 'enquiries')
  if (!actor) return

  res.setHeader('Cache-Control', 'private, no-store')

  const [enquiries, subscribers] = await Promise.all([
    listEnquiries(),
    listSubscribers(),
  ])

  ok(res, { enquiries, subscribers })
})
