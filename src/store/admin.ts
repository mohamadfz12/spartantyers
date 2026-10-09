import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ApiError, api } from '@/lib/api'

/* ------------------------------------------------------------------ *
 * Admin session
 *
 * The API issues a stateless HMAC bearer token with a hard 12-hour
 * expiry and no refresh (see `api/_lib/auth.ts`). That shapes this
 * store in three ways:
 *
 * 1. The expiry is authoritative and local. We know exactly when the
 *    token dies, so an expired token is treated as "logged out" the
 *    moment it is read — never handed to the API to be rejected.
 * 2. Rehydration prunes. A tab reopened the next morning must land on
 *    the login screen, not flash a dashboard and then 401.
 * 3. The token lives only in the store and in the `Authorization`
 *    header the `api.admin.*` helpers build. It is never put in a URL,
 *    never logged, and never written anywhere else.
 * ------------------------------------------------------------------ */

export const SESSION_EXPIRED_MESSAGE =
  'Your session expired, please sign in again.'

/** Env vars an operator must set before the admin surface works at all. */
export const ADMIN_ENV_VARS = [
  {
    name: 'ADMIN_PASSWORD',
    requirement: 'required',
    detail:
      'The single password this sign-in form checks. Until it is set every /api/admin/* endpoint answers 503 — the admin surface is unconfigured, never open.',
  },
  {
    name: 'ADMIN_SESSION_SECRET',
    requirement: 'recommended',
    detail:
      'HMAC signing key for admin session tokens. If it is unset the key is derived from ADMIN_PASSWORD, so rotating the password signs everyone out.',
  },
  {
    name: 'KV_REST_API_URL',
    requirement: 'recommended',
    detail:
      'Vercel KV / Upstash Redis REST endpoint. Orders, enquiries and price overrides are stored here.',
  },
  {
    name: 'KV_REST_API_TOKEN',
    requirement: 'recommended',
    detail:
      'Paired with KV_REST_API_URL. Without both, storage falls back to a development-only in-memory cache that resets on every cold start.',
  },
] as const

/* ------------------------------------------------------------------ */

interface AdminState {
  /** Raw bearer token for `api.admin.*`. Null when signed out. */
  token: string | null
  /** ISO timestamp from the server. Null when signed out. */
  expiresAt: string | null
  /** True while a login request is in flight. */
  signingIn: boolean
  /** Last sign-in or session failure, shown on the login screen. */
  error: string | null
  /** True when the API answered 503 — `ADMIN_PASSWORD` is not set. */
  notConfigured: boolean

  login: (password: string) => Promise<boolean>
  logout: (reason?: string) => void
  isAuthenticated: () => boolean
  clearError: () => void
}

/** A token with no expiry, an unparseable expiry or a past expiry is dead. */
function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true
  const timestamp = Date.parse(expiresAt)
  if (!Number.isFinite(timestamp)) return true
  return timestamp <= Date.now()
}

export const useAdmin = create<AdminState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      signingIn: false,
      error: null,
      notConfigured: false,

      login: async (password) => {
        set({ signingIn: true, error: null, notConfigured: false })

        try {
          const { token, expiresAt } = await api.admin.login(password)
          set({
            token,
            expiresAt,
            signingIn: false,
            error: null,
            notConfigured: false,
          })
          return true
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 0
          set({
            token: null,
            expiresAt: null,
            signingIn: false,
            // The server writes customer-readable messages ("Incorrect
            // password.", "Admin is not configured…"), so show them as-is.
            error:
              error instanceof Error
                ? error.message
                : 'Sign in failed. Please try again.',
            notConfigured: status === 503,
          })
          return false
        }
      },

      logout: (reason) =>
        set({
          token: null,
          expiresAt: null,
          signingIn: false,
          error: reason ?? null,
          notConfigured: false,
        }),

      isAuthenticated: () => {
        const { token, expiresAt } = get()
        return Boolean(token) && !isExpired(expiresAt)
      },

      clearError: () => set({ error: null, notConfigured: false }),
    }),
    {
      name: 'spartan-admin',
      // Only the credential pair is persisted; transient UI state is not.
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
      }),
      /**
       * Prune on read. `merge` runs during rehydration, before anything can
       * render, so an expired token never reaches a component — which is why
       * the gate in Admin.tsx cannot flash a dashboard behind the login.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AdminState>
        if (!saved.token || isExpired(saved.expiresAt)) {
          return { ...current, token: null, expiresAt: null }
        }
        return {
          ...current,
          token: saved.token,
          expiresAt: saved.expiresAt ?? null,
        }
      },
    },
  ),
)

/* ------------------------------------------------------------------ *
 * Imperative access
 * ------------------------------------------------------------------ */

/**
 * The live token for an `api.admin.*` call, or null when there is no usable
 * session. Checks the expiry on every read so a long-idle tab stops making
 * requests it knows will be rejected.
 */
export function adminToken(): string | null {
  const { token, expiresAt } = useAdmin.getState()
  if (!token || isExpired(expiresAt)) return null
  return token
}

export interface AdminFailure {
  /** HTTP status, or 0 for a network/transport failure. */
  status: number
  message: string
  /** True when the session was ended by this failure (401/403). */
  sessionEnded: boolean
  /** True when the deployment has no `ADMIN_PASSWORD` (503). */
  notConfigured: boolean
}

/**
 * The single place every admin page funnels an `api.admin.*` rejection
 * through. A 401 or 403 means the token is gone or was never valid, so the
 * only correct response is to end the session and say so once — rather than
 * five pages each inventing their own handling.
 */
export function handleAdminError(error: unknown): AdminFailure {
  const status = error instanceof ApiError ? error.status : 0
  const message =
    error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.'

  if (status === 401 || status === 403) {
    useAdmin.getState().logout(SESSION_EXPIRED_MESSAGE)
    return {
      status,
      message: SESSION_EXPIRED_MESSAGE,
      sessionEnded: true,
      notConfigured: false,
    }
  }

  if (status === 503) {
    return { status, message, sessionEnded: false, notConfigured: true }
  }

  return { status, message, sessionEnded: false, notConfigured: false }
}

/* ------------------------------------------------------------------ *
 * Session hook
 * ------------------------------------------------------------------ */

export interface AdminSession {
  authenticated: boolean
  token: string | null
  expiresAt: string | null
  /** Milliseconds until the token dies, floored at 0. */
  msRemaining: number
}

/**
 * Subscribes to the session and arms a timer that signs the operator out the
 * instant the token expires, so an open tab cannot sit on a dead session.
 * The timer is torn down on unmount and re-armed whenever the token changes
 * (including on logout, where there is nothing left to arm).
 */
export function useAdminSession(): AdminSession {
  const token = useAdmin((s) => s.token)
  const expiresAt = useAdmin((s) => s.expiresAt)
  const logout = useAdmin((s) => s.logout)

  useEffect(() => {
    if (!token || !expiresAt) return

    const remaining = Date.parse(expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) {
      logout(SESSION_EXPIRED_MESSAGE)
      return
    }

    const timer = setTimeout(() => logout(SESSION_EXPIRED_MESSAGE), remaining)
    return () => clearTimeout(timer)
  }, [token, expiresAt, logout])

  const remaining = expiresAt ? Date.parse(expiresAt) - Date.now() : 0

  return {
    authenticated: Boolean(token) && !isExpired(expiresAt),
    token,
    expiresAt,
    msRemaining: Number.isFinite(remaining) ? Math.max(remaining, 0) : 0,
  }
}
