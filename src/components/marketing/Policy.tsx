import type { ReactNode } from 'react'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Shared furniture for the policy pages (/privacy, /terms, /shipping,
 * /returns) — a sticky contents list, consistently styled sections,
 * and the registered entity block that has to appear verbatim.
 * ------------------------------------------------------------------ */

export const POLICY_UPDATED = '9 October 2026'

export interface PolicySectionDef {
  id: string
  title: string
}

export function PolicyNav({
  sections,
  className,
}: {
  sections: PolicySectionDef[]
  className?: string
}) {
  return (
    <nav
      aria-labelledby="policy-contents"
      className={cn(
        'rounded-lg border border-border bg-card p-5 lg:sticky lg:top-24',
        className,
      )}
    >
      <h2
        id="policy-contents"
        className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
      >
        On this page
      </h2>
      <ol className="mt-4 flex flex-col gap-2.5">
        {sections.map((section, index) => (
          <li key={section.id} className="flex gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className="font-heading text-xs font-bold tabular-nums text-primary/60"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <a
              href={`#${section.id}`}
              className="link-underline text-muted-foreground hover:text-primary"
            >
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function PolicySection({
  id,
  title,
  children,
  className,
}: {
  id: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn('scroll-mt-28 border-t border-border pt-8 first:border-t-0 first:pt-0', className)}
    >
      <h2
        id={`${id}-heading`}
        className="font-heading text-xl font-extrabold uppercase leading-tight tracking-tight text-foreground"
      >
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

export function PolicyText({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p className={cn('text-sm leading-[1.75] text-muted-foreground sm:text-base', className)}>
      {children}
    </p>
  )
}

export function PolicyList({
  items,
  className,
}: {
  items: ReactNode[]
  className?: string
}) {
  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          />
          <span className="text-sm leading-[1.75] text-muted-foreground sm:text-base">
            {item}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** A short emphasised note inside a policy section. */
export function PolicyNote({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        'rounded-md border border-primary/25 bg-primary/[0.06] p-4 text-sm leading-relaxed text-foreground',
        className,
      )}
    >
      {children}
    </p>
  )
}

/**
 * The registered entity and contact block. Every policy page closes with it,
 * built from `site.ts` so a detail can only ever be wrong in one place.
 */
export function EntityBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-5 text-sm leading-relaxed text-muted-foreground md:p-6',
        className,
      )}
    >
      <p className="font-heading text-sm font-bold uppercase tracking-tight text-foreground">
        {site.legalName}
      </p>
      <address className="mt-2 not-italic">
        {site.office.full}
        <br />
        Email{' '}
        <a
          href={`mailto:${site.email.sales}`}
          className="link-underline break-all font-semibold text-primary"
        >
          {site.email.sales}
        </a>{' '}
        or call{' '}
        <a href={site.phone.href} className="link-underline font-semibold text-primary">
          {site.phone.display}
        </a>
        .
      </address>
      <p className="mt-3 text-xs">Last updated {POLICY_UPDATED}.</p>
    </div>
  )
}
