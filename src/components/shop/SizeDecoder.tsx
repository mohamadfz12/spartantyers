import { useId } from 'react'
import { cn, formatNumber } from '@/lib/utils'
import { parseTyreSize, wheelProportions } from '@/components/three'

const MM_PER_INCH = 25.4

export interface SizeDecoderProps {
  /** A catalogue size code such as `295/80R22.5` or `11R22.5`. */
  size: string
  className?: string
}

/**
 * Reads a tyre size code out loud.
 *
 * Operators order by size code every day without necessarily knowing what each
 * number measures, and ordering the wrong overall diameter is an expensive
 * mistake. So this is an annotated scale drawing rather than a glossary: the
 * numbered callouts on the code are the same numbers on the cross-section, and
 * the drawing is built from the real figures with `parseTyreSize`.
 */
export function SizeDecoder({ size, className }: SizeDecoderProps) {
  // Stripped of useId's colon wrapping, which is hostile inside `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const { sectionWidthMm, aspectRatio, rimDiameterIn } = parseTyreSize(size)

  const metric = size.match(/^(\d{3})\/(\d{2})R(\d{2}(?:\.\d)?)$/)
  const imperial = size.match(/^(\d+(?:\.\d+)?)R(\d{2}(?:\.\d)?)$/)
  const isMetric = Boolean(metric)

  const rimMm = rimDiameterIn * MM_PER_INCH
  const sidewallMm = sectionWidthMm * (aspectRatio / 100)
  const overallMm = wheelProportions(size, 0).overallDiameterMm

  /* Marker numbering follows the order the code is read. */
  const marks = {
    width: 1,
    aspect: isMetric ? 2 : null,
    radial: isMetric ? 3 : 2,
    rim: isMetric ? 4 : 3,
  }

  /* -------- drawing geometry, to scale -------- */
  const CX = 206
  const CY = 174
  const R = 138
  const scale = R / (overallMm / 2)
  const rimRadius = (rimMm / 2) * scale
  const halfWidth = Math.max((sectionWidthMm / 2) * scale, 22)

  const x0 = CX - halfWidth
  const x1 = CX + halfWidth
  const rimX0 = CX - halfWidth * 0.52
  const rimX1 = CX + halfWidth * 0.52
  const treadBand = 11

  const arrow = `${uid}-arrow`

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        className,
      )}
    >
      <div className="border-b border-border p-5">
        <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
          What {size} means
        </h3>

        {/* The code itself, as the key to the drawing. */}
        <p className="mt-3 flex flex-wrap items-end gap-px font-mono text-3xl font-bold leading-none sm:text-4xl">
          {metric ? (
            <>
              <Token mark={marks.width}>{metric[1]}</Token>
              <Separator>/</Separator>
              <Token mark={marks.aspect}>{metric[2]}</Token>
              <Token mark={marks.radial}>R</Token>
              <Token mark={marks.rim}>{metric[3]}</Token>
            </>
          ) : imperial ? (
            <>
              <Token mark={marks.width}>{imperial[1]}</Token>
              <Token mark={marks.radial}>R</Token>
              <Token mark={marks.rim}>{imperial[2]}</Token>
            </>
          ) : (
            <span>{size}</span>
          )}
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        {/* ---------------- scale drawing ---------------- */}
        <figure className="m-0">
          <svg
            viewBox="0 0 440 348"
            className="w-full"
            role="img"
            aria-label={`Cross-section of a ${size} tyre. Section width ${Math.round(sectionWidthMm)} millimetres, sidewall height ${Math.round(sidewallMm)} millimetres, rim diameter ${rimDiameterIn} inches, overall diameter ${formatNumber(overallMm)} millimetres.`}
          >
            <defs>
              <marker
                id={arrow}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="hsl(var(--primary))" />
              </marker>
              <linearGradient id={`${uid}-rubber`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--charcoal))" />
                <stop offset="55%" stopColor="hsl(var(--charcoal))" stopOpacity="0.82" />
                <stop offset="100%" stopColor="hsl(var(--charcoal))" />
              </linearGradient>
            </defs>

            {/* Wheel axis */}
            <line
              x1="34"
              y1={CY}
              x2="406"
              y2={CY}
              stroke="hsl(var(--border))"
              strokeWidth="1.5"
              strokeDasharray="7 5"
            />
            <text
              x="34"
              y={CY - 7}
              fontSize="10"
              fontWeight="700"
              letterSpacing="1.4"
              fill="hsl(var(--muted-foreground))"
            >
              AXIS
            </text>

            {/* Rim — the wheel the tyre bolts onto */}
            <rect
              x={rimX0}
              y={CY - rimRadius}
              width={rimX1 - rimX0}
              height={rimRadius * 2}
              rx="3"
              fill="hsl(var(--muted))"
              stroke="hsl(var(--border))"
              strokeWidth="1.6"
            />
            {[CY - rimRadius, CY + rimRadius].map((y) => (
              <rect
                key={y}
                x={rimX0 - 6}
                y={y - 4}
                width={rimX1 - rimX0 + 12}
                height="8"
                rx="2"
                fill="hsl(var(--border))"
              />
            ))}

            {/* Casing — upper and lower sidewall plus tread */}
            {[
              { y: CY - R, height: R - rimRadius, treadY: CY - R },
              { y: CY + rimRadius, height: R - rimRadius, treadY: CY + R - treadBand },
            ].map((band) => (
              <g key={band.y}>
                <rect
                  x={x0}
                  y={band.y}
                  width={x1 - x0}
                  height={band.height}
                  rx="5"
                  fill={`url(#${uid}-rubber)`}
                  stroke="hsl(var(--border))"
                  strokeWidth="1.4"
                />
                {/* Tread band with grooves */}
                <rect
                  x={x0}
                  y={band.treadY}
                  width={x1 - x0}
                  height={treadBand}
                  fill="hsl(var(--primary))"
                  fillOpacity="0.2"
                />
                {Array.from({ length: 5 }, (_, i) => (
                  <line
                    key={i}
                    x1={x0 + ((i + 1) * (x1 - x0)) / 6}
                    y1={band.treadY}
                    x2={x0 + ((i + 1) * (x1 - x0)) / 6}
                    y2={band.treadY + treadBand}
                    stroke="hsl(var(--border))"
                    strokeWidth="1.2"
                  />
                ))}
              </g>
            ))}

            {/* 1 — section width, across the tread */}
            <line
              x1={x0}
              y1="26"
              x2={x1}
              y2="26"
              stroke="hsl(var(--primary))"
              strokeWidth="1.6"
              markerStart={`url(#${arrow})`}
              markerEnd={`url(#${arrow})`}
            />
            <line
              x1={x0}
              y1="26"
              x2={x0}
              y2={CY - R}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <line
              x1={x1}
              y1="26"
              x2={x1}
              y2={CY - R}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <Callout
              mark={marks.width}
              x={x1 + 14}
              y="30"
              text={`${Math.round(sectionWidthMm)}mm section width`}
            />

            {/* 2 — sidewall height, left side */}
            <line
              x1="118"
              y1={CY - R}
              x2="118"
              y2={CY - rimRadius}
              stroke="hsl(var(--primary))"
              strokeWidth="1.6"
              markerStart={`url(#${arrow})`}
              markerEnd={`url(#${arrow})`}
            />
            <line
              x1="118"
              y1={CY - R}
              x2={x0}
              y2={CY - R}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <line
              x1="118"
              y1={CY - rimRadius}
              x2={rimX0}
              y2={CY - rimRadius}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <Callout
              mark={marks.aspect}
              x="112"
              y={CY - (R + rimRadius) / 2}
              anchor="end"
              text={`${Math.round(sidewallMm)}mm sidewall`}
            />

            {/* 4 — rim diameter, right side */}
            <line
              x1="318"
              y1={CY - rimRadius}
              x2="318"
              y2={CY + rimRadius}
              stroke="hsl(var(--primary))"
              strokeWidth="1.6"
              markerStart={`url(#${arrow})`}
              markerEnd={`url(#${arrow})`}
            />
            <line
              x1={rimX1}
              y1={CY - rimRadius}
              x2="318"
              y2={CY - rimRadius}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <line
              x1={rimX1}
              y1={CY + rimRadius}
              x2="318"
              y2={CY + rimRadius}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <Callout
              mark={marks.rim}
              x="326"
              y={CY - 6}
              text={`${rimDiameterIn}in rim`}
            />

            {/* Overall diameter, far right — the number that decides clearance */}
            <line
              x1="398"
              y1={CY - R}
              x2="398"
              y2={CY + R}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.4"
              strokeDasharray="4 3"
            />
            <line
              x1="326"
              y1={CY - R}
              x2="404"
              y2={CY - R}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <line
              x1="326"
              y1={CY + R}
              x2="404"
              y2={CY + R}
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
            <text
              x="394"
              y={CY + R + 22}
              textAnchor="end"
              fontSize="11"
              fontWeight="700"
              fill="hsl(var(--muted-foreground))"
            >
              {formatNumber(overallMm)}mm overall diameter
            </text>
          </svg>
          <figcaption className="mt-1 text-center text-xs text-muted-foreground">
            Cross-section drawn to scale from the {size} figures.
          </figcaption>
        </figure>

        {/* ---------------- the words ---------------- */}
        <ul className="flex flex-col gap-4">
          <Entry
            mark={marks.width}
            term="Section width"
            value={
              isMetric
                ? `${Math.round(sectionWidthMm)} millimetres`
                : `${imperial?.[1] ?? ''} inches (${Math.round(sectionWidthMm)}mm)`
            }
          >
            The width of the inflated casing at its widest point, shoulder to
            shoulder. It has to clear the chassis rails and, on duals, the tyre
            beside it.
          </Entry>

          {isMetric ? (
            <Entry
              mark={marks.aspect}
              term="Aspect ratio"
              value={`${aspectRatio}% — ${Math.round(sidewallMm)}mm of sidewall`}
            >
              Sidewall height as a percentage of the section width. A lower number
              is a shorter, stiffer sidewall and a lower overall height, which is
              what height-critical trailers are after.
            </Entry>
          ) : (
            <Entry
              mark={null}
              term="Aspect ratio"
              value="Not quoted on imperial sizes"
            >
              Imperial codes like {size} carry no aspect ratio. The industry
              convention for these casings is about 92%, which is what the{' '}
              {Math.round(sidewallMm)}mm sidewall and{' '}
              {formatNumber(overallMm)}mm overall diameter above are calculated
              from.
            </Entry>
          )}

          <Entry mark={marks.radial} term="R — radial construction" value="Radial">
            The plies run radially, straight across the casing from bead to bead,
            under a steel belt package. Every tyre we stock is radial; it is what
            makes a casing worth retreading.
          </Entry>

          <Entry
            mark={marks.rim}
            term="Rim diameter"
            value={`${rimDiameterIn} inches`}
          >
            The wheel the tyre beads onto. This one is not negotiable — a{' '}
            {rimDiameterIn}in tyre only fits a {rimDiameterIn}in rim. Rim{' '}
            <em>width</em> is a separate figure, listed as the measuring rim on
            every spec sheet.
          </Entry>
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Token({ mark, children }: { mark: number | null; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex flex-col items-center">
      {mark != null ? (
        <span
          aria-hidden="true"
          className="mb-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary font-heading text-[0.6rem] font-bold text-primary-foreground"
        >
          {mark}
        </span>
      ) : (
        <span aria-hidden="true" className="mb-1 h-4" />
      )}
      <span className="text-primary">{children}</span>
    </span>
  )
}

function Separator({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex flex-col items-center">
      <span aria-hidden="true" className="mb-1 h-4" />
      <span className="text-muted-foreground">{children}</span>
    </span>
  )
}

function Callout({
  mark,
  x,
  y,
  text,
  anchor = 'start',
}: {
  mark: number | null
  x: number | string
  y: number | string
  text: string
  anchor?: 'start' | 'end'
}) {
  const offset = anchor === 'end' ? -1 : 1
  return (
    <g>
      {mark != null ? (
        <>
          <circle
            cx={Number(x) + offset * 7}
            cy={Number(y) - 4}
            r="7.5"
            fill="hsl(var(--primary))"
          />
          <text
            x={Number(x) + offset * 7}
            y={Number(y) - 0.5}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="800"
            fill="hsl(var(--primary-foreground))"
          >
            {mark}
          </text>
        </>
      ) : null}
      <text
        x={mark != null ? Number(x) + offset * 18 : x}
        y={y}
        textAnchor={anchor}
        fontSize="11.5"
        fontWeight="700"
        fill="hsl(var(--foreground))"
      >
        {text}
      </text>
    </g>
  )
}

function Entry({
  mark,
  term,
  value,
  children,
}: {
  mark: number | null
  term: string
  value: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-heading text-xs font-bold',
          mark != null
            ? 'bg-primary text-primary-foreground'
            : 'border border-border text-muted-foreground',
        )}
      >
        {mark ?? '–'}
      </span>
      <div>
        <h4 className="font-heading text-sm font-bold uppercase tracking-wide">
          {term}
        </h4>
        <p className="mt-0.5 font-mono text-xs font-semibold text-primary">{value}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </li>
  )
}
