/**
 * GET /api/admin/activity -> { entries, total }
 *
 * The activity log: sign-ins, stock movements, price edits, order status
 * changes, money recorded, staff changes. Newest first, most recent 500.
 */

import { authorize } from '../auth.js'
import { methodGuard, ok, withGuard } from '../http.js'
import { listAudit } from '../store.js'

const SHOWN = 500

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET'])) return
  const actor = await authorize(req, res, 'activity')
  if (!actor) return
  res.setHeader('Cache-Control', 'private, no-store')

  const entries = await listAudit()
  ok(res, { entries: entries.slice(0, SHOWN), total: entries.length })
})
