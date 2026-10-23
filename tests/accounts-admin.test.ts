/**
 * Customer accounts in the admin panel: who may do what (every role, every action), validation, the
 * special prices, credit, the audit trail, the roles themselves, and the link to the till's customers.
 *   npx tsx --test tests/accounts-admin.test.ts
 */
import assert from 'node:assert/strict'
import { after, beforeEach, describe, test } from 'node:test'
import { can, isStaffRole, ROLE_LABELS, STAFF_ROLES, type Permission, type StaffRole } from '../src/lib/admin-roles.js'
import { products } from '../src/data/products.js'
import {
  PASSWORD,
  account,
  adminCall,
  answered,
  cookieFrom,
  lastMailTo,
  mailer,
  newEmail,
  repo,
  reset,
  shutdown,
  signUp,
  staffToken,
  store,
  type Json,
} from './accounts-kit.js'

beforeEach(reset)
after(shutdown)

const PRODUCT = products[0]!.id
const PRODUCT_2 = products[1]!.id
const ROLES = ['owner', 'manager', 'sales', 'staff'] as const

async function open(extra: Json = {}) {
  const r = await adminCall('account-create', { body: { email: newEmail('t'), name: 'Trade Person', company: 'Trade Co', level: 'bulk', ...extra } })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  return r.json.account as Json
}

describe('roles', () => {
  const ALL: Permission[] = ['dashboard', 'products', 'pricing', 'orders', 'enquiries', 'leads', 'inventory', 'customers', 'pos', 'payments', 'finance', 'staff', 'accounts', 'activity', 'ai', 'trade', 'credit']
  const granted = (role: StaffRole) => ALL.filter((p) => can(role, p)).sort()

  test('owner, manager and staff keep exactly what they had; owner and manager gain trade and credit', () => {
    const everyone = ['dashboard', 'products', 'orders', 'enquiries', 'leads', 'inventory', 'customers', 'pos']
    assert.deepEqual(granted('staff'), [...everyone].sort(), 'staff gains nothing')
    assert.deepEqual(granted('manager'), [...everyone, 'pricing', 'payments', 'finance', 'staff', 'activity', 'ai', 'trade', 'credit'].sort())
    assert.deepEqual(granted('owner'), [...everyone, 'pricing', 'payments', 'finance', 'staff', 'accounts', 'activity', 'ai', 'trade', 'credit'].sort())
  })

  test('the Sales executive can use accounts, orders, enquiries, customers, leads and the till, and nothing else', () => {
    assert.deepEqual(granted('sales'), ['customers', 'dashboard', 'enquiries', 'leads', 'orders', 'pos', 'products', 'trade'])
    for (const denied of ['pricing', 'finance', 'payments', 'staff', 'accounts', 'credit', 'inventory', 'activity', 'ai'] as const) {
      assert.equal(can('sales', denied), false, denied)
    }
    assert.equal(ROLE_LABELS.sales, 'Sales executive')
    assert.ok(isStaffRole('sales'))
    assert.deepEqual([...STAFF_ROLES], ['owner', 'manager', 'sales', 'staff'])
  })

  test('only owner, manager and sales hold trade; only owner and manager hold credit', () => {
    assert.deepEqual(STAFF_ROLES.filter((r) => can(r, 'trade')), ['owner', 'manager', 'sales'])
    assert.deepEqual(STAFF_ROLES.filter((r) => can(r, 'credit')), ['owner', 'manager'])
  })

  test('the Staff page can give someone the new role (server validation), and unknown roles are refused', async () => {
    const ok = await adminCall('staff', { body: { name: 'Sally Sales', email: newEmail('s'), role: 'sales', password: 'sales-password-123' } })
    assert.equal(ok.status, 200)
    assert.equal(ok.json.member.role, 'sales')
    const bad = await adminCall('staff', { body: { name: 'Bad Role', email: newEmail('s'), role: 'supreme' } })
    assert.equal(bad.status, 400)
    assert.match(bad.json.error, /owner, manager, sales or staff/)
    // Changing an existing person to Sales ends their old session, as any role change does.
    const staff = await adminCall('staff', { body: { name: 'Fitter', email: newEmail('f'), role: 'staff', password: 'fitter-password-123' } })
    const patched = await adminCall('staff', { method: 'PATCH', body: { id: staff.json.member.id, role: 'sales' } })
    assert.equal(patched.json.member.role, 'sales')
  })

  test('a signed-in Sales executive reaches the accounts but not the money pages', async () => {
    const token = await staffToken('sales')
    assert.equal((await adminCall('accounts', { method: 'GET', token })).status, 200)
    for (const action of ['ledger', 'staff', 'activity']) assert.equal((await adminCall(action, { method: 'GET', token })).status, 403, action)
    assert.equal((await adminCall('inventory', { method: 'GET', token })).status, 403)
    assert.equal((await adminCall('products', { method: 'PATCH', token, body: { id: PRODUCT, patch: { price: 1 } } })).status, 403)
    const me = await adminCall('me', { method: 'GET', token })
    assert.equal(me.json.user.role, 'sales')
  })
})

describe('who may do what, every role on every action', () => {
  /** Each action with a request that would succeed for someone allowed. `fresh` makes a new account first. */
  const ACTIONS: Array<{
    action: string
    permission: 'trade' | 'credit'
    method?: string
    make: (a: Json) => { body?: Json; query?: Json }
    fresh?: () => Promise<Json>
  }> = [
    { action: 'accounts', permission: 'trade', method: 'GET', make: () => ({}) },
    { action: 'account', permission: 'trade', method: 'GET', make: (a) => ({ query: { id: a.id } }) },
    { action: 'account-update', permission: 'trade', make: (a) => ({ body: { id: a.id, notes: 'hello' } }) },
    { action: 'account-level', permission: 'trade', make: (a) => ({ body: { id: a.id, level: 'wholesaler', discountPct: 5 } }) },
    {
      action: 'account-request',
      permission: 'trade',
      make: (a) => ({ body: { id: a.id, decision: 'approve' } }),
      fresh: async () => (await signUp({ requestedLevel: 'bulk' }).then(async (s) => (await repo.getAccount(s.id))!)) as unknown as Json,
    },
    { action: 'account-prices', permission: 'trade', make: (a) => ({ body: { id: a.id, prices: [{ productId: PRODUCT, price: 100 }] } }) },
    { action: 'account-credit', permission: 'credit', make: (a) => ({ body: { id: a.id, payLater: true, termsDays: 30, creditLimit: 1000 } }) },
    { action: 'account-invite', permission: 'trade', make: (a) => ({ body: { id: a.id } }) },
    { action: 'account-status', permission: 'trade', make: (a) => ({ body: { id: a.id, status: 'suspended' } }) },
    {
      action: 'account-link-pos',
      permission: 'trade',
      make: (a) => ({ body: { id: a.id } }),
      // A sign-up whose email a till customer already had, so it waits unlinked.
      fresh: async () => {
        const email = newEmail('matrix')
        const now = new Date().toISOString()
        await store.savePosCustomer({ id: `till-${email}`, name: 'Matrix Till', company: '', email, phone: '', address: '', notes: '', termsDays: 14, createdAt: now, updatedAt: now, createdBy: 'Sam' })
        return (await repo.getAccount((await signUp({ email })).id)) as unknown as Json
      },
    },
  ]
  const allowed = (role: string | null, permission: 'trade' | 'credit') => role !== null && can(role as StaffRole, permission)

  for (const spec of ACTIONS) {
    test(`${spec.action} (${spec.permission}): owner/manager/sales/staff and nobody`, async () => {
      for (const role of [...ROLES, null] as const) {
        const subject = spec.fresh ? await spec.fresh() : await open()
        const token = role === null ? null : await staffToken(role)
        const { body, query } = spec.make(subject)
        const r = await adminCall(spec.action, { method: spec.method ?? 'POST', token, body, query })
        if (role === null) assert.equal(r.status, 401, `${spec.action} with no sign-in`)
        else if (allowed(role, spec.permission)) assert.equal(r.status, 200, `${role} on ${spec.action}: ${JSON.stringify(r.json)}`)
        else assert.equal(r.status, 403, `${role} on ${spec.action}`)
      }
    })
  }

  test('account-create is for trade holders only', async () => {
    for (const role of [...ROLES, null] as const) {
      const token = role === null ? null : await staffToken(role)
      const r = await adminCall('account-create', { token, body: { email: newEmail(), name: 'Made By Role', level: 'customer' } })
      assert.equal(r.status, role === null ? 401 : allowed(role, 'trade') ? 200 : 403, String(role))
    }
  })

  test('a denied request changes nothing', async () => {
    const a = await open()
    const staff = await staffToken('staff')
    const sales = await staffToken('sales')
    await adminCall('account-credit', { token: staff, body: { id: a.id, payLater: true, termsDays: 60, creditLimit: 9999 } })
    await adminCall('account-credit', { token: sales, body: { id: a.id, payLater: true, termsDays: 60, creditLimit: 9999 } })
    await adminCall('account-level', { token: staff, body: { id: a.id, level: 'wholesaler', discountPct: 50 } })
    const after = (await repo.getAccount(a.id as string))!
    assert.equal(after.payLater, false)
    assert.equal(after.creditLimit, 0)
    assert.equal(after.level, 'bulk')
    assert.equal(after.discountPct, 0)
  })

  test('methods are enforced', async () => {
    const a = await open()
    assert.equal((await adminCall('accounts', { method: 'POST', body: {} })).status, 405)
    assert.equal((await adminCall('account-status', { method: 'GET', query: { id: a.id } })).status, 405)
    assert.equal((await adminCall('account-credit', { method: 'PATCH', body: {} })).status, 405)
  })
})

describe('reading accounts', () => {
  test('the list: search, level, status and pending filters; counts; never a hash', async () => {
    const bulk = await open({ name: 'Bulky Buyer', company: 'Acme Haulage', level: 'bulk' })
    await open({ name: 'Plain Person', company: '', level: 'customer' })
    const pending = (await signUp({ name: 'Pending Pete', requestedLevel: 'wholesaler' })).id
    await adminCall('account-status', { body: { id: bulk.id, status: 'suspended' } })

    const all = await adminCall('accounts', { method: 'GET' })
    assert.equal(all.json.accounts.length, 3)
    assert.deepEqual(all.json.counts, { all: 3, pending: 1, suspended: 1 })
    assert.equal(all.json.accounts[0].id, pending, 'accounts waiting for approval come first')
    for (const a of all.json.accounts) {
      assert.equal('passwordHash' in a, false)
      assert.equal('tokenVersion' in a, false)
      assert.equal(typeof a.hasPassword, 'boolean')
    }
    const q = async (query: Record<string, string>) => (await adminCall('accounts', { method: 'GET', query })).json.accounts.map((a: Json) => a.id)
    assert.deepEqual(await q({ q: 'acme' }), [bulk.id])
    assert.deepEqual(await q({ q: 'ACME HAUL' }), [bulk.id])
    assert.deepEqual(await q({ level: 'bulk' }), [bulk.id])
    assert.deepEqual(await q({ status: 'suspended' }), [bulk.id])
    assert.deepEqual(await q({ pending: '1' }), [pending])
    assert.deepEqual(await q({ q: '%' }), [], 'a percent sign is text, not a wildcard')
    assert.deepEqual(await q({ q: "'; DROP TABLE customer_accounts; --" }), [])
    assert.equal((await adminCall('accounts', { method: 'GET', query: { level: 'gold' } })).status, 400)
    assert.equal((await adminCall('accounts', { method: 'GET', query: { status: 'gone' } })).status, 400)
    assert.equal((await repo.listAccounts()).length, 3, 'the table is still there')
  })

  test('one account: details, special prices, and the counter customer with its balance', async () => {
    const a = await open({ company: 'Detail Co', phone: '0400 111 222' })
    await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT, price: 123.456 }] } })
    const r = await adminCall('account', { method: 'GET', query: { id: a.id as string } })
    assert.equal(r.status, 200)
    assert.equal(r.json.account.id, a.id)
    assert.deepEqual(r.json.prices.map((p: Json) => [p.productId, p.price, p.updatedBy]), [[PRODUCT, 123.46, 'owner']])
    assert.equal(r.json.posCustomer.company, 'Detail Co')
    assert.deepEqual(r.json.posCustomer.balance, { due: 0, overdue: 0, count: 0 })
    assert.equal(r.json.canEditCredit, true)
    const sales = await adminCall('account', { method: 'GET', query: { id: a.id as string }, token: await staffToken('sales') })
    assert.equal(sales.json.canEditCredit, false, 'sales see the account but are told they cannot change credit')
    assert.equal((await adminCall('account', { method: 'GET', query: { id: 'ca_nonexistent' } })).status, 404)
    assert.equal((await adminCall('account', { method: 'GET' })).status, 404)
  })
})

describe('changing accounts', () => {
  test('create: validates everything', async () => {
    const good = { email: newEmail(), name: 'Good Name', level: 'customer' }
    const cases: Array<[Json, RegExp]> = [
      [{ email: 'nope' }, /email/i],
      [{ name: '' }, /name/i],
      [{ level: 'gold' }, /level/],
      [{ level: undefined }, /level/],
      [{ discountPct: 61 }, /0 to 60/],
      [{ discountPct: -1 }, /0 to 60/],
      [{ discountPct: 'lots' }, /0 to 60/],
      [{ phone: '12' }, /phone/i],
      [{ abn: '1234' }, /ABN/],
      [{ notes: 'n'.repeat(2001) }, /Notes/],
    ]
    for (const [override, message] of cases) {
      const r = await adminCall('account-create', { body: { ...good, ...override } })
      assert.equal(r.status, 400, JSON.stringify(override))
      assert.match(r.json.error, message)
    }
    assert.equal((await repo.listAccounts()).length, 0)
    assert.equal((await store.listPosCustomers()).length, 0)
    assert.equal((await adminCall('account-create', { body: 'x' as never })).status, 400)
  })

  test('create ignores fields staff cannot set here (pay later, credit, status, password)', async () => {
    const r = await adminCall('account-create', { body: { email: newEmail(), name: 'Plain', level: 'wholesaler', payLater: true, creditLimit: 5000, status: 'suspended', password: PASSWORD, outstanding: 99, emailVerified: true } })
    const a = r.json.account
    assert.equal(a.payLater, false)
    assert.equal(a.creditLimit, 0)
    assert.equal(a.status, 'active')
    assert.equal(a.hasPassword, false)
    assert.equal(a.outstanding, 0)
    assert.equal(a.emailVerified, false)
  })

  test('update: details, email (unique, signs the customer out), notes', async () => {
    const made = await signUp()
    const other = await signUp()
    const r = await adminCall('account-update', { body: { id: made.id, name: 'Renamed Person', company: 'Renamed Co', phone: '0400 000 111', abn: '11 222 333 444', address: 'New Address', notes: 'VIP' } })
    assert.equal(r.status, 200)
    assert.equal(r.json.account.company, 'Renamed Co')
    assert.equal(r.json.account.notes, 'VIP')
    assert.equal((await account('me', { cookie: made.cookie })).status, 200, 'a details change does not sign anyone out')

    assert.equal((await adminCall('account-update', { body: { id: made.id, email: other.email.toUpperCase() } })).status, 409)
    assert.equal((await adminCall('account-update', { body: { id: made.id, email: 'nope' } })).status, 400)
    assert.equal((await adminCall('account-update', { body: { id: made.id, name: '' } })).status, 400)
    const moved = await adminCall('account-update', { body: { id: made.id, email: newEmail('moved') } })
    assert.equal(moved.status, 200)
    assert.equal(moved.json.account.emailVerified, false)
    assert.equal((await account('me', { cookie: made.cookie })).status, 401, 'a new sign-in name ends old sessions')
    assert.equal((await adminCall('account-update', { body: { id: 'ca_missing', name: 'X' } })).status, 404)
  })

  test('level: sets level and discount, validates both, settles a matching request', async () => {
    const s = await signUp({ requestedLevel: 'wholesaler' })
    const r = await adminCall('account-level', { body: { id: s.id, level: 'wholesaler', discountPct: 12.345 } })
    assert.equal(r.json.account.level, 'wholesaler')
    assert.equal(r.json.account.discountPct, 12.35)
    assert.equal(r.json.account.requestedLevel, null)
    assert.equal(r.json.account.approvedBy, 'owner')
    const keep = await signUp({ requestedLevel: 'wholesaler' })
    const k = await adminCall('account-level', { body: { id: keep.id, level: 'bulk', discountPct: 0 } })
    assert.equal(k.json.account.requestedLevel, 'wholesaler', 'a different level leaves the request open')
    for (const body of [{ level: 'gold', discountPct: 1 }, { level: 'bulk', discountPct: 60.01 }, { level: 'bulk', discountPct: -5 }, { level: 'bulk' }, { level: 'bulk', discountPct: 'x' }]) {
      assert.equal((await adminCall('account-level', { body: { id: s.id, ...body } })).status, 400, JSON.stringify(body))
    }
    assert.equal((await adminCall('account-level', { body: { id: s.id, level: 'bulk', discountPct: 60 } })).status, 200)
    assert.equal((await repo.getAccount(s.id))!.discountPct, 60)
  })

  test('request: approve moves the level and emails; reject clears it and emails; none waiting is a 409', async () => {
    const a = await signUp({ requestedLevel: 'bulk' })
    const approved = await adminCall('account-request', { body: { id: a.id, decision: 'approve' } })
    assert.equal(approved.json.account.level, 'bulk')
    assert.equal(approved.json.account.requestedLevel, null)
    assert.equal(lastMailTo(a.email)!.subject, 'Your Spartan Tyres account is approved')
    assert.equal((await adminCall('account-request', { body: { id: a.id, decision: 'approve' } })).status, 409)

    const b = await signUp({ requestedLevel: 'wholesaler' })
    const rejected = await adminCall('account-request', { body: { id: b.id, decision: 'reject' } })
    assert.equal(rejected.json.account.level, 'customer')
    assert.equal(rejected.json.account.requestedLevel, null)
    assert.equal(lastMailTo(b.email)!.subject, 'About your Spartan Tyres account request')
    assert.match(lastMailTo(b.email)!.text, /not able to offer/)
    assert.equal((await adminCall('account-request', { body: { id: b.id, decision: 'maybe' } })).status, 400)
  })

  test('prices: set, replace, remove, validate (product must exist, price > 0 and <= 100000), all or nothing', async () => {
    const a = await open()
    const set = await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT, price: 250 }, { productId: PRODUCT_2, price: '300.5' }] } })
    assert.equal(set.status, 200)
    assert.deepEqual(set.json.prices.map((p: Json) => [p.productId, p.price]).sort(), [[PRODUCT, 250], [PRODUCT_2, 300.5]].sort())
    await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT, price: 275 }, { productId: PRODUCT_2, price: null }] } })
    assert.deepEqual((await repo.listPrices(a.id as string)).map((p) => [p.productId, p.price]), [[PRODUCT, 275]])
    assert.equal((await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: 'ghost-product-1', price: null }] } })).status, 200, 'removing something already gone is fine')

    const bad: Array<[Json[], string]> = [
      [[{ productId: 'no-such-tyre', price: 10 }], 'unknown product'],
      [[{ productId: PRODUCT, price: 0 }], 'zero'],
      [[{ productId: PRODUCT, price: -1 }], 'negative'],
      [[{ productId: PRODUCT, price: 100000.01 }], 'too high'],
      [[{ productId: PRODUCT, price: 'abc' }], 'text'],
      [[{ productId: PRODUCT, price: Number.NaN }], 'NaN'],
      [[{ productId: PRODUCT }], 'missing price'],
      [[{ price: 5 }], 'missing product'],
      [[{ productId: PRODUCT, price: 5 }, { productId: PRODUCT, price: 6 }], 'twice'],
      [[], 'empty'],
    ]
    for (const [prices, why] of bad) {
      const r = await adminCall('account-prices', { body: { id: a.id, prices } })
      assert.equal(r.status, 400, why)
    }
    assert.equal((await adminCall('account-prices', { body: { id: a.id, prices: 'x' } })).status, 400)
    assert.equal((await adminCall('account-prices', { body: { id: a.id, prices: Array.from({ length: 501 }, (_, i) => ({ productId: `p${i}`, price: 1 })) } })).status, 400)
    // One bad line anywhere stops the whole batch.
    const mixed = await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT_2, price: 50 }, { productId: 'no-such-tyre', price: 5 }] } })
    assert.equal(mixed.status, 400)
    assert.deepEqual((await repo.listPrices(a.id as string)).map((p) => p.productId), [PRODUCT])
    assert.equal((await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT, price: 100000 }] } })).status, 200)
  })

  test('credit (owner and manager): validates, saves, keeps the counter customer\'s terms in step', async () => {
    const a = await open()
    const r = await adminCall('account-credit', { body: { id: a.id, payLater: true, termsDays: 45, creditLimit: 12000.555 } })
    assert.equal(r.status, 200)
    assert.equal(r.json.account.payLater, true)
    assert.equal(r.json.account.termsDays, 45)
    assert.equal(r.json.account.creditLimit, 12000.56)
    assert.equal((await store.getPosCustomer((await repo.getAccount(a.id as string))!.posCustomerId!))!.termsDays, 45)
    const manager = await staffToken('manager')
    assert.equal((await adminCall('account-credit', { token: manager, body: { id: a.id, payLater: false, termsDays: 14, creditLimit: 0 } })).status, 200)
    for (const body of [
      { payLater: 'yes', termsDays: 14, creditLimit: 0 },
      { payLater: true, termsDays: 121, creditLimit: 0 },
      { payLater: true, termsDays: -1, creditLimit: 0 },
      { payLater: true, termsDays: 14.5, creditLimit: 0 },
      { payLater: true, termsDays: '14', creditLimit: 0 },
      { payLater: true, termsDays: 14, creditLimit: -1 },
      { payLater: true, termsDays: 14, creditLimit: 10_000_001 },
      { payLater: true, termsDays: 14, creditLimit: 'lots' },
      { payLater: true, termsDays: 14 },
    ]) {
      assert.equal((await adminCall('account-credit', { body: { id: a.id, ...body } })).status, 400, JSON.stringify(body))
    }
  })

  test('status: suspending ends sessions and cancels waiting links; reactivating restores sign-in', async () => {
    const s = await signUp()
    await account('forgot', { body: { email: s.email } })
    const link = (await adminCall('account-invite', { body: { id: s.id } })).json
    assert.ok(link.account)
    const r = await adminCall('account-status', { body: { id: s.id, status: 'suspended' } })
    assert.equal(r.json.account.status, 'suspended')
    assert.equal((await account('me', { cookie: s.cookie })).status, 401)
    assert.equal((await adminCall('account-invite', { body: { id: s.id } })).status, 409, 'no links for a suspended account')
    const token = (await (await import('../api/_lib/accounts/schema.js')).getAccountsDb()).query(`SELECT 1 FROM customer_tokens WHERE used_at IS NULL`)
    assert.equal((await token).length, 0, 'every waiting link was cancelled')
    assert.equal((await adminCall('account-status', { body: { id: s.id, status: 'active' } })).json.account.status, 'active')
    assert.equal((await account('login', { body: { email: s.email, password: PASSWORD } })).status, 200)
    assert.equal((await adminCall('account-status', { body: { id: s.id, status: 'gone' } })).status, 400)
  })

  test('unknown ids are 404 on every account action', async () => {
    for (const [action, extra] of [
      ['account-update', { name: 'X Y' }],
      ['account-level', { level: 'bulk', discountPct: 0 }],
      ['account-request', { decision: 'approve' }],
      ['account-prices', { prices: [{ productId: PRODUCT, price: 5 }] }],
      ['account-credit', { payLater: false, termsDays: 14, creditLimit: 0 }],
      ['account-invite', {}],
      ['account-status', { status: 'suspended' }],
    ] as const) {
      assert.equal((await adminCall(action, { body: { id: 'ca_doesnotexist0000000', ...extra } })).status, 404, action)
      assert.equal((await adminCall(action, { body: { ...extra } })).status, 404, `${action} without an id`)
    }
  })

  test('every change is written to the activity log, naming the person, with no secrets', async () => {
    const a = await open({ company: 'Logged Co' })
    await adminCall('account-update', { body: { id: a.id, notes: 'x' } })
    await adminCall('account-level', { body: { id: a.id, level: 'wholesaler', discountPct: 10 } })
    await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT, price: 99 }] } })
    await adminCall('account-credit', { body: { id: a.id, payLater: true, termsDays: 30, creditLimit: 100 } })
    await adminCall('account-invite', { body: { id: a.id } })
    await adminCall('account-status', { body: { id: a.id, status: 'suspended' } })
    await adminCall('account-status', { body: { id: a.id, status: 'active' } })
    const sally = await staffToken('sales')
    await adminCall('account-update', { token: sally, body: { id: a.id, notes: 'by sales' } })
    const log = await store.listAudit()
    const actions = new Set(log.map((e) => e.action))
    for (const expected of ['account.create', 'account.update', 'account.level', 'account.prices', 'account.credit', 'account.invite', 'account.suspend', 'account.activate']) {
      assert.ok(actions.has(expected), expected)
    }
    assert.ok(log.some((e) => e.action === 'account.update' && e.actorName === 'Test sales'))
    const text = JSON.stringify(log)
    assert.equal(/token=|scrypt|https?:/i.test(text), false, 'the log never holds a link or a hash')
  })
})

describe('the link to the till', () => {
  const posCustomer = (over: Partial<Awaited<ReturnType<typeof store.getPosCustomer>> & object> = {}) => ({
    id: 'till-1',
    name: 'Terry Till',
    company: 'Till Haulage',
    email: 'till.customer@buyer.example.test',
    phone: '',
    address: '',
    notes: 'Pays by cash',
    termsDays: 21,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'Sam',
    ...over,
  })

  test('an existing counter customer with the same email is linked (kept, blanks filled), not duplicated', async () => {
    await store.savePosCustomer(posCustomer())
    const r = await adminCall('account-create', { body: { email: 'Till.Customer@buyer.example.test', name: 'Terry T', phone: '0400 777 888', address: '5 Account Rd', level: 'bulk' } })
    assert.equal(r.status, 200)
    const customers = await store.listPosCustomers()
    assert.equal(customers.length, 1)
    const linked = customers[0]!
    assert.equal(linked.id, 'till-1')
    assert.equal(linked.accountId, r.json.account.id)
    assert.equal(linked.name, 'Terry Till', 'the till\'s own name stays')
    assert.equal(linked.notes, 'Pays by cash')
    assert.equal(linked.termsDays, 21)
    assert.equal(linked.phone, '0400 777 888', 'a blank is filled from the account')
    assert.equal(linked.address, '5 Account Rd')
    assert.equal(r.json.account.posCustomerId, 'till-1')
    const a = (await repo.getAccount(r.json.account.id))!
    assert.equal(a.termsDays, 21, 'the account takes the till\'s terms')
    assert.equal(a.company, 'Till Haulage', 'and fills its blank company from the till')
  })

  test('later changes never empty a till detail or change its terms (credit, details, the customer\'s own edit)', async () => {
    await store.savePosCustomer(posCustomer({ phone: '02 9000 0000', address: '9 Till St', termsDays: 30 }))
    const r = await adminCall('account-create', { body: { email: 'till.customer@buyer.example.test', name: 'Bob', level: 'wholesaler' } })
    assert.equal(r.status, 200, JSON.stringify(r.json))
    const id = r.json.account.id as string
    await adminCall('account-credit', { body: { id, payLater: true, termsDays: 30, creditLimit: 1000 } })
    await adminCall('account-update', { body: { id, notes: 'checked' } })
    let till = (await store.getPosCustomer('till-1'))!
    assert.deepEqual([till.company, till.phone, till.address, till.termsDays], ['Till Haulage', '02 9000 0000', '9 Till St', 30])

    // The customer clears their phone and address in My account: the till keeps what it had.
    const token = /token=([A-Za-z0-9_-]+)/.exec(r.json.inviteLink as string)![1]!
    const set = await account('set-password', { body: { token, password: PASSWORD } })
    assert.equal(set.status, 200, JSON.stringify(set.json))
    const saved = await account('details', { cookie: cookieFrom(set), body: { name: 'Bob', company: '', phone: '', address: '' } })
    assert.equal(saved.status, 200, JSON.stringify(saved.json))
    till = (await store.getPosCustomer('till-1'))!
    assert.deepEqual([till.company, till.phone, till.address, till.termsDays], ['Till Haulage', '02 9000 0000', '9 Till St', 30])
  })

  test('a self sign-up never claims a till customer by typing its email: it waits unlinked, and staff see the match', async () => {
    await store.savePosCustomer(posCustomer({ notes: 'Owes $3,000 on account' }))
    const { id, cookie } = await signUp({ email: 'Till.Customer@buyer.example.test', name: 'Someone Else' })
    const a = (await repo.getAccount(id))!
    assert.equal(a.posCustomerId, null, 'not linked on an unproven email')
    const till = (await store.getPosCustomer('till-1'))!
    assert.equal(till.accountId, undefined, 'the till customer is untouched')
    assert.equal(till.name, 'Terry Till')
    assert.equal((await store.listPosCustomers()).length, 1, 'and no duplicate is made')
    const me = await account('me', { cookie })
    assert.equal(JSON.stringify(me.json).includes('till-1'), false)
    assert.equal(JSON.stringify(me.json).includes('Owes'), false)

    const seen = await adminCall('account', { query: { id } })
    assert.equal(seen.json.posCustomer, null)
    assert.deepEqual(seen.json.posMatch, { id: 'till-1', name: 'Terry Till', company: 'Till Haulage', email: 'till.customer@buyer.example.test' })
  })

  test('the unproven sign-up is linked once the customer opens a link sent to that email', async () => {
    await store.savePosCustomer(posCustomer())
    const { id, email } = await signUp({ email: 'till.customer@buyer.example.test' })
    mailer.clearDevOutbox()
    await account('forgot', { body: { email } })
    const token = (/token=([A-Za-z0-9_-]+)/.exec(lastMailTo(email)!.text) ?? [])[1]!
    const set = await account('set-password', { body: { token, password: 'a-proven-password' } })
    assert.equal(set.status, 200)
    assert.equal((await repo.getAccount(id))!.posCustomerId, 'till-1')
    assert.equal((await store.getPosCustomer('till-1'))!.accountId, id)
    assert.equal((await store.listPosCustomers()).length, 1)
  })

  test('staff can link the waiting sign-up from the account page, once', async () => {
    await store.savePosCustomer(posCustomer())
    const { id } = await signUp({ email: 'till.customer@buyer.example.test' })
    const sales = await staffToken('sales')
    const linked = await adminCall('account-link-pos', { token: sales, body: { id } })
    assert.equal(linked.status, 200, JSON.stringify(linked.json))
    assert.equal(linked.json.account.posCustomerId, 'till-1')
    assert.equal((await store.getPosCustomer('till-1'))!.accountId, id)
    assert.equal((await adminCall('account', { query: { id } })).json.posMatch, null)
    assert.equal((await adminCall('account-link-pos', { body: { id } })).status, 409)
    assert.ok((await store.listAudit()).some((e) => e.action === 'account.link' && e.actorName === 'Test sales'))
  })

  test('a self sign-up with no matching till customer still gets its own at once', async () => {
    await store.savePosCustomer(posCustomer())
    const { id } = await signUp({ email: newEmail('own') })
    const a = (await repo.getAccount(id))!
    assert.ok(a.posCustomerId)
    assert.notEqual(a.posCustomerId, 'till-1')
    assert.equal((await store.getPosCustomer('till-1'))!.accountId, undefined)
  })

  test('a counter customer already linked to an account is never taken by another', async () => {
    await store.savePosCustomer(posCustomer({ accountId: 'ca_someoneelse00000000' }))
    const r = await adminCall('account-create', { body: { email: 'till.customer@buyer.example.test', name: 'Other Terry', level: 'bulk' } })
    assert.equal(r.status, 200)
    const customers = await store.listPosCustomers()
    assert.equal(customers.length, 2)
    assert.notEqual(r.json.account.posCustomerId, 'till-1')
    assert.equal((await store.getPosCustomer('till-1'))!.accountId, 'ca_someoneelse00000000')
  })

  test('with no match a counter customer is created from the account', async () => {
    const r = await adminCall('account-create', { body: { email: newEmail(), name: 'New Person', company: 'New Co', phone: '0400 000 000', address: '1 Road', level: 'wholesaler' } })
    const pos = (await store.getPosCustomer(r.json.account.posCustomerId))!
    assert.equal(pos.accountId, r.json.account.id)
    assert.equal(pos.company, 'New Co')
    assert.equal(pos.termsDays, 14)
    assert.equal(pos.createdBy, 'owner')
  })

  test('the counter customer follows the account (staff edits, the customer\'s own edits, terms)', async () => {
    const a = await open({ company: 'Follow Co' })
    const posId = a.posCustomerId as string
    await adminCall('account-update', { body: { id: a.id, name: 'Followed Name', company: 'Followed Co', phone: '0400 123 123', address: 'Elsewhere' } })
    let pos = (await store.getPosCustomer(posId))!
    assert.deepEqual([pos.name, pos.company, pos.phone, pos.address], ['Followed Name', 'Followed Co', '0400 123 123', 'Elsewhere'])
    const moved = newEmail('followed')
    await adminCall('account-update', { body: { id: a.id, email: moved } })
    assert.equal((await store.getPosCustomer(posId))!.email, moved)
    await adminCall('account-credit', { body: { id: a.id, payLater: true, termsDays: 60, creditLimit: 500 } })
    pos = (await store.getPosCustomer(posId))!
    assert.equal(pos.termsDays, 60)
    assert.equal(pos.accountId, a.id)
  })

  test('a linked counter customer cannot be deleted from the till; an unlinked one still can', async () => {
    const a = await open({ company: 'Keep Me Co' })
    const blocked = await adminCall('pos', { body: { action: 'customer-delete', id: a.posCustomerId } })
    assert.equal(blocked.status, 409)
    assert.match(blocked.json.error, /website account/)
    assert.ok(await store.getPosCustomer(a.posCustomerId as string))
    await store.savePosCustomer(posCustomer({ id: 'free-1', email: 'free@buyer.example.test' }))
    const free = await adminCall('pos', { body: { action: 'customer-delete', id: 'free-1' } })
    assert.equal(free.status, 200)
    assert.equal(await store.getPosCustomer('free-1'), null)
  })

  test('saving a linked customer at the till keeps the link, and the till cannot create or move a link', async () => {
    const a = await open({ company: 'Till Edit Co' })
    const posId = a.posCustomerId as string
    const edit = await adminCall('pos', { body: { action: 'customer-save', customer: { id: posId, name: 'Edited At Till', company: 'Till Edit Co', email: a.email, termsDays: 30, accountId: 'ca_hijack000000000000' } } })
    assert.equal(edit.status, 200)
    const pos = (await store.getPosCustomer(posId))!
    assert.equal(pos.name, 'Edited At Till')
    assert.equal(pos.accountId, a.id, 'the link survives a till edit and cannot be re-pointed')
    const made = await adminCall('pos', { body: { action: 'customer-save', customer: { name: 'Brand New', accountId: a.id } } })
    assert.equal(made.status, 200)
    assert.equal('accountId' in made.json.customer, false, 'a till cannot link a customer to an account')
  })

  test('customers who have no account behave exactly as before', async () => {
    const made = await adminCall('pos', { body: { action: 'customer-save', customer: { name: 'Walk In', company: 'Walk In Co', email: 'walkin@buyer.example.test' } } })
    assert.equal(made.status, 200)
    assert.deepEqual(Object.keys(made.json.customer).sort(), ['address', 'company', 'createdAt', 'createdBy', 'email', 'id', 'name', 'notes', 'phone', 'termsDays', 'updatedAt'])
    const listed = await adminCall('pos', { method: 'GET', query: { view: 'customers' } })
    assert.equal(listed.status, 200)
  })
})

describe('nothing sensitive reaches the public site', () => {
  test('/api/inventory and the bundle know nothing of accounts or private prices', async () => {
    const a = await open()
    await adminCall('account-prices', { body: { id: a.id, prices: [{ productId: PRODUCT, price: 1.23 }] } })
    const { default: inventory } = await import('../api/inventory.js')
    let body = ''
    await inventory(
      { method: 'GET', query: {}, headers: {} },
      { status() { return this }, setHeader() {}, json(b: unknown) { body = JSON.stringify(b) }, end() {} } as never,
    )
    assert.ok(body.length > 0)
    assert.equal(body.includes('1.23'), false)
    assert.equal(/customer_prices|specialPrice|accountPrice|ca_[a-z2-7]{20}/.test(body), false)
    assert.equal(answered.length > 0, true)
  })
})

void cookieFrom
void mailer
