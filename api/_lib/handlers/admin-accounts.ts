/**
 * Customer accounts in the admin panel (routes in api/admin/[action].ts).
 *
 * GET  accounts          ?q=&level=&status=&pending=1   (permission `trade`) -> { accounts, counts }
 * GET  account           ?id=                            (`trade`) -> { account, prices, posCustomer, posMatch, creditAvailable, canEditCredit }
 *                        (works out `outstanding` again from the till first, so the figure shown is the real one)
 * POST account-create    { email, name, company?, phone?, abn?, address?, level, discountPct?, notes? } -> { account, emailSent, inviteLink? }
 * POST account-update    { id, email?, name?, company?, phone?, abn?, address?, notes? }
 * POST account-level     { id, level, discountPct }
 * POST account-request   { id, decision: 'approve' | 'reject' }
 * POST account-prices    { id, prices: [{ productId, price | null }] }
 * POST account-credit    { id, payLater, termsDays, creditLimit }   (`credit` ONLY: owner and manager; 409 to turn pay later ON for an account with no till customer)
 * POST account-reconcile { id }   works out what the account owes from the till's open tickets and fixes the stored figure
 * POST account-invite    { id }                          -> { account, emailSent, inviteLink? }
 * POST account-status    { id, status: 'active' | 'suspended' }
 * POST account-link-pos  { id }   links a sign-up to the till customer that already had its email
 *
 * Password hashes and token versions never leave: every account goes through `staffView`. Every change
 * is written to the activity log.
 */
import { can } from '../../../src/lib/admin-roles.js'
import { audit, optionalText } from '../audit.js'
import { authorize, type Actor } from '../auth.js'
import { sendEmail } from '../email.js'
import { DbUnavailable } from '../db.js'
import { asEmail, asString, fail, methodGuard, ok, queryParam, readBody, round2, safeMessage, type ApiRequest, type ApiResponse } from '../http.js'
import { getProduct } from '../catalogue.js'
import { balanceOf } from '../pos.js'
import { reconcileOutstanding } from '../accounts/credit.js'
import { creditAvailable } from '../accounts/pricing.js'
import { getPosCustomer, listPosCustomers, listPosTickets } from '../store.js'
import { levelDecisionEmail, levelName, siteBase } from '../accounts/emails.js'
import { linkPosCustomer, syncPosCustomer, unlinkedMatch } from '../accounts/pos-link.js'
import {
  applyPrices,
  countAccounts,
  findAccountByEmail,
  getAccount,
  listAccounts,
  listPrices,
  retireTokens,
  staffView,
  updateAccount,
  type AccountRecord,
} from '../accounts/repo.js'
import { LEVELS, STATUSES, type AccountLevel, type AccountStatus } from '../accounts/schema.js'
import { accountsConfigured } from '../accounts/session.js'
import { cleanProfile, issueLink, later, openAccount } from '../accounts/service.js'
import type { Permission } from '../../../src/lib/admin-roles.js'

type Body = Record<string, unknown>
type AdminHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>

const MAX_PRICE_CHANGES = 500
const MAX_PRICE = 100_000

const isLevel = (v: unknown): v is AccountLevel => typeof v === 'string' && (LEVELS as readonly string[]).includes(v)

/** A discount percentage: 0 to 60, two decimals. Null when not a number in range. */
function asPercent(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 60) return null
  return round2(n)
}

/** Dollars from 0 up to `max`, two decimals. Null otherwise. */
function asDollars(value: unknown, max: number): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return null
  return round2(n)
}

/** Wraps a handler: the method, the permission, no-store, and a 503 where accounts cannot run. */
function route(
  methods: string[],
  permission: Permission,
  run: (ctx: { req: ApiRequest; res: ApiResponse; actor: Actor; body: Body }) => Promise<void>,
  options: { needsSessions?: boolean } = {},
): AdminHandler {
  return async (req, res) => {
    if (!methodGuard(req, res, methods)) return
    const actor = await authorize(req, res, permission)
    if (!actor) return
    res.setHeader('Cache-Control', 'private, no-store')

    let body: Body = {}
    if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
      const parsed = readBody<Body>(req)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(res, 400, 'Expected a JSON request body.')
      body = parsed
    }
    if (options.needsSessions && !accountsConfigured()) {
      return fail(res, 503, 'Customer sign-in is not set up on this deployment. Set ADMIN_SESSION_SECRET.')
    }

    try {
      await run({ req, res, actor, body })
    } catch (error) {
      if (error instanceof DbUnavailable) {
        return fail(res, 503, 'Customer accounts need a Postgres database on this deployment (DATABASE_URL).')
      }
      throw error
    }
  }
}

/** The account named by `body.id`, or null after answering 404. */
async function target(res: ApiResponse, id: unknown): Promise<AccountRecord | null> {
  const found = await getAccount(asString(id, 60) ?? '')
  if (!found) fail(res, 404, 'No customer account with that id.')
  return found
}

const label = (a: Pick<AccountRecord, 'company' | 'name'>) => a.company || a.name

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

const accounts = route(['GET'], 'trade', async ({ req, res }) => {
  const level = queryParam(req, 'level')
  const status = queryParam(req, 'status')
  if (level && !isLevel(level)) return fail(res, 400, '"level" must be customer, bulk or wholesaler.')
  if (status && !(STATUSES as readonly string[]).includes(status)) return fail(res, 400, '"status" must be active or suspended.')
  const pending = queryParam(req, 'pending')
  const q = (queryParam(req, 'q') ?? '').trim().slice(0, 100)
  const [list, counts] = await Promise.all([
    listAccounts({
      q: q || undefined,
      level: level as AccountLevel | undefined,
      status: status as AccountStatus | undefined,
      pending: pending === '1' || pending === 'true',
    }),
    countAccounts(),
  ])
  ok(res, { accounts: list.map(staffView), counts })
})

const account = route(['GET'], 'trade', async ({ req, res, actor }) => {
  const first = await target(res, queryParam(req, 'id'))
  if (!first) return
  // What the account owes is kept in step by every sale and payment; looking at it also checks it
  // against the till's own tickets and repairs any difference.
  let found = first
  if (first.posCustomerId) {
    const checked = await reconcileOutstanding(first.id).catch(() => null)
    if (checked?.fixed) found = (await getAccount(first.id)) ?? first
  }
  const [prices, pos, tickets, customers] = await Promise.all([
    listPrices(found.id),
    found.posCustomerId ? getPosCustomer(found.posCustomerId) : Promise.resolve(null),
    found.posCustomerId ? listPosTickets() : Promise.resolve([]),
    found.posCustomerId ? Promise.resolve([]) : listPosCustomers(),
  ])
  // A sign-up left unlinked because a counter customer already had its email: staff can link them.
  const match = found.posCustomerId ? undefined : unlinkedMatch(customers, found.email)
  ok(res, {
    account: staffView(found),
    prices,
    posCustomer: pos
      ? {
          id: pos.id,
          name: pos.name,
          company: pos.company,
          email: pos.email,
          phone: pos.phone,
          address: pos.address,
          termsDays: pos.termsDays,
          balance: balanceOf(pos.id, tickets),
        }
      : null,
    posMatch: match ? { id: match.id, name: match.name, company: match.company, email: match.email } : null,
    creditAvailable: creditAvailable(found),
    canEditCredit: can(actor.role, 'credit'),
  })
})

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

const accountCreate = route(
  ['POST'],
  'trade',
  async ({ req, res, actor, body }) => {
    const email = asEmail(body.email)?.toLowerCase()
    if (!email) return fail(res, 400, 'A valid email address is required.')
    const profile = cleanProfile(body)
    if (!profile.ok) return fail(res, 400, profile.error)
    if (!isLevel(body.level)) return fail(res, 400, '"level" must be customer, bulk or wholesaler.')
    const discountPct = body.discountPct === undefined || body.discountPct === null || body.discountPct === '' ? 0 : asPercent(body.discountPct)
    if (discountPct === null) return fail(res, 400, 'The discount must be a percentage from 0 to 60.')
    const notes = optionalText(body.notes, 2000)
    if (notes === null) return fail(res, 400, 'Notes must be at most 2000 characters.')

    // Staff chose this email for this business, so a counter customer that already has it is linked.
    const created = await openAccount(
      { email, ...profile.value, level: body.level, discountPct, notes, createdBy: actor.id, approvedBy: actor.id, emailVerified: false },
      actor.id,
      { claimExisting: true },
    )
    if (!created) return fail(res, 409, `${email} already has an account.`)

    const link = await issueLink(req, created, 'invite', actor.id)
    await audit(actor, 'account.create', `Opened a ${levelName(created.level)} account for ${label(created)}${link.sent ? ' and emailed the invite' : ' (invite not emailed)'}`)
    ok(res, { account: staffView(created), emailSent: link.sent, ...(link.sent ? {} : { inviteLink: link.link }) })
  },
  { needsSessions: true },
)

const accountUpdate = route(['POST'], 'trade', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  const merged = cleanProfile({ ...found, ...body })
  if (!merged.ok) return fail(res, 400, merged.error)

  let email = found.email
  if (body.email !== undefined) {
    const next = asEmail(body.email)?.toLowerCase()
    if (!next) return fail(res, 400, 'A valid email address is required.')
    if (next !== found.email) {
      const clash = await findAccountByEmail(next)
      if (clash && clash.id !== found.id) return fail(res, 409, `${next} already has an account.`)
      email = next
    }
  }
  let notes = found.notes
  if (body.notes !== undefined) {
    const n = optionalText(body.notes, 2000)
    if (n === null) return fail(res, 400, 'Notes must be at most 2000 characters.')
    notes = n
  }

  const emailChanged = email !== found.email
  let updated: AccountRecord | null
  try {
    // An email change is a new sign-in name: other sessions end and it must be confirmed again.
    updated = await updateAccount(found.id, {
      ...merged.value,
      notes,
      ...(emailChanged ? { email, emailVerified: false, bumpTokenVersion: true } : {}),
    })
  } catch (error) {
    // Two requests changing to the same email at once: the unique index decides.
    if (/customer_accounts_email_idx|duplicate key/i.test(safeMessage(error))) return fail(res, 409, `${email} already has an account.`)
    throw error
  }
  if (!updated) return fail(res, 404, 'No customer account with that id.')
  // A link already sent went to the old address (perhaps a typo): it must not open the account.
  if (emailChanged) await retireTokens(found.id)
  await syncPosCustomer(updated)
  await audit(actor, 'account.update', `Updated the details of ${label(updated)}${emailChanged ? ' (email changed)' : ''}`)
  ok(res, { account: staffView(updated) })
})

const accountLevel = route(['POST'], 'trade', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  if (!isLevel(body.level)) return fail(res, 400, '"level" must be customer, bulk or wholesaler.')
  const discountPct = asPercent(body.discountPct)
  if (discountPct === null) return fail(res, 400, 'The discount must be a percentage from 0 to 60.')
  const updated = await updateAccount(found.id, {
    level: body.level,
    discountPct,
    // Setting the level the customer asked for settles their request.
    ...(found.requestedLevel === body.level ? { requestedLevel: null } : {}),
    ...(body.level !== found.level ? { approvedBy: actor.id, approvedAt: new Date().toISOString() } : {}),
  })
  if (!updated) return fail(res, 404, 'No customer account with that id.')
  await audit(actor, 'account.level', `${label(updated)}: level ${levelName(found.level)} to ${levelName(updated.level)}, discount ${found.discountPct}% to ${updated.discountPct}%`)
  ok(res, { account: staffView(updated) })
})

const accountRequest = route(['POST'], 'trade', async ({ req, res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  if (body.decision !== 'approve' && body.decision !== 'reject') return fail(res, 400, '"decision" must be approve or reject.')
  const asked = found.requestedLevel
  if (!asked) return fail(res, 409, 'This account has no level request waiting.')
  const approve = body.decision === 'approve'
  const updated = await updateAccount(found.id, {
    requestedLevel: null,
    ...(approve ? { level: asked, approvedBy: actor.id, approvedAt: new Date().toISOString() } : {}),
  })
  if (!updated) return fail(res, 404, 'No customer account with that id.')
  await later(sendEmail(levelDecisionEmail(updated, approve, asked, `${siteBase(req)}/account`)))
  await audit(actor, approve ? 'account.approve' : 'account.reject', `${approve ? 'Approved' : 'Declined'} ${levelName(asked)} for ${label(updated)}`)
  ok(res, { account: staffView(updated) })
})

const accountPrices = route(['POST'], 'trade', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  if (!Array.isArray(body.prices) || body.prices.length === 0 || body.prices.length > MAX_PRICE_CHANGES) {
    return fail(res, 400, `"prices" must be a list of 1 to ${MAX_PRICE_CHANGES} changes.`)
  }
  const seen = new Set<string>()
  const changes: Array<{ productId: string; price: number | null }> = []
  for (const raw of body.prices as unknown[]) {
    const item = (raw ?? {}) as Record<string, unknown>
    const productId = asString(item.productId, 200)
    if (!productId) return fail(res, 400, 'Every price needs a productId.')
    if (seen.has(productId)) return fail(res, 400, `${productId} appears twice in the list.`)
    seen.add(productId)
    if (item.price === null) {
      changes.push({ productId, price: null })
      continue
    }
    if (!getProduct(productId)) return fail(res, 400, `${productId} is not a product we sell.`)
    const price = typeof item.price === 'string' && item.price.trim() ? Number(item.price) : item.price
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      return fail(res, 400, `The price for ${productId} must be more than $0 and at most $${MAX_PRICE.toLocaleString('en-AU')}.`)
    }
    changes.push({ productId, price: round2(price) })
  }
  await applyPrices(found.id, changes, actor.id)
  const set = changes.filter((c) => c.price !== null).length
  await audit(actor, 'account.prices', `${label(found)}: ${set} special price${set === 1 ? '' : 's'} set, ${changes.length - set} removed`)
  ok(res, { prices: await listPrices(found.id) })
})

const accountCredit = route(['POST'], 'credit', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  if (typeof body.payLater !== 'boolean') return fail(res, 400, '"payLater" must be true or false.')
  const termsDays = typeof body.termsDays === 'number' && Number.isInteger(body.termsDays) ? body.termsDays : NaN
  if (!(termsDays >= 0 && termsDays <= 120)) return fail(res, 400, 'Payment terms must be a whole number of days from 0 to 120.')
  const creditLimit = asDollars(body.creditLimit, 10_000_000)
  if (creditLimit === null) return fail(res, 400, 'The credit limit must be dollars from $0 to $10,000,000.')
  // Pay later runs through the customer's till record (its balance and payments), so it needs one.
  // Turning it off is always allowed.
  if (body.payLater && !found.posCustomerId) return fail(res, 409, 'Link this account to its till customer first.')
  // From now on the till applies these settings to this customer too (until now it worked as before).
  const updated = await updateAccount(found.id, { payLater: body.payLater, termsDays, creditLimit, creditSetAt: found.creditSetAt ?? new Date().toISOString() })
  if (!updated) return fail(res, 404, 'No customer account with that id.')
  await syncPosCustomer(updated)
  await audit(
    actor,
    'account.credit',
    `${label(updated)}: pay later ${updated.payLater ? 'on' : 'off'}, ${updated.termsDays} days, limit $${updated.creditLimit.toFixed(2)}`,
  )
  ok(res, { account: staffView(updated) })
})

const accountInvite = route(
  ['POST'],
  'trade',
  async ({ req, res, actor, body }) => {
    const found = await target(res, body.id)
    if (!found) return
    if (found.status !== 'active') return fail(res, 409, 'This account is suspended. Activate it before sending a link.')
    // An account that has a password gets a reset link; one that never set one gets an invite.
    const link = await issueLink(req, found, found.passwordHash ? 'reset' : 'invite', actor.id)
    await audit(actor, 'account.invite', `Sent ${label(found)} a ${found.passwordHash ? 'password reset' : 'set-password'} link${link.sent ? '' : ' (not emailed)'}`)
    ok(res, { account: staffView(found), emailSent: link.sent, ...(link.sent ? {} : { inviteLink: link.link }) })
  },
  { needsSessions: true },
)

const accountStatus = route(['POST'], 'trade', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  if (body.status !== 'active' && body.status !== 'suspended') return fail(res, 400, '"status" must be active or suspended.')
  const suspending = body.status === 'suspended'
  // Suspending ends every session now and cancels any link still waiting.
  const updated = await updateAccount(found.id, { status: body.status, ...(suspending ? { bumpTokenVersion: true } : {}) })
  if (!updated) return fail(res, 404, 'No customer account with that id.')
  if (suspending) await retireTokens(found.id)
  await audit(actor, suspending ? 'account.suspend' : 'account.activate', `${suspending ? 'Suspended' : 'Reactivated'} the account of ${label(updated)}`)
  ok(res, { account: staffView(updated) })
})

const accountLinkPos = route(['POST'], 'trade', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  if (found.posCustomerId) return fail(res, 409, 'This account is already linked to a till customer.')
  // Staff have checked this is the same business, so the counter customer with its email is linked
  // (or, when there is none any more, a new one is made).
  const posCustomerId = await linkPosCustomer(found, actor.id, { claimExisting: true })
  let updated = await updateAccount(found.id, { posCustomerId })
  if (!updated) return fail(res, 404, 'No customer account with that id.')
  // The till customer may already owe money: the account starts with the real figure.
  await reconcileOutstanding(found.id, { settleSeconds: 0 })
  updated = (await getAccount(found.id)) ?? updated
  await audit(actor, 'account.link', `Linked the account of ${label(updated)} to its till customer`)
  ok(res, { account: staffView(updated) })
})

const accountReconcile = route(['POST'], 'trade', async ({ res, actor, body }) => {
  const found = await target(res, body.id)
  if (!found) return
  const result = await reconcileOutstanding(found.id)
  const updated = (await getAccount(found.id)) ?? found
  if (result?.fixed) {
    await audit(actor, 'account.reconcile', `${label(updated)}: owed figure corrected from $${found.outstanding.toFixed(2)} to $${updated.outstanding.toFixed(2)}`)
  }
  ok(res, { account: staffView(updated), reconciled: result, creditAvailable: creditAvailable(updated) })
})

/** The admin actions this file serves, by name, for the router in api/admin/[action].ts. */
export const accountRoutes: Record<string, AdminHandler> = {
  accounts,
  account,
  'account-create': accountCreate,
  'account-update': accountUpdate,
  'account-level': accountLevel,
  'account-request': accountRequest,
  'account-prices': accountPrices,
  'account-credit': accountCredit,
  'account-invite': accountInvite,
  'account-status': accountStatus,
  'account-link-pos': accountLinkPos,
  'account-reconcile': accountReconcile,
}
