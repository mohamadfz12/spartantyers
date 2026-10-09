/**
 * Browser smoke test against the production build.
 *
 * A typecheck and a successful bundle prove the code compiles, not that the
 * site runs. This drives a real Chromium over every route, fails on any
 * console error or unhandled exception, and exercises the interactions that
 * actually matter commercially (add to cart, cart drawer, filters, the 3D
 * wheel, theme switching).
 *
 * Run: npm run smoke   (expects `npm run build` to have run first)
 */

import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join, normalize } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dist = join(root, 'dist')
const shots = join(root, '_smoke')

if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.')
  process.exit(1)
}

// Kept out of package.json so a normal install stays lean — this test is a
// deliberate, occasional check rather than part of the build.
let chromium
try {
  ;({ chromium } = await import('playwright-core'))
} catch {
  console.error(
    'playwright-core is not installed.\n\n' +
      '  npm i -D playwright-core\n' +
      '  node node_modules/playwright-core/cli.js install chromium-headless-shell\n',
  )
  process.exit(1)
}

/* ---------------------------------------------------------------- *
 * Static server with SPA fallback (mirrors vercel.json's rewrite)
 * ---------------------------------------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let filePath = join(dist, normalize(decodeURIComponent(url.pathname)))

  // Never serve outside dist, and fall back to the SPA shell for app routes.
  if (!filePath.startsWith(dist) || !existsSync(filePath) || !extname(filePath)) {
    filePath = join(dist, 'index.html')
  }

  try {
    const body = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
    })
    res.end(body)
  } catch {
    res.writeHead(500).end('server error')
  }
})

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})
const origin = `http://127.0.0.1:${port}`

/* ---------------------------------------------------------------- *
 * Harness
 * ---------------------------------------------------------------- */

await mkdir(shots, { recursive: true })

const browser = await chromium.launch()
const failures = []
const results = []

/** Console/page errors we deliberately tolerate. */
const IGNORE = [
  // No API is running behind the static server, so every fetch 404s.
  /Failed to load resource.*\/api\//i,
  /the server responded with a status of 404/i,
  /ApiError|Network request failed|Request failed with status/i,
  // WebGL in headless Chromium is software-rendered and warns.
  /WebGL|SwiftShader|GroupMarkerNotSet|Automatic fallback to software/i,
]

const tolerated = (text) => IGNORE.some((pattern) => pattern.test(text))

async function visit(path, label, interact) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await context.newPage()

  const errors = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!tolerated(text)) errors.push(`console: ${text}`)
  })
  page.on('pageerror', (error) => {
    const text = error.message ?? String(error)
    if (!tolerated(text)) errors.push(`pageerror: ${text}`)
  })

  try {
    const response = await page.goto(`${origin}${path}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    if (!response || response.status() >= 400) {
      errors.push(`HTTP ${response?.status()}`)
    }

    // Every page must render exactly one <h1> with real text.
    const h1s = await page.locator('h1').allTextContents()
    if (h1s.length === 0) errors.push('no <h1> rendered')
    if (h1s.length > 1) errors.push(`${h1s.length} <h1> elements: ${h1s.join(' | ')}`)
    if (h1s[0] !== undefined && h1s[0].trim().length === 0) errors.push('<h1> is empty')

    // The shell must be present — a crashed route still renders header/footer.
    const title = await page.title()
    if (!title || title === 'undefined') errors.push('document title missing')

    // The error boundary must not have caught anything.
    if (await page.locator('text=Something went wrong').count()) {
      errors.push('error boundary tripped')
    }

    if (interact) await interact(page, errors)

    await page.screenshot({
      path: join(shots, `${label}.png`),
      fullPage: false,
    })

    results.push({
      path,
      h1: (h1s[0] ?? '').trim().slice(0, 56),
      title: title.slice(0, 48),
      ok: errors.length === 0,
    })
  } catch (error) {
    errors.push(`navigation failed: ${error.message}`)
    results.push({ path, h1: '—', title: '—', ok: false })
  }

  if (errors.length) {
    failures.push({ path, errors: [...new Set(errors)] })
  }

  await context.close()
}

/* ---------------------------------------------------------------- *
 * Routes
 * ---------------------------------------------------------------- */

const ROUTES = [
  ['/', 'home'],
  ['/shop', 'shop'],
  ['/shop?position=drive&brand=Greforce', 'shop-filtered'],
  ['/shop?q=11R22.5', 'shop-search'],
  ['/product/greforce-grd57-11r22-5', 'product'],
  ['/product/lionshead-la302e-215-75r17-5', 'product-lowstock'],
  ['/product/greforce-hd02-11r22-5', 'product-preorder'],
  ['/product/does-not-exist', 'product-404'],
  ['/deals', 'deals'],
  ['/finder', 'finder'],
  ['/wheel-lab', 'wheel-lab'],
  ['/brands', 'brands'],
  ['/products', 'range'],
  ['/fleet-solutions', 'fleet'],
  ['/wholesale', 'wholesale'],
  ['/about', 'about'],
  ['/contact', 'contact'],
  ['/faq', 'faq'],
  ['/guide', 'guide'],
  ['/blog', 'blog'],
  ['/blog/reading-commercial-truck-tyre-sizes', 'blog-post'],
  ['/blog/nope', 'blog-404'],
  ['/shipping', 'shipping'],
  ['/returns', 'returns'],
  ['/privacy', 'privacy'],
  ['/terms', 'terms'],
  ['/cart', 'cart-empty'],
  ['/checkout', 'checkout-empty'],
  ['/compare', 'compare-empty'],
  ['/admin', 'admin-login'],
  ['/totally-missing', 'not-found'],
]

for (const [path, label] of ROUTES) {
  await visit(path, label)
}

/* ---------------------------------------------------------------- *
 * Interactions
 * ---------------------------------------------------------------- */

// 3D wheel actually mounts a canvas on the home page.
await visit('/', 'home-3d', async (page, errors) => {
  const canvas = page.locator('canvas').first()
  try {
    await canvas.waitFor({ state: 'attached', timeout: 20000 })
    const box = await canvas.boundingBox()
    if (!box || box.width < 50 || box.height < 50) {
      errors.push(`3D canvas has no size: ${JSON.stringify(box)}`)
    }
  } catch {
    errors.push('3D canvas never mounted on the home page')
  }
})

/**
 * Scroll the home page end to end.
 *
 * This exists because a page can pass every at-rest check and still be broken
 * the moment someone scrolls. Setting `overflow` on an ancestor (even `clip`)
 * silently disables `position: sticky`, which turned the pinned anatomy
 * section into 340vh of empty dark page — invisible to a test that only ever
 * looked at the top of the document.
 */
await visit('/', 'scroll-home', async (page, errors) => {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  const viewport = await page.evaluate(() => window.innerHeight)

  for (const fraction of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(height * fraction))
    await page.waitForTimeout(900)

    // Count text that is on screen but painted at zero opacity — the signature
    // of a scroll-triggered reveal that never fired.
    const state = await page.evaluate(() => {
      const vh = window.innerHeight
      let visible = 0
      let invisible = 0
      for (const el of document.querySelectorAll('main *')) {
        const box = el.getBoundingClientRect()
        if (box.bottom < 0 || box.top > vh || !box.width || !box.height) continue
        if (!el.textContent?.trim()) continue
        if (Number.parseFloat(getComputedStyle(el).opacity) < 0.05) invisible++
        else visible++
      }
      return { visible, invisible }
    })

    // A viewport-sized slice of a content page should never be empty.
    if (state.visible < 5) {
      errors.push(
        `at ${Math.round(fraction * 100)}% scroll only ${state.visible} elements are visible ` +
          `(${state.invisible} present but transparent) — likely a dead sticky or an unfired reveal`,
      )
    }
  }

  // The pinned section must actually pin: its heading stays on screen across
  // a scroll range far taller than the viewport.
  const anatomy = page.getByRole('heading', { name: /four numbers decide the price/i })
  const anatomyTop = await anatomy.evaluate((el) => {
    const section = el.closest('section')
    return section ? window.scrollY + section.getBoundingClientRect().top : -1
  })

  if (anatomyTop < 0) {
    errors.push('could not locate the pinned anatomy section')
  } else {
    for (const offset of [viewport * 0.5, viewport * 1.5, viewport * 2.5]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(anatomyTop + offset))
      await page.waitForTimeout(500)
      if (!(await anatomy.isVisible())) {
        errors.push(
          `pinned section came unstuck ${Math.round(offset)}px in — sticky is broken, ` +
            'check for an overflow value on an ancestor',
        )
        break
      }
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0))
})

// Theme toggle flips the `dark` class.
await visit('/', 'theme', async (page, errors) => {
  const before = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  )
  await page.getByRole('button', { name: /switch to (light|dark) theme/i }).click()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  )
  if (before === after) errors.push('theme toggle did not change the dark class')
})

// Add to cart from the shop, then open the drawer and reach checkout.
await visit('/shop', 'cart-flow', async (page, errors) => {
  await page.getByRole('button', { name: /add to cart/i }).first().click()
  await page.waitForTimeout(600)

  const badge = page.locator('header a[aria-label], header button[aria-label*="cart" i]')
  const cartLabel = await page
    .locator('button[aria-label*="Open cart" i]')
    .first()
    .getAttribute('aria-label')
  if (!cartLabel || /— 0 /.test(cartLabel)) {
    errors.push(`cart count did not increase (aria-label: ${cartLabel})`)
  }
  void badge

  // The drawer opens automatically on add; confirm the checkout link is live.
  const checkout = page.getByRole('link', { name: /secure checkout/i })
  if ((await checkout.count()) === 0) {
    errors.push('cart drawer did not show a checkout link after adding an item')
  }
})

// Axle selector changes the result list.
await visit('/', 'axle', async (page, errors) => {
  const steer = page.getByRole('radio', { name: /steer/i }).first()
  await steer.click()
  await page.waitForTimeout(500)
  if ((await steer.getAttribute('aria-checked')) !== 'true') {
    errors.push('axle radio did not become checked')
  }
})

// Shop filtering by URL actually narrows the result set.
await visit('/shop', 'filter-count', async (page, errors) => {
  const all = await page.locator('article').count()
  await page.goto(`${origin}/shop?brand=Lionshead`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const filtered = await page.locator('article').count()
  if (filtered === 0) errors.push('brand filter returned no products')
  if (filtered >= all) {
    errors.push(`brand filter did not narrow results (${all} → ${filtered})`)
  }
})

// Wheel Lab configurator mounts and its controls respond.
await visit('/wheel-lab', 'wheel-lab-3d', async (page, errors) => {
  try {
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 20000 })
  } catch {
    errors.push('Wheel Lab canvas never mounted')
  }
  const sizeSelect = page.locator('select[aria-label="Tyre size"]')
  if ((await sizeSelect.count()) === 0) {
    errors.push('Wheel Lab size selector missing')
  } else {
    await sizeSelect.selectOption('385/65R22.5')
    await page.waitForTimeout(600)
    if (!(await page.locator('text=385/65R22.5').first().isVisible())) {
      errors.push('Wheel Lab did not reflect the chosen size')
    }
  }
})

// Mobile viewport: nav drawer opens, nothing overflows horizontally.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => {
    if (!tolerated(error.message)) errors.push(`pageerror: ${error.message}`)
  })

  // Check every page, not just the home page: content wider than the screen
  // expands the layout viewport on mobile, which widens every fixed overlay
  // and pushes the nav drawer off the right edge.
  for (const [path] of ROUTES) {
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)

    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))

    if (metrics.innerWidth > metrics.clientWidth + 1) {
      errors.push(
        `${path}: layout viewport expanded to ${metrics.innerWidth}px (content ${metrics.scrollWidth}px) — fixed overlays will sit off-screen`,
      )
    }
  }

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /open menu/i }).click()
  await page.waitForTimeout(600)

  if ((await page.getByRole('link', { name: /^wheel lab$/i }).count()) === 0) {
    errors.push('mobile nav did not open')
  }

  // The drawer, its close button and its call CTA must all be reachable.
  const drawer = await page.evaluate(() => {
    const panel = document.querySelector('[aria-modal="true"]')
    if (!panel) return null
    const rect = panel.getBoundingClientRect()
    const tel = [...panel.querySelectorAll('a[href^="tel:"]')]
      .map((a) => a.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .pop()
    return {
      right: Math.round(rect.right),
      viewport: document.documentElement.clientWidth,
      height: window.innerHeight,
      telBottom: tel ? Math.round(tel.bottom) : null,
    }
  })

  if (!drawer) {
    errors.push('mobile drawer did not render a dialog')
  } else {
    if (drawer.right > drawer.viewport + 1) {
      errors.push(
        `drawer extends ${drawer.right - drawer.viewport}px past the right edge`,
      )
    }
    if (drawer.telBottom != null && drawer.telBottom > drawer.height + 1) {
      errors.push(
        `drawer call CTA sits ${drawer.telBottom - drawer.height}px below the fold`,
      )
    }
  }

  await page.screenshot({ path: join(shots, 'mobile-home.png') })
  await context.close()

  results.push({ path: '/ (390px)', h1: 'mobile', title: '—', ok: errors.length === 0 })
  if (errors.length) failures.push({ path: '/ (390px)', errors })
}

/* ---------------------------------------------------------------- *
 * Report
 * ---------------------------------------------------------------- */

await browser.close()
server.close()

const pad = (value, width) => String(value).padEnd(width)
console.log('')
console.log(`  ${pad('ROUTE', 46)}${pad('H1', 40)}OK`)
console.log(`  ${'-'.repeat(92)}`)
for (const row of results) {
  console.log(`  ${pad(row.path, 46)}${pad(row.h1 || '—', 40)}${row.ok ? 'yes' : 'NO'}`)
}

console.log('')
if (failures.length) {
  console.error(`✗ ${failures.length} route${failures.length === 1 ? '' : 's'} with problems:\n`)
  for (const failure of failures) {
    console.error(`  ${failure.path}`)
    for (const error of failure.errors) console.error(`    - ${error}`)
  }
  process.exit(1)
}

console.log(`✓ ${results.length} checks passed — screenshots in _smoke/`)
