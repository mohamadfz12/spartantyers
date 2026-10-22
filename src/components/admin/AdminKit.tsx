import { useCallback, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  SESSION_EXPIRED_MESSAGE,
  adminToken,
  handleAdminError,
  useAdmin,
} from '@/store/admin'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Shared pieces for the stock, staff and money pages
 * ------------------------------------------------------------------ */

/**
 * Runs one admin write: finds the token, reports success or the server's
 * own error message as a toast, and routes failures through
 * `handleAdminError` so a dead session signs out the same way everywhere.
 * Resolves to the result, or null when it failed.
 */
export function useAdminAction() {
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async <T,>(
      fn: (token: string) => Promise<T>,
      messages: { success?: string; successDetail?: string; failure: string },
    ): Promise<T | null> => {
      const token = adminToken()
      if (!token) {
        useAdmin.getState().logout(SESSION_EXPIRED_MESSAGE)
        return null
      }
      setBusy(true)
      try {
        const result = await fn(token)
        if (messages.success) {
          toast({ title: messages.success, description: messages.successDetail, variant: 'success' })
        }
        return result
      } catch (error) {
        const failure = handleAdminError(error)
        toast({ title: messages.failure, description: failure.message, variant: 'error' })
        return null
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { run, busy }
}

/** A headline number. `tone` colours the value for good / bad / attention. */
export function Tile({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string
  value: string
  hint?: React.ReactNode
  tone?: 'default' | 'good' | 'bad' | 'warn'
  icon?: LucideIcon
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground">
          {label}
        </p>
        {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> : null}
      </div>
      <p
        className={cn(
          'mt-2 font-heading text-2xl font-black tabular-nums leading-none md:text-3xl',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'bad' && 'text-destructive',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}

/** Table cell classes, matching the existing admin tables. */
export const th =
  'border-b border-border bg-muted/40 px-3 py-2.5 text-left font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground whitespace-nowrap'
export const td = 'border-b border-border px-3 py-2.5 align-top'

/** A plain native select styled like the inputs, for compact filter bars. */
export const selectClass =
  'h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/* ------------------------------------------------------------------ *
 * Dates. Money and stock days are Sydney calendar days, YYYY-MM-DD.
 * ------------------------------------------------------------------ */

/** Today on this device's calendar, YYYY-MM-DD (not UTC: in Sydney UTC is yesterday until mid-morning). */
export function todayLocal(): string {
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-')
}

/** "22 Oct 2026" from YYYY-MM-DD, read as a calendar day with no time zone shift. */
export function dayLabel(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '—'
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "22 Oct 2026, 3:15 pm" from an ISO timestamp. */
export function stampLabel(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return '—'
  return new Date(parsed).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/* ------------------------------------------------------------------ *
 * Excel export (the library loads only when someone clicks Export)
 * ------------------------------------------------------------------ */

export interface SheetColumn<T> {
  column: string
  width: number
  value: (row: T) => string | number | null
  /** Numbers are written as real numbers so Excel can add them up. */
  number?: boolean
  /** Excel number format for `number` columns, e.g. '#,##0.00'. */
  format?: string
}

export async function exportSheet<T>(
  rows: T[],
  columns: SheetColumn<T>[],
  fileName: string,
  sheet: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file')
  const schema = columns.map((col) =>
    col.number
      ? {
          column: col.column,
          width: col.width,
          type: Number,
          format: col.format,
          value: (row: T) => {
            const v = col.value(row)
            return typeof v === 'number' && Number.isFinite(v) ? v : null
          },
        }
      : {
          column: col.column,
          width: col.width,
          type: String,
          value: (row: T) => {
            const v = col.value(row)
            return v === null || v === '' ? null : String(v)
          },
        },
  )
  await writeXlsxFile(rows, {
    // The library's schema typing is per-column generic; the shape above is what it accepts.
    schema: schema as never,
    fileName: `${fileName}-${todayLocal()}.xlsx`,
    sheet,
    stickyRowsCount: 1,
    getHeaderStyle: () => ({
      fontWeight: 'bold',
      color: '#ffffff',
      backgroundColor: '#1a1a1a',
    }),
  })
}

export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
