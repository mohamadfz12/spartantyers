import { Star } from 'lucide-react'
import { cn, clamp, formatNumber } from '@/lib/utils'

export type RatingSize = 'sm' | 'md' | 'lg'

const STAR_SIZE: Record<RatingSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

const TEXT_SIZE: Record<RatingSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

export interface RatingProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
  /** 0–5. Fractional values render a true partial star. */
  value: number
  /** Number of reviews, shown as "(63)" and folded into the aria-label. */
  count?: number
  size?: RatingSize
  showValue?: boolean
}

const STARS = [0, 1, 2, 3, 4]

export function Rating({
  value,
  count,
  size = 'md',
  showValue = false,
  className,
  ...props
}: RatingProps) {
  const safe = clamp(Number.isFinite(value) ? value : 0, 0, 5)
  const rounded = Math.round(safe * 10) / 10

  const label =
    `${rounded} out of 5 stars` +
    (typeof count === 'number'
      ? ` from ${formatNumber(count)} review${count === 1 ? '' : 's'}`
      : '')

  return (
    <div
      role="img"
      aria-label={label}
      className={cn('inline-flex items-center gap-1.5', className)}
      {...props}
    >
      <span className="inline-flex items-center gap-0.5">
        {STARS.map((index) => {
          // Fill fraction for this specific star: 1 full, 0 empty, 0<f<1 partial.
          const fill = clamp(safe - index, 0, 1)

          return (
            <span
              key={index}
              className={cn('relative inline-block shrink-0', STAR_SIZE[size])}
            >
              {/* Empty track */}
              <Star
                aria-hidden="true"
                className={cn('absolute inset-0 text-muted-foreground/40', STAR_SIZE[size])}
              />
              {/* Clipped overlay — never rounds, so 4.7 looks like 4.7 */}
              {fill > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${fill * 100}%` }}
                >
                  <Star
                    className={cn(
                      'fill-primary text-primary',
                      STAR_SIZE[size],
                      // Pin to the star's own left edge so clipping cuts the glyph.
                      'absolute left-0 top-0',
                    )}
                  />
                </span>
              ) : null}
            </span>
          )
        })}
      </span>

      {showValue ? (
        <span
          aria-hidden="true"
          className={cn('font-heading font-bold tabular-nums', TEXT_SIZE[size])}
        >
          {rounded.toFixed(1)}
        </span>
      ) : null}

      {typeof count === 'number' ? (
        <span
          aria-hidden="true"
          className={cn('tabular-nums text-muted-foreground', TEXT_SIZE[size])}
        >
          ({formatNumber(count)})
        </span>
      ) : null}
    </div>
  )
}
