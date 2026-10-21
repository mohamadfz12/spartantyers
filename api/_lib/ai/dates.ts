/**
 * Calendar dates for the AI's books. The business is in Sydney, so a "day" of
 * spending is a Sydney day, whatever time zone the server runs in.
 */

export type ISODate = string

/** Today's calendar date in Sydney, as `YYYY-MM-DD`. */
export function todaySydney(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** The first day of the month that `day` is in. */
export function monthStart(day: ISODate): ISODate {
  return `${day.slice(0, 7)}-01`
}
