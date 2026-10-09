import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, Search, X } from 'lucide-react'
import { site } from '@/config/site'
import { faqCategories, faqs, faqsByCategory } from '@/data/faq'
import type { FaqItem } from '@/data/types'
import { pluralise } from '@/lib/utils'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import {
  Accordion,
  AccordionItem,
  Badge,
  Button,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { Reveal } from '@/components/motion'
import { CtaBand, PageHero, SectionHeading } from '@/components/marketing'

/* ------------------------------------------------------------------ *
 * /faq
 *
 * Browsing is by category in tabs; searching collapses the tabs and
 * matches across every question and answer at once, because someone
 * typing "pickup" does not know which category it lives under.
 * ------------------------------------------------------------------ */

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
}

function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <Accordion type="single" className="border-y border-border">
      {items.map((item) => (
        <AccordionItem key={item.question} title={item.question}>
          <p className="leading-[1.75]">{item.answer}</p>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export default function Faq() {
  const [query, setQuery] = useState('')
  const trimmed = query.trim().toLowerCase()
  const searching = trimmed.length > 1

  const results = useMemo(() => {
    if (!searching) return []
    return faqs.filter(
      (item) =>
        item.question.toLowerCase().includes(trimmed) ||
        item.answer.toLowerCase().includes(trimmed) ||
        item.category.toLowerCase().includes(trimmed),
    )
  }, [searching, trimmed])

  const resultsByCategory = useMemo(() => {
    const grouped = new Map<string, FaqItem[]>()
    for (const item of results) {
      const bucket = grouped.get(item.category) ?? []
      bucket.push(item)
      grouped.set(item.category, bucket)
    }
    return [...grouped.entries()]
  }, [results])

  return (
    <>
      <Seo
        title="Frequently Asked Questions — Spartan Tyres"
        description={`Answers on ordering, delivery and pickup, fitment, payment, warranty and fleet supply. ${faqs.length} questions answered, or call ${site.phone.display}.`}
        canonicalPath="/faq"
        jsonLd={[faqPageJsonLd, breadcrumbJsonLd([{ name: 'FAQ', path: '/faq' }])]}
      />

      <PageHero
        eyebrow="Help centre"
        title="Frequently asked questions"
        lede={`${faqs.length} answers across ordering, delivery and pickup, products and fitment, payment, warranty and returns, and fleet supply. If yours is not here, call ${site.phone.display}.`}
        breadcrumb={[{ name: 'FAQ', path: '/faq' }]}
        actions={
          <Button asChild size="lg">
            <a href={site.phone.href}>
              <Phone aria-hidden="true" className="h-4 w-4" />
              {site.phone.display}
            </a>
          </Button>
        }
      />

      <section className="section" aria-labelledby="faq-browse">
        <div className="shell">
          <h2 id="faq-browse" className="sr-only">
            Browse and search the questions
          </h2>

          {/* ---------------- Search ---------------- */}
          <Reveal className="max-w-xl">
            <Label htmlFor="faq-search">Search the questions</Label>
            <div className="relative mt-2">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="faq-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Try pickup, load index, Afterpay, metro delivery"
                className="pl-10 pr-10"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">Clear search</span>
                </button>
              ) : null}
            </div>

            <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
              {searching
                ? `${results.length} ${pluralise(results.length, 'question')} ${
                    results.length === 1 ? 'matches' : 'match'
                  } “${query.trim()}”`
                : ''}
            </p>
          </Reveal>

          {/* ---------------- Results or tabs ---------------- */}
          <div className="mt-8">
            {searching ? (
              results.length === 0 ? (
                <div className="rounded-lg border border-border bg-card p-6 md:p-8">
                  <h3 className="font-heading text-base font-bold uppercase tracking-tight text-foreground">
                    Nothing matched that
                  </h3>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Try a shorter term, or call{' '}
                    <a
                      href={site.phone.href}
                      className="link-underline font-semibold text-primary"
                    >
                      {site.phone.display}
                    </a>{' '}
                    — {site.hours.short}. You can also{' '}
                    <Link to="/contact" className="link-underline font-semibold text-primary">
                      send an enquiry
                    </Link>
                    .
                  </p>
                  <Button variant="outline" className="mt-6" onClick={() => setQuery('')}>
                    Clear the search
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-10">
                  {resultsByCategory.map(([category, items]) => (
                    <div key={category}>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-heading text-sm font-bold uppercase tracking-brand text-primary">
                          {category}
                        </h3>
                        <Badge variant="outline" size="sm">
                          {items.length}
                        </Badge>
                      </div>
                      <FaqList items={items} />
                    </div>
                  ))}
                </div>
              )
            ) : (
              <Tabs defaultValue={faqCategories[0]}>
                <TabsList label="Question categories">
                  {faqCategories.map((category) => (
                    <TabsTrigger key={category} value={category}>
                      {category}
                      <span className="ml-2 font-sans text-xs font-normal tabular-nums opacity-60">
                        {faqsByCategory[category].length}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {faqCategories.map((category) => (
                  <TabsContent key={category} value={category}>
                    <FaqList items={faqsByCategory[category]} />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        </div>
      </section>

      {/* ---------------- Elsewhere ---------------- */}
      <section
        className="section-tight border-t border-border bg-card"
        aria-labelledby="faq-elsewhere"
      >
        <div className="shell">
          <SectionHeading
            id="faq-elsewhere"
            eyebrow="More detail"
            title="Full policies and guides"
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Shipping and delivery',
                body: 'Metro free delivery, non-metro process, pickup and bulk freight.',
                href: '/shipping',
              },
              {
                title: 'Returns and warranty',
                body: '30-day returns, manufacturer warranty and the RMA process.',
                href: '/returns',
              },
              {
                title: 'Tyre guide',
                body: 'Reading a size code, axle positions and what the ratings mean.',
                href: '/guide',
              },
              {
                title: 'Terms and conditions',
                body: 'Orders, pricing, GST, delivery, risk and liability.',
                href: '/terms',
              },
            ].map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="flex h-full flex-col rounded-lg border border-border bg-background p-5 transition-colors duration-300 ease-brand hover:border-primary/60 focus-visible:border-primary"
              >
                <h3 className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
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
