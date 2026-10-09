import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'outline'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'charcoal'

export type BadgeSize = 'sm' | 'md'

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-secondary text-secondary-foreground',
  primary: 'border-transparent bg-primary text-primary-foreground',
  outline: 'border-border bg-transparent text-foreground',
  success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
  charcoal: 'border-transparent bg-charcoal text-charcoal-foreground',
}

const SIZES: Record<BadgeSize, string> = {
  sm: 'h-5 gap-1 px-1.5 text-[0.625rem]',
  md: 'h-6 gap-1.5 px-2.5 text-xs',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'default', size = 'md', ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border',
        'font-heading font-bold uppercase leading-none tracking-tight',
        'whitespace-nowrap',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
})
