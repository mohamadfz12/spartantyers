import { useId } from 'react'
import { useElementSize } from '@/hooks'
import { cn, money } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Revenue-by-day chart
 *
 * Hand-rolled SVG — no chart library is installed and one is not worth
 * the bundle for a single series.
 *
 * Two decisions worth knowing about:
 *
 * - The viewBox is measured, not fixed. Scaling a fixed viewBox would
 *   scale the axis type with it, so labels would shrink to nothing on a
 *   phone. Measuring means one user unit is one CSS pixel and the type
 *   stays the size it was designed at.
 * - The real numbers ship with the picture. `role="img"` plus an
 *   `aria-label` summary gives a screen reader the shape of the trend,
 *   and a visually hidden <table> gives it every value — a chart that
 *   only exists as geometry is a chart some people cannot read.
 * ------------------------------------------------------------------ */

export interface RevenuePoint {
  date: string
  revenue: number
}

const PAD = { top: 18, right: 14, bottom: 30, left: 66 }

export function RevenueChart({
  data,
  className,
}: {
  data: RevenuePoint[]
  className?: string
}) {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const rawId = useId()
  // `useId` returns colons, which are hostile inside `url(#…)`.
  const gradientId = `revenue-gradient-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  // 720 is only the pre-measurement guess for the very first paint.
  const width = Math.max(size.width > 0 ? Math.round(size.width) : 720, 280)
  const height = width < 520 ? 210 : 265

  const plotWidth = Math.max(width - PAD.left - PAD.right, 10)
  const plotHeight = Math.max(height - PAD.top - PAD.bottom, 10)
  const baseY = PAD.top + plotHeight

  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
        No revenue history available yet.
      </p>
    )
  }

  const values = data.map((point) => point.revenue)
  const peak = Math.max(...values)
  const total = values.reduce((sum, value) => sum + value, 0)
  const allZero = peak <= 0

  const scale = niceScale(peak)

  /* ---- Geometry ------------------------------------------------- */

  const count = data.length
  const xAt = (index: number) =>
    count === 1
      ? PAD.left + plotWidth / 2
      : PAD.left + (index / (count - 1)) * plotWidth

  // `scale.max` is 0 only when every value is 0, and that branch never
  // divides — so there is no path through here that divides by zero.
  const yAt = (value: number) =>
    scale.max === 0 ? baseY : baseY - (value / scale.max) * plotHeight

  const points = data.map((point, index) => ({
    ...point,
    x: xAt(index),
    y: yAt(point.revenue),
  }))

  // A single data point has no line to draw, so it becomes a level reading
  // right across the plot rather than a dot floating in white space.
  const linePath =
    count === 1
      ? `M ${PAD.left} ${points[0].y} L ${PAD.left + plotWidth} ${points[0].y}`
      : points
          .map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`)
          .join(' ')

  const areaPath = `${linePath} L ${round(PAD.left + plotWidth)} ${baseY} L ${PAD.left} ${baseY} Z`

  /* ---- X-axis label thinning ------------------------------------ */

  // ~52px per "9 Oct" label with breathing room either side.
  const labelStride = Math.max(1, Math.ceil((count * 52) / plotWidth))
  const showLabel = (index: number) =>
    count === 1 || index === count - 1 || index % labelStride === 0

  /* ---- Accessible summary --------------------------------------- */

  const first = data[0]
  const last = data[count - 1]
  const peakPoint = data[values.indexOf(peak)]

  const half = Math.floor(count / 2)
  const earlier = values.slice(0, half).reduce((a, b) => a + b, 0)
  const later = values.slice(half).reduce((a, b) => a + b, 0)
  const trend = allZero
    ? 'flat, with no revenue recorded'
    : later > earlier * 1.05
      ? 'rising over the window'
      : later < earlier * 0.95
        ? 'falling over the window'
        : 'broadly flat over the window'

  const summary = allZero
    ? `Revenue by day from ${longDay(first.date)} to ${longDay(last.date)}. No revenue was recorded on any day in this window.`
    : `Revenue by day from ${longDay(first.date)} to ${longDay(last.date)}. Total ${money(total)}. Highest day ${money(peak)} on ${longDay(peakPoint.date)}. The trend is ${trend}.`

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div ref={ref} className="w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={summary}
          className="block h-auto w-full overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.45" />
              <stop offset="55%" stopColor="hsl(var(--primary))" stopOpacity="0.16" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Y-axis gridlines + labels */}
          {scale.lines.map((value) => {
            const y = yAt(value)
            return (
              <g key={value}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={PAD.left + plotWidth}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                  strokeDasharray={value === 0 ? undefined : '3 4'}
                />
                <text
                  x={PAD.left - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {money(value)}
                </text>
              </g>
            )
          })}

          {/* Area + line */}
          {!allZero ? (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} />
              <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : (
            <line
              x1={PAD.left}
              y1={baseY}
              x2={PAD.left + plotWidth}
              y2={baseY}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}

          {/* Data points — <title> gives a native hover readout. */}
          {!allZero
            ? points.map((point) => (
                <circle
                  key={point.date}
                  cx={point.x}
                  cy={point.y}
                  r={point.revenue > 0 ? 3 : 2}
                  fill="hsl(var(--background))"
                  stroke="hsl(var(--primary))"
                  strokeWidth={point.revenue > 0 ? 2 : 1}
                >
                  <title>{`${longDay(point.date)}: ${money(point.revenue)}`}</title>
                </circle>
              ))
            : null}

          {/* X-axis labels */}
          {points.map((point, index) =>
            showLabel(index) ? (
              <text
                key={`label-${point.date}`}
                x={point.x}
                y={baseY + 18}
                textAnchor={
                  index === 0 && count > 1
                    ? 'start'
                    : index === count - 1 && count > 1
                      ? 'end'
                      : 'middle'
                }
                className="fill-muted-foreground text-[10px]"
              >
                {shortDay(point.date)}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {allZero ? (
        <p className="text-center text-xs text-muted-foreground">
          No revenue recorded between {shortDay(first.date)} and{' '}
          {shortDay(last.date)}.
        </p>
      ) : null}

      {/* The same data as text, for anyone the geometry does not serve. */}
      <table className="sr-only">
        <caption>Revenue by day</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={`row-${point.date}`}>
              <th scope="row">{longDay(point.date)}</th>
              <td>{money(point.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Picks a round axis maximum and step so the gridlines land on numbers a
 * human would choose. Returns a flat zero scale when there is nothing to
 * plot, which keeps every caller free of divide-by-zero guards.
 */
function niceScale(peak: number, ticks = 4): { max: number; lines: number[] } {
  if (!Number.isFinite(peak) || peak <= 0) return { max: 0, lines: [0] }

  const rough = peak / ticks
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const normalised = rough / magnitude
  const stepMultiple =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10
  const step = stepMultiple * magnitude

  const max = Math.ceil(peak / step) * step
  const lines: number[] = []
  for (let value = 0; value <= max + step / 1000; value += step) {
    lines.push(Math.round(value * 100) / 100)
  }

  return { max, lines }
}

/** Parses `YYYY-MM-DD` as a local date so the label never slips a day. */
function parseDay(iso: string): Date | null {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function shortDay(iso: string): string {
  const date = parseDay(iso)
  if (!date) return iso
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function longDay(iso: string): string {
  const date = parseDay(iso)
  if (!date) return iso
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}
