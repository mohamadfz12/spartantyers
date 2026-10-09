import { useId } from 'react'
import { cn } from '@/lib/utils'
import { site } from '@/config/site'

/**
 * The Spartan mark: a hoplite shield cut from a tyre cross-section, with the
 * tread blocks reading as the shield's rim. Drawn as SVG so it stays crisp at
 * favicon size and at hero size, and so it can be recoloured by CSS.
 */
export function LogoMark({ className }: { className?: string }) {
  // The logo renders in the header, the footer and the mobile nav at once, so
  // the gradient id has to be instance-unique — duplicate SVG ids make every
  // reference resolve to the first definition. Colons are stripped because
  // they are hostile inside `url(#…)`.
  const gradientId = `logo-shield-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <svg
      viewBox="0 0 48 48"
      className={cn('h-9 w-9', className)}
      role="img"
      aria-label={`${site.name} logo`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" />
          <stop offset="100%" stopColor="#b8410a" />
        </linearGradient>
      </defs>

      {/* Tread ring */}
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        opacity="0.9"
      />
      {/* Tread blocks around the ring */}
      {Array.from({ length: 16 }, (_, i) => (
        <rect
          key={i}
          x="22.6"
          y="1.2"
          width="2.8"
          height="5.4"
          rx="0.6"
          fill="currentColor"
          transform={`rotate(${i * 22.5} 24 24)`}
        />
      ))}

      {/* Shield */}
      <path
        d="M24 10.5 36 14.4v8.9c0 6.6-4.6 11.6-12 14.2-7.4-2.6-12-7.6-12-14.2v-8.9z"
        fill={`url(#${gradientId})`}
      />
      {/* Lambda, the hoplite blazon */}
      <path
        d="M24 16.6 29.9 31h-3.4l-2.5-6.6L21.5 31h-3.4z"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  )
}

export function Logo({
  className,
  showWordmark = true,
  compact = false,
}: {
  className?: string
  showWordmark?: boolean
  compact?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={compact ? 'h-8 w-8' : 'h-10 w-10'} />

      {showWordmark ? (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-heading font-black uppercase tracking-tight',
              compact ? 'text-lg' : 'text-xl',
            )}
          >
            Spartan
            <span className="text-primary">.</span>
          </span>
          <span className="font-heading text-[0.58rem] font-bold uppercase tracking-brand text-muted-foreground">
            Truck Tyres
          </span>
        </span>
      ) : null}
    </span>
  )
}
