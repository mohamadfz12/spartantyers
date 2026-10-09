/**
 * Promo codes.
 *
 * Source of truth is `process.env.PROMO_CODES` (JSON) when set, so marketing
 * can rotate codes without a redeploy. The built-in table below is the
 * documented fallback — the endpoint never 503s for a missing env var, because
 * a shop with no promo codes is a perfectly valid shop.
 *
 * `percentOff` is FRACTIONAL (0.1 === 10% off) to match `Promo.percentOff` in
 * `src/store/cart.ts`, which multiplies by it directly.
 */

export interface PromoDefinition {
  code: string
  percentOff: number
  description: string
  /** Minimum tyres in the order for the code to apply. */
  minTyres?: number
}

export interface PromoResolution {
  valid: boolean
  code?: string
  percentOff?: number
  description?: string
  reason?: string
}

const BUILT_IN: PromoDefinition[] = [
  {
    code: 'FLEET10',
    percentOff: 0.1,
    description: '10% off for fleet operators',
  },
  {
    code: 'WELCOME5',
    percentOff: 0.05,
    description: '5% off your first order',
  },
  {
    code: 'BULK15',
    percentOff: 0.15,
    description: '15% off orders of 20 tyres or more',
    minTyres: 20,
  },
  {
    code: 'STEER5',
    percentOff: 0.05,
    description: '5% off steer and all-position tyres',
  },
]

/**
 * Accepts either a JSON array of `PromoDefinition` or an object map of
 * `{ CODE: { percentOff, description, minTyres } }`. A malformed value falls
 * back to the built-in table rather than silently disabling all promos.
 */
function fromEnv(): PromoDefinition[] | null {
  const raw = process.env.PROMO_CODES
  if (!raw || !raw.trim()) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error('[promos] PROMO_CODES is not valid JSON — using built-ins')
    return null
  }

  const entries: Array<Record<string, unknown>> = Array.isArray(parsed)
    ? (parsed as Array<Record<string, unknown>>)
    : parsed && typeof parsed === 'object'
      ? Object.entries(parsed as Record<string, unknown>).map(([code, value]) =>
          value && typeof value === 'object'
            ? { code, ...(value as Record<string, unknown>) }
            : { code, percentOff: value },
        )
      : []

  const table: PromoDefinition[] = []

  for (const entry of entries) {
    const code = typeof entry.code === 'string' ? entry.code.trim() : ''
    const rawPercent = Number(entry.percentOff)
    if (!code || !Number.isFinite(rawPercent) || rawPercent <= 0) continue

    // Tolerate "10" meaning 10% as well as 0.1 — a config mistake that would
    // otherwise hand out a 1000% discount.
    const percentOff = rawPercent > 1 ? rawPercent / 100 : rawPercent
    if (percentOff >= 1) continue

    const minTyres = Number(entry.minTyres)

    table.push({
      code: code.toUpperCase(),
      percentOff,
      description:
        typeof entry.description === 'string' && entry.description.trim()
          ? entry.description.trim()
          : `${Math.round(percentOff * 100)}% off`,
      minTyres:
        Number.isFinite(minTyres) && minTyres > 0 ? Math.floor(minTyres) : undefined,
    })
  }

  return table.length ? table : null
}

export function promoTable(): PromoDefinition[] {
  return fromEnv() ?? BUILT_IN
}

/**
 * Case-insensitive lookup plus eligibility.
 *
 * `tyreCount` is optional because `/api/promo/validate` only receives a code —
 * at that point a minimum-quantity code is reported as valid with its
 * condition spelled out in the description. The real gate is applied at
 * checkout, where `pricing.ts` calls this again with the actual tyre count.
 */
export function resolvePromo(
  code: unknown,
  tyreCount?: number,
): PromoResolution {
  if (typeof code !== 'string' || !code.trim()) {
    return { valid: false, reason: 'Enter a promo code.' }
  }

  const normalised = code.trim().toUpperCase()
  const promo = promoTable().find((entry) => entry.code === normalised)

  if (!promo) {
    return { valid: false, reason: `"${normalised}" is not a valid promo code.` }
  }

  if (
    promo.minTyres != null &&
    typeof tyreCount === 'number' &&
    tyreCount < promo.minTyres
  ) {
    return {
      valid: false,
      code: promo.code,
      reason: `${promo.code} needs at least ${promo.minTyres} tyres — you have ${tyreCount}.`,
    }
  }

  const description =
    promo.minTyres != null && tyreCount == null
      ? `${promo.description} (minimum ${promo.minTyres} tyres)`
      : promo.description

  return {
    valid: true,
    code: promo.code,
    percentOff: promo.percentOff,
    description,
  }
}
