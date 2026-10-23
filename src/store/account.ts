import { create } from 'zustand'
import { accountApi, type CustomerAccount } from '@/lib/account-client'

/* ------------------------------------------------------------------ *
 * The signed-in customer, as the browser knows it.
 *
 * `me` comes from GET /api/account/me when the app starts and again after
 * every sign-in, sign-out or change. It is NEVER persisted: the session is
 * the httpOnly cookie, so nothing about it can be read or copied from here.
 * ------------------------------------------------------------------ */

interface AccountState {
  me: CustomerAccount | null
  /** False until the first check has finished, so pages do not flash "signed out". */
  ready: boolean
  refresh: () => Promise<void>
  setMe: (me: CustomerAccount | null) => void
  logout: () => Promise<void>
}

let ticket = 0

export const useAccount = create<AccountState>()((set) => ({
  me: null,
  ready: false,
  async refresh() {
    const mine = ++ticket
    try {
      const me = await accountApi.me()
      if (mine === ticket) set({ me, ready: true })
    } catch {
      // Offline or the accounts service is down: treat as signed out, never block the shop.
      if (mine === ticket) set({ me: null, ready: true })
    }
  },
  setMe(me) {
    ticket++
    set({ me, ready: true })
  },
  async logout() {
    ticket++
    try {
      await accountApi.logout()
    } catch {
      // The cookie could not be cleared from here; the check below shows the true state.
    }
    set({ me: null, ready: true })
    void useAccount.getState().refresh()
  },
}))
