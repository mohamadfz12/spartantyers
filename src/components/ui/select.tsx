import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fieldSkin } from './input'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /**
   * Rendered as a disabled, selected-by-default first option so the control
   * can show a prompt without faking a value.
   */
  placeholder?: string
}

/**
 * A native <select> in Tailwind clothing. Native is deliberate: it gives us
 * the OS picker on mobile and correct screen-reader semantics for free.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, placeholder, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          fieldSkin,
          'h-11 appearance-none bg-background py-0 pr-10',
          // Keep the native dropdown list legible in dark mode.
          '[&>option]:bg-background [&>option]:text-foreground',
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>

      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
})
