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

const root = process.cwd()
const LIVE = process.argv.includes('--live')
// Inside node_modules so the transpiled functions resolve their npm imports
// (the Neon driver) exactly as they do on Vercel.
const out = join(root, 'node_modules', '.cache', 'spartan-api-check')
void tmpdir

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

// Every database variable is cleared so the offline run starts from "no
// database", whatever happens to be in this shell.
const DB_VARS = [
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN', 'DATABASE_URL', 'POSTGRES_URL',
]
for (const name of DB_VARS) delete process.env[name]

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

/* ---- --live: prove the real database round-trips, touching nothing else ---- */
if (LIVE) {
  const { readFileSync, existsSync } = await import('node:fs')
  const envFile = ['.env.local', '.env'].map((f) => join(root, f)).find((f) => existsSync(f))
  if (!envFile) {
    console.error('\n--live needs a .env or .env.local file (Vercel: Settings → Environment Variables → Download).')
    process.exit(1)
  }
  // Load values into this process only. Names are printed; values never are.
  const found = []
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m || !DB_VARS.includes(m[1])) continue
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    found.push(m[1])
  }
  console.log(`\n--- live database (${envFile.split(/[\\/]/).pop()}) ---`)
  console.log('database variables found:', found.length ? found.join(', ') : 'none')

  const store = await import(pathToFileURL(join(out, 'api/_lib/store.js')).href)
  console.log('backend selected        :', store.storeBackend())
  const health = await store.storeHealth()
  console.log('health                  :', health)
  if (health !== 'connected') process.exit(1)
  const test = await store.storeSelfTest()
  console.log('write → read back       :', test.readBack ? 'ok' : 'FAILED')
  console.log('delete test record      :', test.removed ? 'ok' : 'FAILED')
  if (!test.readBack || !test.removed) process.exit(1)
  console.log('\n✓ the real database works for orders, enquiries and edits')
  process.exit(0)
}

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

/* ---- storage health, as the dashboard reports it ---- */
console.log('\n--- storage health ---')
let storageFailures = 0
const expectStorage = (label, result, wantStatus, wantStorage) => {
  const good = result.status === wantStatus && (wantStorage == null || result.body?.storage === wantStorage)
  if (!good) storageFailures++
  console.log(`${good ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${result.status} ${result.body?.storage ?? result.body?.error ?? ''}`)
}

const s1 = await call(admin, 'GET', { action: 'stats' }, undefined, auth)
expectStorage('no database configured', s1, 200, 'memory')

// A real Redis REST server, stood up locally, so 'connected' is proven rather than assumed.
const { createServer } = await import('node:http')
const redis = createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const ok = req.headers.authorization === 'Bearer good-token'
    const cmd = ok ? JSON.parse(body || '[]') : []
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' })
    if (!ok) return res.end(JSON.stringify({ error: 'unauthorized' }))
    const verb = String(cmd[0] ?? '').toUpperCase()
    res.end(JSON.stringify({ result: verb === 'PING' ? 'PONG' : verb === 'HGETALL' ? [] : null }))
  })
})
const redisPort = await new Promise((r) => redis.listen(0, '127.0.0.1', () => r(redis.address().port)))

for (const [scheme, urlKey, tokenKey] of [
  ['Vercel naming (KV_REST_API_*)', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['Upstash naming (UPSTASH_REDIS_REST_*)', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
]) {
  process.env[urlKey] = `http://127.0.0.1:${redisPort}`
  process.env[tokenKey] = 'good-token'
  expectStorage(`${scheme}, working`, await call(admin, 'GET', { action: 'stats' }, undefined, auth), 200, 'connected')
  process.env[tokenKey] = 'wrong-token'
  expectStorage(`${scheme}, wrong token`, await call(admin, 'GET', { action: 'stats' }, undefined, auth), 503)
  delete process.env[urlKey]
  delete process.env[tokenKey]
}
redis.close()

// Postgres configured but unreachable must say so, not fall back to memory.
process.env.DATABASE_URL = 'postgresql://user:pass@unreachable.invalid/db?sslmode=require'
expectStorage('Postgres (DATABASE_URL), unreachable', await call(admin, 'GET', { action: 'stats' }, undefined, auth), 503)
delete process.env.DATABASE_URL
process.env.POSTGRES_URL = 'postgresql://user:pass@unreachable.invalid/db?sslmode=require'
expectStorage('Postgres (POSTGRES_URL), unreachable', await call(admin, 'GET', { action: 'stats' }, undefined, auth), 503)
delete process.env.POSTGRES_URL

if (storageFailures) {
  console.error(`\n✗ ${storageFailures} storage check(s) failed`)
  process.exit(1)
}
console.log('\n✓ all API checks passed')
