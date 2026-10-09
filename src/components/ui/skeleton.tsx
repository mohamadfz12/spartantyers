import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * A muted block with a light sweep across it. Marked aria-hidden: the
 * surrounding region should carry `aria-busy` so SRs hear "loading" once
 * rather than announcing a dozen placeholders.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative isolate overflow-hidden rounded-md bg-muted',
        // The sweep itself — `animate-shimmer` is already in the Tailwind config.
        'before:absolute before:inset-0 before:-translate-x-full',
        'before:bg-gradient-to-r before:from-transparent before:via-foreground/10 before:to-transparent',
        'before:animate-shimmer motion-reduce:before:hidden',
        className,
      )}
      {...props}
    />
  )
}

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number
}

export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: Math.max(1, lines) }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            'h-3.5',
            // Ragged last line reads as prose rather than a solid bar.
            index === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full',
          )}
        />
      ))}
    </div>
  )
}

export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Aspect ratio class for the media block, e.g. `aspect-video`. */
  mediaClassName?: string
}

export function SkeletonCard({
  className,
  mediaClassName,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border bg-card p-4',
        className,
      )}
      {...props}
    >
      <span className="sr-only">Loading…</span>
      <Skeleton className={cn('aspect-square w-full', mediaClassName)} />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-4/5" />
        <SkeletonText lines={2} className="mt-1" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  )
}
