import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { Seo } from '@/components/Seo'
import { Input, type InputProps } from '@/components/ui'
import { loginPathFor, passwordChecks, safeNext } from '@/lib/account-portal'
import { cn } from '@/lib/utils'
import { useAccount } from '@/store/account'

/* ------------------------------------------------------------------ *
 * Shared furniture for the customer portal pages
 * ------------------------------------------------------------------ */

/** One portal page: a no-index head, the standard section and a heading. */
export function AccountPage({
  title,
  eyebrow = 'My account',
  heading,
  lede,
  width = 'narrow',
  children,
}: {
  /** Browser tab title (no site suffix; it is added here). */
  title: string
  eyebrow?: string
  heading: string
  lede?: React.ReactNode
  width?: 'narrow' | 'wide'
  children: React.ReactNode
}) {
  return (
    <>
      <Seo title={`${title} | Spartan Tyres`} description="Your Spartan Tyres account." noIndex />
      <section className="section-tight border-b border-border bg-card/40 md:py-16">
        <div className={cn('shell', width === 'narrow' ? 'max-w-xl' : 'max-w-4xl')}>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display-3 mt-3 break-words text-foreground">{heading}</h1>
          {lede ? <div className="lede mt-3 text-base sm:text-base">{lede}</div> : null}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </>
  )
}

/** The card every portal form sits in. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-lg border border-border bg-card p-5 md:p-7', className)}>{children}</div>
}

function Pending() {
  return (
    <div className="shell flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <p className="animate-pulse font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">Checking your account</p>
    </div>
  )
}

/** Account pages that need a signed-in customer; others are sent to log in and brought back. */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const ready = useAccount((s) => s.ready)
  const me = useAccount((s) => s.me)
  const location = useLocation()
  if (!ready) return <Pending />
  if (!me) return <Navigate to={loginPathFor(location.pathname + location.search)} replace />
  return <>{children}</>
}

/** Login and sign-up: a customer who is already signed in is sent on (to `next`, or /account). */
export function GuestOnly({ hold = false, children }: { hold?: boolean; children: React.ReactNode }) {
  const ready = useAccount((s) => s.ready)
  const me = useAccount((s) => s.me)
  const [params] = useSearchParams()
  if (!ready) return <Pending />
  if (me && !hold) return <Navigate to={safeNext(params.get('next'))} replace />
  return <>{children}</>
}

/* ------------------------------------------------------------------ *
 * Form plumbing: field errors beside the field, focus on the first one
 * ------------------------------------------------------------------ */

export type FieldErrors = Record<string, string | undefined>

export function useFormErrors() {
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (tick === 0) return
    const form = formRef.current
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>('[data-form-error]')
    target?.focus()
  }, [tick])

  const fail = useCallback((fields: FieldErrors, general = '') => {
    setErrors(fields)
    setFormError(general)
    setTick((n) => n + 1)
  }, [])
  const clear = useCallback(() => {
    setErrors({})
    setFormError('')
  }, [])
  const clearField = useCallback((name: string) => {
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current))
  }, [])

  return { formRef, errors, formError, fail, clear, clearField }
}

/** A form-level problem (wrong password, too many attempts, offline). */
export function FormAlert({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      tabIndex={-1}
      data-form-error
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning'; title?: string; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'info' ? undefined : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-md border p-4 text-sm leading-relaxed',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10',
        tone === 'warning' && 'border-amber-500/40 bg-amber-500/10',
        tone === 'info' && 'border-primary/30 bg-primary/[0.07]',
      )}
    >
      {tone === 'success' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : null}
      <div className="min-w-0">
        {title ? <p className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">{title}</p> : null}
        <div className={cn('text-muted-foreground', title && 'mt-1')}>{children}</div>
      </div>
    </div>
  )
}

/** A password box with a show/hide button. `Field` wires its aria attributes onto the input itself. */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput({ className, ...props }, ref) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={shown ? 'text' : 'password'} className={cn('pr-12', className)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  )
})

/**
 * The password rules, ticking off as the customer types. Built from spans with list roles because
 * `Field` puts its hint inside a <p>, where a real <ul> is not allowed.
 */
export function PasswordRules({ password, email, id }: { password: string; email?: string; id?: string }) {
  const checks = passwordChecks(password, email)
  return (
    <span id={id} role="list" className="flex flex-col gap-1 text-xs text-muted-foreground" aria-label="Password rules">
      {checks.map((check) => (
        <span role="listitem" key={check.id} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn('inline-block h-2 w-2 shrink-0 rounded-full border', check.ok ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground/50')}
          />
          <span className={cn(check.ok && 'text-foreground')}>
            {check.label}
            <span className="sr-only">{check.ok ? ' (done)' : ' (not yet)'}</span>
          </span>
        </span>
      ))}
    </span>
  )
}

export function BackLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="link-underline text-sm font-semibold text-primary">
      {children}
    </Link>
  )
}
