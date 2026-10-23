/**
 * GET    /api/admin/leads (bearer token)
 *   -> { leads, statuses, importedAt, statusOptions, plans, people }
 * PATCH  /api/admin/leads (bearer token)  { key, status?, notes?, researchHours? }
 *   -> { key, status }
 * POST   /api/admin/leads (bearer token)  { date, towns, who?, note? }      (a new day plan)
 *   -> { plan }
 * PUT    /api/admin/leads (bearer token)  { id, date, towns, who?, note? }  (change a day plan)
 *   -> { plan }
 * DELETE /api/admin/leads?plan=<id> (bearer token)
 *   -> { ok }
 *
 * The lead list is commercially sensitive, so it lives only in the database
 * (loaded with `npm run import:leads`) and is only ever served from here,
 * behind the admin token. It is never part of the public site bundle, and the
 * GitHub repository is public, so it is never committed either.
 *
 * Sales progress (status + notes) is stored separately from the leads, keyed
 * by each lead's stable key, so re-importing a bigger list keeps every note.
 *
 * Day plans (src/lib/lead-plans.ts) are the team's shared work plan: a day and
 * the whole towns worked that day. They live here rather than in a function of
 * their own because they are part of the same page and Vercel allows only so
 * many functions. `people` is the names of active staff, offered as
 * suggestions for who does a day.
 */

import { randomUUID } from 'node:crypto'
import { checkPlanInput, dayLabel, listNames, unknownTownsError } from '../../../src/lib/lead-plans.js'
import { audit } from '../audit.js'
import { authorize } from '../auth.js'
import { fail, methodGuard, ok, queryParam, readBody, withGuard } from '../http.js'
import {
  LEAD_STATUSES,
  deleteLeadPlan,
  getLead,
  getLeadPlan,
  getLeadStatuses,
  getMeta,
  listLeadPlans,
  listLeads,
  listStaff,
  saveLeadPlan,
  setLeadStatus,
  type LeadStatusValue,
  type StoredLeadPlan,
} from '../store.js'

const MAX_NOTES = 4000
/** Research time per company, in hours. */
const MAX_RESEARCH_HOURS = 1000
/** Plan ids are always randomUUID()s; anything else is never looked up. */
const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function findPlan(id: unknown): Promise<StoredLeadPlan | null> {
  return typeof id === 'string' && PLAN_ID.test(id) ? getLeadPlan(id) : null
}

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'PATCH', 'POST', 'PUT', 'DELETE'])) return
  const actor = await authorize(req, res, 'leads')
  if (!actor) return

  res.setHeader('Cache-Control', 'private, no-store')
  const method = (req.method ?? 'GET').toUpperCase()

  if (method === 'GET') {
    const [leads, statuses, imported, plans, staff] = await Promise.all([
      listLeads(),
      getLeadStatuses(),
      getMeta<{ at: string; count: number }>('leads-imported'),
      listLeadPlans(),
      listStaff(),
    ])
    ok(res, {
      leads,
      statuses,
      importedAt: imported?.at ?? null,
      statusOptions: LEAD_STATUSES,
      plans,
      people: staff.filter((member) => member.active).map((member) => member.name),
    })
    return
  }

  /* ---- Day plans ------------------------------------------------- */

  if (method === 'DELETE') {
    const plan = await findPlan(queryParam(req, 'plan'))
    if (!plan) return fail(res, 404, 'No plan with that id. Reload the page and try again.')
    await deleteLeadPlan(plan.id)
    await audit(actor, 'leads.plan.delete', `Removed the plan for ${describePlan(plan)}`)
    ok(res, { ok: true })
    return
  }

  if (method === 'POST' || method === 'PUT') {
    const body = readBody<Record<string, unknown>>(req)
    const checked = checkPlanInput(body)
    if (!checked.ok) return fail(res, 400, checked.error)

    const existing = method === 'PUT' ? await findPlan(body?.id) : null
    if (method === 'PUT' && !existing) {
      return fail(res, 404, 'No plan with that id. Reload the page and try again.')
    }

    // A plan may name any town on the lead list, and keeps the towns it already
    // has even if a re-import has since dropped one.
    const knownTowns = new Set((await listLeads()).map((lead) => lead.city).filter(Boolean))
    for (const town of existing?.towns ?? []) knownTowns.add(town)
    const unknown = unknownTownsError(checked.value.towns, knownTowns)
    if (unknown) return fail(res, 400, unknown)

    const now = new Date().toISOString()
    const plan: StoredLeadPlan = {
      id: existing?.id ?? randomUUID(),
      ...checked.value,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? actor.name,
      updatedAt: now,
      updatedBy: actor.name,
    }
    await saveLeadPlan(plan)
    await audit(
      actor,
      existing ? 'leads.plan.update' : 'leads.plan.create',
      `${existing ? 'Changed the plan for' : 'Planned'} ${describePlan(plan)}`,
    )
    ok(res, { plan })
    return
  }

  /* ---- Sales progress on one lead (PATCH) ------------------------ */

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

/** "Mon 26 Oct 2026: Bathurst, Blayney and 3 more (Sam)", for the activity log. */
function describePlan(plan: StoredLeadPlan): string {
  const day = `${dayLabel(plan.date)} ${plan.date.slice(0, 4)}`
  return `${day}: ${listNames(plan.towns)}${plan.who ? ` (${plan.who})` : ''}`
}
