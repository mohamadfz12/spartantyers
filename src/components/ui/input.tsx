import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
} from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Shared field skin — Input, Textarea and Select all wear this.
 * ------------------------------------------------------------------ */

export const fieldSkin = cn(
  'w-full rounded-md border border-input bg-background text-foreground',
  'px-3.5 py-2.5 text-sm shadow-sm transition-colors duration-200 ease-brand',
  'placeholder:text-muted-foreground/70',
  'hover:border-primary/40',
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
)

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(fieldSkin, 'h-11 py-0', className)}
      {...props}
    />
  )
})

/* ------------------------------------------------------------------ *
 * Textarea
 * ------------------------------------------------------------------ */

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(fieldSkin, 'min-h-[6rem] resize-y leading-relaxed', className)}
      {...props}
    />
  )
})

/* ------------------------------------------------------------------ *
 * Label
 * ------------------------------------------------------------------ */

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn(
        'font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
})

/* ------------------------------------------------------------------ *
 * FieldError
 * ------------------------------------------------------------------ */

export type FieldErrorProps = React.HTMLAttributes<HTMLParagraphElement>

export const FieldError = forwardRef<HTMLParagraphElement, FieldErrorProps>(
  function FieldError({ className, children, ...props }, ref) {
    if (!children) return null
    return (
      <p
        ref={ref}
        className={cn(
          'flex items-start gap-1.5 text-xs font-medium text-destructive',
          className,
        )}
        {...props}
      >
        <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>{children}</span>
      </p>
    )
  },
)

/* ------------------------------------------------------------------ *
 * Field — label + control + hint/error, fully wired for a11y.
 * ------------------------------------------------------------------ */

export interface FieldProps {
  label: React.ReactNode
  /** Must match the `id` of the control passed as `children`. */
  htmlFor: string
  error?: string
  hint?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  className,
  children,
}: FieldProps) {
  const uid = useId()
  const base = htmlFor || uid
  const errorId = `${base}-error`
  const hintId = `${base}-hint`

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>

      {/* Clone the control so call sites never have to repeat the aria wiring. */}
      {Children.map(children, (node) => {
        if (!isValidElement(node)) return node
        const existing = node.props as Record<string, unknown>
        const merged = {
          'aria-invalid': error ? true : (existing['aria-invalid'] as boolean | undefined),
          'aria-describedby':
            [describedBy, existing['aria-describedby'] as string | undefined]
              .filter(Boolean)
              .join(' ') || undefined,
          'aria-required': required || undefined,
        }
        return cloneElement(node, merged as Partial<unknown>)
      })}

      {hint && !error ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}
