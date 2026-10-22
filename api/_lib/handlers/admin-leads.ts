/**
 * GET   /api/admin/leads (bearer token)
 *   -> { leads, statuses, importedAt, statusOptions }
 * PATCH /api/admin/leads (bearer token)  { key, status?, notes? }
 *   -> { key, status }
 *
 * The lead list is commercially sensitive, so it lives only in the database
 * (loaded with `npm run import:leads`) and is only ever served from here,
 * behind the admin token. It is never part of the public site bundle, and the
 * GitHub repository is public, so it is never committed either.
 *
 * Sales progress (status + notes) is stored separately from the leads, keyed
 * by each lead's stable key, so re-importing a bigger list keeps every note.
 */

import { authorize } from '../auth.js'
import { fail, methodGuard, ok, readBody, withGuard } from '../http.js'
import {
  LEAD_STATUSES,
  getLead,
  getLeadStatuses,
  getMeta,
  listLeads,
  setLeadStatus,
  type LeadStatusValue,
} from '../store.js'

const MAX_NOTES = 4000
/** Research time per company, in hours. */
const MAX_RESEARCH_HOURS = 1000

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PATCH'])) return
  const actor = await authorize(req, res, 'leads')
  if (!actor) return

  res.setHeader('Cache-Control', 'private, no-store')

  if ((req.method ?? 'GET').toUpperCase() === 'GET') {
    const [leads, statuses, imported] = await Promise.all([
      listLeads(),
      getLeadStatuses(),
      getMeta<{ at: string; count: number }>('leads-imported'),
    ])
    ok(res, {
      leads,
      statuses,
      importedAt: imported?.at ?? null,
      statusOptions: LEAD_STATUSES,
    })
    return
  }

  const body = readBody<{ key?: unknown; status?: unknown; notes?: unknown; researchHours?: unknown }>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body with "key" and a "status" or "notes".')
    return
  }

  const key = typeof body.key === 'string' ? body.key.trim() : ''
  if (!key) {
    fail(res, 400, 'A lead "key" is required.')
    return
  }

  const patch: { status?: LeadStatusValue; notes?: string; researchHours?: number | null } = {}

  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status as LeadStatusValue)) {
      fail(res, 400, `"status" must be one of ${LEAD_STATUSES.join(', ')}.`)
      return
    }
    patch.status = body.status as LeadStatusValue
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > MAX_NOTES) {
      fail(res, 400, `"notes" must be text of at most ${MAX_NOTES} characters.`)
      return
    }
    patch.notes = body.notes
  }

  if (body.researchHours !== undefined) {
    if (body.researchHours === null || body.researchHours === '') {
      patch.researchHours = null
    } else {
      const hours = Number(body.researchHours)
      if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_RESEARCH_HOURS) {
        fail(res, 400, `"researchHours" must be more than 0 and at most ${MAX_RESEARCH_HOURS}, or null to clear it.`)
        return
      }
      patch.researchHours = Math.round(hours * 100) / 100
    }
  }

  if (patch.status === undefined && patch.notes === undefined && patch.researchHours === undefined) {
    fail(res, 400, 'Nothing to change: send a "status", "notes" or "researchHours".')
    return
  }

  // Refuse keys that are not real leads, so a typo cannot create orphan
  // status rows that no list will ever show.
  if (!(await getLead(key))) {
    fail(res, 404, 'No lead with that key. Re-load the list and try again.')
    return
  }

  ok(res, { key, status: await setLeadStatus(key, patch) })
})
