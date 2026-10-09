import { Clock, MapPin, Truck, Warehouse } from 'lucide-react'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'
import { useCart, type Fulfilment } from '@/store/cart'
import { FittingAddOn } from './FittingAddOn'

/**
 * Delivery vs warehouse pickup.
 *
 * Switching back to delivery clears the fitting add-on — that rule lives in
 * `setFulfilment()` in the cart store, so it is deliberately not repeated here.
 */
export interface FulfilmentPickerProps {
  className?: string
  /**
   * `checkout` adds the full delivery-area and collection copy; `cart` keeps
   * it to the one-liners that fit beside the line items.
   */
  variant?: 'cart' | 'checkout'
}

const OPTIONS: Array<{
  value: Fulfilment
  title: string
  summary: string
  icon: typeof Truck
}> = [
  {
    value: 'delivery',
    title: 'Deliver to me',
    summary: `Free to metro, ${site.commerce.metroDeliveryEstimate}`,
    icon: Truck,
  },
  {
    value: 'pickup',
    title: 'Pick up from warehouse',
    summary: `${site.warehouse.full}, no freight cost`,
    icon: Warehouse,
  },
]

export function FulfilmentPicker({
  className,
  variant = 'cart',
}: FulfilmentPickerProps) {
  const fulfilment = useCart((s) => s.fulfilment)
  const setFulfilment = useCart((s) => s.setFulfilment)

  return (
    <div className={className}>
      <fieldset>
        <legend className="font-heading text-sm font-bold uppercase tracking-wide">
          How would you like to receive your tyres?
        </legend>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const selected = fulfilment === option.value
            const Icon = option.icon

            return (
              <label
                key={option.value}
                className={cn(
                  'relative flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors duration-200',
                  'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                  'focus-within:ring-offset-background',
                  selected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/50',
                )}
              >
                <input
                  type="radio"
                  name="fulfilment"
                  value={option.value}
                  checked={selected}
                  onChange={() => setFulfilment(option.value)}
                  className="sr-only"
                />

                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                    selected ? 'border-primary' : 'border-input',
                  )}
                >
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full bg-primary transition-transform duration-200',
                      selected ? 'scale-100' : 'scale-0',
                    )}
                  />
                </span>

                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        'h-4 w-4 shrink-0',
                        selected ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    {option.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {option.summary}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {fulfilment === 'delivery' ? (
        <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2 text-foreground">
            <Truck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Free delivery on all metro orders, estimated{' '}
              {site.commerce.metroDeliveryEstimate}.
            </span>
          </p>
          <p>
            If your delivery address is outside our metro delivery area, a member
            of our team will contact you after your order is placed to arrange
            shipping and confirm any additional costs.
          </p>
          {variant === 'checkout' ? (
            <p className="flex items-start gap-2">
              <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Orders are packaged and dispatched from our Sydney warehouse
                within {site.commerce.dispatchWindow}. Metro areas we deliver to
                include {site.commerce.metroCities.slice(0, 5).join(', ')} and{' '}
                {site.commerce.metroCities.length - 5} more.
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            <p className="flex items-start gap-2">
              <MapPin
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              />
              <span>
                <span className="font-heading text-sm font-bold uppercase tracking-wide">
                  Collect from {site.name}
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {site.warehouse.full}
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {site.hours.label}
                </span>
                <a
                  href={site.warehouse.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    'mt-1.5 inline-block rounded text-xs font-medium text-primary underline-offset-4 hover:underline',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  Open in Google Maps
                </a>
              </span>
            </p>
            {variant === 'checkout' ? (
              <p className="mt-3 text-muted-foreground">
                A member of our team will contact you when your order is ready to
                collect — usually within {site.commerce.dispatchWindow}. Bring your
                order reference with you.
              </p>
            ) : null}
          </div>

          <FittingAddOn />
        </div>
      )}
    </div>
  )
}
