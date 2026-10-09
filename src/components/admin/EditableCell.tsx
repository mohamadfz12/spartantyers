import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * EditableCell
 *
 * Click (or Enter/Space on the keyboard) to edit, Enter to save,
 * Escape to cancel, blur to cancel. Validation runs locally before
 * `onCommit` fires, so a bad value never becomes a request — the API
 * would reject it with a 400 and the operator would have learnt
 * nothing useful from a round trip.
 *
 * Shared by the desktop table and the mobile card list so there is one
 * implementation of the editing contract rather than two.
 * ------------------------------------------------------------------ */

export interface EditableCellProps {
  /** Accessible name for the control, e.g. 'Price for GRD57 11R22.5'. */
  label: string
  /** Raw text seeded into the input when editing begins. */
  initial: string
  /** Rendered when not editing. */
  children: React.ReactNode
  /** Returns an error message, or null when the value is acceptable. */
  validate: (raw: string) => string | null
  /** Receives the trimmed raw value once it validates. */
  onCommit: (raw: string) => void
  /** Shows a spinner and blocks editing while a save is in flight. */
  saving?: boolean
  numeric?: boolean
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
  className?: string
}

export function EditableCell({
  label,
  initial,
  children,
  validate,
  onCommit,
  saving = false,
  numeric = true,
  placeholder,
  inputMode = 'decimal',
  className,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uid = useId()
  const errorId = `${uid}-error`

  useEffect(() => {
    if (!editing) return
    const node = inputRef.current
    if (!node) return
    node.focus()
    node.select()
  }, [editing])

  const begin = () => {
    if (saving) return
    setDraft(initial)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  const commit = () => {
    const raw = draft.trim()
    const problem = validate(raw)
    if (problem) {
      setError(problem)
      return
    }
    setEditing(false)
    setError(null)
    // Nothing changed — skip the request entirely.
    if (raw === initial.trim()) return
    onCommit(raw)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        disabled={saving}
        aria-label={`${label}. Activate to edit.`}
        className={cn(
          'group inline-flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1',
          'text-left transition-colors duration-200 ease-brand',
          'hover:bg-primary/10 hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-wait disabled:opacity-60',
          numeric && 'justify-end tabular-nums',
          className,
        )}
      >
        <span className="truncate">{children}</span>
        {saving ? (
          <Loader2
            aria-hidden="true"
            className="h-3 w-3 shrink-0 animate-spin text-primary"
          />
        ) : (
          <Pencil
            aria-hidden="true"
            className="h-3 w-3 shrink-0 text-muted-foreground/0 transition-colors duration-200 group-hover:text-primary"
          />
        )}
      </button>
    )
  }

  return (
    <span className={cn('block', className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          if (error) setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
        // Clicking away discards, matching Escape. Saving on blur would let a
        // stray click write a half-typed number.
        onBlur={cancel}
        className={cn(
          'w-full min-w-[4.5rem] rounded-sm border bg-background px-1.5 py-1 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          numeric && 'text-right tabular-nums',
          error ? 'border-destructive' : 'border-primary',
        )}
      />
      {error ? (
        <span
          id={errorId}
          role="alert"
          className={cn(
            'mt-1 block text-[0.6875rem] font-medium leading-tight text-destructive',
            numeric && 'text-right',
          )}
        >
          {error}
        </span>
      ) : null}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Validators — mirror `api/admin/products.ts` exactly
 * ------------------------------------------------------------------ */

const MAX_PRICE = 20000
const MAX_STOCK = 100000

export function validatePrice(raw: string): string | null {
  if (!raw) return 'Price is required.'
  const value = Number(raw)
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (value <= 0) return 'Must be more than $0.'
  if (value > MAX_PRICE) return `Must be $${MAX_PRICE.toLocaleString('en-AU')} or less.`
  return null
}

export function validateDiscount(raw: string): string | null {
  if (!raw) return null // Empty clears the discount.
  const value = Number(raw)
  if (!Number.isFinite(value)) return 'Enter a number, or leave blank.'
  if (!Number.isInteger(value)) return 'Whole percentages only.'
  if (value < 0 || value > 90) return 'Must be between 0 and 90.'
  return null
}

export function validateStock(raw: string): string | null {
  if (!raw) return 'Stock is required.'
  const value = Number(raw)
  if (!Number.isFinite(value)) return 'Enter a number.'
  if (!Number.isInteger(value)) return 'Whole tyres only.'
  if (value < 0) return 'Cannot be negative.'
  if (value > MAX_STOCK) return `Must be ${MAX_STOCK.toLocaleString('en-AU')} or less.`
  return null
}
