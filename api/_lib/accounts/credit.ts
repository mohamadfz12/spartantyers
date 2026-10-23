/**
 * Keeping `outstanding` equal to what the customer really owes. The figure moves with every on-account
 * sale and every account payment (see pos.ts and orders.ts); this recomputes it from the till's open
 * account tickets, the source of truth, and repairs any difference.
 */
import { balanceOf } from '../pos.js'
import { listPosTickets } from '../store.js'
import { getAccount, settleOutstanding } from './repo.js'

export interface Reconciled {
  /** What the till's open account tickets say the customer owes. */
  balance: number
  /** The stored figure after this call. */
  outstanding: number
  /** True when the stored figure was wrong and has been fixed. */
  fixed: boolean
  /** True when a fix was needed but a sale was only just recorded, so it was left for the next look. */
  deferred: boolean
}

/**
 * Recomputes `outstanding` from the linked till customer's open account tickets and fixes it. A sale
 * recorded within the last `settleSeconds` (default 2 minutes) is left alone: its ticket may not exist
 * yet. Null when there is no such account; an account with no till customer owes nothing through the
 * till and is returned as it is.
 */
export async function reconcileOutstanding(accountId: string, options: { settleSeconds?: number } = {}): Promise<Reconciled | null> {
  const account = await getAccount(accountId)
  if (!account) return null
  if (!account.posCustomerId) return { balance: 0, outstanding: account.outstanding, fixed: false, deferred: false }
  const balance = balanceOf(account.posCustomerId, await listPosTickets()).due
  if (balance === account.outstanding) return { balance, outstanding: balance, fixed: false, deferred: false }
  const changed = await settleOutstanding(account.id, account.outstanding, balance, options.settleSeconds ?? 120)
  return changed
    ? { balance, outstanding: balance, fixed: true, deferred: false }
    : { balance, outstanding: (await getAccount(accountId))?.outstanding ?? account.outstanding, fixed: false, deferred: true }
}
