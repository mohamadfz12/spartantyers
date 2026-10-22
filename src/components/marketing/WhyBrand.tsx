import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Factory, Gauge, ShieldCheck } from 'lucide-react'
import { patternsOf, storyFor } from '@/data/brand-stories'
import { brandLogos } from '@/data/media'
import { ProductThumb } from '@/components/shop/ProductThumb'
import { YouTube } from '@/components/YouTube'
import { Reveal, Stagger } from '@/components/motion'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Why Greforce / Why Lionshead
 *
 * The full story of each brand we stock, from src/data/brand-stories.ts
 * (the same text the AI assistant knows): who makes it, how it is built,
 * what it is certified to, and its best-known patterns. Greforce plays
 * the brand's own film; Lionshead publishes no video, so its section
 * shows the tyres instead.
 * ------------------------------------------------------------------ */

const ICONS = [Gauge, BadgeCheck, Factory, ShieldCheck]

export function WhyBrand({ brand, dark = false }: { brand: 'Greforce' | 'Lionshead'; dark?: boolean }) {
  const story = storyFor(brand)
  if (!story) return null
  const logo = brandLogos[brand]
  const patterns = patternsOf(brand)
  const featured = story.heroPatterns
    .map((model) => patterns.find((p) => p.model === model))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  return (
    <section
      id={story.anchor}
      aria-labelledby={`${story.anchor}-title`}
      className={cn('section scroll-mt-24', dark ? 'bg-charcoal text-charcoal-foreground' : 'bg-background')}
    >
      <div className="shell">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <Reveal direction="right">
            {logo ? (
              <img src={logo.src} alt={`${brand} logo`} width={logo.width} height={logo.height} className={cn('h-10 w-auto rounded bg-white px-2 py-1', dark && 'shadow-lift')} loading="lazy" />
            ) : null}
            <p className="eyebrow mt-5">{story.tagline}</p>
            <h2 id={`${story.anchor}-title`} className={cn('display-2 mt-3', dark && 'text-white')}>
              {story.title}
            </h2>
            <div className={cn('mt-5 flex flex-col gap-4 leading-relaxed', dark ? 'text-white/70' : 'text-muted-foreground')}>
              {story.story.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
          </Reveal>

          <Reveal direction="left" delay={0.1}>
            {story.video ? (
              <div>
                <YouTube id={story.video.id} title={story.video.title} />
                <p className={cn('mt-2 text-xs', dark ? 'text-white/50' : 'text-muted-foreground')}>From {story.video.channel} on YouTube.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {featured.map(({ model, sample, sizes }) => (
                  <Link
                    key={model}
                    to={`/product/${sample.id}`}
                    className={cn(
                      'group flex flex-col items-center rounded-xl border p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary',
                      dark ? 'border-white/10 bg-white/[0.04]' : 'border-border bg-card',
                    )}
                  >
                    <div className="h-28 w-28 sm:h-36 sm:w-36">
                      <ProductThumb brand={sample.brand} model={sample.model} tread={sample.tread} />
                    </div>
                    <p className="mt-3 font-heading text-base font-black uppercase group-hover:text-primary">{model}</p>
                    <p className={cn('text-xs', dark ? 'text-white/50' : 'text-muted-foreground')}>
                      {sample.positionLabel} · {sizes.join(', ')}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Reveal>
        </div>

        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {story.highlights.map((h, i) => {
            const Icon = ICONS[i % ICONS.length]!
            return (
              <div key={h.title} className={cn('rounded-xl border p-5', dark ? 'border-white/10 bg-white/[0.04]' : 'border-border bg-card')}>
                <Icon aria-hidden="true" className="h-6 w-6 text-primary" />
                <h3 className={cn('mt-3 font-heading text-sm font-bold uppercase tracking-wide', dark && 'text-white')}>{h.title}</h3>
                <p className={cn('mt-2 text-sm leading-relaxed', dark ? 'text-white/65' : 'text-muted-foreground')}>{h.body}</p>
              </div>
            )
          })}
        </Stagger>

        <Reveal className="mt-10">
          <dl className={cn('grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-5', dark ? 'border-white/10 bg-white/10' : 'border-border bg-border')}>
            {story.facts.map((f) => (
              <div key={f.label} className={cn('p-4', dark ? 'bg-charcoal' : 'bg-card')}>
                <dt className={cn('font-heading text-[0.65rem] font-bold uppercase tracking-brand', dark ? 'text-white/50' : 'text-muted-foreground')}>{f.label}</dt>
                <dd className={cn('mt-1 text-sm font-semibold', dark && 'text-white')}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal className="mt-8 flex flex-wrap items-center gap-2">
          <span className={cn('mr-1 font-heading text-xs font-bold uppercase tracking-brand', dark ? 'text-white/50' : 'text-muted-foreground')}>
            Our {brand} range:
          </span>
          {patterns.map(({ model, sample }) => (
            <Link
              key={model}
              to={`/product/${sample.id}`}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold transition-colors hover:border-primary hover:text-primary',
                dark ? 'border-white/15 text-white/80' : 'border-border',
              )}
            >
              {model}
            </Link>
          ))}
          <Button asChild size="sm" className="ml-auto">
            <Link to={`/shop?brand=${brand}`}>
              Shop all {brand}
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
