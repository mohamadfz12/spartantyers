import { Check, TrendingDown } from 'lucide-react'
import { PRICE_BREAKS } from '@/data/products'
import { site } from '@/config/site'
import { cn, money, pluralise } from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'
import { Badge, Progress } from '@/components/ui'

/**
 * The full volume ladder.
 *
 * The drawer shows only the next step up; here there is room for all four
 * bands, which is the honest view for a fleet buyer deciding whether to round
 * an order up from six tyres to eight.
 */
export function PriceBreakLadder({ className }: { className?: string }) {
  const totals = useCartTotals()
  const cartLines = useCart((s) => s.lines)
  const { itemCount, volumeLabel, nextBreak, tyresToNextBreak } = totals
  const hasAccountLines = totals.accountSaving > 0
  // Tyres at the customer's account price do not take the volume break (each is charged the lower of the two),
  // so the saving the next break would add is worked on the other tyres only. A guest has no such tyres.
  const subtotal = hasAccountLines
    ? cartLines.reduce(
        (sum, line) => (totals.lineUnits[line.id]?.basis === 'account' ? sum : sum + line.price * line.quantity),
        0,
      )
    : totals.subtotal

  return (
    <section
      aria-labelledby="price-breaks-heading"
      className={cn('rounded-lg border border-border bg-card p-5 md:p-6', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="price-breaks-heading"
          className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide"
        >
          <TrendingDown aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          Volume pricing
        </h2>
        <p className="text-xs text-muted-foreground">
          Applied automatically &mdash; no code needed
        </p>
      </div>

      {nextBreak ? (
        <div className="mt-4">
          <p className="font-heading text-sm font-bold uppercase tracking-wide text-primary">
            Add {tyresToNextBreak} more {pluralise(tyresToNextBreak, 'tyre')} to save{' '}
            {Math.round(nextBreak.discount * 100)}%
          </p>
          <Progress
            value={itemCount}
            max={nextBreak.min}
            className="mt-2.5"
            label={`${itemCount} of ${nextBreak.min} tyres towards the ${nextBreak.label} price break`}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {itemCount} of {nextBreak.min} tyres towards the {nextBreak.label} break
            &mdash; that would save about{' '}
            {money(Math.round(subtotal * nextBreak.discount * 100) / 100)} at today's
            subtotal.
          </p>
        </div>
      ) : (
        <p className="mt-4 font-heading text-sm font-bold uppercase tracking-wide text-primary">
          Maximum volume discount applied
        </p>
      )}

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {PRICE_BREAKS.map((band) => {
          const current = volumeLabel === band.label
          const reached = itemCount >= band.min

          return (
            <li
              key={band.label}
              aria-current={current ? 'true' : undefined}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 transition-colors duration-200',
                current
                  ? 'border-primary bg-primary/10'
                  : reached
                    ? 'border-border bg-muted/40'
                    : 'border-border bg-background',
              )}
            >
              <span className="flex items-center gap-2">
                {reached ? (
                  <Check
                    aria-hidden="true"
                    strokeWidth={3}
                    className="h-3.5 w-3.5 shrink-0 text-primary"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-input"
                  />
                )}
                <span className="font-heading text-sm font-bold uppercase tracking-wide">
                  {band.label}
                </span>
              </span>

              <span className="flex items-center gap-2">
                <span className="font-heading text-sm font-black tabular-nums text-primary">
                  &minus;{Math.round(band.discount * 100)}%
                </span>
                {current ? (
                  <Badge variant="primary" size="sm">
                    Your band
                  </Badge>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {hasAccountLines
          ? 'Tyres at your account price are not discounted again: each tyre is charged the lower of your price and the volume price. '
          : ''}
        Ordering {site.commerce.bulkThreshold} tyres or more? We can also arrange
        consolidated depot freight &mdash; call{' '}
        <a
          href={site.phone.href}
          className="rounded font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {site.phone.display}
        </a>
        .
      </p>
    </section>
  )
}
