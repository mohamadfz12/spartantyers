/**
 * Small helpers the AI's files share, kept in one place so they cannot drift apart.
 */

/** A jsonb column as an object (the two database engines return it as an object or as text); {} for anything else. */
export const metaOf = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') {
    try {
      return metaOf(JSON.parse(v))
    } catch {
      return {}
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** A number from an environment value, or null when it is unset, blank or not a number of zero or more. */
export const cap = (v: string | undefined): number | null => {
  const x = Number(v)
  return String(v ?? '').trim() !== '' && Number.isFinite(x) && x >= 0 ? x : null
}
