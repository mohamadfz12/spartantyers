/**
 * One customer, two doors. Every customer account is linked to a counter (POS) customer, so the till
 * and the website see the same person: `StoredPosCustomer.accountId` and `account.posCustomerId`.
 * The till's own account machinery (tickets on account, payments, balances) keeps working on that
 * counter customer; nothing about how it prices or sells changes here.
 */
import { randomUUID } from 'node:crypto'
import { getPosCustomer, listPosCustomers, savePosCustomer, type StoredPosCustomer } from '../store.js'
import { updateAccount, type AccountRecord } from './repo.js'

type Linkable = Pick<AccountRecord, 'id' | 'email' | 'name' | 'company' | 'phone' | 'address' | 'termsDays'>

/** A counter customer with this email that no account has linked yet, if there is one. */
export function unlinkedMatch(customers: StoredPosCustomer[], email: string): StoredPosCustomer | undefined {
  const wanted = email.trim().toLowerCase()
  return wanted ? customers.find((c) => !c.accountId && c.email.trim().toLowerCase() === wanted) : undefined
}

/**
 * The counter customer for this account: an existing one with the same email and no account yet is
 * linked (its own details are kept; blanks are filled from the account), otherwise a new one is
 * created. Returns the counter customer's id.
 *
 * `claimExisting: false` is for a self sign-up, whose email nobody has proven yet: an existing
 * counter customer carries a real business's balance and history, so it is never handed to whoever
 * typed its email. Then, when one matches, nothing is linked (null) until the customer opens a link
 * sent to that email (set-password) or staff link it from the account page.
 */
export async function linkPosCustomer(
  account: Linkable,
  by: string,
  options: { claimExisting: boolean },
): Promise<string | null> {
  const email = account.email.trim().toLowerCase()
  const now = new Date().toISOString()

  const customers = await listPosCustomers()
  const own = customers.find((c) => c.accountId === account.id)
  if (own) return own.id

  const match = unlinkedMatch(customers, email)
  if (match && !options.claimExisting) return null
  if (match) {
    await savePosCustomer({
      ...match,
      accountId: account.id,
      name: match.name || account.name,
      company: match.company || account.company,
      phone: match.phone || account.phone,
      address: match.address || account.address,
      updatedAt: now,
    })
    // The account takes what the till already knew: its blanks are filled from the till record, and the
    // till's payment terms become the account's, so a later sync never changes the till's terms or
    // empties a detail the till had.
    await updateAccount(account.id, {
      termsDays: match.termsDays,
      ...(!account.company && match.company ? { company: match.company } : {}),
      ...(!account.phone && match.phone ? { phone: match.phone } : {}),
      ...(!account.address && match.address ? { address: match.address } : {}),
    })
    return match.id
  }

  const created: StoredPosCustomer = {
    id: randomUUID(),
    name: account.name || account.company,
    company: account.company,
    email,
    phone: account.phone,
    address: account.address,
    notes: '',
    termsDays: account.termsDays,
    accountId: account.id,
    createdAt: now,
    updatedAt: now,
    createdBy: by,
  }
  await savePosCustomer(created)
  return created.id
}

/**
 * Copies the account's details onto its counter customer (name, company, email, phone, address, terms).
 * A blank on the account never empties a detail the till has. No-op when none is linked.
 */
export async function syncPosCustomer(account: Linkable & { posCustomerId: string | null }): Promise<void> {
  if (!account.posCustomerId) return
  const c = await getPosCustomer(account.posCustomerId)
  if (!c || c.accountId !== account.id) return
  await savePosCustomer({
    ...c,
    name: account.name || account.company || c.name,
    company: account.company || c.company,
    email: account.email.trim().toLowerCase(),
    phone: account.phone || c.phone,
    address: account.address || c.address,
    termsDays: account.termsDays,
    updatedAt: new Date().toISOString(),
  })
}
