/**
 * Day plans on the admin Leads page: the shared rules (src/lib/lead-plans.ts) and the API
 * (api/admin/leads: POST / PUT / DELETE plans, plans + people on GET), against the in-memory
 * store. No network, no database.
 *   npx tsx --test tests/lead-plans.test.ts
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

Object.assign(process.env, {
  // Sydney's own clock, so the daylight-saving tests would catch any local-time date maths.
  TZ: 'Australia/Sydney',
  AI_DB_MEMORY: '1',
  ADMIN_PASSWORD: 'test-admin-password',
  ADMIN_SESSION_SECRET: 'test-secret-test-secret-test-secret',
})
for (const name of [
  'DATABASE_URL',
  'POSTGRES_URL',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL',
]) {
  delete process.env[name]
}

const plansLib = await import('../src/lib/lead-plans.js')
const {
  addDays,
  checkPlanInput,
  dayLabel,
  isDay,
  isPlanDay,
  leadsInTowns,
  listNames,
  nextMonday,
  planProgress,
  sortPlans,
  sydneyToday,
  townClashes,
  unknownTownsError,
  weekdayOf,
  weekLabel,
  weekStart,
} = plansLib
type LeadPlan = import('../src/lib/lead-plans.js').LeadPlan
const { issueToken } = await import('../api/_lib/auth.js')
const store = await import('../api/_lib/store.js')
const { default: adminRoute } = await import('../api/admin/[action].js')

type Json = Record<string, any>

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

class FakeRes {
  code = 200
  headers: Record<string, string> = {}
  body: unknown = undefined
  status(code: number) {
    this.code = code
    return this
  }
  setHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v
  }
  json(b: unknown) {
    this.body = b
  }
  end() {}
}

const OWNER = issueToken()!.token

async function call(o: { method?: string; query?: Record<string, string>; body?: unknown; token?: string | null } = {}) {
  const res = new FakeRes()
  const headers: Record<string, string> = {}
  const token = o.token === undefined ? OWNER : o.token
  if (token) headers.authorization = `Bearer ${token}`
  await adminRoute({ method: o.method ?? 'GET', query: { action: 'leads', ...(o.query ?? {}) }, body: o.body, headers }, res as never)
  return { status: res.code, json: (res.body ?? {}) as Json }
}

const MEMORY = '__spartanMemoryStore__'
const memory = () => (globalThis as unknown as Record<string, Record<string, Record<string, unknown>>>)[MEMORY]

function lead(key: string, city: string, extra: Record<string, unknown> = {}) {
  return {
    key,
    name: `Company ${key}`,
    category: 'Transport',
    subtype: '',
    website: '',
    description: '',
    region: 'W NSW',
    area: 'Central West',
    city,
    address: '',
    phones: [],
    emails: [],
    contact_page: '',
    other_contacts: '',
    size: '',
    employees: '',
    fleet: '',
    size_basis: '',
    source: '',
    reach: '',
    priority: 'A',
    ...extra,
  }
}

/** A fresh in-memory database holding these leads. */
function seed(leads = [lead('b1', 'Bathurst'), lead('b2', 'Bathurst'), lead('k1', 'Bathurst (Kelso)'), lead('y1', 'Blayney'), lead('d1', 'Dubbo')]) {
  ;(globalThis as unknown as Record<string, unknown>)[MEMORY] = {
    'spartan:leads': Object.fromEntries(leads.map((l) => [l.key, l])),
  }
}

function plan(over: Partial<LeadPlan> = {}): LeadPlan {
  return {
    id: 'p1',
    date: '2026-10-26',
    towns: ['Bathurst'],
    who: '',
    note: '',
    createdAt: '2026-10-23T00:00:00.000Z',
    createdBy: 'Owner',
    updatedAt: '2026-10-23T00:00:00.000Z',
    updatedBy: 'Owner',
    ...over,
  }
}

/* ------------------------------------------------------------------ *
 * Days and weeks
 * ------------------------------------------------------------------ */

test('isDay accepts real days only', () => {
  assert.equal(isDay('2026-10-26'), true)
  assert.equal(isDay('2028-02-29'), true)
  for (const bad of ['2026-02-31', '2026-02-29', '2026-13-01', '2026-10-6', '26-10-2026', '', 'monday', 20261026, null, undefined]) {
    assert.equal(isDay(bad), false, String(bad))
  }
})

test('plan days run from 2020 to 2099', () => {
  assert.equal(isPlanDay('2020-01-01'), true)
  assert.equal(isPlanDay('2099-12-31'), true)
  assert.equal(isPlanDay('2019-12-31'), false)
  assert.equal(isPlanDay('2100-01-01'), false)
  assert.equal(isPlanDay('2026-02-31'), false)
})

test('addDays crosses months, years and the daylight-saving change', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02')
  assert.equal(addDays('2026-12-30', 3), '2027-01-02')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  // Sydney moves its clocks forward on 4 October 2026: a day is still a day.
  assert.equal(addDays('2026-10-03', 1), '2026-10-04')
  assert.equal(addDays('2026-10-04', 1), '2026-10-05')
  assert.equal(addDays('2027-04-03', 1), '2027-04-04')
})

test('weeks start on Monday', () => {
  assert.equal(weekdayOf('2026-10-26'), 0) // Monday
  assert.equal(weekdayOf('2026-10-23'), 4) // Friday
  assert.equal(weekdayOf('2026-11-01'), 6) // Sunday
  for (let i = 0; i < 7; i++) assert.equal(weekStart(addDays('2026-10-26', i)), '2026-10-26')
  assert.equal(weekStart('2027-01-01'), '2026-12-28')
})

test('next Monday is always after the day', () => {
  assert.equal(nextMonday('2026-10-23'), '2026-10-26') // Friday
  assert.equal(nextMonday('2026-10-25'), '2026-10-26') // Sunday
  assert.equal(nextMonday('2026-10-26'), '2026-11-02') // Monday: the one after
  assert.equal(nextMonday('2026-10-31'), '2026-11-02') // Saturday
})

test('today is the Sydney day, wherever the browser is', () => {
  // 22 Oct 14:30 UTC is 23 Oct 01:30 in Sydney (AEDT, UTC+11).
  assert.equal(sydneyToday(new Date('2026-10-22T14:30:00Z')), '2026-10-23')
  assert.equal(sydneyToday(new Date('2026-10-22T12:59:00Z')), '2026-10-22')
  // Winter (AEST, UTC+10).
  assert.equal(sydneyToday(new Date('2026-06-30T14:00:00Z')), '2026-07-01')
})

test('day and week labels', () => {
  assert.equal(dayLabel('2026-10-26'), 'Mon 26 Oct')
  assert.equal(dayLabel('2026-10-26', 'long'), 'Monday 26 October 2026')
  assert.equal(dayLabel('2026-11-01', 'long'), 'Sunday 1 November 2026')
  assert.equal(weekLabel('2026-10-26'), 'Week of 26 Oct 2026')
})

/* ------------------------------------------------------------------ *
 * Checking a plan
 * ------------------------------------------------------------------ */

const KNOWN = new Set(['Bathurst', 'Bathurst (Kelso)', 'Blayney', 'Canowindra'])

test('a good plan is cleaned up: trimmed, no repeats, towns A to Z', () => {
  const result = checkPlanInput({
    date: '2026-10-26',
    towns: [' Canowindra', 'Bathurst', 'Bathurst', 'Bathurst (Kelso) '],
    who: '  Sales rep 1 ',
    note: ' Start early ',
  })
  assert.deepEqual(result, {
    ok: true,
    value: { date: '2026-10-26', towns: ['Bathurst', 'Bathurst (Kelso)', 'Canowindra'], who: 'Sales rep 1', note: 'Start early' },
  })
  const bare = checkPlanInput({ date: '2026-10-26', towns: ['Blayney'] })
  assert.deepEqual(bare, { ok: true, value: { date: '2026-10-26', towns: ['Blayney'], who: '', note: '' } })
  // Extra keys (an id, a made-up field) never reach the plan.
  const extra = checkPlanInput({ date: '2026-10-26', towns: ['Blayney'], id: 'x', createdBy: 'someone', admin: true })
  assert.deepEqual(extra, bare)
})

test('a bad plan is refused with a clear reason', () => {
  const reason = (body: unknown) => {
    const result = checkPlanInput(body)
    assert.equal(result.ok, false, JSON.stringify(body))
    return result.ok ? '' : result.error
  }
  assert.match(reason(null), /Expected a plan/)
  assert.match(reason([]), /Expected a plan/)
  assert.match(reason('2026-10-26'), /Expected a plan/)
  assert.match(reason({ towns: ['Bathurst'] }), /"date" must be a real day/)
  assert.match(reason({ date: '2026-02-31', towns: ['Bathurst'] }), /"date" must be a real day/)
  assert.match(reason({ date: '1999-12-31', towns: ['Bathurst'] }), /"date" must be a real day from 2020-01-01 to 2099-12-31/)
  assert.match(reason({ date: '2026-10-26', towns: 'Bathurst' }), /must be a list/)
  assert.match(reason({ date: '2026-10-26', towns: [] }), /at least one town/)
  assert.match(reason({ date: '2026-10-26', towns: ['  '] }), /Every town must be a name/)
  assert.match(reason({ date: '2026-10-26', towns: [42] }), /Every town must be a name/)
  assert.match(reason({ date: '2026-10-26', towns: ['x'.repeat(121)] }), /Every town must be a name/)
  const many = Array.from({ length: 61 }, (_, i) => `Town ${i}`)
  assert.match(reason({ date: '2026-10-26', towns: many }), /at most 60 towns/)
  assert.equal(checkPlanInput({ date: '2026-10-26', towns: many.slice(0, 60) }).ok, true)
  // A huge list is refused before any of it is looked at.
  const huge = Array.from({ length: 400_000 }, (_, i) => `T${i}`)
  const started = performance.now()
  const refused = checkPlanInput({ date: '2026-10-26', towns: huge })
  const took = performance.now() - started
  assert.equal(refused.ok, false)
  assert.match(refused.ok ? '' : refused.error, /at most 60 towns/)
  assert.ok(took < 50, `refused at once (took ${took.toFixed(1)} ms)`)
  assert.match(reason({ date: '2026-10-26', towns: ['Bathurst'], who: 'x'.repeat(121) }), /"who"/)
  assert.equal(checkPlanInput({ date: '2026-10-26', towns: ['Bathurst'], who: 'x'.repeat(120) }).ok, true, 'a staff name of 120 fits')
  assert.match(reason({ date: '2026-10-26', towns: ['Bathurst'], who: 7 }), /"who"/)
  assert.match(reason({ date: '2026-10-26', towns: ['Bathurst'], note: 'x'.repeat(1001) }), /"note"/)
})

test('towns must be on the lead list', () => {
  assert.equal(unknownTownsError(['Bathurst', 'Blayney'], KNOWN), null)
  assert.match(unknownTownsError(['Bathurst', 'Narnia'], KNOWN) ?? '', /^Narnia is not on the lead list/)
  assert.match(unknownTownsError(['Narnia', 'Atlantis'], KNOWN) ?? '', /^Narnia and Atlantis are not on the lead list/)
})

/* ------------------------------------------------------------------ *
 * Plans and their leads
 * ------------------------------------------------------------------ */

test('a plan holds every lead in its towns, and progress counts the worked ones', () => {
  const leads = [
    { key: 'a', city: 'Bathurst' },
    { key: 'b', city: 'Bathurst' },
    { key: 'c', city: 'Blayney' },
    { key: 'd', city: 'Dubbo' },
  ]
  assert.deepEqual(leadsInTowns(['Bathurst', 'Blayney'], leads).map((l) => l.key), ['a', 'b', 'c'])
  assert.deepEqual(planProgress(['Bathurst', 'Blayney'], leads, (l) => l.key === 'a' || l.key === 'd'), { total: 3, done: 1 })
  assert.deepEqual(planProgress(['Nowhere'], leads, () => true), { total: 0, done: 0 })
})

test('clashes: the same town on the same day in another plan', () => {
  const plans = [
    plan({ id: 'p1', date: '2026-10-26', towns: ['Bathurst', 'Blayney'], who: 'Rep 1' }),
    plan({ id: 'p2', date: '2026-10-27', towns: ['Bathurst'] }),
  ]
  const clashes = townClashes(plans, '2026-10-26', ['Blayney', 'Canowindra'])
  assert.deepEqual(clashes.map((c) => [c.town, c.plan.id]), [['Blayney', 'p1']])
  assert.deepEqual(townClashes(plans, '2026-10-26', ['Bathurst'], 'p1'), [], 'a plan never clashes with itself')
  assert.deepEqual(townClashes(plans, '2026-10-28', ['Bathurst']), [])
})

test('plans sort by day, then by when they were made', () => {
  const sorted = sortPlans([
    plan({ id: 'c', date: '2026-10-27', createdAt: '2026-10-01T00:00:00Z' }),
    plan({ id: 'b', date: '2026-10-26', createdAt: '2026-10-02T00:00:00Z' }),
    plan({ id: 'a', date: '2026-10-26', createdAt: '2026-10-01T00:00:00Z' }),
  ])
  assert.deepEqual(sorted.map((p) => p.id), ['a', 'b', 'c'])
})

test('listNames reads naturally', () => {
  assert.equal(listNames([]), '')
  assert.equal(listNames(['Bathurst']), 'Bathurst')
  assert.equal(listNames(['Bathurst', 'Blayney']), 'Bathurst and Blayney')
  assert.equal(listNames(['Bathurst', 'Blayney', 'Cowra']), 'Bathurst, Blayney and Cowra')
  assert.equal(listNames(['A', 'B', 'C', 'D', 'E']), 'A, B and 3 more')
})

/* ------------------------------------------------------------------ *
 * The API
 * ------------------------------------------------------------------ */

beforeEach(() => seed())

test('GET gives the plans and the names of active staff', async () => {
  const now = new Date().toISOString()
  const staff = (id: string, name: string, active: boolean) => ({
    id, name, email: `${id}@example.com`, phone: '', role: 'staff' as const, position: '', payRate: null,
    startDate: '', notes: '', active, tokenVersion: 1, createdAt: now, updatedAt: now,
  })
  await store.saveStaff(staff('s1', 'Sales rep 1', true))
  await store.saveStaff(staff('s2', 'Left last year', false))

  const res = await call()
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.plans, [])
  assert.deepEqual(res.json.people, ['Sales rep 1'])
  assert.equal(res.json.leads.length, 5)
})

test('make, change and delete a plan, each one written to the activity log', async () => {
  const made = await call({
    method: 'POST',
    body: { date: '2026-10-26', towns: ['Blayney', 'Bathurst', 'Bathurst (Kelso)'], who: 'Sales rep 1', note: 'A leads first' },
  })
  assert.equal(made.status, 200, JSON.stringify(made.json))
  const created = made.json.plan as LeadPlan
  assert.ok(created.id)
  assert.deepEqual(created.towns, ['Bathurst', 'Bathurst (Kelso)', 'Blayney'])
  assert.equal(created.who, 'Sales rep 1')
  assert.equal(created.createdBy, 'Owner')

  const listed = await call()
  assert.deepEqual(listed.json.plans, [created])

  const changed = await call({
    method: 'PUT',
    body: { id: created.id, date: '2026-10-27', towns: ['Dubbo'], who: '', note: '' },
  })
  assert.equal(changed.status, 200, JSON.stringify(changed.json))
  const updated = changed.json.plan as LeadPlan
  assert.equal(updated.id, created.id)
  assert.equal(updated.date, '2026-10-27')
  assert.deepEqual(updated.towns, ['Dubbo'])
  assert.equal(updated.createdAt, created.createdAt, 'made-at never changes')
  assert.ok(updated.updatedAt >= created.updatedAt)
  assert.equal((await call()).json.plans.length, 1, 'a change never makes a second plan')

  const gone = await call({ method: 'DELETE', query: { plan: created.id } })
  assert.equal(gone.status, 200)
  assert.deepEqual((await call()).json.plans, [])
  assert.equal((await call({ method: 'DELETE', query: { plan: created.id } })).status, 404)

  const log = (await store.listAudit()).filter((e) => e.action.startsWith('leads.plan.'))
  assert.deepEqual(log.map((e) => e.action).sort(), ['leads.plan.create', 'leads.plan.delete', 'leads.plan.update'])
  const create = log.find((e) => e.action === 'leads.plan.create')!
  assert.equal(create.detail, 'Planned Mon 26 Oct 2026: Bathurst, Bathurst (Kelso) and Blayney (Sales rep 1)')
})

test('plans are refused when they are wrong, and need a signed-in admin', async () => {
  const bad = async (body: unknown, method = 'POST') => (await call({ method, body })).status
  assert.equal(await bad({ date: '2026-10-26', towns: ['Narnia'] }), 400)
  assert.equal(await bad({ date: 'next monday', towns: ['Bathurst'] }), 400)
  assert.equal(await bad({ date: '2026-10-26', towns: [] }), 400)
  assert.equal(await bad(undefined), 400)
  assert.equal(await bad({ id: 'no-such-plan', date: '2026-10-26', towns: ['Bathurst'] }, 'PUT'), 404)
  assert.equal((await call({ method: 'DELETE', query: { plan: 'no-such-plan' } })).status, 404)
  assert.equal((await call({ method: 'DELETE' })).status, 404)

  assert.equal((await call({ method: 'POST', body: { date: '2026-10-26', towns: ['Bathurst'] }, token: null })).status, 401)
  assert.equal((await call({ token: null })).status, 401)
  assert.equal((await call({ method: 'DELETE', query: { plan: 'x' }, token: 'not-a-real-token' })).status, 401)
  assert.deepEqual((await call()).json.plans, [], 'nothing was saved')
})

test('only real plan ids are looked up', async () => {
  for (const id of ['__proto__', 'constructor', 'toString', '../x', 'P1', '']) {
    assert.equal((await call({ method: 'DELETE', query: { plan: id } })).status, 404, `DELETE ${id}`)
    const put = await call({ method: 'PUT', body: { id, date: '2026-10-26', towns: ['Bathurst'] } })
    assert.equal(put.status, 404, `PUT ${id}`)
  }
  assert.deepEqual((await call()).json.plans, [], 'no plan was made by a strange id')
})

test('a bad plan is refused before the lead list is read', async () => {
  let reads = 0
  const bucket = memory()['spartan:leads']
  memory()['spartan:leads'] = new Proxy(bucket, {
    ownKeys(target) {
      reads++
      return Reflect.ownKeys(target)
    },
  })
  assert.equal((await call({ method: 'POST', body: { date: 'soon', towns: ['Bathurst'] } })).status, 400)
  assert.equal((await call({ method: 'POST', body: { date: '2026-10-26', towns: Array(61).fill('Bathurst') } })).status, 400)
  assert.equal(reads, 0)
  assert.equal((await call({ method: 'POST', body: { date: '2026-10-26', towns: ['Bathurst'] } })).status, 200)
  assert.ok(reads > 0, 'a good plan does check the towns')
})

test('a change keeps a town that a re-import has since dropped', async () => {
  const made = await call({ method: 'POST', body: { date: '2026-10-26', towns: ['Blayney', 'Dubbo'] } })
  assert.equal(made.status, 200)
  // The list is re-imported without Blayney.
  delete memory()['spartan:leads'].y1
  const changed = await call({
    method: 'PUT',
    body: { id: made.json.plan.id, date: '2026-10-26', towns: ['Blayney', 'Dubbo'], note: 'Blayney closed down' },
  })
  assert.equal(changed.status, 200, JSON.stringify(changed.json))
  // But a new plan cannot name it any more.
  assert.equal((await call({ method: 'POST', body: { date: '2026-10-27', towns: ['Blayney'] } })).status, 400)
})

test('staff with the leads page can plan; the plan names them', async () => {
  const now = new Date().toISOString()
  await store.saveStaff({
    id: 's1', name: 'Sales rep 1', email: 's1@example.com', phone: '', role: 'staff', position: '', payRate: null,
    startDate: '', notes: '', active: true, passwordHash: 'set', tokenVersion: 3, createdAt: now, updatedAt: now,
  })
  const token = issueToken(Date.now(), { id: 's1', tokenVersion: 3 })!.token
  const made = await call({ method: 'POST', body: { date: '2026-10-26', towns: ['Bathurst'] }, token })
  assert.equal(made.status, 200, JSON.stringify(made.json))
  assert.equal(made.json.plan.createdBy, 'Sales rep 1')
  assert.equal(made.json.plan.updatedBy, 'Sales rep 1')
})

test('plans never touch the leads or their sales progress', async () => {
  const status = await call({ method: 'PATCH', body: { key: 'b1', status: 'Called', notes: 'Spoke to the owner' } })
  assert.equal(status.status, 200)
  const before = JSON.stringify({ leads: memory()['spartan:leads'], statuses: memory()['spartan:lead-status'] })

  const made = await call({ method: 'POST', body: { date: '2026-10-26', towns: ['Bathurst'] } })
  await call({ method: 'PUT', body: { id: made.json.plan.id, date: '2026-10-28', towns: ['Bathurst', 'Blayney'] } })
  await call({ method: 'DELETE', query: { plan: made.json.plan.id } })

  assert.equal(JSON.stringify({ leads: memory()['spartan:leads'], statuses: memory()['spartan:lead-status'] }), before)
  const listed = await call()
  assert.equal(listed.json.statuses.b1.status, 'Called')
})

test('only the expected methods are accepted', async () => {
  const res = await call({ method: 'PATCHY' })
  assert.equal(res.status, 405)
})
