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
  const liveLeads = await store.listLeads()
  const liveStatuses = await store.getLeadStatuses()
  console.log('leads in database       :', liveLeads.length, `(${Object.keys(liveStatuses).length} with a status/notes)`)
  console.log('\n✓ the real database works for orders, enquiries, edits and leads')
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
const leadsList = await call(admin, 'GET', { action: 'leads' }, undefined, auth)
console.log('leads list          ', leadsList.status, `${leadsList.body?.leads?.length} leads, statuses: ${leadsList.body?.statusOptions?.join('/')}`)
const leadBad = await call(admin, 'PATCH', { action: 'leads' }, { key: 'abc', status: 'Bogus' }, auth)
console.log('lead bad status     ', leadBad.status, JSON.stringify(leadBad.body).slice(0, 80))
const leadMissing = await call(admin, 'PATCH', { action: 'leads' }, { key: 'no-such-lead', status: 'Called' }, auth)
console.log('lead unknown key    ', leadMissing.status, JSON.stringify(leadMissing.body))
const leadsNoAuth = await call(admin, 'GET', { action: 'leads' })
console.log('leads without token ', leadsNoAuth.status)
const leadChecks = [
  [leadsList.status, 200], [leadBad.status, 400], [leadMissing.status, 404], [leadsNoAuth.status, 401],
]
if (leadChecks.some(([got, want]) => got !== want)) {
  console.error('✗ leads endpoint did not behave as expected')
  process.exit(1)
}
const noAuth = await call(admin, 'GET', { action: 'stats' })
console.log('no token            ', noAuth.status, JSON.stringify(noAuth.body))

/* ---- staff, roles, inventory, hours and money ---- */
console.log('\n--- staff, inventory, money ---')
let opsFailures = 0
const expect = (label, result, want, extra = '') => {
  const good = result.status === want
  if (!good) opsFailures++
  console.log(`${good ? 'ok  ' : 'FAIL'} ${label.padEnd(44)} ${result.status}${good ? '' : ` (wanted ${want}) ${JSON.stringify(result.body).slice(0, 120)}`} ${extra}`)
  return result.body
}
const bearer = (token) => ({ authorization: `Bearer ${token}` })

const meOwner = expect('who am I (owner password)', await call(admin, 'GET', { action: 'me' }, undefined, auth), 200)
if (meOwner?.user?.role !== 'owner') { opsFailures++; console.log('FAIL owner role not reported') }

const mgr = expect('add a manager with a sign-in', await call(admin, 'POST', { action: 'staff' }, {
  name: 'Mia Manager', email: 'Mia@Example.com', role: 'manager', password: 'manager-pass-123',
}, auth), 200)
const fitter = expect('add a staff member with a sign-in', await call(admin, 'POST', { action: 'staff' }, {
  name: 'Sam Fitter', email: 'sam@example.com', role: 'staff', password: 'fitter-pass-123', payRate: 32.5,
}, auth), 200)
if (mgr?.member?.passwordHash || fitter?.member?.passwordHash || !fitter?.member?.hasLogin) {
  opsFailures++; console.log('FAIL password hash leaked or hasLogin missing')
}
expect('duplicate email refused', await call(admin, 'POST', { action: 'staff' }, { name: 'X', email: 'sam@example.com' }, auth), 409)
expect('short password refused', await call(admin, 'POST', { action: 'staff' }, { name: 'Y', email: 'y@example.com', password: 'short' }, auth), 400)

expect('staff login, wrong password', await call(admin, 'POST', { action: 'login' }, { email: 'sam@example.com', password: 'nope-nope-nope' }), 401)
expect('staff login, unknown email', await call(admin, 'POST', { action: 'login' }, { email: 'ghost@example.com', password: 'whatever-123' }), 401)
const samLogin = expect('staff login, right password', await call(admin, 'POST', { action: 'login' }, { email: 'SAM@example.com', password: 'fitter-pass-123' }), 200)
const mgrLogin = expect('manager login', await call(admin, 'POST', { action: 'login' }, { email: 'mia@example.com', password: 'manager-pass-123' }), 200)
const sam = bearer(samLogin?.token)
const mia = bearer(mgrLogin?.token)
if (samLogin?.user?.role !== 'staff') { opsFailures++; console.log('FAIL staff role not returned at login') }

expect('staff: inventory allowed', await call(admin, 'GET', { action: 'inventory' }, undefined, sam), 200)
expect('staff: money refused', await call(admin, 'GET', { action: 'ledger' }, undefined, sam), 403)
expect('staff: staff list refused', await call(admin, 'GET', { action: 'staff' }, undefined, sam), 403)
expect('staff: activity log refused', await call(admin, 'GET', { action: 'activity' }, undefined, sam), 403)
expect('staff: price change refused', await call(admin, 'PATCH', { action: 'products' }, { id: priced.id, patch: { price: 1 } }, sam), 403)
expect('staff: stock change allowed', await call(admin, 'PATCH', { action: 'products' }, { id: priced.id, patch: { stock: 20 } }, sam), 200)
expect('manager: staff list allowed', await call(admin, 'GET', { action: 'staff' }, undefined, mia), 200)
expect('manager: adding staff refused', await call(admin, 'POST', { action: 'staff' }, { name: 'Z', email: 'z@example.com' }, mia), 403)

const recv = expect('receive 10 tyres + record expense', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'receive', productId: priced.id, quantity: 10, unitCost: 300, supplier: 'Test Supplier', reference: 'INV-1', recordExpense: true,
}, auth), 200)
if (recv?.item?.product?.stock !== 30 || !recv?.expenseId || recv?.item?.settings?.costPrice !== 300) {
  opsFailures++; console.log('FAIL receive did not add stock / set cost / record expense', JSON.stringify(recv).slice(0, 200))
}
const recv2 = expect('receive 10 more at $400 (average cost)', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'receive', productId: priced.id, quantity: 10, unitCost: 400,
}, auth), 200)
// (30 on hand at $300 + 10 at $400) / 40 = $325
if (recv2?.item?.settings?.costPrice !== 325) { opsFailures++; console.log('FAIL average cost', recv2?.item?.settings?.costPrice) }
expect('staff: receive with expense refused', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'receive', productId: priced.id, quantity: 1, unitCost: 1, recordExpense: true,
}, sam), 403)
const dmg = expect('write off 3 damaged', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'adjust', productId: priced.id, mode: 'remove', quantity: 3, reason: 'Damaged',
}, sam), 200)
if (dmg?.item?.product?.stock !== 37 || dmg?.move?.by !== 'Sam Fitter') { opsFailures++; console.log('FAIL adjust', JSON.stringify(dmg?.move)) }
expect('remove more than on hand refused', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'adjust', productId: priced.id, mode: 'remove', quantity: 999, reason: 'Damaged',
}, auth), 400)
expect('adjust without a valid reason refused', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'adjust', productId: priced.id, mode: 'add', quantity: 1, reason: 'Because',
}, auth), 400)
const count = expect('stocktake count sets stock', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'adjust', productId: priced.id, mode: 'set', quantity: 36, reason: 'Stocktake count',
}, auth), 200)
if (count?.item?.product?.stock !== 36) { opsFailures++; console.log('FAIL count') }
expect('reorder level / location saved', await call(admin, 'POST', { action: 'inventory' }, {
  action: 'settings', productId: priced.id, reorderLevel: 8, location: 'Rack B3',
}, auth), 200)
const invList = expect('inventory lists the movements', await call(admin, 'GET', { action: 'inventory' }, undefined, auth), 200)
console.log('     movements logged:', invList?.totalMoves, '| storefront sees stock', (await call(loaded['api/inventory.js'], 'GET')).body?.products?.find((x) => x.id === priced.id)?.stock)

const sheet = expect('log 8 hours for Sam', await call(admin, 'POST', { action: 'timesheets' }, {
  staffId: fitter.member.id, date: '2026-10-20', hours: 8, note: 'Fleet job',
}, mia), 200)
expect('impossible date refused', await call(admin, 'POST', { action: 'timesheets' }, { staffId: fitter.member.id, date: '2026-02-31', hours: 1 }, auth), 400)
expect('no pay rate refused', await call(admin, 'POST', { action: 'timesheets' }, { staffId: mgr.member.id, date: '2026-10-20', hours: 1 }, auth), 400)
const paid = expect('pay Sam (wages expense)', await call(admin, 'PATCH', { action: 'timesheets' }, {
  action: 'pay', ids: [sheet.entry.id], date: '2026-10-21', method: 'Bank transfer',
}, mia), 200)
if (paid?.expense?.amount !== 260 || paid?.expense?.gst !== 0 || !paid?.entries?.[0]?.paid) {
  opsFailures++; console.log('FAIL wages', JSON.stringify(paid).slice(0, 200))
}
expect('paid hours cannot be deleted', await call(admin, 'DELETE', { action: 'timesheets', id: sheet.entry.id }, undefined, auth), 409)
expect('Sam has hours: delete refused', await call(admin, 'DELETE', { action: 'staff', id: fitter.member.id }, undefined, auth), 409)
expect('wages expense cannot be edited', await call(admin, 'PATCH', { action: 'ledger' }, { id: paid.expense.id, amount: 1 }, auth), 409)
const undo = expect('delete the wages expense', await call(admin, 'DELETE', { action: 'ledger', id: paid.expense.id }, undefined, auth), 200)
const afterUndo = (await call(admin, 'GET', { action: 'staff' }, undefined, auth)).body?.timesheets?.find((t) => t.id === sheet.entry.id)
if (undo?.unpaid !== 1 || afterUndo?.paid !== false) { opsFailures++; console.log('FAIL wages undo did not un-pay the hours') }

const pay = expect('record a bank transfer', await call(admin, 'POST', { action: 'ledger' }, {
  type: 'payment', date: '2026-10-21', amount: 550, category: 'Fleet account', method: 'Bank transfer', counterparty: 'ABC Haulage',
}, mia), 200)
if (pay?.entry?.gst !== 50) { opsFailures++; console.log('FAIL GST inside $550 should be $50', pay?.entry?.gst) }
expect('edit it', await call(admin, 'PATCH', { action: 'ledger' }, { id: pay.entry.id, amount: 660 }, mia), 200)
expect('unknown category refused', await call(admin, 'POST', { action: 'ledger' }, {
  type: 'expense', date: '2026-10-21', amount: 10, category: 'Lunch', method: 'Cash',
}, auth), 400)
expect('negative amount refused', await call(admin, 'POST', { action: 'ledger' }, {
  type: 'expense', date: '2026-10-21', amount: -5, category: 'Rent', method: 'Cash',
}, auth), 400)
expect('record rent', await call(admin, 'POST', { action: 'ledger' }, {
  type: 'expense', date: '2026-10-01', amount: 2200, category: 'Rent', method: 'Direct debit',
}, auth), 200)
expect('balance settings', await call(admin, 'PATCH', { action: 'ledger' }, { settings: { openingBalance: 5000, openingDate: '2026-07-01' } }, auth), 200)
const ledger = expect('ledger lists everything', await call(admin, 'GET', { action: 'ledger' }, undefined, auth), 200)
const types = (ledger?.entries ?? []).map((e) => `${e.type}:${e.category}:${e.amount}`).sort().join(', ')
console.log('     entries:', types, '| opening', ledger?.settings?.openingBalance)

expect('customers', await call(admin, 'GET', { action: 'customers' }, undefined, sam), 200)
const act = expect('activity log', await call(admin, 'GET', { action: 'activity' }, undefined, auth), 200)
console.log('     activity entries:', act?.total, '| e.g.', act?.entries?.find((e) => e.action === 'stock.adjust')?.detail)
if ((act?.entries ?? []).some((e) => /pass-123/.test(e.detail))) { opsFailures++; console.log('FAIL a password reached the activity log') }

expect('deactivate Sam', await call(admin, 'PATCH', { action: 'staff' }, { id: fitter.member.id, active: false }, auth), 200)
expect('Sam\'s open session ends at once', await call(admin, 'GET', { action: 'inventory' }, undefined, sam), 401)
expect('Sam can no longer sign in', await call(admin, 'POST', { action: 'login' }, { email: 'sam@example.com', password: 'fitter-pass-123' }), 401)
expect('demote Mia to staff', await call(admin, 'PATCH', { action: 'staff' }, { id: mgr.member.id, role: 'staff' }, auth), 200)
expect('Mia\'s old manager session ends', await call(admin, 'GET', { action: 'staff' }, undefined, mia), 401)
expect('Mia (no hours) can be deleted', await call(admin, 'DELETE', { action: 'staff', id: mgr.member.id }, undefined, auth), 200)
expect('tampered token refused', await call(admin, 'GET', { action: 'me' }, undefined, bearer(`${samLogin.token.split('.')[0]}x.${samLogin.token.split('.')[1]}`)), 401)

if (opsFailures) {
  console.error(`\n✗ ${opsFailures} staff / inventory / money check(s) failed`)
  process.exit(1)
}

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
