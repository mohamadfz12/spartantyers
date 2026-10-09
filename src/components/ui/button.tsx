import { Children, cloneElement, forwardRef, isValidElement } from 'react'
import type { ReactElement } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant =
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'secondary'
  | 'destructive'
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

/* ------------------------------------------------------------------ *
 * Shared class recipe
 *
 * Exported so non-button elements (links, labels, native file inputs)
 * can wear the exact same costume without nesting a <button>.
 * ------------------------------------------------------------------ */

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden rounded-md ' +
  'transition-all duration-300 ease-brand ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-background ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  /* The hero action: blocky, uppercase, with a sheen that sweeps on hover. */
  primary: cn(
    'bg-primary text-primary-foreground shadow-sm',
    'font-heading font-bold uppercase tracking-wide',
    'hover:bg-primary/90 hover:shadow-glow active:translate-y-px',
    'before:pointer-events-none before:absolute before:inset-0 before:-translate-x-full',
    'before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent',
    'before:transition-transform before:duration-700 before:ease-brand',
    'hover:before:translate-x-full motion-reduce:before:hidden',
  ),
  outline: cn(
    'border border-input bg-transparent text-foreground',
    'font-heading font-bold uppercase tracking-wide',
    'hover:border-primary hover:bg-primary/10 hover:text-primary active:translate-y-px',
  ),
  secondary: cn(
    'bg-secondary text-secondary-foreground',
    'font-heading font-semibold uppercase tracking-wide',
    'hover:bg-secondary/80 active:translate-y-px',
  ),
  ghost: cn(
    'bg-transparent text-foreground font-medium',
    'hover:bg-accent hover:text-accent-foreground',
  ),
  destructive: cn(
    'bg-destructive text-destructive-foreground shadow-sm',
    'font-heading font-bold uppercase tracking-wide',
    'hover:bg-destructive/90 active:translate-y-px',
  ),
  link: cn(
    'bg-transparent p-0 font-medium text-primary underline-offset-4',
    'hover:underline',
  ),
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-[3.25rem] px-7 text-base',
  icon: 'h-11 w-11 p-0',
}

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
): string {
  // `link` ignores the size box so it sits inline with body copy.
  return cn(BASE, VARIANTS[variant], variant === 'link' ? 'h-auto' : SIZES[size])
}

/* ------------------------------------------------------------------ */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Render the single child instead of a <button>, merging classes + props. */
  asChild?: boolean
}

type ChildProps = {
  className?: string
  children?: React.ReactNode
  [key: string]: unknown
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    asChild = false,
    disabled,
    children,
    type,
    ...props
  },
  ref,
) {
  const classes = cn(buttonClasses(variant, size), className)

  if (asChild) {
    const child = Children.only(children) as ReactElement<ChildProps>
    if (!isValidElement(child)) return null

    const childProps = child.props as ChildProps

    return cloneElement(child, {
      ...props,
      ref,
      className: cn(classes, childProps.className),
      'aria-disabled': disabled || loading ? true : childProps['aria-disabled'],
      'data-loading': loading ? '' : undefined,
      children: (
        <>
          {loading ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
          ) : null}
          {childProps.children}
        </>
      ),
    } as Partial<ChildProps>)
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
      ) : null}
      {children}
    </button>
  )
})
