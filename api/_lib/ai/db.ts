/**
 * The AI's database. The connection itself (Neon in production, PGlite locally and in tests) is
 * shared with customer accounts and lives in `api/_lib/db.ts`; this file keeps the AI's names
 * for it and the AI's own idempotent schema, so no AI file or test changes.
 */
import {
  closeDb,
  dbConfigured,
  DbUnavailable,
  ensureSchema,
  getDb,
  num,
  type Db,
  type Schema,
  type Statement,
} from '../db.js'

export type { Statement }
export { num }

/** The AI's database handle: the same interface as the shared one. */
export type AiDb = Db

/** True when the AI has somewhere to keep its books on this deployment. */
export const aiDbConfigured = dbConfigured

/** Thrown when the AI has no database on this deployment (callers answer "not configured"). */
export class AiDbUnavailable extends DbUnavailable {
  constructor() {
    super('The AI database is not configured.')
    this.name = 'AiDbUnavailable'
  }
}

/** The AI database with its tables in place. */
export function getAiDb(): Promise<AiDb> {
  return getDb(AI_SCHEMA, () => new AiDbUnavailable())
}

/**
 * Closes the local database and forgets the memoised schema checks. For tests, which
 * want a fresh in-memory database; harmless in production (a no-op without PGlite).
 */
export const closeAiDb = closeDb

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

const AI_SCHEMA: Schema = { name: 'ai', statements: SCHEMA }

/** Creates the AI tables if they are missing. Safe to call any number of times, from any number of instances. */
export function ensureAiSchema(db: AiDb): Promise<void> {
  return ensureSchema(db, AI_SCHEMA)
}
