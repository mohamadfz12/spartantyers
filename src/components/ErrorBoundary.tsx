import { Component, type ErrorInfo, type ReactNode } from 'react'
import { site } from '@/config/site'

interface Props {
  children: ReactNode
  /** Shown instead of the default panel. */
  fallback?: ReactNode
  /** Remounting key — change it to retry after a transient failure. */
  resetKey?: unknown
}

interface State {
  error: Error | null
}

/**
 * Catches render-time errors so one broken section cannot white-screen the
 * whole storefront.
 *
 * Commerce sites fail at the worst moments — a malformed persisted cart, a
 * stale localStorage shape after a deploy, a WebGL driver throwing during a
 * render. Any of those would otherwise leave a blank page with no way to
 * contact the business. This always leaves the phone number on screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No error-reporting service is wired up, so the console is the only
    // signal. Keep the component stack — it is what makes these debuggable.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  private handleReset = () => {
    this.setState({ error: null })
  }

  private handleHardReset = () => {
    // The most likely cause of a persistent crash is a persisted store whose
    // shape no longer matches the code, so offer a clean slate.
    try {
      for (const key of [
        'spartan-cart',
        'spartan-compare',
        'spartan-axle',
        'spartan-recent',
        'spartan-quality',
      ]) {
        window.localStorage.removeItem(key)
      }
    } catch {
      /* private mode — nothing we can do, and nothing that matters */
    }
    window.location.href = '/'
  }

  render() {
    const { error } = this.state

    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] items-center justify-center px-4 py-16"
      >
        <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="font-heading text-xl font-black uppercase tracking-tight">
            Something went wrong
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Sorry — this part of the site hit an unexpected error. Your cart is
            saved. You can try again, or call us and we'll take your order over
            the phone.
          </p>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-md bg-primary px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90"
            >
              Try again
            </button>
            <a
              href={site.phone.href}
              className="rounded-md border border-border bg-background px-5 py-2.5 font-heading text-sm font-bold uppercase tracking-wide transition-colors hover:border-primary hover:text-primary"
            >
              Call {site.phone.display}
            </a>
          </div>

          <p className="mt-6 border-t border-border pt-5 text-xs text-muted-foreground">
            Still stuck?{' '}
            <button
              type="button"
              onClick={this.handleHardReset}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Reset the site and start over
            </button>
            .
          </p>

          {import.meta.env.DEV ? (
            <pre className="mt-5 max-h-48 overflow-auto rounded border border-border bg-muted p-3 text-left text-[0.7rem] leading-relaxed text-muted-foreground">
              {error.stack ?? error.message}
            </pre>
          ) : null}
        </div>
      </div>
    )
  }
}
