import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, User } from 'lucide-react'
import { blogCategories, blogPosts } from '@/data/blog'
import type { BlogPost } from '@/data/types'
import { cn, formatDate, pluralise } from '@/lib/utils'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { Badge } from '@/components/ui'
import { Reveal, Stagger } from '@/components/motion'
import { CtaBand, PageHero, SectionHeading } from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /blog
 *
 * Newest post leads at full width; the rest follow as cards. The
 * category filter is a plain toggle group rather than a router query,
 * so it costs no navigation and keeps the back button meaningful.
 * ------------------------------------------------------------------ */

const ALL = 'All articles'

function PostMeta({
  post,
  className,
}: {
  post: BlogPost
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <User aria-hidden="true" className="h-3.5 w-3.5" />
        {post.author}
      </span>
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      <span className="flex items-center gap-1.5">
        <Clock aria-hidden="true" className="h-3.5 w-3.5" />
        {post.readMinutes} min read
      </span>
    </div>
  )
}

export default function Blog() {
  const [category, setCategory] = useState<string>(ALL)

  const filtered = useMemo(
    () =>
      category === ALL
        ? blogPosts
        : blogPosts.filter((post) => post.category === category),
    [category],
  )

  const [featured, ...rest] = filtered

  return (
    <>
      <Seo
        title="Truck Tyre Articles & Guides — Spartan Tyres"
        description="Practical long-form guides for Australian fleet operators and owner-drivers: bulk buying, rolling resistance, retreading, pressure management, axle positions and sizing."
        canonicalPath="/blog"
        jsonLd={breadcrumbJsonLd([{ name: 'Blog', path: '/blog' }])}
      />

      <PageHero
        eyebrow="Articles and guides"
        title="Written for people who buy tyres by the pallet"
        lede={`${blogPosts.length} long-form guides on specifying, buying and looking after commercial tyres in Australian conditions — heat, distance and unsealed roads, rather than the duty cycles most patterns are designed around.`}
        breadcrumb={[{ name: 'Blog', path: '/blog' }]}
      />

      <section className="section" aria-labelledby="blog-index">
        <div className="shell">
          <h2 id="blog-index" className="sr-only">
            All articles
          </h2>

          {/* ---------------- Category filter ---------------- */}
          <div
            role="group"
            aria-label="Filter articles by category"
            className="flex flex-wrap gap-2"
          >
            {[ALL, ...blogCategories].map((option) => {
              const active = option === category
              const count =
                option === ALL
                  ? blogPosts.length
                  : blogPosts.filter((post) => post.category === option).length

              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(option)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2',
                    'font-heading text-xs font-bold uppercase tracking-wide',
                    'transition-colors duration-200 ease-brand',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {option}
                  <span className="font-sans text-[0.625rem] font-normal tabular-nums opacity-70">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
            Showing {filtered.length} {pluralise(filtered.length, 'article')}
            {category === ALL ? '' : ` in ${category}`}.
          </p>

          {/* ---------------- Featured ---------------- */}
          {featured ? (
            <Reveal className="mt-10">
              <Link
                to={`/blog/${featured.slug}`}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary md:p-10"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />

                <div className="relative flex flex-wrap items-center gap-3">
                  <Badge variant="primary">Latest</Badge>
                  <Badge variant="outline">{featured.category}</Badge>
                </div>

                <h3 className="relative mt-5 max-w-3xl font-heading text-2xl font-black uppercase leading-tight tracking-tight text-foreground group-hover:text-primary sm:text-3xl lg:text-4xl">
                  {featured.title}
                </h3>

                <p className="relative mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                  {featured.excerpt}
                </p>

                <PostMeta post={featured} className="relative mt-6" />

                <span className="relative mt-6 inline-flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide text-primary">
                  Read the article
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 transition-transform duration-300 ease-brand group-hover:translate-x-1"
                  />
                </span>
              </Link>
            </Reveal>
          ) : null}

          {/* ---------------- The rest ---------------- */}
          {rest.length ? (
            <Stagger className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => (
                <article key={post.slug} className="h-full">
                  <Link
                    to={`/blog/${post.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
                  >
                    <Badge variant="outline" size="sm" className="self-start">
                      {post.category}
                    </Badge>

                    <h3 className="mt-4 font-heading text-lg font-bold uppercase leading-tight tracking-tight text-foreground group-hover:text-primary">
                      {post.title}
                    </h3>

                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {post.excerpt}
                    </p>

                    <div className="mt-5 border-t border-border pt-4">
                      <PostMeta post={post} />
                    </div>
                  </Link>
                </article>
              ))}
            </Stagger>
          ) : null}
        </div>
      </section>

      {/* ---------------- Guide cross-link ---------------- */}
      <section
        className="section-tight border-t border-border bg-card"
        aria-labelledby="blog-guide"
      >
        <div className="shell">
          <SectionHeading
            id="blog-guide"
            eyebrow="Start here"
            title="New to specifying commercial tyres?"
            lede={
              <>
                The{' '}
                <Link to="/guide" className="link-underline font-semibold text-primary">
                  tyre guide
                </Link>{' '}
                covers the size code, axle positions and the ratings that decide cost per
                kilometre — the groundwork these articles build on.
              </>
            }
          />
        </div>
      </section>

      <CtaBand />
    </>
  )
}
