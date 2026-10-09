import { Check } from 'lucide-react'
import { cn, clamp } from '@/lib/utils'
import { useReducedMotion } from '@/hooks'

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export interface ProgressProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
  value: number
  max?: number
  /** Accessible name — required when there is no visible label nearby. */
  label?: string
  /** Class for the filled bar, so consumers can retint it. */
  barClassName?: string
}

export function Progress({
  value,
  max = 100,
  label,
  className,
  barClassName,
  ...props
}: ProgressProps) {
  const reduced = useReducedMotion()
  const safeMax = max > 0 ? max : 100
  const safeValue = clamp(Number.isFinite(value) ? value : 0, 0, safeMax)
  const percent = (safeValue / safeMax) * 100

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(safeValue)}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuetext={`${Math.round(percent)}%`}
      aria-label={label}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-muted',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary',
          reduced ? '' : 'transition-[width] duration-500 ease-brand',
          barClassName,
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Stepper
 * ------------------------------------------------------------------ */

export interface StepperProps extends React.HTMLAttributes<HTMLElement> {
  steps: string[]
  /** 0-based index of the active step. */
  current: number
  /** Accessible name for the step list. */
  label?: string
}

export function Stepper({
  steps,
  current,
  label = 'Progress',
  className,
  ...props
}: StepperProps) {
  const reduced = useReducedMotion()
  const total = steps.length
  const active = clamp(current, 0, Math.max(total - 1, 0))
  // The connector fills to the centre of the active step.
  const fill = total > 1 ? (active / (total - 1)) * 100 : 100

  return (
    <nav aria-label={label} className={cn('w-full', className)} {...props}>
      {/* Mobile: a single honest sentence beats a squashed rail. */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Step {active + 1} of {total}
          </p>
          <p className="font-heading text-sm font-bold uppercase tracking-tight">
            {steps[active]}
          </p>
        </div>
        <Progress
          value={total > 1 ? active + 1 : 1}
          max={total || 1}
          label={`Step ${active + 1} of ${total}: ${steps[active] ?? ''}`}
        />
      </div>

      {/* Desktop: numbered rail with a connecting line that fills. */}
      <ol className="relative hidden list-none items-start md:flex">
        {/* Track + fill, inset so it runs centre-to-centre of the end circles. */}
        {total > 1 ? (
          <div
            aria-hidden="true"
            className="absolute top-[1.125rem] h-0.5"
            style={{ left: `${50 / total}%`, right: `${50 / total}%` }}
          >
            <div className="relative h-full w-full rounded-full bg-border">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full bg-primary',
                  reduced ? '' : 'transition-[width] duration-500 ease-brand',
                )}
                style={{ width: `${fill}%` }}
              />
            </div>
          </div>
        ) : null}

        {steps.map((step, index) => {
          const done = index < active
          const isCurrent = index === active

          return (
            <li
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
                  'font-heading text-sm font-bold tabular-nums',
                  'transition-colors duration-300 ease-brand',
                  done && 'border-primary bg-primary text-primary-foreground',
                  isCurrent &&
                    'border-primary bg-background text-primary shadow-glow',
                  !done && !isCurrent && 'border-border bg-background text-muted-foreground',
                )}
              >
                {done ? (
                  <Check aria-hidden="true" strokeWidth={3} className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </span>

              <span
                className={cn(
                  'px-1 font-heading text-xs font-bold uppercase leading-tight tracking-tight',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step}
              </span>

              <span className="sr-only">
                {done ? '(completed)' : isCurrent ? '(current step)' : '(not started)'}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
