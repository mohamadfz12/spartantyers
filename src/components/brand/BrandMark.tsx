import { cn } from '@/lib/utils'
import { brandLogos } from '@/data/media'

/**
 * Marks for every tyre brand on the site.
 *
 * A brand with a logo in `brandLogos` shows it on a white plate of a fixed size
 * per `size`, so a row of logos lines up and dark artwork stays legible on the
 * dark theme. Any other brand gets a typographic treatment instead — its own
 * colour, weight, tracking and accent rule.
 */

export interface BrandStyle {
  /** Accent colour, as a CSS colour. */
  accent: string
  /** Tailwind font weight class. */
  weight: string
  /** Tailwind tracking class. */
  tracking: string
  /** Rendered in uppercase? */
  upper: boolean
  /** Decorative rule under the wordmark. */
  rule?: 'bar' | 'underline' | 'double' | 'none'
  italic?: boolean
}

const BRAND_STYLES: Record<string, BrandStyle> = {
  Greforce: {
    accent: '#e1632a',
    weight: 'font-black',
    tracking: 'tracking-tight',
    upper: true,
    rule: 'bar',
  },
  Lionshead: {
    accent: '#d4a017',
    weight: 'font-extrabold',
    tracking: 'tracking-wide',
    upper: true,
    rule: 'double',
  },
  Bridgestone: {
    accent: '#e4002b',
    weight: 'font-bold',
    tracking: 'tracking-tight',
    upper: false,
    rule: 'underline',
  },
  Michelin: {
    accent: '#2b61a4',
    weight: 'font-bold',
    tracking: 'tracking-wide',
    upper: true,
    rule: 'none',
  },
  Goodyear: {
    accent: '#0033a0',
    weight: 'font-extrabold',
    tracking: 'tracking-tight',
    upper: true,
    rule: 'underline',
    italic: true,
  },
  Continental: {
    accent: '#ffa500',
    weight: 'font-bold',
    tracking: 'tracking-wide',
    upper: false,
    rule: 'bar',
  },
  Pirelli: {
    accent: '#d9241f',
    weight: 'font-black',
    tracking: 'tracking-tighter',
    upper: true,
    rule: 'none',
    italic: true,
  },
  Dunlop: {
    accent: '#ffd400',
    weight: 'font-extrabold',
    tracking: 'tracking-tight',
    upper: true,
    rule: 'bar',
  },
  Hankook: {
    accent: '#ea5504',
    weight: 'font-bold',
    tracking: 'tracking-brand',
    upper: true,
    rule: 'none',
  },
  Yokohama: {
    accent: '#c8102e',
    weight: 'font-bold',
    tracking: 'tracking-wide',
    upper: true,
    rule: 'double',
  },
}

const FALLBACK: BrandStyle = {
  accent: 'hsl(var(--primary))',
  weight: 'font-bold',
  tracking: 'tracking-wide',
  upper: true,
  rule: 'bar',
}

export function brandStyle(name: string): BrandStyle {
  return BRAND_STYLES[name] ?? FALLBACK
}

export function BrandMark({
  name,
  className,
  size = 'md',
}: {
  name: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const style = brandStyle(name)
  const artwork = brandLogos[name]

  const textSize =
    size === 'lg' ? 'text-2xl md:text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg'

  if (artwork) {
    const plate = size === 'lg' ? 'h-16 w-44' : size === 'sm' ? 'h-10 w-28' : 'h-12 w-32'
    return (
      <span className={cn('flex items-center justify-center', className)}>
        {/* The artwork is dark on transparent, so it sits on a white plate. */}
        <span
          className={cn(
            'flex items-center justify-center rounded-md bg-white px-2.5 py-1.5 ring-1 ring-border',
            plate,
          )}
        >
          <img
            src={artwork.src}
            alt={name}
            width={artwork.width}
            height={artwork.height}
            loading="lazy"
            decoding="async"
            className="h-auto max-h-full w-auto max-w-full object-contain"
          />
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn('flex flex-col items-center gap-1.5', className)}
      style={{ ['--brand-accent' as string]: style.accent }}
    >
      <span
        className={cn(
          'font-heading leading-none text-foreground',
          textSize,
          style.weight,
          style.tracking,
          style.upper && 'uppercase',
          style.italic && 'italic',
        )}
      >
        {name}
      </span>

      {style.rule === 'bar' ? (
        <span
          className="h-[3px] w-10 rounded-full"
          style={{ background: style.accent }}
        />
      ) : null}
      {style.rule === 'underline' ? (
        <span
          className="h-[2px] w-full max-w-[5.5rem] rounded-full"
          style={{ background: style.accent }}
        />
      ) : null}
      {style.rule === 'double' ? (
        <span className="flex w-10 flex-col gap-[2px]">
          <span className="h-[2px] rounded-full" style={{ background: style.accent }} />
          <span
            className="h-[2px] rounded-full opacity-50"
            style={{ background: style.accent }}
          />
        </span>
      ) : null}
    </span>
  )
}
