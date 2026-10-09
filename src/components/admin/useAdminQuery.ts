import { useCallback, useEffect, useRef, useState } from 'react'
import { adminToken, handleAdminError, useAdmin } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * useAdminQuery
 *
 * One fetch primitive for every admin page, so all four states —
 * loading, error (retryable), empty and loaded — exist by construction
 * rather than by each page remembering to write them. Failures go
 * through `handleAdminError`, which is what makes 401/403 handling
 * global: a dead token signs the operator out from wherever it is
 * noticed.
 * ------------------------------------------------------------------ */

export interface AdminQuery<T> {
  data: T | null
  loading: boolean
  /** Null when the last load succeeded. */
  error: string | null
  /** True when the API answered 503 — the deployment has no ADMIN_PASSWORD. */
  notConfigured: boolean
  /** Re-runs the fetcher. Wire this to the error state's retry button. */
  reload: () => void
  /**
   * Replaces the cached data locally. Used for optimistic writes; pair every
   * call with a rollback on failure.
   */
  patch: (updater: (previous: T) => T) => void
}

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  notConfigured: boolean
}

export function useAdminQuery<T>(
  /** Stable identity for the request, e.g. `'orders'`. */
  key: string,
  fetcher: (token: string) => Promise<T>,
): AdminQuery<T> {
  const token = useAdmin((s) => s.token)

  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    error: null,
    notConfigured: false,
  })
  const [attempt, setAttempt] = useState(0)

  // The fetcher is almost always an inline arrow, so it is held in a ref and
  // the effect keys off `key` instead. Otherwise every render would refetch.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    const bearer = adminToken()

    // No usable session: the auth gate is about to render the login screen,
    // so there is nothing to load and nothing to report.
    if (!bearer) {
      setState({ data: null, loading: false, error: null, notConfigured: false })
      return
    }

    let active = true
    setState((previous) => ({ ...previous, loading: true, error: null }))

    fetcherRef
      .current(bearer)
      .then((data) => {
        if (!active) return
        setState({ data, loading: false, error: null, notConfigured: false })
      })
      .catch((error: unknown) => {
        const failure = handleAdminError(error)
        if (!active) return
        setState({
          data: null,
          loading: false,
          error: failure.message,
          notConfigured: failure.notConfigured,
        })
      })

    return () => {
      active = false
    }
  }, [key, attempt, token])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const patch = useCallback((updater: (previous: T) => T) => {
    setState((previous) =>
      previous.data === null
        ? previous
        : { ...previous, data: updater(previous.data) },
    )
  }, [])

  return { ...state, reload, patch }
}
