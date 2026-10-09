import { useState } from 'react'
import { Check, Tag, X } from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'
import { useCart } from '@/store/cart'
import { Button, Field, Input } from '@/components/ui'

/**
 * Promo code entry.
 *
 * `/api/promo/validate` answers in-band — a 200 with `{valid: false, reason}`
 * for a bad code — so the only exceptional path is the API being unreachable.
 * That gets its own message with the phone number rather than a dead field,
 * because a fleet buyer who was promised a code will not accept silence.
 */
export function PromoField({ className }: { className?: string }) {
  const promo = useCart((s) => s.promo)
  const applyPromo = useCart((s) => s.applyPromo)

  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (checking) return

    const trimmed = code.trim()
    if (!trimmed) {
      setError('Enter a promo code.')
      return
    }

    setChecking(true)
    setError(null)

    try {
      const result = await api.validatePromo(trimmed)

      if (result.valid && result.code && typeof result.percentOff === 'number') {
        applyPromo({
          code: result.code,
          // Fractional, straight from the server — 0.1 is 10% off.
          percentOff: result.percentOff,
          description:
            result.description ?? `${Math.round(result.percentOff * 100)}% off`,
        })
        setCode('')
      } else {
        setError(result.reason ?? 'That promo code could not be applied.')
      }
    } catch (caught) {
      const unreachable =
        !(caught instanceof ApiError) || caught.status === 0 || caught.status === 408
      setError(
        unreachable
          ? `We couldn't reach our promo service just now. Please check your connection and try again, or call ${site.phone.display} and we'll apply it for you.`
          : caught.message,
      )
    } finally {
      setChecking(false)
    }
  }

  if (promo) {
    return (
      <div
        className={cn(
          'rounded-md border border-primary/40 bg-primary/5 p-3',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-start gap-2 text-sm">
            <Check
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
            />
            <span className="min-w-0">
              <span className="block font-heading text-sm font-bold uppercase tracking-wide text-primary">
                {promo.code} applied
              </span>
              <span className="block text-xs text-muted-foreground">
                {promo.description}
              </span>
            </span>
          </p>

          <button
            type="button"
            onClick={() => applyPromo(null)}
            className={cn(
              'shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors',
              'hover:bg-destructive/10 hover:text-destructive',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            <X aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">Remove promo code {promo.code}</span>
          </button>
        </div>
        <p aria-live="polite" className="sr-only">
          Promo code {promo.code} applied: {promo.description}
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn('flex items-start gap-2', className)}
    >
      {/* Field owns the aria wiring, so the Input must be its only child. */}
      <Field
        label={
          <span className="flex items-center gap-1.5">
            <Tag aria-hidden="true" className="h-3.5 w-3.5" />
            Promo code
          </span>
        }
        htmlFor="promo-code"
        error={error ?? undefined}
        className="min-w-0 flex-1"
      >
        <Input
          id="promo-code"
          name="promoCode"
          value={code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. FLEET10"
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            if (error) setError(null)
          }}
          className="uppercase"
        />
      </Field>

      {/* mt-6 lines the button up with the input, past the field label. */}
      <Button type="submit" variant="outline" loading={checking} className="mt-6 shrink-0">
        Apply
      </Button>
    </form>
  )
}
