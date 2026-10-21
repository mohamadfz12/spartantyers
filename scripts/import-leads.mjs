/**
 * Loads the NSW lead list into the database behind the admin "Leads" page.
 *
 * The leads are commercially sensitive and the GitHub repository is public,
 * so they are never committed and never bundled into the site. They live in
 * spartan-tyres-leads/ on this machine and in the database — nowhere else.
 *
 *   npm run import:leads                       # spartan-tyres-leads/leads.json
 *   npm run import:leads -- path/to/leads.json
 *   npm run import:leads -- --dry-run          # validate only, write nothing
 *
 * Needs DATABASE_URL (or POSTGRES_URL) for the Neon database, read from .env /
 * .env.local in the project root. Prints counts only, never contact details or
 * credentials.
 *
 * Runs as ONE transaction: the new list replaces the old one completely or not
 * at all, so the admin never sees a half-imported list. Statuses and notes are
 * stored separately (keyed by each lead's stable `key`) and are not touched.
 */

import { neon } from '@neondatabase/serverless'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const file = args.find((a) => !a.startsWith('--')) ?? join(root, 'spartan-tyres-leads', 'leads.json')

/* ---- database url, from the environment or .env files ---- */

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const path = join(root, name)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
}
loadEnv()

/* ---- validate the list ---- */

if (!existsSync(file)) {
  console.error(`No lead file at ${file}. Run build.py in spartan-tyres-leads first.`)
  process.exit(1)
}

const raw = JSON.parse(readFileSync(file, 'utf8'))
if (!Array.isArray(raw) || raw.length === 0) {
  console.error('The lead file must be a non-empty JSON array.')
  process.exit(1)
}

const REGIONS = ['Metro', 'N NSW', 'W NSW', 'S NSW']
const CATEGORIES = ['Transport', 'Truck Tyre Reseller']
const FIELDS = [
  'key', 'name', 'category', 'subtype', 'website', 'description', 'region', 'area', 'city',
  'address', 'phones', 'emails', 'contact_page', 'other_contacts', 'size', 'employees',
  'fleet', 'size_basis', 'source', 'reach', 'priority',
]

const problems = []
const byKey = {}
for (const [i, lead] of raw.entries()) {
  const where = `row ${i + 1} (${lead?.name ?? 'no name'})`
  if (!lead?.key) problems.push(`${where}: no "key" — rebuild with the current build.py`)
  else if (byKey[lead.key]) problems.push(`${where}: duplicate key ${lead.key}`)
  if (!lead?.name) problems.push(`${where}: no name`)
  if (!CATEGORIES.includes(lead?.category)) problems.push(`${where}: bad category "${lead?.category}"`)
  if (!REGIONS.includes(lead?.region)) problems.push(`${where}: bad region "${lead?.region}"`)
  if (lead?.key) {
    const clean = {}
    for (const f of FIELDS) {
      const v = lead[f]
      clean[f] = f === 'phones' || f === 'emails' ? (Array.isArray(v) ? v : []) : (v ?? '')
    }
    byKey[lead.key] = clean
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) in ${file}:`)
  for (const p of problems.slice(0, 20)) console.error('  -', p)
  process.exit(1)
}

const keys = Object.keys(byKey)
const count = (pred) => Object.values(byKey).filter(pred).length
console.log(`${keys.length} leads validated from ${file.replace(root, '.')}`)
console.log(`  Transport ${count((l) => l.category === 'Transport')} · Truck Tyre Reseller ${count((l) => l.category === 'Truck Tyre Reseller')}`)
console.log(`  ${REGIONS.map((r) => `${r} ${count((l) => l.region === r)}`).join(' · ')}`)
console.log(`  with phone ${count((l) => l.phones.length)} · with email ${count((l) => l.emails.length)}`)

if (dryRun) {
  console.log('\n--dry-run: nothing written.')
  process.exit(0)
}

/* ---- write ---- */

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error('\nNo DATABASE_URL / POSTGRES_URL found. Download the env file from Vercel (Settings → Environment Variables) into .env.')
  process.exit(1)
}

const sql = neon(url)
const now = new Date().toISOString()

// The DDL matches api/_lib/store.ts, which creates the same table on first use.
await sql.query(`CREATE TABLE IF NOT EXISTS spartan_store (
  bucket     text        NOT NULL,
  field      text        NOT NULL,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, field)
)`)

const [before] = await sql.query(
  `SELECT count(*)::int AS n FROM spartan_store WHERE bucket = 'spartan:leads'`,
)

await sql.transaction([
  sql.query(
    `INSERT INTO spartan_store (bucket, field, value, updated_at)
     SELECT 'spartan:leads', e.key, e.value, now() FROM jsonb_each($1::jsonb) AS e
     ON CONFLICT (bucket, field) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(byKey)],
  ),
  sql.query(
    `DELETE FROM spartan_store WHERE bucket = 'spartan:leads' AND NOT (field = ANY($1::text[]))`,
    [keys],
  ),
  sql.query(
    `INSERT INTO spartan_store (bucket, field, value, updated_at)
     VALUES ('spartan:meta', 'leads-imported', $1::jsonb, now())
     ON CONFLICT (bucket, field) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ at: now, count: keys.length })],
  ),
])

const [after] = await sql.query(
  `SELECT count(*)::int AS n FROM spartan_store WHERE bucket = 'spartan:leads'`,
)
const [statuses] = await sql.query(
  `SELECT count(*)::int AS n FROM spartan_store WHERE bucket = 'spartan:lead-status'`,
)

console.log(`\n✓ imported: ${before.n} → ${after.n} leads in the database`)
console.log(`  ${statuses.n} saved statuses / notes untouched`)
if (after.n !== keys.length) {
  console.error(`✗ expected ${keys.length} rows after import, found ${after.n}`)
  process.exit(1)
}
