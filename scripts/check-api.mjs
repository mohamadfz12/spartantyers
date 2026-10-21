/**
 * Loads every serverless function the way Vercel's Node runtime does, then
 * drives the admin flow and the storefront endpoints against them.
 *
 * Why this exists: Vercel transpiles each file under api/ on its own, keeps
 * import specifiers exactly as written, and runs the result as ES modules
 * (package.json is "type": "module"). Node refuses an ES-module import with no
 * file extension, so `from './_lib/http'` crashes the function on load with
 * FUNCTION_INVOCATION_FAILED - before any code runs. Vite and tsc both accept
 * the extensionless form, so a typecheck and a successful build say nothing
 * about it. Every relative import under api/ must end in `.js`; this check
 * fails if one does not.
 *
 * Run: npm run check:api
 */
import { build } from 'esbuild'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const root = process.argv[2] ?? process.cwd()
const out = process.argv[3] ?? join(tmpdir(), 'spartan-api-check')

rmSync(out, { recursive: true, force: true })

const files = []
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.ts$/.test(n) && !/\.d\.ts$/.test(n)) files.push(p)
  }
}
walk(join(root, 'api'))
walk(join(root, 'src'))
await build({
  entryPoints: files.filter((f) => !f.endsWith('.tsx')),
  outdir: out, outbase: root, bundle: false, format: 'esm',
  platform: 'node', target: 'node22', logLevel: 'silent',
})
writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }))

process.env.ADMIN_PASSWORD = 'test-password'
process.env.ADMIN_SESSION_SECRET = 'test-secret-test-secret-test-secret'

const fns = []
const walkFns = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) { if (n !== '_lib') walkFns(p) }
    else if (n.endsWith('.ts')) fns.push(relative(root, p).replace(/\\/g, '/').replace(/\.ts$/, '.js'))
  }
}
walkFns(join(root, 'api'))

const loaded = {}
let crashed = 0
for (const fn of fns) {
  try {
    loaded[fn] = (await import(pathToFileURL(join(out, fn)).href)).default
    console.log('LOADS   ', fn)
  } catch (e) {
    crashed++
    console.log('CRASH   ', fn, '\n           ', e.code, '-', e.message.split('\n')[0].replace(out, ''))
  }
}
if (crashed) process.exit(1)

/* ---- drive the admin flow end to end ---- */
function call(fn, method, query = {}, body, headers = {}) {
  return new Promise((resolve) => {
    const res = {
      _s: 200, _h: {},
      status(c) { this._s = c; return this },
      setHeader(k, v) { this._h[k] = v },
      json(b) { resolve({ status: this._s, body: b }) },
      end() { resolve({ status: this._s, body: null }) },
    }
    Promise.resolve(fn({ method, query, body, headers }, res)).catch((e) =>
      resolve({ status: 'THREW', body: e.message }))
  })
}

const admin = loaded['api/admin/[action].js']
console.log('\n--- admin flow ---')
const bad = await call(admin, 'POST', { action: 'login' }, { password: 'wrong' })
console.log('wrong password      ', bad.status, JSON.stringify(bad.body))
const ok = await call(admin, 'POST', { action: 'login' }, { password: 'test-password' })
console.log('right password      ', ok.status, ok.body?.token ? 'token issued, expires ' + ok.body.expiresAt : JSON.stringify(ok.body))
const auth = { authorization: `Bearer ${ok.body?.token}` }

const stats = await call(admin, 'GET', { action: 'stats' }, undefined, auth)
console.log('dashboard stats     ', stats.status, JSON.stringify(stats.body).slice(0, 110))
const prods = await call(admin, 'GET', { action: 'products' }, undefined, auth)
console.log('product list        ', prods.status, `${prods.body?.products?.length} products`)

const priced = prods.body.products.find((p) => p.price != null)
const poa = prods.body.products.find((p) => p.price == null)
const edit = await call(admin, 'PATCH', { action: 'products' }, { id: priced.id, patch: { stock: 7 } }, auth)
console.log('edit stock          ', edit.status, `${priced.id} stock -> ${edit.body?.product?.stock}`)
const edit2 = await call(admin, 'PATCH', { action: 'products' }, { id: poa.id, patch: { stock: 3 } }, auth)
console.log('edit POA line stock ', edit2.status, `${poa.id} stock -> ${edit2.body?.product?.stock ?? JSON.stringify(edit2.body)}`)

const orders = await call(admin, 'GET', { action: 'orders' }, undefined, auth)
console.log('orders              ', orders.status, `${orders.body?.orders?.length} orders`)
const enq = await call(admin, 'GET', { action: 'enquiries' }, undefined, auth)
console.log('enquiries           ', enq.status, `${enq.body?.enquiries?.length} enquiries, ${enq.body?.subscribers?.length} subscribers`)
const noAuth = await call(admin, 'GET', { action: 'stats' })
console.log('no token            ', noAuth.status, JSON.stringify(noAuth.body))

/* ---- storefront endpoints ---- */
console.log('\n--- storefront endpoints ---')
const contact = await call(loaded['api/contact.js'], 'POST', {}, {
  name: 'Test Person', email: 'test@example.com', enquiryType: 'Fleet quote', message: 'Looking for 20 drive tyres for our fleet.',
})
console.log('contact form        ', contact.status, JSON.stringify(contact.body))
const enq2 = await call(admin, 'GET', { action: 'enquiries' }, undefined, auth)
console.log('...in admin inbox   ', enq2.status, `${enq2.body?.enquiries?.length} enquiries, latest type: ${enq2.body?.enquiries?.[0]?.enquiryType}`)
const inv = await call(loaded['api/inventory.js'], 'GET')
console.log('inventory           ', inv.status, `${inv.body?.products?.length} products`)
const sq = await call(loaded['api/square/[action].js'], 'GET', { action: 'config' })
console.log('square config       ', sq.status, JSON.stringify(sq.body).slice(0, 90))
