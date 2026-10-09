import { useEffect } from 'react'
import { site } from '@/config/site'

/**
 * Document head management without a dependency.
 *
 * This is a client-rendered SPA, so these tags are written after hydration.
 * Googlebot renders JavaScript and will see them; other crawlers may not, which
 * is why `index.html` also ships hand-written defaults for the home page and
 * `public/sitemap.xml` lists every route. If full crawler coverage of every
 * page becomes a requirement, this is the seam to swap for prerendering.
 */

export interface SeoProps {
  title: string
  description: string
  canonicalPath?: string
  /** Absolute or root-relative image for social cards. */
  image?: string
  type?: 'website' | 'article' | 'product'
  /** JSON-LD object, serialised into a script tag. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
  noIndex?: boolean
}

const JSON_LD_ID = 'spartan-jsonld'

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value)
  }
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

export function Seo({
  title,
  description,
  canonicalPath,
  image = '/og-image.svg',
  type = 'website',
  jsonLd,
  noIndex = false,
}: SeoProps) {
  useEffect(() => {
    document.title = title

    const absoluteImage = image.startsWith('http') ? image : `${site.url}${image}`
    const canonical = canonicalPath ? `${site.url}${canonicalPath}` : undefined

    upsertMeta('meta[name="description"]', { name: 'description', content: description })
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noIndex ? 'noindex, nofollow' : 'index, follow',
    })

    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    })
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type })
    upsertMeta('meta[property="og:image"]', {
      property: 'og:image',
      content: absoluteImage,
    })
    upsertMeta('meta[property="og:site_name"]', {
      property: 'og:site_name',
      content: site.name,
    })
    if (canonical) {
      upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
      upsertLink('canonical', canonical)
    }

    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    })
    upsertMeta('meta[name="twitter:image"]', {
      name: 'twitter:image',
      content: absoluteImage,
    })
  }, [title, description, canonicalPath, image, type, noIndex])

  useEffect(() => {
    // Remove the previous page's structured data before writing this page's,
    // so stale JSON-LD never lingers across a client-side navigation.
    document.getElementById(JSON_LD_ID)?.remove()
    if (!jsonLd) return

    const script = document.createElement('script')
    script.id = JSON_LD_ID
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)

    return () => script.remove()
  }, [jsonLd])

  return null
}

/* ------------------------------------------------------------------ *
 * Structured data builders
 * ------------------------------------------------------------------ */

export const organisationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: site.legalName,
  alternateName: site.name,
  url: site.url,
  description: site.description,
  telephone: site.phone.e164,
  email: site.email.sales,
  address: {
    '@type': 'PostalAddress',
    streetAddress: site.office.street,
    addressLocality: site.office.suburb,
    addressRegion: site.office.state,
    postalCode: site.office.postcode,
    addressCountry: site.office.country,
  },
  areaServed: { '@type': 'Country', name: 'Australia' },
}

export const localBusinessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AutoPartsStore',
  name: site.name,
  description: site.description,
  url: site.url,
  telephone: site.phone.e164,
  email: site.email.sales,
  priceRange: '$$',
  address: {
    '@type': 'PostalAddress',
    streetAddress: site.office.street,
    addressLocality: site.office.suburb,
    addressRegion: site.office.state,
    postalCode: site.office.postcode,
    addressCountry: site.office.country,
  },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: site.hours.days,
    opens: site.hours.opens,
    closes: site.hours.closes,
  },
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${site.url}${item.path}`,
    })),
  }
}
