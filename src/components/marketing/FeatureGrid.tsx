import type { IconCard, Pillar, Stat, Step } from '@/data/content'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader } from '@/components/ui'
import { IconTile } from '@/components/Icon'
import { Counter, Reveal, Stagger } from '@/components/motion'

/* ------------------------------------------------------------------ *
 * The four repeating content shapes from src/data/content.ts, each
 * given one rendering so they look identical wherever they appear.
 * ------------------------------------------------------------------ */

/** `IconCard[]` — value props, segments, fleet services, wholesale benefits. */
export function FeatureGrid({
  items,
  columns = 3,
  className,
}: {
  items: IconCard[]
  columns?: 2 | 3
  className?: string
}) {
  return (
    <Stagger
      className={cn(
        'grid gap-5',
        columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item) => (
        <Card key={item.title} className="h-full">
          <CardHeader className="pb-3">
            <IconTile name={item.icon} />
            {/* A real heading rather than CardTitle's div, so the page outline
                includes every feature. */}
            <h3 className="mt-4 font-heading text-base font-bold uppercase leading-tight tracking-tight text-foreground">
              {item.title}
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </CardContent>
        </Card>
      ))}
    </Stagger>
  )
}

/** `Pillar[]` — about pillars, performance factors, warranty terms. */
export function PillarGrid({
  items,
  columns = 2,
  numbered = false,
  className,
}: {
  items: Pillar[]
  columns?: 2 | 3
  numbered?: boolean
  className?: string
}) {
  return (
    <Stagger
      className={cn(
        'grid gap-5',
        columns === 2 ? 'md:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.title}
          className="flex h-full flex-col rounded-lg border border-border bg-card p-6"
        >
          <div className="flex items-baseline gap-3">
            {numbered ? (
              <span
                aria-hidden="true"
                className="font-heading text-sm font-black tabular-nums text-primary"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
            ) : null}
            <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
              {item.title}
            </h3>
          </div>
          <span aria-hidden="true" className="mt-4 h-[3px] w-10 rounded-full bg-primary" />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        </div>
      ))}
    </Stagger>
  )
}

/** `Step[]` — the how-it-works sequence. */
export function StepList({ items, className }: { items: Step[]; className?: string }) {
  return (
    <ol className={cn('grid gap-5 md:grid-cols-3', className)}>
      {items.map((item) => (
        <li
          key={item.step}
          className="relative flex flex-col rounded-lg border border-border bg-card p-6"
        >
          <span className="font-heading text-4xl font-black leading-none text-primary/25">
            {String(item.step).padStart(2, '0')}
          </span>
          <h3 className="mt-4 font-heading text-base font-bold uppercase tracking-tight text-foreground">
            {item.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        </li>
      ))}
    </ol>
  )
}

/** `Stat[]` — the counted figure strip. */
export function StatStrip({
  items,
  className,
  tone = 'card',
}: {
  items: Stat[]
  className?: string
  tone?: 'card' | 'charcoal'
}) {
  const dark = tone === 'charcoal'

  return (
    <dl
      className={cn(
        'grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2 lg:grid-cols-4',
        dark
          ? 'border-charcoal-foreground/15 bg-charcoal-foreground/15'
          : 'border-border bg-border',
        className,
      )}
    >
      {items.map((stat, index) => (
        <Reveal
          key={stat.label}
          delay={index * 0.06}
          className={cn('flex flex-col p-6', dark ? 'bg-charcoal' : 'bg-card')}
        >
          <dt
            className={cn(
              'font-heading text-xs font-bold uppercase tracking-brand',
              dark ? 'text-charcoal-foreground/60' : 'text-muted-foreground',
            )}
          >
            {stat.label}
          </dt>
          <dd className="mt-3 flex flex-col gap-2">
            <Counter
              value={stat.value}
              suffix={stat.suffix}
              className="font-heading text-3xl font-black leading-none tracking-tight text-primary sm:text-4xl"
            />
            <span
              className={cn(
                'text-xs leading-relaxed',
                dark ? 'text-charcoal-foreground/70' : 'text-muted-foreground',
              )}
            >
              {stat.detail}
            </span>
          </dd>
        </Reveal>
      ))}
    </dl>
  )
}
