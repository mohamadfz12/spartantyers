/**
 * The shared Postgres connection: one tiny interface (`query`, `transaction`) over two engines.
 * The AI (`api/_lib/ai/db.ts`) and customer accounts (`api/_lib/accounts/schema.ts`) both use it,
 * each with its own idempotent schema.
 *
 *   Production   Neon Postgres over HTTP (`DATABASE_URL` or `POSTGRES_URL`, the same
 *                order `api/_lib/store.ts` uses).
 *   Local/tests  PGlite, real Postgres compiled to WebAssembly, in `./.data/ai-pglite`
 *                (or in memory when `AI_DB_MEMORY=1`). Never on Vercel: without a
 *                Postgres URL there, a feature that needs the database is "not configured".
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

export interface Db {
  /** Rows of one parameterised statement. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>
  /** Several statements, atomically, in order; the rows of each, in the same order. */
  transaction(statements: Statement[]): Promise<Record<string, unknown>[][]>
}

/** One feature's tables: idempotent statements, run once per process under an advisory lock. */
export interface Schema {
  /** Names the once-per-process memo. */
  name: string
  statements: string[]
}

/** Postgres connection string, in the same order as `api/_lib/store.ts`. */
function postgresUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null
}

/** True when there is somewhere to keep these books on this deployment. */
export function dbConfigured(): boolean {
  return !!postgresUrl() || !process.env.VERCEL
}

/* ------------------------------------------------------------------ *
 * Neon (production)
 * ------------------------------------------------------------------ */

let neonClient: { url: string; sql: NeonQueryFunction<false, false> } | null = null

function neonDb(url: string): Db {
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

function pgliteDb(): Db {
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

/** Thrown when there is no database on this deployment (callers answer "not configured"). */
export class DbUnavailable extends Error {
  constructor(message = 'The database is not configured.') {
    super(message)
    this.name = 'DbUnavailable'
  }
}

/** Which database this process is using; a schema is remembered against it. */
function connectionKey(url: string | null): string {
  return url ?? (process.env.AI_DB_MEMORY === '1' ? 'memory' : 'disk')
}

/** Schemas already checked in this process, by `connectionKey|lock`. */
const schemaReady = new Map<string, Promise<void>>()

/**
 * The database with `schema` in place. Each schema is created once per process (a failed attempt is
 * forgotten so one network blip cannot poison an instance until its next cold start).
 */
export async function getDb(schema: Schema, unavailable: () => Error = () => new DbUnavailable()): Promise<Db> {
  const url = postgresUrl()
  if (!url && process.env.VERCEL) throw unavailable()
  const db = url ? neonDb(url) : pgliteDb()
  const key = `${connectionKey(url)}|${schema.name}`
  let ready = schemaReady.get(key)
  if (!ready) {
    ready = ensureSchema(db, schema)
    schemaReady.set(key, ready)
    ready.catch(() => {
      if (schemaReady.get(key) === ready) schemaReady.delete(key)
    })
  }
  await ready
  return db
}

/**
 * Creates a schema's tables if they are missing. Safe to call any number of times, from any number of
 * instances. Every schema takes the same advisory lock, so two features starting at once (or two that
 * share a table) never run their DDL at the same moment.
 */
export async function ensureSchema(db: Db, schema: Schema): Promise<void> {
  await db.transaction([
    { text: `SELECT pg_advisory_xact_lock(hashtext('spartan-schema'))` },
    ...schema.statements.map((text) => ({ text })),
  ])
}

/** Integer columns can arrive as numbers or strings (bigint sums); always read them through this. */
export const num = (value: unknown): number => Number(value ?? 0)

/**
 * Closes the local database and forgets every memoised schema check. For tests, which
 * want a fresh in-memory database; harmless in production (a no-op without PGlite).
 */
export async function closeDb(): Promise<void> {
  schemaReady.clear()
  const open = pglite
  pglite = null
  if (open) await (await open.catch(() => null))?.close()
}
