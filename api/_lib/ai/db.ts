/**
 * The AI's database: one tiny interface (`query`, `transaction`) over two engines.
 *
 *   Production   Neon Postgres over HTTP (`DATABASE_URL` or `POSTGRES_URL`, the same
 *                order `api/_lib/store.ts` uses).
 *   Local/tests  PGlite, real Postgres compiled to WebAssembly, in `./.data/ai-pglite`
 *                (or in memory when `AI_DB_MEMORY=1`). Never on Vercel: without a
 *                Postgres URL there the AI is simply "not configured".
 *
 * `transaction` takes a fixed list of statements because Neon's HTTP driver cannot
 * hold a transaction open between round trips. Each statement sees what the ones
 * before it wrote, and in READ COMMITTED a statement after a lock sees everything
 * committed before the lock was granted, which is what the spend lock relies on.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

export interface Statement {
  text: string
  params?: unknown[]
}

export interface AiDb {
  /** Rows of one parameterised statement. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
  /** Several statements, atomically, in order; the rows of each, in the same order. */
  transaction(statements: Statement[]): Promise<Record<string, unknown>[][]>
}

/** Postgres connection string, in the same order as `api/_lib/store.ts`. */
function postgresUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null
}

/** True when the AI has somewhere to keep its books on this deployment. */
export function aiDbConfigured(): boolean {
  return !!postgresUrl() || !process.env.VERCEL
}

/* ------------------------------------------------------------------ *
 * Neon (production)
 * ------------------------------------------------------------------ */

let neonClient: { url: string; sql: NeonQueryFunction<false, false> } | null = null

function neonDb(url: string): AiDb {
  // Rebuilt only if the URL changes, which happens between test cases.
  if (!neonClient || neonClient.url !== url) neonClient = { url, sql: neon(url) }
  const sql = neonClient.sql
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[]
    },
    async transaction(statements) {
      const results = await sql.transaction((txn) =>
        statements.map((s) => txn.query(s.text, s.params ?? [])),
      )
      return results as Record<string, unknown>[][]
    },
  }
}

/* ------------------------------------------------------------------ *
 * PGlite (local development and tests)
 * ------------------------------------------------------------------ */

/** The slice of PGlite this file uses. */
interface PgliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
  transaction<T>(fn: (tx: PgliteLike) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Loads a module by a name the file tracer cannot see (see openPglite). */
const loadModule = (name: string) => import(name)

let pglite: Promise<PgliteLike> | null = null

function openPglite(): Promise<PgliteLike> {
  if (!pglite) {
    pglite = (async () => {
      // PGlite is a dev dependency and is never used on Vercel. The module name goes through a
      // function parameter: Vercel's file tracer follows a literal or a constant specifier (it
      // would add PGlite's ~10 MB to every function that imports this file), but it cannot
      // follow a name it only learns when the function is called.
      const { PGlite } = await loadModule('@electric-sql/pglite')
      if (process.env.AI_DB_MEMORY === '1') return new PGlite() as PgliteLike
      const { mkdirSync } = await import('node:fs')
      mkdirSync('./.data', { recursive: true })
      return new PGlite('./.data/ai-pglite') as PgliteLike
    })()
    pglite.catch(() => {
      pglite = null
    })
  }
  return pglite
}

function pgliteDb(): AiDb {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await (await openPglite()).query<T>(text, params)).rows
    },
    async transaction(statements) {
      const db = await openPglite()
      return db.transaction(async (tx) => {
        const out: Record<string, unknown>[][] = []
        for (const s of statements) {
          out.push((await tx.query<Record<string, unknown>>(s.text, s.params ?? [])).rows)
        }
        return out
      })
    },
  }
}

/* ------------------------------------------------------------------ *
 * Public
 * ------------------------------------------------------------------ */

/** Thrown when the AI has no database on this deployment (callers answer "not configured"). */
export class AiDbUnavailable extends Error {
  constructor() {
    super('The AI database is not configured.')
    this.name = 'AiDbUnavailable'
  }
}

let schemaReady: { key: string; ready: Promise<void> } | null = null

/** The AI database with its tables in place. */
export async function getAiDb(): Promise<AiDb> {
  const url = postgresUrl()
  if (!url && process.env.VERCEL) throw new AiDbUnavailable()
  const db = url ? neonDb(url) : pgliteDb()
  const key = url ?? (process.env.AI_DB_MEMORY === '1' ? 'memory' : 'disk')
  if (!schemaReady || schemaReady.key !== key) {
    const ready = ensureAiSchema(db)
    // A failed attempt must not be cached, or one network blip would poison
    // this instance until its next cold start.
    ready.catch(() => {
      if (schemaReady?.ready === ready) schemaReady = null
    })
    schemaReady = { key, ready }
  }
  await schemaReady.ready
  return db
}

/** Integer columns can arrive as numbers or strings (bigint sums); always read them through this. */
export const num = (value: unknown): number => Number(value ?? 0)

/**
 * Closes the local database and forgets the memoised schema check. For tests, which
 * want a fresh in-memory database; harmless in production (a no-op without PGlite).
 */
export async function closeAiDb(): Promise<void> {
  schemaReady = null
  const open = pglite
  pglite = null
  if (open) await (await open.catch(() => null))?.close()
}

/* ------------------------------------------------------------------ *
 * Schema
 *
 * Idempotent, run once per process before the first AI query. The advisory lock
 * makes it safe when several cold starts run it at the same moment. The voice
 * columns exist from the start so adding voice later needs no migration.
 * ------------------------------------------------------------------ */

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_settings (
     id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     data       jsonb NOT NULL DEFAULT '{}'::jsonb,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
     id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     day               text NOT NULL,
     purpose           text NOT NULL,
     model             text NOT NULL,
     ip_hash           text NOT NULL DEFAULT '',
     cost_micros       integer NOT NULL DEFAULT 0,
     status            text NOT NULL DEFAULT 'reserved',
     prompt_tokens     integer NOT NULL DEFAULT 0,
     cached_tokens     integer NOT NULL DEFAULT 0,
     completion_tokens integer NOT NULL DEFAULT 0,
     created_at        timestamptz NOT NULL DEFAULT now(),
     updated_at        timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS ai_usage_day_idx ON ai_usage (day)`,
  `CREATE INDEX IF NOT EXISTS ai_usage_day_ip_idx ON ai_usage (day, ip_hash)`,
  `CREATE TABLE IF NOT EXISTS ai_rate (
     key      text PRIMARY KEY,
     count    integer NOT NULL DEFAULT 0,
     reset_at timestamptz NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS ai_conversations (
     id         text PRIMARY KEY,
     ip_hash    text NOT NULL DEFAULT '',
     started_at timestamptz NOT NULL DEFAULT now(),
     last_at    timestamptz NOT NULL DEFAULT now(),
     turns      integer NOT NULL DEFAULT 0,
     order_ref  text
   )`,
  `CREATE INDEX IF NOT EXISTS ai_conversations_last_idx ON ai_conversations (last_at)`,
  `CREATE TABLE IF NOT EXISTS ai_messages (
     id              bigserial PRIMARY KEY,
     conversation_id text NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
     role            text NOT NULL,
     content         text NOT NULL DEFAULT '',
     meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
     created_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages (conversation_id, id)`,
  `CREATE TABLE IF NOT EXISTS ai_calls (
     id              text PRIMARY KEY,
     conversation_id text NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
     openai_id       text NOT NULL DEFAULT '',
     ip_hash         text NOT NULL DEFAULT '',
     practice        boolean NOT NULL DEFAULT false,
     usage_id        uuid REFERENCES ai_usage (id) ON DELETE SET NULL,
     reserve_micros  integer NOT NULL DEFAULT 0,
     reserved_until  timestamptz,
     status          text NOT NULL DEFAULT 'live',
     started_at      timestamptz NOT NULL DEFAULT now(),
     ends_at         timestamptz NOT NULL,
     ended_at        timestamptz,
     end_reason      text NOT NULL DEFAULT '',
     seconds         integer NOT NULL DEFAULT 0,
     tools           integer NOT NULL DEFAULT 0,
     lines           integer NOT NULL DEFAULT 0,
     opened          boolean NOT NULL DEFAULT false,
     pending         jsonb NOT NULL DEFAULT '{}'::jsonb,
     monitored       boolean NOT NULL DEFAULT false,
     measured        jsonb,
     measured_until  timestamptz,
     reported        jsonb,
     settled         boolean NOT NULL DEFAULT false,
     cost_micros     integer NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS ai_calls_live_idx ON ai_calls (status, ends_at)`,
  `CREATE INDEX IF NOT EXISTS ai_calls_conversation_idx ON ai_calls (conversation_id)`,
]

/** Creates the AI tables if they are missing. Safe to call any number of times, from any number of instances. */
export async function ensureAiSchema(db: AiDb): Promise<void> {
  await db.transaction([
    { text: `SELECT pg_advisory_xact_lock(hashtext('spartan-ai-schema'))` },
    ...SCHEMA.map((text) => ({ text })),
  ])
}
