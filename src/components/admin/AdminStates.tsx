import { AlertTriangle, Inbox, RefreshCw, Settings2 } from 'lucide-react'
import { Button, Card, CardContent } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ADMIN_ENV_VARS } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * Shared admin empty / error / unconfigured surfaces
 * ------------------------------------------------------------------ */

/** A titled panel — the admin equivalent of a page section. */
export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  headingLevel = 'h2',
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  headingLevel?: 'h2' | 'h3'
}) {
  const Heading = headingLevel

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5">
        <div className="min-w-0">
          <Heading className="font-heading text-sm font-bold uppercase tracking-brand">
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn('p-4 md:p-5', bodyClassName)}>{children}</div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

export function AdminError({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-4 rounded-lg border border-destructive/40',
        'bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
        />
        <div>
          <p className="font-heading text-sm font-bold uppercase tracking-wide">
            Could not load this data
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function AdminEmpty({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: typeof Inbox
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border',
        'bg-muted/30 px-6 py-12 text-center',
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
      <p className="font-heading text-sm font-bold uppercase tracking-brand">
        {title}
      </p>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * "Admin not configured" — the 503 state
 *
 * This is where a fresh deploy lands, so it is written as setup
 * instructions rather than as an error. The variable names are listed
 * verbatim so they can be copied straight into Vercel.
 * ------------------------------------------------------------------ */

export function AdminNotConfigured({
  message,
  className,
  headingLevel = 'h2',
}: {
  /** The server's own 503 message, shown for context. */
  message?: string
  className?: string
  /**
   * `h1` when this panel *is* the page (the login screen on a fresh
   * deploy), `h2` when it sits inside the admin shell under its title.
   */
  headingLevel?: 'h1' | 'h2'
}) {
  const Heading = headingLevel

  return (
    <Card className={cn('mx-auto w-full max-w-2xl', className)}>
      <CardContent className="p-6 pt-6 md:p-8 md:pt-8">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Settings2 aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <Heading className="font-heading text-lg font-extrabold uppercase leading-tight tracking-tight">
              Admin is not configured yet
            </Heading>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This is the expected state for a fresh deployment. The admin API
              refuses every request until a password exists, so a missing
              environment variable can never leave orders exposed.
            </p>
          </div>
        </div>

        {message ? (
          <p className="mt-5 rounded-md border border-border bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <span className="font-heading font-bold uppercase tracking-brand">
              Server said:{' '}
            </span>
            {message}
          </p>
        ) : null}

        <h3 className="mt-6 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
          Set these in the Vercel project environment
        </h3>

        <dl className="mt-3 flex flex-col gap-3">
          {ADMIN_ENV_VARS.map((variable) => (
            <div
              key={variable.name}
              className="rounded-md border border-border bg-muted/30 p-3.5"
            >
              <dt className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-semibold text-foreground">
                  {variable.name}
                </code>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 font-heading text-[0.625rem] font-bold uppercase tracking-tight',
                    variable.requirement === 'required'
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {variable.requirement}
                </span>
              </dt>
              <dd className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {variable.detail}
              </dd>
            </div>
          ))}
        </dl>

        <ol className="mt-6 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">1.</span> Open the
            Vercel project, then Settings &rarr; Environment Variables.
          </li>
          <li>
            <span className="font-semibold text-foreground">2.</span> Add the
            variables above for every environment you want the admin panel in.
          </li>
          <li>
            <span className="font-semibold text-foreground">3.</span> Redeploy —
            environment changes only reach the serverless functions on a new
            deployment.
          </li>
          <li>
            <span className="font-semibold text-foreground">4.</span> Reload this
            page and sign in with the password you set.
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
