/**
 * The customer accounts tables, in the shared Postgres (see `api/_lib/db.ts`). Idempotent, run once
 * per process before the first accounts query.
 *
 * `outstanding` is what the customer owes on account (pay later). It goes up in one guarded UPDATE
 * when an on-account sale is accepted (`reserveCredit`, repo.ts), down when an account payment is
 * applied, and `reconcileOutstanding` (credit.ts) can always recompute it from the till's open account
 * tickets. `last_reserved_at` lets that repair step leave a sale that is still being recorded alone.
 * Money is `numeric(12,2)` in dollars, GST included, like every price on the site.
 */
import { getDb, type Db, type Schema } from '../db.js'

export const LEVELS = ['customer', 'bulk', 'wholesaler'] as const
export type AccountLevel = (typeof LEVELS)[number]
export const STATUSES = ['active', 'suspended'] as const
export type AccountStatus = (typeof STATUSES)[number]

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS customer_accounts (
     id               text PRIMARY KEY,
     email            text NOT NULL,
     name             text NOT NULL DEFAULT '',
     company          text NOT NULL DEFAULT '',
     phone            text NOT NULL DEFAULT '',
     abn              text NOT NULL DEFAULT '',
     address          text NOT NULL DEFAULT '',
     level            text NOT NULL DEFAULT 'customer' CHECK (level IN ('customer', 'bulk', 'wholesaler')),
     requested_level  text CHECK (requested_level IS NULL OR requested_level IN ('bulk', 'wholesaler')),
     status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
     email_verified   boolean NOT NULL DEFAULT false,
     discount_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 60),
     pay_later        boolean NOT NULL DEFAULT false,
     terms_days       integer NOT NULL DEFAULT 14 CHECK (terms_days >= 0 AND terms_days <= 120),
     credit_limit     numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0 AND credit_limit <= 10000000),
     outstanding      numeric(12,2) NOT NULL DEFAULT 0,
     password_hash    text,
     token_version    integer NOT NULL DEFAULT 0,
     pos_customer_id  text,
     notes            text NOT NULL DEFAULT '',
     created_by       text NOT NULL DEFAULT '',
     approved_by      text,
     approved_at      timestamptz,
     last_login_at    timestamptz,
     created_at       timestamptz NOT NULL DEFAULT now(),
     updated_at       timestamptz NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS last_reserved_at timestamptz`,
  // When an owner or manager first set pay later for the account. Until then the till works as it
  // always did for the linked counter customer (see reserveForSale in pos.ts).
  `ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS credit_set_at timestamptz`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customer_accounts_email_idx ON customer_accounts (lower(email))`,
  `CREATE INDEX IF NOT EXISTS customer_accounts_pos_idx ON customer_accounts (pos_customer_id)`,
  `CREATE TABLE IF NOT EXISTS customer_prices (
     account_id text NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
     product_id text NOT NULL,
     price      numeric(12,2) NOT NULL CHECK (price > 0 AND price <= 100000),
     updated_by text NOT NULL DEFAULT '',
     updated_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (account_id, product_id)
   )`,
  `CREATE TABLE IF NOT EXISTS customer_tokens (
     token_hash text PRIMARY KEY,
     account_id text NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
     purpose    text NOT NULL CHECK (purpose IN ('invite', 'reset')),
     expires_at timestamptz NOT NULL,
     used_at    timestamptz,
     created_by text NOT NULL DEFAULT '',
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS customer_tokens_account_idx ON customer_tokens (account_id)`,
  // One row per pay-later checkout attempt, so a double click or a retried request is one order.
  `CREATE TABLE IF NOT EXISTS customer_order_keys (
     account_id text NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
     key        text NOT NULL,
     order_id   text,
     reference  text,
     total      numeric(12,2),
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (account_id, key)
   )`,
]

export const ACCOUNTS_SCHEMA: Schema = { name: 'accounts', statements: STATEMENTS }

/** The shared database with the accounts tables in place. */
export function getAccountsDb(): Promise<Db> {
  return getDb(ACCOUNTS_SCHEMA)
}
