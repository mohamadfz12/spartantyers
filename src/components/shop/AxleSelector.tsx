import { useId } from 'react'
import { ArrowRight } from 'lucide-react'
import type { AxlePosition } from '@/data/types'
import { POSITION_LABELS, productsForPosition } from '@/data/products'
import { cn, pluralise } from '@/lib/utils'
import { Badge } from '@/components/ui'
import { StaticWheel } from '@/components/three'

/**
 * Interactive truck side elevation.
 *
 * Choosing a tyre starts with "which axle", and a diagram answers that faster
 * than a dropdown does — especially for an owner-driver who knows the truck but
 * not our taxonomy. The wheels on each axle render the actual tread family that
 * axle takes, so the picture teaches the distinction while it is being used.
 */

export interface AxleSelectorProps {
  value: AxlePosition
  onChange: (position: AxlePosition) => void
  className?: string
  /** Shows the per-axle description panel under the diagram. */
  showDetail?: boolean
}

const AXLE_INFO: Record<
  AxlePosition,
  {
    tread: 'rib' | 'lug' | 'trailer'
    summary: string
    bestFor: string
    /** x positions of the wheels on this axle, in viewBox units. */
    wheels: number[]
  }
> = {
  steer: {
    tread: 'rib',
    summary:
      'Front axle. Needs even wear, responsive steering and wet grip — a continuous rib pattern, never a drive lug.',
    bestFor: 'Control, cornering, wet traction',
    wheels: [152],
  },
  drive: {
    tread: 'lug',
    summary:
      'Powered axles. Needs traction and resistance to the wear that torque inflicts — a deep block or lug pattern.',
    bestFor: 'Traction, fuel efficiency, longevity',
    wheels: [306, 378],
  },
  trailer: {
    tread: 'trailer',
    summary:
      'Non-powered axles. Free-rolling, so it prioritises durability, low rolling resistance and retreadability.',
    bestFor: 'Durability, load capacity, retreadability',
    wheels: [642, 714, 786],
  },
}

const ORDER: AxlePosition[] = ['steer', 'drive', 'trailer']

export function AxleSelector({
  value,
  onChange,
  className,
  showDetail = true,
}: AxleSelectorProps) {
  // Stripped of useId's colon wrapping so the `url(#…)` gradient references
  // stay plain alphanumerics.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const info = AXLE_INFO[value]
  const matchCount = productsForPosition(value).length

  return (
    <div className={cn('w-full', className)}>
      <svg
        viewBox="0 0 880 290"
        className="w-full"
        role="group"
        aria-label="Truck axle position selector. Choose steer, drive or trailer to filter tyres."
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--card))" />
            <stop offset="100%" stopColor="hsl(var(--muted))" />
          </linearGradient>
          <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.32" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(var(--border))" stopOpacity="0" />
            <stop offset="20%" stopColor="hsl(var(--border))" />
            <stop offset="80%" stopColor="hsl(var(--border))" />
            <stop offset="100%" stopColor="hsl(var(--border))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ground */}
        <rect x="0" y="252" width="880" height="2.5" fill={`url(#${uid}-ground)`} />

        {/* Trailer body */}
        <g>
          <rect
            x="400"
            y="78"
            width="438"
            height="140"
            rx="4"
            fill={`url(#${uid}-body)`}
            stroke="hsl(var(--border))"
            strokeWidth="2"
          />
          {/* Corrugated side panels */}
          {Array.from({ length: 13 }, (_, i) => (
            <line
              key={i}
              x1={420 + i * 32}
              y1="86"
              x2={420 + i * 32}
              y2="210"
              stroke="hsl(var(--border))"
              strokeWidth="1.4"
              opacity="0.6"
            />
          ))}
          <rect
            x="400"
            y="78"
            width="438"
            height="12"
            rx="3"
            fill="hsl(var(--primary))"
            opacity="0.18"
          />
        </g>

        {/* Chassis rail */}
        <rect x="120" y="218" width="718" height="11" rx="2" fill="hsl(var(--border))" />

        {/* Cab */}
        <g>
          <path
            d="M118 225 L118 142 Q118 134 126 132 L176 120 L206 76 Q209 70 217 70 L268 70 Q276 70 276 78 L276 225 Z"
            fill={`url(#${uid}-body)`}
            stroke="hsl(var(--border))"
            strokeWidth="2"
          />
          {/* Windscreen */}
          <path
            d="M186 122 L212 84 Q214 80 220 80 L266 80 L266 126 Z"
            fill={`url(#${uid}-glass)`}
            stroke="hsl(var(--border))"
            strokeWidth="1.6"
          />
          {/* Grille */}
          <rect x="122" y="150" width="14" height="52" rx="2" fill="hsl(var(--border))" />
          {/* Headlight */}
          <circle cx="129" cy="212" r="6" fill="hsl(var(--primary))" opacity="0.55" />
          {/* Exhaust stack */}
          <rect x="280" y="92" width="11" height="130" rx="3" fill="hsl(var(--border))" />
          {/* Fifth wheel coupling */}
          <rect x="356" y="206" width="56" height="14" rx="3" fill="hsl(var(--border))" />
        </g>

        {/* Axle groups — rendered last so they sit above the body */}
        {ORDER.map((position) => (
          <AxleGroup
            key={position}
            position={position}
            selected={value === position}
            onSelect={() => onChange(position)}
          />
        ))}
      </svg>

      {/* Button row — the accessible, unambiguous control. The diagram above is
          a richer way to hit the same targets, not the only way. */}
      <div
        className="mt-5 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 sm:gap-3"
        role="radiogroup"
        aria-label="Axle position"
      >
        {ORDER.map((position) => {
          const active = value === position
          const count = productsForPosition(position).length
          return (
            <button
              key={position}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(position)}
              className={cn(
                'group flex min-w-0 flex-col items-center gap-2 rounded-lg border-2 p-2 transition-all duration-300 ease-brand min-[360px]:p-3 sm:p-4',
                active
                  ? 'border-primary bg-primary/5 shadow-glow'
                  : 'border-border bg-card hover:border-primary/40 hover:-translate-y-0.5',
              )}
            >
              <div className="h-10 w-10 sm:h-12 sm:w-12">
                <StaticWheel tread={AXLE_INFO[position].tread} spin={active} />
              </div>
              <span
                className={cn(
                  'font-heading text-xs font-bold uppercase tracking-wide sm:text-sm',
                  active ? 'text-primary' : 'text-foreground',
                )}
              >
                {POSITION_LABELS[position]}
              </span>
              <span className="text-[0.68rem] text-muted-foreground">
                {count} {pluralise(count, 'tyre')}
              </span>
            </button>
          )
        })}
      </div>

      {showDetail ? (
        <div className="mt-5 rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-heading text-base font-bold uppercase tracking-wide">
              {POSITION_LABELS[value]} tyres
            </h3>
            <Badge variant="primary" size="sm">
              {matchCount} in stock range
            </Badge>
          </div>

          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            {info.summary}
          </p>

          <p className="mt-3 flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wide text-primary">
            <ArrowRight className="h-3.5 w-3.5" />
            Best for: {info.bestFor}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const WHEEL_RADIUS = 36
const WHEEL_CY = 252 - WHEEL_RADIUS

function AxleGroup({
  position,
  selected,
  onSelect,
}: {
  position: AxlePosition
  selected: boolean
  onSelect: () => void
}) {
  const info = AXLE_INFO[position]
  const first = info.wheels[0]
  const last = info.wheels[info.wheels.length - 1]

  return (
    <g
      onClick={onSelect}
      className="cursor-pointer"
      // The real control is the radio button row below; this is a visual
      // affordance over the same action, so it stays out of the tab order.
      aria-hidden="true"
    >
      {/* Hit area */}
      <rect
        x={first - WHEEL_RADIUS - 10}
        y={WHEEL_CY - WHEEL_RADIUS - 14}
        width={last - first + WHEEL_RADIUS * 2 + 20}
        height={WHEEL_RADIUS * 2 + 28}
        rx="8"
        fill={selected ? 'hsl(var(--primary))' : 'transparent'}
        fillOpacity={selected ? 0.1 : 0}
        stroke={selected ? 'hsl(var(--primary))' : 'transparent'}
        strokeWidth="2"
        strokeDasharray="6 4"
        className="transition-all duration-300"
      />

      {/* Label */}
      <text
        x={(first + last) / 2}
        y={WHEEL_CY - WHEEL_RADIUS - 22}
        textAnchor="middle"
        className={cn(
          'font-heading text-[15px] font-bold uppercase transition-colors duration-300',
          selected ? 'fill-primary' : 'fill-[hsl(var(--muted-foreground))]',
        )}
        style={{ letterSpacing: '0.12em' }}
      >
        {POSITION_LABELS[position]}
      </text>

      {info.wheels.map((cx) => (
        <g key={cx}>
          {/* Selected pulse ring */}
          {selected ? (
            <circle
              cx={cx}
              cy={WHEEL_CY}
              r={WHEEL_RADIUS + 3}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              opacity="0.55"
            />
          ) : null}

          {/* The tyre itself, rendered by the shared wheel component so the
              tread genuinely matches what this axle takes. */}
          <foreignObject
            x={cx - WHEEL_RADIUS}
            y={WHEEL_CY - WHEEL_RADIUS}
            width={WHEEL_RADIUS * 2}
            height={WHEEL_RADIUS * 2}
          >
            <div
              className={cn(
                'h-full w-full transition-all duration-500',
                selected ? 'opacity-100' : 'opacity-55 saturate-50',
              )}
            >
              <StaticWheel tread={info.tread} spin={selected} />
            </div>
          </foreignObject>
        </g>
      ))}
    </g>
  )
}
