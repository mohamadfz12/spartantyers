import { useEffect, useState } from 'react'
import { Minus, Plus, Wrench } from 'lucide-react'
import { api } from '@/lib/api'
import { site } from '@/config/site'
import { cn, money, pluralise } from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'

/**
 * Professional wheel fitting, sold per tyre and only with warehouse pickup.
 *
 * The count is clamped to the cart quantity by the store, so this control only
 * has to stop the buttons at the ends. The displayed total is confirmed against
 * `/api/services/fitting` — the service that owns the fee — and falls back to
 * the local calculation if that call cannot be made.
 */
export function FittingAddOn({ className }: { className?: string }) {
  const fittingTyres = useCart((s) => s.fittingTyres)
  const setFittingTyres = useCart((s) => s.setFittingTyres)
  const { itemCount, fittingTotal } = useCartTotals()

  const [quotedTotal, setQuotedTotal] = useState<number | null>(null)
  const [quotedPerTyre, setQuotedPerTyre] = useState<number | null>(null)

  useEffect(() => {
    if (fittingTyres <= 0) {
      setQuotedTotal(null)
      return
    }

    let cancelled = false
    api
      .quoteFitting(fittingTyres)
      .then((quote) => {
        if (cancelled) return
        setQuotedTotal(quote.total)
        setQuotedPerTyre(quote.perTyre)
      })
      // A quote failure is cosmetic: the authoritative fee is applied
      // server-side at charge time, so fall back to the local figure.
      .catch(() => {
        if (!cancelled) setQuotedTotal(null)
      })

    return () => {
      cancelled = true
    }
  }, [fittingTyres])

  const perTyre = quotedPerTyre ?? site.commerce.fittingFeePerTyre
  const total = quotedTotal ?? fittingTotal

  return (
    <div
      className={cn('rounded-md border border-border bg-background p-4', className)}
    >
      <h3 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
        <Wrench aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        Add wheel fitting
      </h3>

      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Picking up from our {site.warehouse.suburb} warehouse? You can add
        professional wheel fitting ({money(site.commerce.fittingFeePerTyre)} per
        tyre) at checkout.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            id="fitting-stepper-label"
            className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
          >
            Tyres to fit
          </span>

          <div
            role="group"
            aria-labelledby="fitting-stepper-label"
            className="flex items-center rounded-md border border-border"
          >
            <StepButton
              label="Fit one fewer tyre"
              disabled={fittingTyres <= 0}
              onClick={() => setFittingTyres(fittingTyres - 1)}
            >
              <Minus aria-hidden="true" className="h-3.5 w-3.5" />
            </StepButton>

            <span
              aria-live="polite"
              className="w-12 text-center font-heading text-sm font-bold tabular-nums"
            >
              {fittingTyres}
            </span>

            <StepButton
              label="Fit one more tyre"
              disabled={fittingTyres >= itemCount}
              onClick={() => setFittingTyres(fittingTyres + 1)}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            </StepButton>
          </div>

          <span className="text-xs text-muted-foreground">of {itemCount}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setFittingTyres(fittingTyres >= itemCount ? 0 : itemCount)}
            className={cn(
              'rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            {fittingTyres >= itemCount
              ? 'No fitting'
              : `Fit all ${itemCount} ${pluralise(itemCount, 'tyre')}`}
          </button>

          <p aria-live="polite" className="font-heading text-sm font-bold tabular-nums">
            {fittingTyres > 0 ? (
              <>
                {money(total)}
                <span className="sr-only">
                  {' '}
                  for {fittingTyres} {pluralise(fittingTyres, 'tyre')} at{' '}
                  {money(perTyre)} each
                </span>
              </>
            ) : (
              <span className="font-sans text-xs font-normal text-muted-foreground">
                Not added
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        'disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}
