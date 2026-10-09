import { useId, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { TreadFamily } from '@/data/types'
import { TREAD_SPECS } from './wheelGeometry'

export interface StaticWheelProps {
  tread?: TreadFamily
  className?: string
  /** Rotates slowly — switched off wherever reduced motion is requested. */
  spin?: boolean
  /** Draws the brand name across the sidewall. */
  label?: string
  size?: string
  title?: string
}

/**
 * A flat-on SVG truck wheel.
 *
 * This is the honest fallback for the 3D wheel: it ships in the HTML, costs
 * nothing, renders where WebGL is unavailable or declined, and fills the frame
 * while three.js is still being fetched. The tread marks are generated from the
 * same pattern table the 3D geometry uses, so a drive tyre still looks like a
 * drive tyre here.
 */
export function StaticWheel({
  tread = 'lug',
  className,
  spin = false,
  label,
  size,
  title,
}: StaticWheelProps) {
  const spec = TREAD_SPECS[tread]

  // Several wheels render on the same page, so gradient and path ids have to be
  // instance-unique: duplicate SVG ids resolve to the first definition.
  // useId emits colon-wrapped values like `:r3:`; strip them so the
  // `url(#…)` fragment references stay plain alphanumerics.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')

  // Radii in the 0–100 viewBox space.
  const R_OUTER = 49
  const R_TREAD_IN = 41
  const R_SIDEWALL = 39
  const R_RIM = 23
  const R_HUB = 8

  const treadMarks = useMemo(() => {
    // Cap the count so the SVG stays small; ribs still read fine at 48 marks.
    const count = Math.min(spec.blocksPerRow, 48)
    const pitch = 360 / count
    const sweep = pitch * (1 - spec.gapRatio)

    // Chord width of the block at the middle of the tread band. Deriving it
    // from the pattern's own pitch is what makes a lug read as chunky blocks
    // with wide grooves and a rib read as a near-continuous band with sipes —
    // a fixed width would flatten that distinction.
    const midRadius = (R_OUTER + R_TREAD_IN) / 2
    const width = 2 * midRadius * Math.sin((sweep / 2) * (Math.PI / 180))

    return Array.from({ length: count }, (_, i) => ({
      start: i * pitch,
      sweep,
      width,
      skew: (spec.skew * 180) / Math.PI,
    }))
  }, [spec, R_OUTER, R_TREAD_IN])

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label={title ?? `${spec.label} truck tyre`}
    >
      <defs>
        <radialGradient id={`${uid}-rubber`} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#2a2d33" />
          <stop offset="55%" stopColor="#15161a" />
          <stop offset="100%" stopColor="#08090b" />
        </radialGradient>
        <radialGradient id={`${uid}-rim`} cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#e6eaef" />
          <stop offset="45%" stopColor="#b2b9c1" />
          <stop offset="100%" stopColor="#6a7279" />
        </radialGradient>
        <radialGradient id={`${uid}-hub`} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#3a3e44" />
          <stop offset="100%" stopColor="#1a1c20" />
        </radialGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <path id={`${uid}-arc`} d="M 50 50 m -31 0 a 31 31 0 1 1 62 0" fill="none" />
      </defs>

      <g className={spin ? 'origin-center animate-spin-slow' : undefined}>
        {/* Carcass */}
        <circle cx="50" cy="50" r={R_OUTER} fill={`url(#${uid}-rubber)`} />

        {/* Tread blocks */}
        <g>
          {treadMarks.map(({ start, sweep, width, skew }, index) => (
            <rect
              key={index}
              x={50 - width / 2}
              y={50 - R_OUTER}
              // Seat the block slightly into the groove ring so there is no
              // hairline gap between tread and carcass.
              height={R_OUTER - R_TREAD_IN + 1.5}
              width={width}
              rx={Math.min(0.7, width / 4)}
              fill="#2f3339"
              transform={`rotate(${start + sweep / 2} 50 50) rotate(${skew} 50 ${50 - (R_OUTER + R_TREAD_IN) / 2})`}
            />
          ))}
        </g>

        {/* Groove ring separating tread from sidewall */}
        <circle
          cx="50"
          cy="50"
          r={R_TREAD_IN}
          fill="none"
          stroke="#07080a"
          strokeWidth="1.6"
        />

        {/* Sidewall moulding rings */}
        <circle
          cx="50"
          cy="50"
          r={R_SIDEWALL}
          fill="none"
          stroke="#272a30"
          strokeWidth="0.5"
        />
        <circle
          cx="50"
          cy="50"
          r={R_RIM + 3}
          fill="none"
          stroke="#272a30"
          strokeWidth="0.5"
        />

        {label ? (
          <text
            fill="#b9bec6"
            fontSize="5.2"
            fontWeight="800"
            letterSpacing="1.1"
            fontFamily="Montserrat, sans-serif"
          >
            <textPath href={`#${uid}-arc`} startOffset="50%" textAnchor="middle">
              {label.toUpperCase()}
            </textPath>
          </text>
        ) : null}

        {size ? (
          <text
            x="50"
            y="69"
            fill="#7d838b"
            fontSize="3.4"
            fontWeight="700"
            letterSpacing="0.5"
            textAnchor="middle"
            fontFamily="Montserrat, sans-serif"
          >
            {size}
          </text>
        ) : null}

        {/* Rim */}
        <circle cx="50" cy="50" r={R_RIM} fill={`url(#${uid}-rim)`} />
        <circle
          cx="50"
          cy="50"
          r={R_RIM}
          fill="none"
          stroke="#555d64"
          strokeWidth="0.8"
        />

        {/* Six spokes */}
        {Array.from({ length: 6 }, (_, i) => (
          <rect
            key={i}
            x="48.4"
            y={50 - R_RIM + 1}
            width="3.2"
            height={R_RIM - R_HUB}
            rx="1.4"
            fill="#9aa2aa"
            transform={`rotate(${i * 60} 50 50)`}
          />
        ))}

        {/* Hub and ten wheel nuts */}
        <circle cx="50" cy="50" r={R_HUB} fill={`url(#${uid}-hub)`} />
        {Array.from({ length: 10 }, (_, i) => {
          const angle = (i * Math.PI * 2) / 10
          return (
            <circle
              key={i}
              cx={50 + Math.cos(angle) * 5.4}
              cy={50 + Math.sin(angle) * 5.4}
              r="1.15"
              fill="#aeb5bd"
            />
          )
        })}
        <circle cx="50" cy="50" r="2.6" fill="#101216" />
      </g>

      {/* Fixed specular sheen — stays put while the wheel turns under it. */}
      <circle
        cx="50"
        cy="50"
        r={R_OUTER}
        fill={`url(#${uid}-sheen)`}
        pointerEvents="none"
      />
    </svg>
  )
}

/**
 * Loading indicator. Used as the Suspense fallback for the 3D scenes and as
 * the app-level route transition spinner.
 */
export function WheelSpinner({
  className,
  label = 'Loading',
}: {
  className?: string
  label?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-4', className)}
      role="status"
      aria-live="polite"
    >
      <div className="relative h-16 w-16">
        <StaticWheel tread="lug" spin className="opacity-90" />
        <span className="absolute inset-0 rounded-full border-2 border-primary/30" />
      </div>
      <span className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
