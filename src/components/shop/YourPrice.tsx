import { useMemo } from 'react'
import type { Product } from '@/data/types'
import { priceView, type PriceView } from '@/lib/account-price-display'
import { cn, money, priceLabel } from '@/lib/utils'
import { useAccountPriceMap } from '@/store/account-prices'
import { Badge } from '@/components/ui'

/**
 * The one place a tyre's price is decided for display. `usePriceView(product)` says whether the signed-in
 * customer has their own price that beats the shelf price (`view.yours`); every screen that shows a tyre price
 * calls it, and when `view.yours` renders `<YourPrice view={view} />` in place of its usual price. When it is
 * false (a guest, or nothing better for this tyre) the screen shows exactly what it always did.
 */
export function usePriceView(product: Pick<Product, 'id' | 'price' | 'discountPrice'>): PriceView {
  const prices = useAccountPriceMap()
  const { id, price, discountPrice } = product
  return useMemo(() => priceView({ id, price, discountPrice }, prices), [id, price, discountPrice, prices])
}

export interface YourPriceProps {
  view: PriceView
  /** Classes for the price itself (size and weight). */
  priceClassName?: string
  /** Classes for the struck-through usual price. */
  retailClassName?: string
  className?: string
}

/**
 * The account price, the usual price struck through (with a hidden "Usual price" label for screen readers)
 * and a "Your price" badge in words, not only colour. Render inside the screen's own flex row.
 */
export function YourPrice({ view, priceClassName, retailClassName, className }: YourPriceProps) {
  if (!view.yours || view.current == null) return null
  return (
    <>
      <span className={cn('font-heading font-black leading-none', priceClassName, className)}>
        <span className="sr-only">Your price </span>
        {money(view.current)}
      </span>
      {view.retail != null ? (
        <span className={cn('text-sm text-muted-foreground line-through', retailClassName)}>
          <span className="sr-only">Usual price </span>
          {money(view.retail)}
        </span>
      ) : null}
      <Badge variant="primary" size="sm">
        Your price
      </Badge>
    </>
  )
}

/**
 * A price inside a line of text (a tray, a table cell, a button). For a guest it is exactly `priceLabel(shelf price)`;
 * with an account price that beats it, the account price, the usual price struck through and the words "Your price".
 */
export function InlinePrice({ product, className }: { product: Pick<Product, 'id' | 'price' | 'discountPrice'>; className?: string }) {
  const view = usePriceView(product)
  if (!view.yours || view.current == null) return <>{priceLabel(view.retail)}</>
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5', className)}>
      <span>
        <span className="sr-only">Your price </span>
        {money(view.current)}
      </span>
      {view.retail != null ? (
        <s className="text-muted-foreground">
          <span className="sr-only">Usual price </span>
          {money(view.retail)}
        </s>
      ) : null}
      <span className="font-sans text-[0.65rem] font-bold uppercase tracking-wide text-primary">Your price</span>
    </span>
  )
}

export { accountLine } from '@/lib/account-price-display'

/** "$x each", the usual price struck through, and the "Your price" badge, for a cart or checkout line. */
export function AccountUnit({ unit, retail, className }: { unit: number; retail: number | null; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1', className)}>
      <span>
        <span className="sr-only">Your price </span>
        {money(unit)}
      </span>
      {retail != null ? (
        <s className="text-muted-foreground">
          <span className="sr-only">Usual price </span>
          {money(retail)}
        </s>
      ) : null}
      <Badge variant="primary" size="sm">
        Your price
      </Badge>
    </span>
  )
}
