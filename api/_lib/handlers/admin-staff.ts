/**
 * GET    /api/admin/staff                 -> { staff, timesheets }
 * POST   /api/admin/staff { ...member, password? }      -> { member }
 * PATCH  /api/admin/staff { id, ...changes, password? } -> { member }
 * DELETE /api/admin/staff?id=                           -> { ok }
 *
 * Owners and managers can see the team and its hours; only an owner can add
 * people, give them a sign-in, change a role or switch someone off.
 *
 * Password hashes never leave this file: every response goes through
 * `publicStaff`, which replaces the hash with a plain `hasLogin` flag.
 */

import { randomUUID } from 'node:crypto'
import { can, isStaffRole, ROLE_LABELS } from '../../../src/lib/admin-roles.js'
import { asDate, audit, optionalText } from '../audit.js'
import { STAFF_PASSWORD_MIN, authorize, hashStaffPassword } from '../auth.js'
import {
  asEmail,
  asString,
  fail,
  methodGuard,
  ok,
  queryParam,
  readBody,
  withGuard,
} from '../http.js'
import {
  deleteStaff,
  getStaff,
  listStaff,
  listTimesheets,
  saveStaff,
  type StoredStaff,
} from '../store.js'

const MAX_RATE = 1000

export function publicStaff(member: StoredStaff) {
  const { passwordHash, tokenVersion, ...rest } = member
  return { ...rest, hasLogin: Boolean(passwordHash) }
}

export default withGuard(async (req, res) => {
  if (!methodGuard(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return
  const method = (req.method ?? 'GET').toUpperCase()

  const actor = await authorize(req, res, method === 'GET' ? 'staff' : 'accounts')
  if (!actor) return

  res.setHeader('Cache-Control', 'private, no-store')

  if (method === 'GET') {
    const [staff, timesheets] = await Promise.all([listStaff(), listTimesheets()])
    ok(res, {
      staff: staff.map(publicStaff),
      timesheets,
      canManageAccounts: can(actor.role, 'accounts'),
    })
    return
  }

  if (method === 'DELETE') {
    const id = asString(queryParam(req, 'id'), 120)
    const member = id ? await getStaff(id) : null
    if (!member) {
      fail(res, 404, 'No staff member with that id.')
      return
    }
    const logged = (await listTimesheets()).some((entry) => entry.staffId === member.id)
    if (logged) {
      fail(
        res,
        409,
        `${member.name} has hours on record, so they can't be deleted. Switch them to inactive instead; that keeps their timesheets and ends their sign-in.`,
      )
      return
    }
    await deleteStaff(member.id)
    await audit(actor, 'staff.delete', `Removed ${member.name}`)
    ok(res, { ok: true })
    return
  }

  /* ---- POST (create) and PATCH (update) ------------------------- */

  const body = readBody<Record<string, unknown>>(req)
  if (!body) {
    fail(res, 400, 'Expected a JSON request body.')
    return
  }

  const creating = method === 'POST'
  const existing = creating ? null : await getStaff(asString(body.id, 120) ?? '')
  if (!creating && !existing) {
    fail(res, 404, 'No staff member with that id.')
    return
  }

  const has = (key: string) => creating || key in body
  const now = new Date().toISOString()
  const next: StoredStaff = existing
    ? { ...existing }
    : {
        id: randomUUID(),
        name: '',
        email: '',
        phone: '',
        role: 'staff',
        position: '',
        payRate: null,
        startDate: '',
        notes: '',
        active: true,
        tokenVersion: 1,
        createdAt: now,
        updatedAt: now,
      }
  let endSessions = false

  if (has('name')) {
    const name = asString(body.name, 120)
    if (!name) return fail(res, 400, 'A name is required (up to 120 characters).')
    next.name = name
  }

  if (has('email')) {
    const email = asEmail(body.email)?.toLowerCase()
    if (!email) return fail(res, 400, 'A valid email address is required; it is what they sign in with.')
    const clash = (await listStaff()).find((m) => m.email === email && m.id !== next.id)
    if (clash) return fail(res, 409, `${clash.name} already uses ${email}.`)
    if (existing && existing.email !== email) endSessions = true
    next.email = email
  }

  if (has('role')) {
    const role = body.role ?? 'staff'
    if (!isStaffRole(role)) return fail(res, 400, '"role" must be owner, manager, sales or staff.')
    if (existing && existing.role !== role) endSessions = true
    next.role = role
  }

  for (const [key, max] of [['phone', 40], ['position', 80], ['notes', 2000]] as const) {
    if (!has(key)) continue
    const text = optionalText(body[key], max)
    if (text === null) return fail(res, 400, `"${key}" must be text of at most ${max} characters.`)
    next[key] = text
  }

  if (has('payRate')) {
    if (body.payRate === null || body.payRate === undefined || body.payRate === '') {
      next.payRate = null
    } else {
      const rate = Number(body.payRate)
      if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_RATE) {
        return fail(res, 400, `Pay rate must be dollars per hour, between 0 and ${MAX_RATE}.`)
      }
      next.payRate = Math.round(rate * 100) / 100
    }
  }

  if (has('startDate')) {
    if (!body.startDate) next.startDate = ''
    else {
      const date = asDate(body.startDate)
      if (!date) return fail(res, 400, 'Start date must be a real date (YYYY-MM-DD).')
      next.startDate = date
    }
  }

  if (!creating && 'active' in body) {
    if (typeof body.active !== 'boolean') return fail(res, 400, '"active" must be true or false.')
    if (existing!.active && !body.active) endSessions = true
    next.active = body.active
  }

  if ('password' in body && body.password !== '' && body.password != null) {
    if (typeof body.password !== 'string' || body.password.length < STAFF_PASSWORD_MIN || body.password.length > 200) {
      return fail(res, 400, `Passwords need at least ${STAFF_PASSWORD_MIN} characters.`)
    }
    next.passwordHash = await hashStaffPassword(body.password)
    endSessions = true
  }

  if (!creating && body.removeLogin === true) {
    delete next.passwordHash
    endSessions = true
  }

  if (endSessions && existing) next.tokenVersion = existing.tokenVersion + 1
  next.updatedAt = now

  await saveStaff(next)

  if (creating) {
    await audit(
      actor,
      'staff.create',
      `Added ${next.name} as ${ROLE_LABELS[next.role]}${next.passwordHash ? ' with a sign-in' : ''}`,
    )
  } else {
    const changes: string[] = []
    if (existing!.role !== next.role) changes.push(`role ${ROLE_LABELS[existing!.role]} → ${ROLE_LABELS[next.role]}`)
    if (existing!.active !== next.active) changes.push(next.active ? 'reactivated' : 'deactivated')
    if (existing!.passwordHash !== next.passwordHash) changes.push(next.passwordHash ? 'password set' : 'sign-in removed')
    if (existing!.payRate !== next.payRate) changes.push(`pay rate ${existing!.payRate ?? '—'} → ${next.payRate ?? '—'}`)
    if (existing!.email !== next.email) changes.push('email changed')
    await audit(actor, 'staff.update', `${next.name}: ${changes.join(', ') || 'details updated'}`)
  }

  ok(res, { member: publicStaff(next) })
})
