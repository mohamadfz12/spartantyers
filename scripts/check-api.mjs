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
const leadHoursBad = await call(admin, 'PATCH', { action: 'leads' }, { key: 'abc', researchHours: -1 }, auth)
console.log('lead bad research   ', leadHoursBad.status, JSON.stringify(leadHoursBad.body).slice(0, 80))
const leadHoursMissing = await call(admin, 'PATCH', { action: 'leads' }, { key: 'no-such-lead', researchHours: 8 }, auth)
console.log('lead research, no key', leadHoursMissing.status)
const leadChecks = [
  [leadsList.status, 200], [leadBad.status, 400], [leadMissing.status, 404], [leadsNoAuth.status, 401],
  [leadHoursBad.status, 400], [leadHoursMissing.status, 404],
]
if (leadChecks.some(([got, want]) => got !== want)) {
  console.error('✗ leads endpoint did not behave as expected')
  process.exit(1)
}
// A price set in the admin must be what the website reads (and what checkout charges).
const priceEdit = await call(admin, 'PATCH', { action: 'products' }, { id: priced.id, patch: { price: 512.34, discount: 10 } }, auth)
const shop = await call(loaded['api/inventory.js'], 'GET')
const live = shop.body?.products?.find((p) => p.id === priced.id)
console.log('price edit -> shop  ', priceEdit.status, `price ${live?.price}, on sale ${live?.discountPrice}`)
if (priceEdit.status !== 200 || live?.price !== 512.34 || live?.discountPrice !== 461.11) {
  console.error('✗ a price edited in the admin did not reach /api/inventory')
  process.exit(1)
}
const noAuth = await call(admin, 'GET', { action: 'stats' })
console.log('no token            ', noAuth.status, JSON.stringify(noAuth.body))


let tillToken = null
function sam_till() { return { authorization: `Bearer ${tillToken}` } }
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

/* ---- the counter till (POS) ---- */
console.log('\n--- till (POS) ---')
await call(admin, 'POST', { action: 'staff' }, { name: 'Tia Till', email: 'tia@example.com', role: 'staff', password: 'till-pass-12345' }, auth)
tillToken = (await call(admin, 'POST', { action: 'login' }, { email: 'tia@example.com', password: 'till-pass-12345' })).body?.token
const till = await call(admin, 'GET', { action: 'pos', view: 'items' }, undefined, auth)
expect('till items', till, 200, `${till.body?.items?.length} items, square ${till.body?.squareReady ? 'on' : 'off'}`)
const tyre = till.body.items.find((i) => i.source === 'tyre' && i.price != null)
const stockBefore = tyre.stock
const fleet = expect('add a counter customer', await call(admin, 'POST', { action: 'pos' }, {
  action: 'customer-save', customer: { name: 'Dave Driver', company: 'ABC Haulage', email: 'dave@abc.example', termsDays: 30 },
}, auth), 200)
const t1 = expect('save a ticket', await call(admin, 'POST', { action: 'pos' }, {
  action: 'ticket-save', customerId: null, discount: 10,
  lines: [{ source: 'tyre', itemId: tyre.itemId, name: tyre.name, variation: tyre.variation, qty: 2, price: tyre.price }, { source: 'custom', name: 'Fitting', qty: 2, price: 70 }],
}, auth), 200)
const expectTotal = Math.round((tyre.price * 2 + 140 - 10) * 100) / 100
if (t1?.ticket?.total !== expectTotal || t1?.ticket?.status !== 'open') { opsFailures++; console.log('FAIL ticket total', t1?.ticket?.total, expectTotal) }
expect('bad line refused', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', lines: [{ name: '', qty: 1, price: 1 }] }, auth), 400)
expect('discount over total refused', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', discount: 999999, lines: [{ name: 'x', qty: 1, price: 1 }] }, auth), 400)
expect('short cash refused', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-cash', ref: t1.ticket.ref, tendered: 1 }, auth), 400)
const cash = expect('pay in cash', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-cash', ref: t1.ticket.ref, tendered: expectTotal + 20 }, sam_till()), 200)
if (cash?.ticket?.status !== 'paid' || cash?.change !== 20) { opsFailures++; console.log('FAIL cash', JSON.stringify(cash).slice(0, 200)) }
expect('paying twice refused', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-cash', ref: t1.ticket.ref }, auth), 409)
const after = (await call(admin, 'GET', { action: 'pos', view: 'items' }, undefined, auth)).body.items.find((i) => i.key === tyre.key)
if (after.stock !== Math.max(0, stockBefore - 2)) { opsFailures++; console.log('FAIL stock', stockBefore, '->', after.stock) }
console.log('     stock', stockBefore, '->', after.stock)
const led = (await call(admin, 'GET', { action: 'ledger' }, undefined, auth)).body
const posEntry = led.entries.find((e) => e.source === 'pos' && e.reference === t1.ticket.ref)
if (!posEntry || posEntry.amount !== expectTotal || posEntry.method !== 'Cash') { opsFailures++; console.log('FAIL ledger entry', JSON.stringify(posEntry)) }
expect('POS ledger entry cannot be deleted', await call(admin, 'DELETE', { action: 'ledger', id: posEntry?.id }, undefined, auth), 409)

const t2 = (await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', lines: [{ source: 'service', itemId: 'fitting', name: 'Fitting', qty: 1, price: 70 }] }, auth)).body.ticket
expect('pay another way', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-other', ref: t2.ref, method: 'Bank transfer' }, auth), 200)
expect('unknown method refused', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-other', ref: 'TK-NOPE', method: 'Gold bars' }, auth), 400)

const t3 = (await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', lines: [{ name: 'Tyres on account', qty: 1, price: 1000 }] }, auth)).body.ticket
expect('on account needs a customer', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-account', ref: t3.ref }, auth), 400)
await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', ref: t3.ref, customerId: fleet.customer.id, lines: t3.lines }, auth)
const acct = expect('put on account', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-account', ref: t3.ref }, auth), 200)
if (acct?.ticket?.status !== 'account' || !acct?.dueDate) { opsFailures++; console.log('FAIL account', JSON.stringify(acct).slice(0, 160)) }
const t4 = (await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', customerId: fleet.customer.id, lines: [{ name: 'More tyres', qty: 1, price: 500 }] }, auth)).body.ticket
await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-account', ref: t4.ref, dueDays: 0 }, auth)
const owes = (await call(admin, 'GET', { action: 'pos', view: 'customer', id: fleet.customer.id }, undefined, auth)).body
if (owes.balance.due !== 1500) { opsFailures++; console.log('FAIL balance', JSON.stringify(owes.balance)) }
const prev = expect('preview $700', await call(admin, 'GET', { action: 'pos', view: 'account-preview', id: fleet.customer.id, amount: '700' }, undefined, auth), 200)
// t4 is due today, t3 in 30 days: t4 ($500) is paid off first, then $200 of t3.
if (prev?.allocations?.[0]?.ticketRef !== t4.ref || prev?.allocations?.[0]?.settles !== true || prev?.allocations?.[1]?.amount !== 200 || prev?.left !== 800) {
  opsFailures++; console.log('FAIL allocation', JSON.stringify(prev))
}
expect('more than owed refused', await call(admin, 'GET', { action: 'pos', view: 'account-preview', id: fleet.customer.id, amount: '9999' }, undefined, auth), 400)
expect('take $700 in cash', await call(admin, 'POST', { action: 'pos' }, { action: 'account-cash', customerId: fleet.customer.id, amount: 700 }, auth), 200)
const mid = (await call(admin, 'GET', { action: 'pos', view: 'customer', id: fleet.customer.id }, undefined, auth)).body
const t3now = mid.tickets.find((t) => t.ref === t3.ref)
const t4now = mid.tickets.find((t) => t.ref === t4.ref)
if (mid.balance.due !== 800 || t4now.status !== 'paid' || t3now.amountPaid !== 200 || t3now.status !== 'account') {
  opsFailures++; console.log('FAIL after part payment', JSON.stringify({ b: mid.balance, t3: t3now.status, paid: t3now.amountPaid, t4: t4now.status }))
}
expect('pay the rest of one ticket', await call(admin, 'POST', { action: 'pos' }, { action: 'account-other', customerId: fleet.customer.id, amount: 800, method: 'Bank transfer', ticket: t3.ref }, auth), 200)
const end = (await call(admin, 'GET', { action: 'pos', view: 'customer', id: fleet.customer.id }, undefined, auth)).body
if (end.balance.due !== 0 || end.tickets.some((t) => t.status === 'account') || end.payments.length !== 2) { opsFailures++; console.log('FAIL settle', JSON.stringify(end.balance)) }
expect('customer with tickets cannot be deleted', await call(admin, 'POST', { action: 'pos' }, { action: 'customer-delete', id: fleet.customer.id }, auth), 409)
const t5 = (await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', lines: [{ name: 'Quote', qty: 1, price: 5 }] }, auth)).body.ticket
expect('cancel an open ticket', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-void', ref: t5.ref }, auth), 200)
expect('tickets list', await call(admin, 'GET', { action: 'pos', view: 'tickets' }, undefined, auth), 200)
expect('Terminal without Square: clear message, not a sign-out', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-charge', ref: t5.ref }, auth), 409)
expect('Square page without Square: 503', await call(admin, 'GET', { action: 'square', view: 'summary' }, undefined, auth), 503)
const salesAfter = (await call(admin, 'GET', { action: 'ledger' }, undefined, auth)).body.entries.filter((e) => e.source === 'pos')
console.log('     POS payments in the ledger:', salesAfter.length, salesAfter.map((e) => `${e.method} $${e.amount}`).join(', '))
if (salesAfter.length !== 4) { opsFailures++; console.log('FAIL expected 4 POS ledger payments') }

/* ---- Square Terminal, against a fake Square (fetch is intercepted for Square's hosts only) ---- */
console.log('\n--- Square Terminal (fake Square) ---')
const realFetch = globalThis.fetch
const fakeSq = { checkouts: {}, payments: [], polls: 0 }
const sqJson = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url))
  if (!/squareup(sandbox)?\.com$/.test(u.hostname)) return realFetch(url, init)
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body ? JSON.parse(init.body) : {}
  const path = u.pathname
  if (method === 'POST' && path === '/v2/devices/codes') return sqJson({ device_code: { id: 'dc_1', code: 'QWER', name: body.device_code.name, pair_by: new Date(Date.now() + 3e5).toISOString(), status: 'UNPAIRED' } })
  if (method === 'GET' && path === '/v2/devices/codes/dc_1') return sqJson({ device_code: { id: 'dc_1', name: 'Front counter', status: 'PAIRED', device_id: 'device_1', paired_at: new Date().toISOString() } })
  if (method === 'POST' && path === '/v2/orders') return sqJson({ order: { id: `order_${Object.keys(fakeSq.checkouts).length + fakeSq.payments.length}` } })
  if (method === 'POST' && path === '/v2/terminals/checkouts') {
    const id = `co_${Object.keys(fakeSq.checkouts).length + 1}`
    fakeSq.checkouts[id] = { id, status: 'PENDING', amount_money: body.checkout.amount_money, reference_id: body.checkout.reference_id }
    return sqJson({ checkout: fakeSq.checkouts[id] })
  }
  const co = path.match(/^\/v2\/terminals\/checkouts\/([^/]+)$/)
  if (method === 'GET' && co) {
    fakeSq.polls++
    // In progress on the first look, paid after that.
    const c = fakeSq.checkouts[co[1]]
    c.status = c.seen ? 'COMPLETED' : 'IN_PROGRESS'
    c.seen = true
    return sqJson({ checkout: { ...c, payment_ids: c.status === 'COMPLETED' ? [`pay_${co[1]}`] : [] } })
  }
  if (method === 'POST' && path === '/v2/payments') { fakeSq.payments.push(body); return sqJson({ payment: { id: `cash_${fakeSq.payments.length}` } }) }
  if (method === 'GET' && path === '/v2/catalog/list') return sqJson({ objects: [{ id: 'item_1', item_data: { name: 'Wheel alignment', variations: [{ id: 'var_1', item_variation_data: { name: 'Regular', price_money: { amount: 9900 } } }] } }] })
  if (method === 'GET' && path === '/v2/payments') return sqJson({ payments: [{ id: 'p1', status: 'COMPLETED', created_at: new Date().toISOString(), total_money: { amount: 12345 }, reference_id: 'spt-ticket-TK-ABC', card_details: { card: { card_brand: 'VISA', last_4: '4242' }, entry_method: 'CONTACTLESS' }, processing_fee: [{ amount_money: { amount: 200 } }] }] })
  if (method === 'GET' && path === '/v2/refunds') return sqJson({ refunds: [] })
  if (method === 'GET' && path === '/v2/merchants/me') return sqJson({ merchant: { business_name: 'Spartan Tyres' } })
  if (method === 'GET' && path.startsWith('/v2/locations/')) return sqJson({ location: { name: 'Yennora', currency: 'AUD', status: 'ACTIVE' } })
  if (method === 'GET' && path === '/v2/payouts') return sqJson({ payouts: [] })
  if (method === 'GET' && path === '/v2/devices') return sqJson({ devices: [] })
  return sqJson({ errors: [{ code: 'NOT_FOUND', detail: `fake Square has no ${method} ${path}` }] }, 404)
}
process.env.SQUARE_ACCESS_TOKEN = 'EAAAfake'
process.env.SQUARE_LOCATION_ID = 'LOC_FAKE'

const pair = expect('pair a Terminal', await call(admin, 'POST', { action: 'square' }, { action: 'pair', name: 'Front counter' }, auth), 200)
expect('staff cannot pair', await call(admin, 'POST', { action: 'square' }, { action: 'pair' }, sam_till()), 403)
const status = expect('Terminal paired after the code is used', await call(admin, 'GET', { action: 'square', view: 'terminal' }, undefined, auth), 200)
if (pair?.code?.code !== 'QWER' || status?.devices?.[0]?.id !== 'device_1' || status?.code) { opsFailures++; console.log('FAIL pairing', JSON.stringify(status)) }
const items2 = (await call(admin, 'GET', { action: 'pos', view: 'items' }, undefined, auth)).body
if (!items2.items.some((i) => i.source === 'square' && i.price === 99)) { opsFailures++; console.log('FAIL square items in till') }
const tc = (await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', lines: [{ name: 'Wheel alignment', source: 'square', itemId: 'var_1', qty: 1, price: 99 }] }, sam_till())).body.ticket
const sent = expect('send a ticket to the Terminal', await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-charge', ref: tc.ref }, sam_till()), 200)
const coId = sent.checkout.id
const first = await call(admin, 'GET', { action: 'pos', view: 'checkout', id: coId }, undefined, sam_till())
if (first.body?.checkout?.status !== 'IN_PROGRESS') { opsFailures++; console.log('FAIL first poll', JSON.stringify(first.body)) }
// Two tabs polling at once must record the payment once.
const [a, b] = await Promise.all([
  call(admin, 'GET', { action: 'pos', view: 'checkout', id: coId }, undefined, sam_till()),
  call(admin, 'GET', { action: 'pos', view: 'checkout', id: coId }, undefined, auth),
])
console.log('     two polls:', a.body?.checkout?.status, b.body?.checkout?.status)
const paidTicket = (await call(admin, 'GET', { action: 'pos', view: 'ticket', ref: tc.ref }, undefined, auth)).body.ticket
const cardEntries = (await call(admin, 'GET', { action: 'ledger' }, undefined, auth)).body.entries.filter((e) => e.reference === tc.ref)
expect('ticket paid by card on the Terminal', { status: paidTicket.status === 'paid' && paidTicket.paymentMethod === 'Card (in store)' ? 200 : 500, body: paidTicket }, 200)
if (cardEntries.length !== 1) { opsFailures++; console.log('FAIL card payment recorded', cardEntries.length, 'times') }
const tcash = (await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-save', lines: [{ name: 'Valve', qty: 1, price: 15 }] }, auth)).body.ticket
await call(admin, 'POST', { action: 'pos' }, { action: 'ticket-cash', ref: tcash.ref, tendered: 20 }, auth)
const cashInSquare = fakeSq.payments.find((p) => p.source_id === 'CASH' && p.reference_id === `spt-ticket-${tcash.ref}`)
if (!cashInSquare || cashInSquare.amount_money.amount !== 1500 || cashInSquare.cash_details.buyer_supplied_money.amount !== 2000) { opsFailures++; console.log('FAIL cash in Square', JSON.stringify(cashInSquare)) }
console.log('     cash also recorded in Square:', Boolean(cashInSquare))
const custom = expect('charge any amount', await call(admin, 'POST', { action: 'square' }, { action: 'charge', amount: 45, description: 'Puncture repair' }, auth), 200)
await call(admin, 'GET', { action: 'pos', view: 'checkout', id: custom.checkout.id }, undefined, auth)
const done = await call(admin, 'GET', { action: 'pos', view: 'checkout', id: custom.checkout.id }, undefined, auth)
if (done.body?.checkout?.status !== 'COMPLETED' || !/recorded/.test(done.body?.checkout?.detail)) { opsFailures++; console.log('FAIL custom charge', JSON.stringify(done.body)) }
const sum = expect('Square summary', await call(admin, 'GET', { action: 'square', view: 'summary', fresh: '1' }, undefined, auth), 200)
console.log('     today', sum?.today?.gross, 'from', Object.keys(sum?.bySource ?? {}).join(', '))
if (sum?.today?.gross !== 123.45 || !sum?.bySource?.['Counter (POS)']) { opsFailures++; console.log('FAIL summary') }
for (const view of ['payments', 'refunds', 'payouts', 'items', 'devices']) {
  expect(`Square ${view}`, await call(admin, 'GET', { action: 'square', view }, undefined, auth), 200)
}
expect('staff cannot open the Square page', await call(admin, 'GET', { action: 'square', view: 'summary' }, undefined, sam_till()), 403)
globalThis.fetch = realFetch
delete process.env.SQUARE_ACCESS_TOKEN
delete process.env.SQUARE_LOCATION_ID

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
