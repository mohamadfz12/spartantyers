import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/motion'

/**
 * The single page-opening device for every content, info and legal page.
 *
 * Keeping it in one place is what makes fifteen pages read as one site: the
 * same eyebrow, the same measure on the lede, the same textured surface, and
 * exactly one `<h1>` per page.
 */

export interface Crumb {
  name: string
  /** Omit on the final crumb — the current page is not a link. */
  path?: string
}

export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <li>
          <Link to="/" className="link-underline hover:text-primary">
            Home
          </Link>
        </li>
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.name}-${index}`}>
            <li aria-hidden="true" className="text-muted-foreground/50">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li>
              {crumb.path && index < trail.length - 1 ? (
                <Link to={crumb.path} className="link-underline hover:text-primary">
                  {crumb.name}
                </Link>
              ) : (
                <span aria-current="page" className="font-semibold text-foreground">
                  {crumb.name}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}

export interface PageHeroProps {
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  breadcrumb?: Crumb[]
  /** Right-hand column: a wheel, a diagram, a stat panel. */
  visual?: ReactNode
  /** Buttons and links sitting under the lede. */
  actions?: ReactNode
  /** Small meta row under the actions (dates, counts, authorship). */
  meta?: ReactNode
  className?: string
  /** Narrower measure, centred — used by the legal and 404 pages. */
  align?: 'left' | 'centre'
}

export function PageHero({
  eyebrow,
  title,
  lede,
  breadcrumb,
  visual,
  actions,
  meta,
  className,
  align = 'left',
}: PageHeroProps) {
  const centred = align === 'centre'

  return (
    <section
      className={cn(
        'relative overflow-hidden border-b border-border bg-card',
        className,
      )}
    >
      {/* Texture and wash, both token-driven so dark mode is deliberate. */}
      <div
        aria-hidden="true"
        className="grid-texture pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="hazard pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-70"
      />

      <div className="shell relative py-12 md:py-16 lg:py-20">
        {breadcrumb ? <Breadcrumbs trail={breadcrumb} className="mb-6" /> : null}

        <div
          className={cn(
            // Centred heroes stack: a centred measure beside a visual reads as
            // a mistake, so the visual drops underneath instead.
            visual && centred && 'flex flex-col items-center gap-10',
            visual &&
              !centred &&
              'grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-14',
          )}
        >
          <Reveal className={cn('min-w-0', centred && 'mx-auto max-w-3xl text-center')}>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="display-2 mt-4 text-foreground">{title}</h1>
            {lede ? (
              <div className={cn('lede mt-5 max-w-2xl', centred && 'mx-auto')}>{lede}</div>
            ) : null}
            {actions ? (
              <div
                className={cn(
                  'mt-8 flex flex-wrap items-center gap-3',
                  centred && 'justify-center',
                )}
              >
                {actions}
              </div>
            ) : null}
            {meta ? (
              <div
                className={cn(
                  'mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground',
                  centred && 'justify-center',
                )}
              >
                {meta}
              </div>
            ) : null}
          </Reveal>

          {visual ? (
            <Reveal
              direction="scale"
              delay={0.1}
              className={cn('min-w-0', centred && 'w-full max-w-xs')}
            >
              {visual}
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/**
 * Section heading used below the hero. Every page's second-level structure
 * goes through this so the eyebrow / h2 / lede rhythm never drifts.
 */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  level = 2,
  id,
  className,
  align = 'left',
}: {
  eyebrow?: string
  title: ReactNode
  lede?: ReactNode
  level?: 2 | 3
  id?: string
  className?: string
  align?: 'left' | 'centre'
}) {
  const Tag = level === 2 ? 'h2' : 'h3'
  const centred = align === 'centre'

  return (
    <div
      className={cn('max-w-3xl', centred && 'mx-auto text-center', className)}
    >
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <Tag
        id={id}
        className={cn(
          'mt-3 text-foreground',
          level === 2 ? 'display-3' : 'font-heading text-xl font-bold uppercase tracking-tight',
        )}
      >
        {title}
      </Tag>
      {lede ? <div className="lede mt-4">{lede}</div> : null}
    </div>
  )
}
