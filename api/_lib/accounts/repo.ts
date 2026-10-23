/**
 * Reading and writing customer accounts. Every value reaches SQL as a parameter. A
 * password hash and the token version live only in `AccountRecord`; what leaves the server goes
 * through `customerView` (the customer's own account) or `staffView` (the admin screens), neither of
 * which has them.
 */
import { createHash, randomBytes } from 'node:crypto'
import { num, type Statement } from '../db.js'
import { getAccountsDb, type AccountLevel, type AccountStatus } from './schema.js'

export interface AccountRecord {
  id: string
  email: string
  name: string
  company: string
  phone: string
  abn: string
  address: string
  level: AccountLevel
  requestedLevel: 'bulk' | 'wholesaler' | null
  status: AccountStatus
  emailVerified: boolean
  discountPct: number
  payLater: boolean
  termsDays: number
  creditLimit: number
  outstanding: number
  passwordHash: string | null
  tokenVersion: number
  posCustomerId: string | null
  notes: string
  createdBy: string
  approvedBy: string | null
  approvedAt: string | null
  lastLoginAt: string | null
  /** When an owner or manager first set pay later; null = never (the till then works as before). */
  creditSetAt: string | null
  createdAt: string
  updatedAt: string
}

type Row = Record<string, unknown>

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string | number | Date).toISOString())

function toRecord(r: Row): AccountRecord {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name ?? ''),
    company: String(r.company ?? ''),
    phone: String(r.phone ?? ''),
    abn: String(r.abn ?? ''),
    address: String(r.address ?? ''),
    level: r.level as AccountLevel,
    requestedLevel: (r.requested_level as AccountRecord['requestedLevel']) ?? null,
    status: r.status as AccountStatus,
    emailVerified: r.email_verified === true,
    discountPct: num(r.discount_pct),
    payLater: r.pay_later === true,
    termsDays: num(r.terms_days),
    creditLimit: num(r.credit_limit),
    outstanding: num(r.outstanding),
    passwordHash: (r.password_hash as string | null) ?? null,
    tokenVersion: num(r.token_version),
    posCustomerId: (r.pos_customer_id as string | null) ?? null,
    notes: String(r.notes ?? ''),
    createdBy: String(r.created_by ?? ''),
    approvedBy: (r.approved_by as string | null) ?? null,
    approvedAt: iso(r.approved_at),
    lastLoginAt: iso(r.last_login_at),
    creditSetAt: iso(r.credit_set_at),
    createdAt: iso(r.created_at) ?? '',
    updatedAt: iso(r.updated_at) ?? '',
  }
}

/* ------------------------------------------------------------------ *
 * What may leave the server
 * ------------------------------------------------------------------ */

/** The customer's own account, as `GET /api/account/me` returns it. */
export function customerView(a: AccountRecord) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    company: a.company,
    phone: a.phone,
    abn: a.abn,
    address: a.address,
    level: a.level,
    requestedLevel: a.requestedLevel,
    status: a.status,
    discountPct: a.discountPct,
    payLater: a.payLater,
    termsDays: a.termsDays,
    creditLimit: a.creditLimit,
    outstanding: a.outstanding,
    emailVerified: a.emailVerified,
    // Whether an order on account can go through now (on, active and linked to its till customer).
    // Only the yes/no: nothing about the till customer itself.
    payLaterReady: a.payLater && a.status === 'active' && a.posCustomerId !== null,
  }
}

/** An account for the admin screens: everything except the hash and the token version. */
export function staffView(a: AccountRecord) {
  const { passwordHash, tokenVersion, ...rest } = a
  return { ...rest, hasPassword: Boolean(passwordHash) }
}

/* ------------------------------------------------------------------ *
 * Ids and tokens
 * ------------------------------------------------------------------ */

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** `ca_` + 20 random base32 characters (5 bits each, no modulo bias). */
export function newAccountId(): string {
  const bytes = randomBytes(20)
  let out = ''
  for (const b of bytes) out += BASE32[b & 31]
  return `ca_${out}`
}

export const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

export const normaliseEmail = (email: string): string => email.trim().toLowerCase()

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export async function getAccount(id: string): Promise<AccountRecord | null> {
  if (!id) return null
  const rows = await (await getAccountsDb()).query<Row>(`SELECT * FROM customer_accounts WHERE id = $1::text`, [id])
  return rows[0] ? toRecord(rows[0]) : null
}

export async function findAccountByEmail(email: string): Promise<AccountRecord | null> {
  const needle = normaliseEmail(email)
  if (!needle) return null
  const rows = await (await getAccountsDb()).query<Row>(
    `SELECT * FROM customer_accounts WHERE lower(email) = $1::text`,
    [needle],
  )
  return rows[0] ? toRecord(rows[0]) : null
}

export interface AccountFilter {
  q?: string
  level?: AccountLevel
  status?: AccountStatus
  /** Only accounts waiting for a level to be approved. */
  pending?: boolean
}

export async function listAccounts(filter: AccountFilter = {}): Promise<AccountRecord[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.level) {
    params.push(filter.level)
    where.push(`level = $${params.length}::text`)
  }
  if (filter.status) {
    params.push(filter.status)
    where.push(`status = $${params.length}::text`)
  }
  if (filter.pending) where.push(`requested_level IS NOT NULL`)
  if (filter.q) {
    params.push(`%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`).toLowerCase()}%`)
    const p = `$${params.length}::text`
    where.push(
      `(lower(name) LIKE ${p} OR lower(company) LIKE ${p} OR lower(email) LIKE ${p} OR lower(phone) LIKE ${p} OR lower(abn) LIKE ${p})`,
    )
  }
  const rows = await (await getAccountsDb()).query<Row>(
    `SELECT * FROM customer_accounts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (requested_level IS NOT NULL) DESC, lower(coalesce(nullif(company, ''), name)), id`,
    params,
  )
  return rows.map(toRecord)
}

/** Columns a caller may set, by their camelCase name. Anything else is ignored. */
const COLUMNS = {
  email: 'email',
  name: 'name',
  company: 'company',
  phone: 'phone',
  abn: 'abn',
  address: 'address',
  level: 'level',
  requestedLevel: 'requested_level',
  status: 'status',
  emailVerified: 'email_verified',
  discountPct: 'discount_pct',
  payLater: 'pay_later',
  termsDays: 'terms_days',
  creditLimit: 'credit_limit',
  passwordHash: 'password_hash',
  posCustomerId: 'pos_customer_id',
  notes: 'notes',
  approvedBy: 'approved_by',
  approvedAt: 'approved_at',
  lastLoginAt: 'last_login_at',
  creditSetAt: 'credit_set_at',
} as const

export type AccountPatch = Partial<{ [K in keyof typeof COLUMNS]: AccountRecord[K] }> & { bumpTokenVersion?: boolean }

/** `UPDATE ... RETURNING *` for the given fields (and `updated_at`). */
export function updateStatement(id: string, patch: AccountPatch): Statement {
  const sets: string[] = []
  const params: unknown[] = [id]
  for (const [key, column] of Object.entries(COLUMNS)) {
    if (!(key in patch)) continue
    params.push((patch as Record<string, unknown>)[key])
    sets.push(`${column} = $${params.length}`)
  }
  if (patch.bumpTokenVersion) sets.push(`token_version = token_version + 1`)
  sets.push(`updated_at = now()`)
  return { text: `UPDATE customer_accounts SET ${sets.join(', ')} WHERE id = $1::text RETURNING *`, params }
}

/** Null when there is no such account. */
export async function updateAccount(id: string, patch: AccountPatch): Promise<AccountRecord | null> {
  const s = updateStatement(id, patch)
  const rows = await (await getAccountsDb()).query<Row>(s.text, s.params)
  return rows[0] ? toRecord(rows[0]) : null
}

export interface NewAccount {
  email: string
  name: string
  company?: string
  phone?: string
  abn?: string
  address?: string
  level?: AccountLevel
  requestedLevel?: 'bulk' | 'wholesaler' | null
  discountPct?: number
  termsDays?: number
  passwordHash?: string | null
  emailVerified?: boolean
  notes?: string
  createdBy: string
  /** Set when staff made the account (and chose its level); null for a self sign-up. */
  approvedBy?: string | null
}

/** Inserts an account. Null if the email is already taken (the unique index decides, so two at once cannot both win). */
export async function insertAccount(input: NewAccount): Promise<AccountRecord | null> {
  const db = await getAccountsDb()
  const rows = await db.query<Row>(
    `INSERT INTO customer_accounts
       (id, email, name, company, phone, abn, address, level, requested_level, discount_pct, terms_days,
        password_hash, email_verified, notes, created_by, approved_by, approved_at)
     VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::text, $10::numeric,
        $11::int, $12::text, $13::boolean, $14::text, $15::text, $16::text, CASE WHEN $16::text IS NULL THEN NULL ELSE now() END)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      newAccountId(),
      normaliseEmail(input.email),
      input.name,
      input.company ?? '',
      input.phone ?? '',
      input.abn ?? '',
      input.address ?? '',
      input.level ?? 'customer',
      input.requestedLevel ?? null,
      input.discountPct ?? 0,
      input.termsDays ?? 14,
      input.passwordHash ?? null,
      input.emailVerified ?? false,
      input.notes ?? '',
      input.createdBy,
      input.approvedBy ?? null,
    ],
  )
  return rows[0] ? toRecord(rows[0]) : null
}

/* ------------------------------------------------------------------ *
 * Special prices
 * ------------------------------------------------------------------ */

export interface SpecialPrice {
  productId: string
  price: number
  updatedBy: string
  updatedAt: string
}

export async function listPrices(accountId: string): Promise<SpecialPrice[]> {
  const rows = await (await getAccountsDb()).query<Row>(
    `SELECT product_id, price, updated_by, updated_at FROM customer_prices WHERE account_id = $1::text ORDER BY product_id`,
    [accountId],
  )
  return rows.map((r) => ({
    productId: String(r.product_id),
    price: num(r.price),
    updatedBy: String(r.updated_by ?? ''),
    updatedAt: iso(r.updated_at) ?? '',
  }))
}

/** Sets or removes (`price: null`) special prices, all or nothing. */
export async function applyPrices(
  accountId: string,
  changes: Array<{ productId: string; price: number | null }>,
  by: string,
): Promise<void> {
  if (!changes.length) return
  const statements: Statement[] = changes.map((c) =>
    c.price === null
      ? { text: `DELETE FROM customer_prices WHERE account_id = $1::text AND product_id = $2::text`, params: [accountId, c.productId] }
      : {
          text: `INSERT INTO customer_prices (account_id, product_id, price, updated_by) VALUES ($1::text, $2::text, $3::numeric, $4::text)
                 ON CONFLICT (account_id, product_id) DO UPDATE SET price = EXCLUDED.price, updated_by = EXCLUDED.updated_by, updated_at = now()`,
          params: [accountId, c.productId, c.price, by],
        },
  )
  await (await getAccountsDb()).transaction(statements)
}

/* ------------------------------------------------------------------ *
 * Credit (pay later)
 * ------------------------------------------------------------------ */

/**
 * Takes `amount` of the account's credit for an on-account sale, in ONE guarded UPDATE: the sale is only
 * accepted if, at the moment of the update, the account is active, may pay later, is linked to its till
 * customer, and `outstanding + amount` is within the limit. Two orders at once cannot both pass, because
 * the second UPDATE sees the first one's new `outstanding`. Returns the new outstanding, or null when
 * the credit was refused (the caller then reads the account to say why).
 */
export async function reserveCredit(accountId: string, amount: number): Promise<number | null> {
  const rows = await (await getAccountsDb()).query<Row>(
    `UPDATE customer_accounts
        SET outstanding = outstanding + $2::numeric, last_reserved_at = now(), updated_at = now()
      WHERE id = $1::text AND status = 'active' AND pay_later AND pos_customer_id IS NOT NULL
        AND outstanding + $2::numeric <= credit_limit
      RETURNING outstanding`,
    [accountId, amount],
  )
  return rows[0] ? num(rows[0].outstanding) : null
}

/**
 * Adds a till sale on account to what is owed WITHOUT a limit check: only for an account whose pay
 * later has never been set, where the till keeps working as it always did for that customer.
 */
export async function addOutstanding(accountId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return
  await (await getAccountsDb()).query(
    `UPDATE customer_accounts SET outstanding = outstanding + $2::numeric, last_reserved_at = now(), updated_at = now() WHERE id = $1::text`,
    [accountId, amount],
  )
}

/** Gives credit back (a sale that failed after `reserveCredit`, or a payment received). Never below zero. */
export async function releaseCredit(accountId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return
  await (await getAccountsDb()).query(
    `UPDATE customer_accounts SET outstanding = GREATEST(outstanding - $2::numeric, 0), last_reserved_at = now(), updated_at = now()
      WHERE id = $1::text`,
    [accountId, amount],
  )
}

/**
 * Says "credit is about to move" BEFORE a payment or a cancel changes the till tickets, so a repair
 * (`settleOutstanding`) that reads the tickets in between waits instead of setting a figure the
 * following `releaseCredit` would then take the same amount off again.
 */
export async function markCreditMoving(accountId: string): Promise<void> {
  await (await getAccountsDb()).query(`UPDATE customer_accounts SET last_reserved_at = now() WHERE id = $1::text`, [accountId])
}

/**
 * Sets `outstanding` to `to`, but only if it still holds `from` and no credit moved (a sale, a payment, a
 * cancel) in the last `settleSeconds`: the tickets and the figure may be between the two steps of it.
 * Returns true if it changed.
 */
export async function settleOutstanding(accountId: string, from: number, to: number, settleSeconds: number): Promise<boolean> {
  const rows = await (await getAccountsDb()).query<Row>(
    `UPDATE customer_accounts SET outstanding = $3::numeric, updated_at = now()
      WHERE id = $1::text AND outstanding = $2::numeric
        AND (last_reserved_at IS NULL OR last_reserved_at < now() - make_interval(secs => $4::int))
      RETURNING id`,
    [accountId, from, to, settleSeconds],
  )
  return rows.length === 1
}

/* ------------------------------------------------------------------ *
 * Pay-later checkout attempts (idempotency)
 * ------------------------------------------------------------------ */

export type OrderKeyState =
  | { state: 'claimed' }
  | { state: 'done'; orderId: string; reference: string; total: number }
  | { state: 'busy' }

/** An attempt that never finished (a crashed request) can be taken over after this long. */
const ORDER_KEY_STALE_SECONDS = 600

/**
 * The first caller with a key gets `claimed`; a repeat of a finished attempt gets the original order
 * back (`done`); a repeat while the first is still running gets `busy`.
 */
export async function claimOrderKey(accountId: string, key: string): Promise<OrderKeyState> {
  const db = await getAccountsDb()
  for (let attempt = 0; attempt < 2; attempt++) {
    const inserted = await db.query<Row>(
      `INSERT INTO customer_order_keys (account_id, key) VALUES ($1::text, $2::text) ON CONFLICT DO NOTHING RETURNING key`,
      [accountId, key],
    )
    if (inserted.length) return { state: 'claimed' }
    const rows = await db.query<Row>(
      `SELECT order_id, reference, total, created_at < now() - make_interval(secs => $3::int) AS stale
         FROM customer_order_keys WHERE account_id = $1::text AND key = $2::text`,
      [accountId, key, ORDER_KEY_STALE_SECONDS],
    )
    const row = rows[0]
    if (!row) continue
    if (row.order_id) return { state: 'done', orderId: String(row.order_id), reference: String(row.reference ?? ''), total: num(row.total) }
    if (row.stale !== true) return { state: 'busy' }
    await db.query(`DELETE FROM customer_order_keys WHERE account_id = $1::text AND key = $2::text AND order_id IS NULL`, [accountId, key])
  }
  return { state: 'busy' }
}

export async function finishOrderKey(accountId: string, key: string, orderId: string, reference: string, total: number): Promise<void> {
  await (await getAccountsDb()).query(
    `UPDATE customer_order_keys SET order_id = $3::text, reference = $4::text, total = $5::numeric WHERE account_id = $1::text AND key = $2::text`,
    [accountId, key, orderId, reference, total],
  )
}

/** Forgets an attempt that failed, so the customer can try again with the same key. */
export async function dropOrderKey(accountId: string, key: string): Promise<void> {
  await (await getAccountsDb()).query(
    `DELETE FROM customer_order_keys WHERE account_id = $1::text AND key = $2::text AND order_id IS NULL`,
    [accountId, key],
  )
}

/* ------------------------------------------------------------------ *
 * Single-use links (invite, reset)
 * ------------------------------------------------------------------ */

export type TokenPurpose = 'invite' | 'reset'

/** Invite links last 7 days, reset links 1 hour. */
export const TOKEN_TTL_SECONDS: Record<TokenPurpose, number> = { invite: 7 * 86400, reset: 3600 }

/**
 * Makes a link token: 32 random bytes, of which only the SHA-256 is stored. Earlier unused tokens of
 * the same account are retired, so only the newest link works. Returns the raw token (shown once).
 */
export async function createToken(accountId: string, purpose: TokenPurpose, by: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url')
  await (await getAccountsDb()).transaction([
    { text: `UPDATE customer_tokens SET used_at = now() WHERE account_id = $1::text AND used_at IS NULL`, params: [accountId] },
    {
      text: `INSERT INTO customer_tokens (token_hash, account_id, purpose, expires_at, created_by)
             VALUES ($1::text, $2::text, $3::text, now() + make_interval(secs => $4::int), $5::text)`,
      params: [sha256Hex(raw), accountId, purpose, TOKEN_TTL_SECONDS[purpose], by],
    },
  ])
  return raw
}

/**
 * Uses a token up, once. One statement, so two requests with the same link cannot both win. Only a
 * token that exists, is unused, is unexpired and belongs to an ACTIVE account is consumed.
 */
export async function consumeToken(raw: string): Promise<{ accountId: string; purpose: TokenPurpose } | null> {
  if (!raw || raw.length > 200) return null
  const rows = await (await getAccountsDb()).query<Row>(
    `UPDATE customer_tokens t SET used_at = now()
       FROM customer_accounts a
      WHERE t.token_hash = $1::text AND t.account_id = a.id AND a.status = 'active'
        AND t.used_at IS NULL AND t.expires_at > now()
      RETURNING t.account_id, t.purpose`,
    [sha256Hex(raw)],
  )
  return rows[0] ? { accountId: String(rows[0].account_id), purpose: rows[0].purpose as TokenPurpose } : null
}

/**
 * The account a token would open, without using it up, so a password refused for that account (the
 * same as its email) keeps the link. The same conditions as `consumeToken`, which still decides.
 */
export async function peekToken(raw: string): Promise<string | null> {
  if (!raw || raw.length > 200) return null
  const rows = await (await getAccountsDb()).query<Row>(
    `SELECT t.account_id FROM customer_tokens t JOIN customer_accounts a ON a.id = t.account_id
      WHERE t.token_hash = $1::text AND a.status = 'active' AND t.used_at IS NULL AND t.expires_at > now()`,
    [sha256Hex(raw)],
  )
  return rows[0] ? String(rows[0].account_id) : null
}

/** Retires every unused link of an account (when it is suspended, or its email changes). */
export async function retireTokens(accountId: string): Promise<void> {
  await (await getAccountsDb()).query(`UPDATE customer_tokens SET used_at = now() WHERE account_id = $1::text AND used_at IS NULL`, [accountId])
}

/** Removes an account and, by cascade, its special prices and links. Only for undoing a half-made account. */
export async function deleteAccount(id: string): Promise<void> {
  await (await getAccountsDb()).query(`DELETE FROM customer_accounts WHERE id = $1::text`, [id])
}

export async function countAccounts(): Promise<{ all: number; pending: number; suspended: number }> {
  const rows = await (await getAccountsDb()).query<Row>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE requested_level IS NOT NULL) AS pending,
            count(*) FILTER (WHERE status = 'suspended') AS suspended
       FROM customer_accounts`,
  )
  return { all: num(rows[0]?.total), pending: num(rows[0]?.pending), suspended: num(rows[0]?.suspended) }
}
