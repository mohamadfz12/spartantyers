import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds the shared `.elevate` lift and a border that warms to primary. */
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative rounded-lg border border-border bg-card text-card-foreground',
        interactive &&
          'elevate cursor-pointer hover:border-primary/60 focus-within:border-primary/60',
        className,
      )}
      {...props}
    />
  )
})

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-1.5 p-5 md:p-6', className)}
        {...props}
      />
    )
  },
)

export const CardTitle = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'font-heading text-lg font-bold uppercase leading-tight tracking-tight',
          className,
        )}
        {...props}
      />
    )
  },
)

export const CardDescription = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
})

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('p-5 pt-0 md:p-6 md:pt-0', className)} {...props} />
  },
)

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-3 border-t border-border p-5 md:p-6',
          className,
        )}
        {...props}
      />
    )
  },
)
