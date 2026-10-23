import { create } from 'zustand'
import type { AccountPricing } from '@/lib/account-pricing'
import type { AccountPriceMap } from '@/lib/account-price-display'
import { useAccount } from '@/store/account'

/* ------------------------------------------------------------------ *
 * The signed-in customer's own prices, as the browser knows them.
 *
 * Loaded from GET /api/account/prices whenever the account store says someone is signed in, cleared
 * the moment they are not. NEVER persisted (no localStorage): the prices are private, and the session is
 * the httpOnly cookie. `pricing` is the context the shared rule (src/lib/account-pricing.ts) needs to
 * total a cart exactly as the server does.
 * ------------------------------------------------------------------ */

export type PricesStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AccountPricesState {
  status: PricesStatus
  /** Product id to the account's unit price (before volume breaks), only where it beats the shelf price. */
  prices: AccountPriceMap
  /** Null for a guest. */
  pricing: AccountPricing | null
  /** Fetch again (after a catalogue change, or to retry). Does nothing when nobody is signed in. */
  reload: () => Promise<void>
}

const LEVELS = ['customer', 'bulk', 'wholesaler'] as const

/** Reads the endpoint's reply defensively: anything unexpected is an error, never a guess. */
export function parsePricesReply(data: unknown): { prices: AccountPriceMap; pricing: AccountPricing } | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const level = record.level
  if (typeof level !== 'string' || !(LEVELS as readonly string[]).includes(level)) return null
  if (!record.prices || typeof record.prices !== 'object') return null
  const prices: AccountPriceMap = {}
  const special: Record<string, number> = {}
  for (const [id, entry] of Object.entries(record.prices as Record<string, unknown>)) {
    const unit = entry && typeof entry === 'object' ? (entry as { unit?: unknown }).unit : undefined
    if (typeof unit !== 'number' || !Number.isFinite(unit) || unit <= 0) continue
    prices[id] = { unit, basis: 'account' }
    special[id] = unit
  }
  // The context carries the server's finished unit prices as "special" prices and NO percentage. The list holds only
  // the tyres where the account beats the shelf price; a percentage here would re-price every other tyre by the %,
  // including one where a special price above the shelf price took the place of the % (a special always wins).
  return { prices, pricing: { level: level as AccountPricing['level'], discountPct: 0, special } }
}

let ticket = 0

export const useAccountPrices = create<AccountPricesState>()((set) => ({
  status: 'idle',
  prices: {},
  pricing: null,
  async reload() {
    if (!useAccount.getState().me) return
    const mine = ++ticket
    set((s) => (s.status === 'ready' ? s : { status: 'loading' }))
    try {
      const response = await fetch('/api/account/prices', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (mine !== ticket) return
      if (!response.ok) throw new Error(String(response.status))
      const parsed = parsePricesReply(await response.json())
      if (!parsed) throw new Error('bad reply')
      if (mine === ticket) set({ status: 'ready', prices: parsed.prices, pricing: parsed.pricing })
    } catch {
      // Keep nothing half-known: stale prices would total a cart the server will not charge.
      if (mine === ticket) set({ status: 'error', prices: {}, pricing: null })
    }
  },
}))

function clear() {
  ticket++
  useAccountPrices.setState({ status: 'idle', prices: {}, pricing: null })
}

/** What the account store says about who is signed in, boiled down to what changes the prices. */
const keyOf = (me: ReturnType<typeof useAccount.getState>['me']) =>
  me ? `${me.id}|${me.level}|${me.discountPct}|${me.status}` : ''

function sync() {
  if (useAccount.getState().me) void useAccountPrices.getState().reload()
  else clear()
}

useAccount.subscribe((state, previous) => {
  if (keyOf(state.me) !== keyOf(previous.me)) sync()
})
// The account store may already have answered before this module loaded.
if (useAccount.getState().me) sync()

/** For the shop: the signed-in customer's prices, or an empty map for a guest. */
export const useAccountPriceMap = (): AccountPriceMap => useAccountPrices((s) => s.prices)
