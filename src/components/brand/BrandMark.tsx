import { cn } from '@/lib/utils'
import { brandLogos } from '@/data/media'

/**
 * Typographic marks for every tyre brand on the site.
 *
 * We cannot ship other manufacturers' trademarked logos, so each brand gets a
 * distinct, honest typographic treatment instead — its own colour, weight,
 * tracking and accent rule. The result is a brand wall that reads as designed
 * rather than as a row of broken images, and it costs no network requests.
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

/**
 * Brands whose supplied artwork we render. These are the two lines actually
 * held in the warehouse; every other manufacturer we can source falls back to
 * the typographic treatment below, which keeps third-party trademarks off
 * pages that merely list what is available to order. Add a name here to show
 * its artwork instead.
 */
const ARTWORK_BRANDS = new Set(['Greforce', 'Lionshead'])

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
  const artwork = ARTWORK_BRANDS.has(name) ? brandLogos[name] : undefined

  const textSize =
    size === 'lg' ? 'text-2xl md:text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg'

  if (artwork) {
    const height = size === 'lg' ? 'h-12' : size === 'sm' ? 'h-6' : 'h-9'
    return (
      <span className={cn('flex items-center justify-center', className)}>
        <img
          src={artwork.src}
          alt={name}
          width={artwork.width}
          height={artwork.height}
          loading="lazy"
          decoding="async"
          // The supplied artwork is light-on-dark, so it needs a dark plate to
          // stay legible in both colour schemes.
          className={cn(
            'w-auto rounded-md bg-[#111113] px-3 py-1.5 object-contain',
            height,
          )}
        />
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
