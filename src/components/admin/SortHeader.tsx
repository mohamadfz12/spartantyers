import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Sortable table header
 *
 * `aria-sort` lives on the <th> (where assistive tech looks for it) and
 * the control is a real <button> inside, so the column is sortable by
 * keyboard without the header itself becoming a focus stop.
 * ------------------------------------------------------------------ */

export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string> {
  key: K
  direction: SortDirection
}

/** Toggles direction when the same column is clicked, else adopts a default. */
export function nextSort<K extends string>(
  current: SortState<K>,
  key: K,
  defaultDirection: SortDirection = 'asc',
): SortState<K> {
  if (current.key !== key) return { key, direction: defaultDirection }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

export function SortHeader<K extends string>({
  sortKey,
  label,
  sort,
  onSort,
  defaultDirection = 'asc',
  numeric = false,
  className,
  srHint,
}: {
  sortKey: K
  label: string
  sort: SortState<K>
  onSort: (key: K, defaultDirection: SortDirection) => void
  /** Direction applied the first time this column is chosen. */
  defaultDirection?: SortDirection
  /** Right-aligns the cell, as numbers should be. */
  numeric?: boolean
  className?: string
  /** Extra context announced after the label, e.g. "in Australian dollars". */
  srHint?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      className={cn(
        'whitespace-nowrap border-b border-border bg-muted/50 p-0 text-left',
        'font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey, defaultDirection)}
        className={cn(
          'flex w-full items-center gap-1.5 px-2.5 py-2.5 transition-colors duration-200 ease-brand',
          'hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          active && 'text-foreground',
          numeric && 'justify-end',
        )}
      >
        <span>{label}</span>
        {srHint ? <span className="sr-only">, {srHint}</span> : null}
        <Icon
          aria-hidden="true"
          className={cn(
            'h-3 w-3 shrink-0',
            active ? 'text-primary' : 'text-muted-foreground/60',
          )}
        />
      </button>
    </th>
  )
}

/** A plain, non-sortable header cell with matching dense styling. */
export function PlainHeader({
  children,
  numeric = false,
  className,
}: {
  children: React.ReactNode
  numeric?: boolean
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-border bg-muted/50 px-2.5 py-2.5',
        'font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground',
        numeric ? 'text-right' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  )
}
