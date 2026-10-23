/**
 * The signed-in customer for a checkout that anyone may use. Card checkout is open to guests, so a
 * missing, expired, tampered or revoked session is simply "no account", never an error.
 */
import { header, type ApiRequest } from '../http.js'
import type { AccountRecord } from './repo.js'
import { accountsConfigured, COOKIE_NAME, getSessionAccount, parseCookies, readCustomerToken } from './session.js'

export async function optionalSessionAccount(req: ApiRequest): Promise<AccountRecord | null> {
  if (!accountsConfigured()) return null
  const raw = parseCookies(header(req, 'cookie'))[COOKIE_NAME]
  // No cookie, or one that does not verify: a guest, and the database is not touched.
  if (!raw || !readCustomerToken(raw)) return null
  try {
    return await getSessionAccount(req)
  } catch {
    return null
  }
}
