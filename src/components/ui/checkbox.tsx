import { forwardRef, useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Convenience label rendered to the right of the box and tied by `htmlFor`. */
  label?: React.ReactNode
  /** Class for the outer <label> wrapper when `label` is provided. */
  wrapperClassName?: string
}

/**
 * A real <input type="checkbox"> kept in the accessibility tree (peer) with a
 * drawn box on top, so keyboard, form submission and SR announcements are
 * native while the visuals match the brand.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, wrapperClassName, id, disabled, ...props },
  ref,
) {
  const uid = useId()
  const inputId = id ?? `cb-${uid}`

  const control = (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        disabled={disabled}
        className={cn(
          'peer h-5 w-5 cursor-pointer appearance-none rounded-[0.25rem]',
          'border border-input bg-background shadow-sm',
          'transition-colors duration-200 ease-brand',
          'hover:border-primary/60',
          'checked:border-primary checked:bg-primary',
          'indeterminate:border-primary indeterminate:bg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3.5}
        className={cn(
          'pointer-events-none absolute h-3.5 w-3.5 text-primary-foreground',
          'scale-50 opacity-0 transition-all duration-200 ease-brand',
          'peer-checked:scale-100 peer-checked:opacity-100',
        )}
      />
    </span>
  )

  if (label === undefined) return control

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group inline-flex cursor-pointer items-start gap-2.5 text-sm text-foreground',
        disabled && 'cursor-not-allowed opacity-60',
        wrapperClassName,
      )}
    >
      {control}
      <span className="leading-5">{label}</span>
    </label>
  )
})
