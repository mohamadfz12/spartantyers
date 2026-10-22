/**
 * Reporting periods for the Payments and Balance pages.
 *
 * Everything works on YYYY-MM-DD strings, so comparisons are plain string
 * comparisons and there is no time zone to get wrong. The Australian
 * financial year runs 1 July to 30 June; quarters follow the BAS calendar
 * (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun), which are also calendar quarters.
 */

export type PeriodKey =
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-fy'
  | 'last-fy'
  | 'last-12'
  | 'all'
  | 'custom'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-quarter': 'This quarter',
  'last-quarter': 'Last quarter',
  'this-fy': 'This financial year',
  'last-fy': 'Last financial year',
  'last-12': 'Last 12 months',
  all: 'All time',
  custom: 'Custom dates',
}

export interface DateRange {
  /** Inclusive, YYYY-MM-DD; '' for unbounded. */
  from: string
  to: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
/** Last day of month `m` (1-12) of year `y`. */
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Month `m` (1-12) shifted by `delta` months. */
function shiftMonth(y: number, m: number, delta: number): [number, number] {
  const index = y * 12 + (m - 1) + delta
  return [Math.floor(index / 12), (index % 12) + 1]
}

export function periodRange(key: PeriodKey, today: string, custom: DateRange): DateRange {
  const [y, m] = today.split('-').map(Number) as [number, number]

  switch (key) {
    case 'this-month':
      return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)) }
    case 'last-month': {
      const [py, pm] = shiftMonth(y, m, -1)
      return { from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) }
    }
    case 'this-quarter':
    case 'last-quarter': {
      const startMonth = Math.floor((m - 1) / 3) * 3 + 1
      const [qy, qm] = shiftMonth(y, startMonth, key === 'last-quarter' ? -3 : 0)
      const [ey, em] = shiftMonth(qy, qm, 2)
      return { from: ymd(qy, qm, 1), to: ymd(ey, em, lastDay(ey, em)) }
    }
    case 'this-fy':
    case 'last-fy': {
      const startYear = (m >= 7 ? y : y - 1) - (key === 'last-fy' ? 1 : 0)
      return { from: ymd(startYear, 7, 1), to: ymd(startYear + 1, 6, 30) }
    }
    case 'last-12': {
      const [sy, sm] = shiftMonth(y, m, -11)
      return { from: ymd(sy, sm, 1), to: ymd(y, m, lastDay(y, m)) }
    }
    case 'custom':
      return custom
    default:
      return { from: '', to: '' }
  }
}

export function inRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

/** "FY 2025–26" for the financial year containing `date`. */
export function financialYearLabel(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const start = m >= 7 ? y : y - 1
  return `FY ${start}–${String((start + 1) % 100).padStart(2, '0')}`
}

/** Every YYYY-MM month from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`)
    ;[y, m] = shiftMonth(y, m, 1)
    if (out.length > 240) break
  }
  return out
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
}
