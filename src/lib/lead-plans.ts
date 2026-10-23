/**
 * Day plans on the admin Leads page: which towns the team works on, and when.
 *
 * A plan is one day and a list of whole towns. Every lead whose town is on the
 * list belongs to the plan, so a lead imported later joins it by itself. There
 * is one shared plan for the whole team; `who` only says who is doing the day.
 *
 * Shared by the API (which checks and stores plans) and the admin UI (week
 * maths, progress, clashes). Imports nothing, so the Vercel functions can load
 * it with a plain relative path. Days are YYYY-MM-DD strings on the Sydney
 * calendar, and all date maths runs in UTC, so a daylight-saving change can
 * never move a plan to another day.
 */

export interface LeadPlan {
  id: string
  /** YYYY-MM-DD: the day these towns are worked. */
  date: string
  /** Town names exactly as the leads spell them (`lead.city`), A to Z. */
  towns: string[]
  /** Who is doing the day; '' when nobody is named. */
  who: string
  note: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

/** What the admin sends to make or change a plan. */
export interface LeadPlanInput {
  date: string
  towns: string[]
  who: string
  note: string
}

export const PLAN_LIMITS = {
  /** More towns than one day can hold, few enough to read at a glance. */
  towns: 60,
  townLength: 120,
  /** As long as a staff member's name may be. */
  who: 120,
  note: 1000,
} as const

/** The first and last days a plan can be made for. */
export const PLAN_DAYS = { first: '2020-01-01', last: '2099-12-31' } as const

export type PlanCheck = { ok: true; value: LeadPlanInput } | { ok: false; error: string }

/**
 * Checks the shape of a plan sent by the admin: a day, 1 to 60 towns, and
 * optional who and note. Cheap, so it runs before anything is read from the
 * database; `unknownTownsError` then checks the towns against the lead list.
 */
export function checkPlanInput(body: unknown): PlanCheck {
  const invalid = (error: string): PlanCheck => ({ ok: false, error })
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('Expected a plan: a "date", "towns", and optionally "who" and "note".')
  }
  const raw = body as Record<string, unknown>

  if (!isPlanDay(raw.date)) {
    return invalid(`"date" must be a real day from ${PLAN_DAYS.first} to ${PLAN_DAYS.last}, written YYYY-MM-DD.`)
  }

  if (!Array.isArray(raw.towns)) return invalid('"towns" must be a list of town names.')
  // The page never sends a town twice, so a longer list is refused before any work is done on it.
  if (raw.towns.length > PLAN_LIMITS.towns) return invalid(`A plan can hold at most ${PLAN_LIMITS.towns} towns.`)
  const towns = new Set<string>()
  for (const value of raw.towns) {
    const town = typeof value === 'string' ? value.trim() : ''
    if (!town || town.length > PLAN_LIMITS.townLength) {
      return invalid(`Every town must be a name of at most ${PLAN_LIMITS.townLength} characters.`)
    }
    towns.add(town)
  }
  if (towns.size === 0) return invalid('Choose at least one town.')

  const who = optionalText(raw.who, PLAN_LIMITS.who)
  if (who === null) return invalid(`"who" must be text of at most ${PLAN_LIMITS.who} characters.`)
  const note = optionalText(raw.note, PLAN_LIMITS.note)
  if (note === null) return invalid(`"note" must be text of at most ${PLAN_LIMITS.note} characters.`)

  return { ok: true, value: { date: raw.date, towns: sortTowns([...towns]), who, note } }
}

/**
 * The reason a plan names towns that are not on the lead list, or null when
 * every town is known. `knownTowns` is the towns on the current list (plus,
 * when changing a plan, the towns it already holds), so a typo can never make
 * a day with no leads in it.
 */
export function unknownTownsError(towns: readonly string[], knownTowns: ReadonlySet<string>): string | null {
  const unknown = towns.filter((town) => !knownTowns.has(town))
  if (!unknown.length) return null
  return `${listNames(unknown)} ${unknown.length === 1 ? 'is' : 'are'} not on the lead list. Reload the page and try again.`
}

/* ------------------------------------------------------------------ *
 * Days and weeks
 * ------------------------------------------------------------------ */

/** True for a real calendar day written YYYY-MM-DD (not 2026-02-31). */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** A real day within the range plans can be made for. */
export function isPlanDay(value: unknown): value is string {
  return isDay(value) && value >= PLAN_DAYS.first && value <= PLAN_DAYS.last
}

const utc = (day: string) => new Date(`${day}T00:00:00Z`)

export function addDays(day: string, days: number): string {
  const date = utc(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayOf(day: string): number {
  return (utc(day).getUTCDay() + 6) % 7
}

/** The Monday of the week `day` falls in. */
export function weekStart(day: string): string {
  return addDays(day, -weekdayOf(day))
}

/** The first Monday after `day` (a Monday gives the Monday a week later). */
export function nextMonday(day: string): string {
  return addDays(day, 7 - weekdayOf(day))
}

/** Today on the business's own calendar: Sydney, wherever the browser is. */
export function sydneyToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "Mon 26 Oct" (short) or "Monday 26 October 2026" (long). */
export function dayLabel(day: string, style: 'short' | 'long' = 'short'): string {
  const date = utc(day)
  const weekday = WEEKDAYS[weekdayOf(day)]
  const month = MONTHS[date.getUTCMonth()]
  return style === 'long'
    ? `${weekday} ${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`
    : `${weekday.slice(0, 3)} ${date.getUTCDate()} ${month.slice(0, 3)}`
}

/** "Week of 26 Oct 2026", for the Monday that starts it. */
export function weekLabel(monday: string): string {
  const date = utc(monday)
  return `Week of ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCFullYear()}`
}

/* ------------------------------------------------------------------ *
 * Plans and their leads
 * ------------------------------------------------------------------ */

/** Earliest day first; plans on the same day in the order they were made. */
export function sortPlans<T extends Pick<LeadPlan, 'date' | 'createdAt'>>(plans: readonly T[]): T[] {
  return [...plans].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
}

export function sortTowns(towns: readonly string[]): string[] {
  return [...towns].sort((a, b) => a.localeCompare(b, 'en-AU'))
}

/** Every lead in the plan's towns. */
export function leadsInTowns<T extends { city: string }>(towns: readonly string[], leads: readonly T[]): T[] {
  const wanted = new Set(towns)
  return leads.filter((lead) => wanted.has(lead.city))
}

/** How many of the plan's leads have been worked on (`isDone`) out of all of them. */
export function planProgress<T extends { city: string }>(
  towns: readonly string[],
  leads: readonly T[],
  isDone: (lead: T) => boolean,
): { total: number; done: number } {
  const mine = leadsInTowns(towns, leads)
  return { total: mine.length, done: mine.filter(isDone).length }
}

/**
 * Towns that another plan already covers on the same day, so the admin can
 * warn before two people drive to the same town. `ignoreId` is the plan being
 * changed, which never clashes with itself.
 */
export function townClashes(
  plans: readonly LeadPlan[],
  date: string,
  towns: readonly string[],
  ignoreId?: string,
): Array<{ town: string; plan: LeadPlan }> {
  const clashes: Array<{ town: string; plan: LeadPlan }> = []
  for (const plan of plans) {
    if (plan.id === ignoreId || plan.date !== date) continue
    for (const town of towns) if (plan.towns.includes(town)) clashes.push({ town, plan })
  }
  return clashes
}

/** "Bathurst", "Bathurst and Blayney", "Bathurst, Blayney and Cowra", "Bathurst, Blayney and 4 more". */
export function listNames(names: readonly string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.slice(0, max - 1).join(', ')} and ${names.length - (max - 1)} more`
}

/** Optional free text: '' when absent, null when present but not text or too long. */
function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > max ? null : trimmed
}
