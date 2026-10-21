import { Check, Info, TriangleAlert, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { site } from '@/config/site'
import { cn, moneyExact } from '@/lib/utils'
import type { CartCard } from '@/lib/ai/protocol'
import { addCardToCart, finishCard, type CardView } from '@/store/assistant'

const Row = ({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={cn('text-right [overflow-wrap:anywhere]', strong && 'font-bold text-foreground')}>{children}</dd>
  </>
)

/**
 * The "Add to your cart?" card. It shows exactly what checkout will charge (the server priced it);
 * nothing is in the cart until the customer taps the button. Then the tyre goes into the site's
 * own cart and the site's own checkout takes payment.
 *
 * In the chat the buttons act on the chat's messages; on a call (src/store/call.ts) the call hands
 * in what to do when the customer adds or dismisses it, and the same card is shown.
 */
export function CartCardView({
  messageId,
  card,
  view,
  onAdd,
  onDismiss,
}: {
  messageId: number
  card: CartCard
  view: CardView
  onAdd?: () => void
  onDismiss?: () => void
}) {
  const navigate = useNavigate()
  const { state } = view

  if (state === 'done') {
    return (
      <div role="status" className="flex w-full items-start gap-3 rounded-xl border border-green-500/50 bg-green-500/10 p-3.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-600 text-white">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-sm leading-snug">
          <span className="font-semibold">Added to your cart.</span>{' '}
          <span className="text-muted-foreground">
            {card.quantity} x {card.name}, {card.size}
          </span>
        </p>
      </div>
    )
  }

  if (state === 'dismissed') {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Not added: {card.quantity} x {card.name}, {card.size}
      </p>
    )
  }

  if (state === 'failed') {
    return (
      <div role="alert" className="flex w-full items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-3.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="text-sm leading-snug">
          {view.message ?? `That could not be added. Please call ${site.phone.display} and the team will help.`}
        </p>
      </div>
    )
  }

  const working = state === 'working'
  return (
    <section
      aria-label="Add to your cart?"
      className="w-full rounded-xl border border-primary/40 bg-card p-4 text-card-foreground shadow-sm"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-brand text-primary">Add to your cart?</p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <Row label="Tyre">{card.name}</Row>
        <Row label="Size">
          {card.size}
          {card.positionLabel ? ` (${card.positionLabel})` : ''}
        </Row>
        <Row label="Price each">{moneyExact(card.unitPrice)}</Row>
        <Row label="Quantity">{card.quantity}</Row>
        {card.volumeDiscount > 0 ? (
          <Row label="Volume discount">
            {`-${moneyExact(card.volumeDiscount)}`}
            {card.volumeLabel ? ` (${card.volumeLabel})` : ''}
          </Row>
        ) : null}
        {card.fitting ? <Row label="Fitting at pickup">{moneyExact(card.fittingTotal)}</Row> : null}
        <Row label="Total inc. GST" strong>
          {moneyExact(card.total)}
        </Row>
      </dl>

      {card.preOrder ? (
        <p className="mt-3 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
          Pre-order: not in stock right now
        </p>
      ) : null}

      {card.notes.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {card.notes.map((note) => (
            <li key={note} className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        <Button
          type="button"
          loading={working}
          onClick={onAdd ?? (() => addCardToCart(messageId, card, navigate))}
          className="w-full"
        >
          {card.checkout ? 'Add and check out' : 'Add to cart'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={working}
          onClick={onDismiss ?? (() => finishCard(messageId, card, 'dismissed'))}
          className="w-full"
        >
          Not now
        </Button>
      </div>
    </section>
  )
}
