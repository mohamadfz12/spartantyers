/**
 * Data integrity check.
 *
 * Transpiles the data modules with esbuild (already a Vite dependency) and
 * actually executes them, then asserts the invariants the UI relies on. A
 * typecheck cannot catch a duplicate product id or a review pointing at a
 * product that does not exist — this can.
 *
 * Run: npm run check
 */

import { build } from 'esbuild'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outfile = join(root, 'node_modules/.cache/spartan-data-check.mjs')

const failures = []
const notes = []

function check(label, condition, detail = '') {
  if (condition) return
  failures.push(detail ? `${label} — ${detail}` : label)
}

// Bundle an entry that re-exports everything we want to inspect.
await build({
  stdin: {
    contents: `
      export * as products from './src/data/products'
      export * as brands from './src/data/brands'
      export * as reviews from './src/data/reviews'
      export * as blog from './src/data/blog'
      export * as faq from './src/data/faq'
      export * as content from './src/data/content'
      export * as media from './src/data/media'
      export { site, nav } from './src/config/site'
    `,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
  // The data modules only import each other and site.ts, so nothing external
  // should be needed. If that stops being true, this will fail loudly.
  external: ['react', 'react-dom'],
  alias: { '@': join(root, 'src') },
})

const m = await import(pathToFileURL(outfile).href)

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

const { products: P } = m
const all = P.products

check('catalogue is non-empty', all.length > 0)
notes.push(`${all.length} products`)

const ids = all.map((p) => p.id)
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
check('product ids are unique', dupIds.length === 0, `duplicates: ${dupIds.join(', ')}`)

const skus = all.map((p) => p.sku)
const dupSkus = skus.filter((s, i) => skus.indexOf(s) !== i)
check('SKUs are unique', dupSkus.length === 0, `duplicates: ${dupSkus.join(', ')}`)

/**
 * Spartan's SKUs encode brand, size and pattern (GRF-29580R225-GPILOTX1), and
 * the same string is printed in the warehouse barcode — so a SKU that does not
 * spell out its own line is a typo that would mis-pick in the warehouse.
 */
const SKU_PREFIX = { Greforce: 'GRF', Lionshead: 'LH' }
const expectedSku = (p) =>
  `${SKU_PREFIX[p.brand]}-${p.size.replace(/[/.]/g, '')}-${p.model.replace(/[\s-]/g, '').toUpperCase()}`

for (const p of all) {
  check(`${p.id}: slug is URL-safe`, /^[a-z0-9-]+$/.test(p.id), p.id)
  check(`${p.id}: SKU matches brand, size and pattern`, p.sku === expectedSku(p),
    `${p.sku} — expected ${expectedSku(p)}`)
  check(`${p.id}: price is a positive number or POA`, p.price === null || p.price > 0)
  // An unpublished figure is null; a published one must resolve.
  check(`${p.id}: maxLoadKg resolved`, p.loadIndex === null ? p.maxLoadKg === null : p.maxLoadKg > 0,
    `load index "${p.loadIndex}"`)
  check(`${p.id}: maxSpeedKmh resolved`,
    p.speedRating === null ? p.maxSpeedKmh === null : p.maxSpeedKmh > 0,
    `speed "${p.speedRating}"`)
  check(`${p.id}: tread depth positive or unpublished`, p.treadDepthMm === null || p.treadDepthMm > 0)
  check(`${p.id}: has axle positions`, p.position.length > 0)
  check(`${p.id}: sectionWidthMm parsed`, p.sectionWidthMm > 0, `size "${p.size}"`)
  check(`${p.id}: rimDiameterIn parsed`, p.rimDiameterIn > 0, `size "${p.size}"`)
  check(`${p.id}: stock not negative`, p.stock >= 0)
  check(`${p.id}: rating in range`, p.rating >= 0 && p.rating <= 5)
  check(`${p.id}: no star rating without ratings`, p.reviewCount > 0 || p.rating === 0)
  check(`${p.id}: highlights present`, p.highlights.length >= 3)
  check(`${p.id}: tread family known`, ['rib', 'lug', 'block', 'trailer'].includes(p.tread))
  check(`${p.id}: copy never prints an unpublished value`,
    ![p.headline, p.description, ...p.highlights, ...p.tags].some((text) => /\bnull\b|undefined|NaN/.test(text)))

  if (p.price === null) {
    // Built to order: nothing on the floor, and nothing to discount.
    check(`${p.id}: POA line carries no stock`, p.stock === 0)
    check(`${p.id}: POA line carries no discount`, p.discount == null && p.discountPrice == null)
  }

  if (p.discount != null) {
    check(`${p.id}: discount sane`, p.discount > 0 && p.discount < 90)
    check(
      `${p.id}: discountPrice below price`,
      p.discountPrice != null && p.price != null && p.discountPrice < p.price,
    )
  }
}

notes.push(`${P.pricedProducts.length} priced · ${P.poaProducts.length} POA`)

// Curated lists must resolve — a typo here would render a blank home page —
// and "the lines we move most" must be lines the cart can actually sell.
check('featuredProducts all resolve', P.featuredProducts.length === 4,
  `got ${P.featuredProducts.length}, expected 4`)
for (const p of P.featuredProducts) {
  check(`featured ${p.id} has a price`, p.price !== null)
  check(`featured ${p.id} is in stock`, p.stock > 0)
}
check('every deal has a price', P.dealProducts.every((p) => p.price !== null))
check('allSizes non-empty', P.allSizes.length > 0)
check('priceRange sane', P.priceRange.min > 0 && P.priceRange.max >= P.priceRange.min)
check('inStockCount <= priced lines', P.inStockCount <= P.pricedProducts.length)
check('priced + POA covers the catalogue',
  P.pricedProducts.length + P.poaProducts.length === all.length)

// Price-on-application lines must sort after every priced line.
const sorted = [...all].sort((a, b) => P.comparePrice(a, b))
const firstPoa = sorted.findIndex((p) => p.price === null)
check('comparePrice puts POA last', firstPoa === -1 || sorted.slice(firstPoa).every((p) => p.price === null))
const sortedDesc = [...all].sort((a, b) => P.comparePrice(a, b, 'desc'))
check('comparePrice puts POA last descending too',
  sortedDesc.slice(sortedDesc.length - P.poaProducts.length).every((p) => p.price === null))

/* ------------------------------------------------------------------ *
 * Product photography
 * ------------------------------------------------------------------ */

const { media: MEDIA } = m
for (const src of MEDIA.productPhotoFiles) {
  check(`photo ${src} exists`, existsSync(join(root, 'public', src)), src)
}
const withPhoto = all.filter((p) => MEDIA.productPhotoFor(p))
notes.push(`${withPhoto.length} lines with a catalogue photo`)
check('photos are keyed to real patterns',
  MEDIA.productPhotoFiles.length <= new Set(all.map((p) => `${p.brand}|${p.model}`)).size)

// Every axle position must have stock, or the axle selector shows an empty state.
for (const position of ['steer', 'drive', 'trailer']) {
  const count = P.productsForPosition(position).length
  check(`${position} axle has products`, count > 0)
  notes.push(`${position}: ${count}`)
}

// The hero and the price-break ladder both depend on these.
check('relatedProducts returns results', P.relatedProducts(all[0], 4).length === 4)
check('priceBreakFor(1) is undefined', P.priceBreakFor(1) === undefined)
check('priceBreakFor(4) hits first band', P.priceBreakFor(4)?.min === 4)
check('priceBreakFor(100) hits top band', P.priceBreakFor(100)?.min === 40)

// Ids referenced from pages/components by literal string.
const literalIds = ['greforce-hd01m-11r22-5']
for (const id of literalIds) {
  check(`hard-referenced id "${id}" exists`, P.productById.has(id))
}

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

const { reviews: R } = m
notes.push(`${R.reviews.length} reviews`)

for (const review of R.reviews) {
  if (review.productId) {
    check(
      `review ${review.id} points at a real product`,
      P.productById.has(review.productId),
      review.productId,
    )
  }
  check(`review ${review.id}: rating 1-5`, review.rating >= 1 && review.rating <= 5)
  check(`review ${review.id}: has body`, review.body.trim().length > 20)
  check(`review ${review.id}: valid date`, !Number.isNaN(Date.parse(review.date)))
}

const reviewIds = R.reviews.map((r) => r.id)
check('review ids unique', new Set(reviewIds).size === reviewIds.length)
check('featuredReviews non-empty', R.featuredReviews.length > 0)

/* ------------------------------------------------------------------ *
 * Blog
 * ------------------------------------------------------------------ */

const { blog: B } = m
notes.push(`${B.blogPosts.length} blog posts`)

for (const post of B.blogPosts) {
  check(`post ${post.slug}: slug URL-safe`, /^[a-z0-9-]+$/.test(post.slug))
  check(`post ${post.slug}: has title`, post.title.length > 0)
  check(`post ${post.slug}: has excerpt`, post.excerpt.length > 40)
  check(`post ${post.slug}: valid date`, !Number.isNaN(Date.parse(post.date)))
  check(`post ${post.slug}: readMinutes > 0`, post.readMinutes > 0)
  check(`post ${post.slug}: substantial body`, post.body.length > 2000)
  check(`post ${post.slug}: resolves via getPost`, B.getPost(post.slug)?.slug === post.slug)

  // The Prose renderer only understands these constructs.
  const bad = post.body
    .split('\n')
    .filter((line) => /\*\*|__|\]\(|^#{1}\s|^#{3,}\s|^\|/.test(line))
  check(
    `post ${post.slug}: body uses only supported markdown-lite`,
    bad.length === 0,
    bad.slice(0, 2).join(' / '),
  )
}

const slugs = B.blogPosts.map((p) => p.slug)
check('blog slugs unique', new Set(slugs).size === slugs.length)
check('blogCategories derived', B.blogCategories.length > 0)
check('relatedPosts works', B.relatedPosts(slugs[0], 3).length > 0)
check(
  'relatedPosts excludes itself',
  !B.relatedPosts(slugs[0], 3).some((p) => p.slug === slugs[0]),
)

/* ------------------------------------------------------------------ *
 * FAQ
 * ------------------------------------------------------------------ */

const { faq: F } = m
notes.push(`${F.faqs.length} FAQs`)

for (const item of F.faqs) {
  check(`faq "${item.question.slice(0, 32)}": has answer`, item.answer.length > 40)
  check(`faq "${item.question.slice(0, 32)}": has category`, Boolean(item.category))
}
check('faqCategories derived', F.faqCategories.length > 0)
check(
  'faqsByCategory covers every FAQ',
  Object.values(F.faqsByCategory).flat().length === F.faqs.length,
)

/* ------------------------------------------------------------------ *
 * Brands
 * ------------------------------------------------------------------ */

const { brands: BR } = m

check('two brands stocked', BR.stockedBrands.length === 2)
check('sourced brands present', BR.sourcedBrands.length > 0)
for (const brand of BR.stockedBrands) {
  const actual = all.filter((p) => p.brand === brand.name).length
  check(
    `${brand.name}: skuCount matches catalogue`,
    brand.skuCount === actual,
    `says ${brand.skuCount}, catalogue has ${actual}`,
  )
  check(`${brand.name}: has SKUs`, actual > 0)
}
for (const brand of BR.sourcedBrands) {
  // Ordered in on request: the link goes to our own contact page, never off-site.
  check(`${brand.name}: links to the contact page`, brand.href === '/contact')
  check(`${brand.name}: not marked external`, brand.external === false)
}

/* ------------------------------------------------------------------ *
 * Content & config
 * ------------------------------------------------------------------ */

const { content: C, site, nav } = m

check('homeStats has 4 entries', C.homeStats.length === 4)
check('valueProps non-empty', C.valueProps.length > 0)
check('howItWorks has 3 steps', C.howItWorks.length === 3)
check('customerSegments has 4', C.customerSegments.length === 4)
check('warrantyTerms non-empty', C.warrantyTerms.length > 0)
check('tyreGuide positions cover 3 axles', C.tyreGuide.positions.length === 3)
check('deliveryZones metro list non-empty', C.deliveryZones.metro.length > 0)

check('site.phone href is a tel: link', site.phone.href.startsWith('tel:'))
check('fitting fee is 70', site.commerce.fittingFeePerTyre === 70)
check('GST rate is 10%', site.commerce.gstRate === 0.1)
check('office address getter works', site.office.full.includes('Yennora'))
check('warehouse address getter works', site.warehouse.full.includes('Yennora'))

// Every nav href must be a route the app actually serves.
const ROUTES = new Set([
  '/', '/shop', '/deals', '/finder', '/brands', '/products',
  '/fleet-solutions', '/wholesale', '/about', '/contact', '/faq', '/guide',
  '/blog', '/shipping', '/returns', '/privacy', '/terms', '/cart', '/checkout',
  '/compare',
])

const navHrefs = [
  ...nav.primary.map((i) => i.href),
  ...nav.secondary.map((i) => i.href),
  ...nav.footer.flatMap((c) => c.links.map((l) => l.href)),
  ...BR.stockedBrands.map((b) => b.href),
]

for (const href of navHrefs) {
  const path = href.split('?')[0]
  check(`nav target "${href}" is a real route`, ROUTES.has(path), path)
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

rmSync(outfile, { force: true })

console.log(`\n  ${notes.join(' · ')}\n`)

if (failures.length) {
  console.error(`✗ ${failures.length} data check${failures.length === 1 ? '' : 's'} failed:\n`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('✓ all data checks passed')
