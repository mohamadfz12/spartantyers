/**
 * Generates public/sitemap.xml from the real catalogue and blog data.
 *
 * Product ids are derived at runtime in src/data/products.ts rather than being
 * literals, so this script reproduces the same slug rule over the raw spec
 * entries. It asserts the counts it found, so a drift between the data and this
 * script fails the build rather than silently shipping a short sitemap.
 *
 * Run: npm run sitemap  (also runs automatically before `npm run build`)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const ORIGIN = 'https://spartantrucktyres.com.au'
const TODAY = new Date().toISOString().slice(0, 10)

/** Mirrors the slugify in src/data/products.ts. */
function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ---------- static routes ---------- */

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/shop', priority: '0.9', changefreq: 'daily' },
  { path: '/deals', priority: '0.9', changefreq: 'daily' },
  { path: '/finder', priority: '0.8', changefreq: 'weekly' },
  { path: '/brands', priority: '0.7', changefreq: 'monthly' },
  { path: '/products', priority: '0.7', changefreq: 'weekly' },
  { path: '/fleet-solutions', priority: '0.8', changefreq: 'monthly' },
  { path: '/wholesale', priority: '0.8', changefreq: 'monthly' },
  { path: '/about', priority: '0.6', changefreq: 'monthly' },
  { path: '/contact', priority: '0.7', changefreq: 'monthly' },
  { path: '/faq', priority: '0.6', changefreq: 'monthly' },
  { path: '/guide', priority: '0.7', changefreq: 'monthly' },
  { path: '/blog', priority: '0.7', changefreq: 'weekly' },
  { path: '/shipping', priority: '0.5', changefreq: 'monthly' },
  { path: '/returns', priority: '0.5', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
]

/* ---------- products ---------- */

const productsSource = readFileSync(join(root, 'src/data/products.ts'), 'utf8')

// Each spec entry opens with `pattern: '…', brand: '…', size: '…'`.
const specPattern =
  /pattern:\s*'([^']+)'\s*,\s*brand:\s*'([^']+)'\s*,\s*size:\s*'([^']+)'/g

const productPaths = []
for (const match of productsSource.matchAll(specPattern)) {
  const [, pattern, brand, size] = match
  productPaths.push(`/product/${slugify(brand)}-${slugify(pattern)}-${slugify(size)}`)
}

const uniqueProducts = [...new Set(productPaths)]
if (uniqueProducts.length !== productPaths.length) {
  throw new Error(
    `Duplicate product slugs generated (${productPaths.length} entries, ${uniqueProducts.length} unique). Two catalogue entries share a brand, pattern and size.`,
  )
}
if (uniqueProducts.length < 20) {
  throw new Error(
    `Only matched ${uniqueProducts.length} products — the spec format in products.ts has probably changed. Update the regex in scripts/generate-sitemap.mjs.`,
  )
}

/* ---------- blog ---------- */

const blogSource = readFileSync(join(root, 'src/data/blog.ts'), 'utf8')
const blogSlugs = [...blogSource.matchAll(/^\s*slug:\s*'([^']+)'/gm)].map(
  (match) => match[1],
)

const uniqueSlugs = [...new Set(blogSlugs)]
if (uniqueSlugs.length < 5) {
  throw new Error(
    `Only matched ${uniqueSlugs.length} blog slugs — the format in blog.ts has probably changed.`,
  )
}

/* ---------- write ---------- */

const entries = [
  ...STATIC_ROUTES,
  ...uniqueProducts.map((path) => ({
    path,
    priority: '0.7',
    changefreq: 'weekly',
  })),
  ...uniqueSlugs.map((slug) => ({
    path: `/blog/${slug}`,
    priority: '0.6',
    changefreq: 'monthly',
  })),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${ORIGIN}${entry.path}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`

writeFileSync(join(root, 'public/sitemap.xml'), xml, 'utf8')

console.log(
  `sitemap.xml written — ${entries.length} URLs ` +
    `(${STATIC_ROUTES.length} static, ${uniqueProducts.length} products, ${uniqueSlugs.length} posts)`,
)
