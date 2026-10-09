import { Minus, Plus } from 'lucide-react'
import { cn, clamp } from '@/lib/utils'

export interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Used in the accessible name so multiple steppers stay distinguishable. */
  label: string
  id: string
  className?: string
}

/**
 * Tyres are bought in pairs, fours and eights, so the stepper has to be fast to
 * drive and the typed value has to be respected — fleet buyers enter 24.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 200,
  label,
  id,
  className,
}: QuantityStepperProps) {
  const set = (next: number) => onChange(clamp(Math.round(next), min, max))

  return (
    <div
      className={cn(
        'inline-flex h-11 items-stretch overflow-hidden rounded-md border border-input bg-background',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
        className="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Minus aria-hidden="true" className="h-4 w-4" />
      </button>

      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => {
          if (event.target.value === '') return
          set(Number(event.target.value))
        }}
        className="w-14 border-x border-input bg-background text-center font-heading text-base font-bold tabular-nums text-foreground [appearance:textfield] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        className="flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  )
}
