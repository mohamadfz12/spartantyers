import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Clock, Phone, User } from 'lucide-react'
import { site } from '@/config/site'
import { blogPosts, getPost, relatedPosts } from '@/data/blog'
import { formatDate } from '@/lib/utils'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { Badge, Button } from '@/components/ui'
import { ScrollProgressBar, Reveal } from '@/components/motion'
import {
  CtaBand,
  PageHero,
  Prose,
  SectionHeading,
  proseHeadings,
} from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /blog/:slug
 *
 * A missing slug renders a real not-found state rather than redirecting,
 * so a mistyped or retired URL still explains itself and offers the way
 * back. The body is markdown-lite, rendered by <Prose>.
 * ------------------------------------------------------------------ */

/** `"Dave Marsden, Technical Manager"` → name and role. */
function splitAuthor(author: string): { name: string; role?: string } {
  const [name, ...role] = author.split(',')
  return { name: name.trim(), role: role.join(',').trim() || undefined }
}

export default function BlogPost() {
  const { slug = '' } = useParams<{ slug: string }>()
  const post = getPost(slug)

  const headings = useMemo(() => (post ? proseHeadings(post.body) : []), [post])
  const related = useMemo(() => (post ? relatedPosts(slug) : []), [post, slug])

  const articleJsonLd = useMemo(() => {
    if (!post) return undefined
    const { name, role } = splitAuthor(post.author)
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      articleSection: post.category,
      inLanguage: 'en-AU',
      author: {
        '@type': 'Person',
        name,
        ...(role ? { jobTitle: role } : {}),
        worksFor: { '@type': 'Organization', name: site.legalName },
      },
      publisher: {
        '@type': 'Organization',
        name: site.legalName,
        url: site.url,
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `${site.url}/blog/${post.slug}`,
      },
    }
  }, [post])

  /* ---------------- Not found ---------------- */
  if (!post) {
    return (
      <>
        <Seo
          title="Article not found — Spartan Tyres"
          description="We could not find that article. Browse every guide on specifying, buying and looking after commercial tyres."
          canonicalPath="/blog"
          noIndex
        />

        <PageHero
          eyebrow="Article not found"
          title="We could not find that article"
          lede="The link may be mistyped, or the article may have been retired. Every guide we have published is listed on the blog index."
          breadcrumb={[{ name: 'Blog', path: '/blog' }, { name: 'Not found' }]}
          align="centre"
          actions={
            <>
              <Button asChild size="lg">
                <Link to="/blog">
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                  All articles
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={site.phone.href}>
                  <Phone aria-hidden="true" className="h-4 w-4" />
                  {site.phone.display}
                </a>
              </Button>
            </>
          }
        />

        <section className="section" aria-labelledby="missing-suggestions">
          <div className="shell">
            <SectionHeading
              id="missing-suggestions"
              eyebrow="Try one of these"
              title="The most read guides"
              align="centre"
            />

            <div className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {blogPosts.slice(0, 3).map((suggestion) => (
                <Link
                  key={suggestion.slug}
                  to={`/blog/${suggestion.slug}`}
                  className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
                >
                  <Badge variant="outline" size="sm" className="self-start">
                    {suggestion.category}
                  </Badge>
                  <h3 className="mt-4 font-heading text-base font-bold uppercase leading-tight tracking-tight text-foreground group-hover:text-primary">
                    {suggestion.title}
                  </h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {suggestion.excerpt}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <CtaBand />
      </>
    )
  }

  const { name: authorName, role: authorRole } = splitAuthor(post.author)

  return (
    <>
      <Seo
        title={`${post.title} — Spartan Tyres`}
        description={post.excerpt}
        canonicalPath={`/blog/${post.slug}`}
        type="article"
        jsonLd={
          articleJsonLd
            ? [
                articleJsonLd,
                breadcrumbJsonLd([
                  { name: 'Blog', path: '/blog' },
                  { name: post.title, path: `/blog/${post.slug}` },
                ]),
              ]
            : undefined
        }
      />

      {/* Reading progress. Handles reduced motion through the shared primitive. */}
      <ScrollProgressBar />

      <PageHero
        eyebrow={post.category}
        title={post.title}
        lede={post.excerpt}
        breadcrumb={[{ name: 'Blog', path: '/blog' }, { name: post.title }]}
        meta={
          <>
            <span className="flex items-center gap-2">
              <User aria-hidden="true" className="h-4 w-4 text-primary" />
              <span>
                <span className="font-semibold text-foreground">{authorName}</span>
                {authorRole ? <span className="text-muted-foreground">, {authorRole}</span> : null}
              </span>
            </span>
            <time dateTime={post.date} className="flex items-center gap-2">
              {formatDate(post.date)}
            </time>
            <span className="flex items-center gap-2">
              <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
              {post.readMinutes} min read
            </span>
          </>
        }
      />

      <article className="section">
        <div className="shell">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:gap-16">
            {/* ---------------- Body ---------------- */}
            <div className="min-w-0 max-w-[46rem]">
              <Prose body={post.body} />

              <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-border pt-8">
                <Button asChild variant="outline">
                  <Link to="/blog">
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Back to all articles
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <a href={site.phone.href}>
                    <Phone aria-hidden="true" className="h-4 w-4" />
                    Ask us about this — {site.phone.display}
                  </a>
                </Button>
              </div>
            </div>

            {/* ---------------- Contents + author ---------------- */}
            <aside className="min-w-0">
              <div className="flex flex-col gap-5 lg:sticky lg:top-24">
                {headings.length ? (
                  <nav
                    aria-labelledby="article-contents"
                    className="rounded-lg border border-border bg-card p-5"
                  >
                    <h2
                      id="article-contents"
                      className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                    >
                      In this article
                    </h2>
                    <ol className="mt-4 flex flex-col gap-2.5">
                      {headings.map((heading) => (
                        <li key={heading.id} className="text-sm">
                          <a
                            href={`#${heading.id}`}
                            className="link-underline text-muted-foreground hover:text-primary"
                          >
                            {heading.text}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                ) : null}

                <div className="rounded-lg border border-border bg-card p-5">
                  <h2 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                    Written by
                  </h2>
                  <p className="mt-3 font-heading text-base font-bold uppercase tracking-tight text-foreground">
                    {authorName}
                  </p>
                  {authorRole ? (
                    <p className="mt-1 text-sm text-muted-foreground">{authorRole}</p>
                  ) : null}
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {site.legalName}, {site.office.suburb} {site.office.state}.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </article>

      {/* ---------------- Related ---------------- */}
      {related.length ? (
        <section
          className="section border-t border-border bg-card"
          aria-labelledby="article-related"
        >
          <div className="shell">
            <SectionHeading
              id="article-related"
              eyebrow="Keep reading"
              title="Related articles"
            />

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <Reveal key={item.slug} className="h-full">
                  <Link
                    to={`/blog/${item.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-border bg-background p-6 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="outline" size="sm">
                        {item.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.readMinutes} min read
                      </span>
                    </div>
                    <h3 className="mt-4 font-heading text-base font-bold uppercase leading-tight tracking-tight text-foreground group-hover:text-primary">
                      {item.title}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {item.excerpt}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-brand text-primary">
                      Read on
                      <ArrowRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5 transition-transform duration-300 ease-brand group-hover:translate-x-1"
                      />
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <CtaBand />
    </>
  )
}
