import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Package,
  Receipt,
  Truck,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import { Button, Field, Input, Select, Stepper, Textarea } from '@/components/ui'
import { FulfilmentPicker } from '@/components/checkout/FulfilmentPicker'
import { OrderSummary } from '@/components/checkout/OrderSummary'
import { SquareCard, type SquareCardResult } from '@/components/checkout/SquareCard'
import { site } from '@/config/site'
import type { Order } from '@/data/types'
import {
  cn,
  isValidAuPhone,
  isValidEmail,
  isValidPostcode,
  money,
} from '@/lib/utils'
import { useCart, useCartTotals } from '@/store/cart'

const STEPS = ['Details', 'Delivery', 'Payment'] as const

const AU_STATES = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NT', label: 'Northern Territory' },
] as const

interface Details {
  name: string
  email: string
  phone: string
  company: string
}

interface AddressForm {
  line1: string
  suburb: string
  state: string
  postcode: string
}

/**
 * Three-step checkout: details, delivery, payment.
 *
 * Everything lives in component state and nothing card-shaped is ever stored —
 * the card is only ever in Square's own iframe, and the only thing that leaves
 * it is a single-use token.
 */
export default function Checkout() {
  const navigate = useNavigate()

  const lines = useCart((s) => s.lines)
  const fulfilment = useCart((s) => s.fulfilment)
  const fittingTyres = useCart((s) => s.fittingTyres)
  const promo = useCart((s) => s.promo)
  const clear = useCart((s) => s.clear)
  const totals = useCartTotals()

  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  const [details, setDetails] = useState<Details>({
    name: '',
    email: '',
    phone: '',
    company: '',
  })
  const [detailErrors, setDetailErrors] = useState<Partial<Record<keyof Details, string>>>(
    {},
  )

  const [address, setAddress] = useState<AddressForm>({
    line1: '',
    suburb: '',
    state: '',
    postcode: '',
  })
  const [addressErrors, setAddressErrors] = useState<
    Partial<Record<keyof AddressForm, string>>
  >({})

  const [notes, setNotes] = useState('')

  const headingRef = useRef<HTMLHeadingElement>(null)

  /* ---- Idempotency ---------------------------------------------- */

  /**
   * One key per checkout attempt, reused across every retry of that attempt so
   * a double-click, a decline-then-retry or a network blip cannot produce two
   * charges — Square deduplicates on it for 24 hours.
   *
   * It is only replaced when the order itself changes (lines, fulfilment,
   * fitting count or promo) or after a successful order, because at that point
   * the retry would legitimately be a different charge.
   */
  const orderSignature = useMemo(
    () =>
      JSON.stringify({
        lines: lines.map((line) => [line.id, line.quantity]),
        fulfilment,
        fittingTyres,
        promo: promo?.code ?? null,
      }),
    [lines, fulfilment, fittingTyres, promo],
  )

  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const lastSignature = useRef(orderSignature)

  useEffect(() => {
    if (lastSignature.current === orderSignature) return
    lastSignature.current = orderSignature
    setIdempotencyKey(newIdempotencyKey())
  }, [orderSignature])

  /* ---- Step movement -------------------------------------------- */

  // Move focus to the new step's heading, but not on first paint — stealing
  // focus on page load would be worse than leaving it at the top of the page.
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  function validateDetails(): boolean {
    const errors: Partial<Record<keyof Details, string>> = {}

    if (!details.name.trim()) {
      errors.name = 'Please enter the name this order should be placed under.'
    }
    if (!isValidEmail(details.email)) {
      errors.email =
        'Please enter a valid email address — your receipt and tracking go there.'
    }
    if (!isValidAuPhone(details.phone)) {
      errors.phone =
        'Please enter a valid Australian phone number, for example 0412 345 678.'
    }

    setDetailErrors(errors)
    return Object.keys(errors).length === 0
  }

  function validateDelivery(): boolean {
    if (fulfilment === 'pickup') {
      setAddressErrors({})
      return true
    }

    const errors: Partial<Record<keyof AddressForm, string>> = {}

    if (!address.line1.trim()) errors.line1 = 'Please enter the street address.'
    if (!address.suburb.trim()) errors.suburb = 'Please enter the suburb.'
    if (!address.state) errors.state = 'Please choose a state.'
    if (!isValidPostcode(address.postcode)) {
      errors.postcode = 'Please enter a valid Australian postcode (4 digits).'
    }

    setAddressErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleStepSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (step === 0 && validateDetails()) setStep(1)
    else if (step === 1 && validateDelivery()) setStep(2)
  }

  /* ---- Success --------------------------------------------------- */

  const handleSuccess = useCallback(
    (result: SquareCardResult) => {
      // Built from the cart for display, but `total` is the server's figure —
      // the client's arithmetic is never the authority on what was charged.
      const order: Order = {
        id: result.orderId,
        reference: result.reference,
        createdAt: new Date().toISOString(),
        status: 'paid',
        fulfilment,
        customer: {
          name: details.name.trim(),
          email: details.email.trim(),
          phone: details.phone.trim(),
          ...(details.company.trim() ? { company: details.company.trim() } : {}),
        },
        ...(fulfilment === 'delivery'
          ? {
              address: {
                line1: address.line1.trim(),
                suburb: address.suburb.trim(),
                state: address.state,
                postcode: address.postcode.trim(),
              },
            }
          : {}),
        lines: lines.map((line) => ({
          sku: line.sku,
          name: `${line.brand} ${line.model}`,
          size: line.size,
          quantity: line.quantity,
          unitPrice: line.price,
        })),
        fittingTyres: fulfilment === 'pickup' ? fittingTyres : 0,
        subtotal: totals.subtotal,
        fittingTotal: totals.fittingTotal,
        discount:
          Math.round((totals.volumeDiscount + totals.promoDiscount) * 100) / 100,
        total: result.total,
        ...(promo ? { promoCode: promo.code } : {}),
        paymentId: result.paymentId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }

      setDone(true)
      clear()
      navigate(`/order/${encodeURIComponent(result.reference)}`, {
        // Hand the order over directly so the confirmation renders instantly,
        // with no lookup round-trip on the most important page of the funnel.
        state: { order, receiptUrl: result.receiptUrl },
        replace: true,
      })
    },
    [
      address,
      clear,
      details,
      fittingTyres,
      fulfilment,
      lines,
      navigate,
      notes,
      promo,
      totals,
    ],
  )

  const paymentLines = useMemo(
    () => lines.map((line) => ({ id: line.id, quantity: line.quantity })),
    [lines],
  )

  const customer = useMemo(
    () => ({
      name: details.name.trim(),
      email: details.email.trim(),
      phone: details.phone.trim(),
      ...(details.company.trim() ? { company: details.company.trim() } : {}),
    }),
    [details],
  )

  const deliveryAddress = useMemo(
    () =>
      fulfilment === 'delivery'
        ? {
            line1: address.line1.trim(),
            suburb: address.suburb.trim(),
            state: address.state,
            postcode: address.postcode.trim(),
          }
        : undefined,
    [address, fulfilment],
  )

  /* ---- Empty-cart guard ------------------------------------------ */

  if (lines.length === 0 && !done) {
    return (
      <>
        <Seo
          title={`Checkout | ${site.name}`}
          description="Secure checkout for commercial truck tyres."
          canonicalPath="/checkout"
          noIndex
        />
        <div className="section">
          <div className="shell">
            <h1 className="display-3">Checkout</h1>
            <div className="mt-6 max-w-xl rounded-lg border border-border bg-card p-6 md:p-8">
              <p className="text-base leading-relaxed">
                Add some items to your cart before checking out.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/shop">
                    <Package aria-hidden="true" className="h-4 w-4" />
                    Browse all tyres
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/cart">Back to cart</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Seo
        title={`Checkout | ${site.name}`}
        description="Secure checkout for commercial truck tyres. Card payments processed by Square, free delivery to all metro areas."
        canonicalPath="/checkout"
        noIndex
      />

      <div className="section-tight">
        <div className="shell">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="display-3">Checkout</h1>
              <p className="lede mt-2">
                {totals.itemCount} {totals.itemCount === 1 ? 'tyre' : 'tyres'},{' '}
                {money(totals.total)} including GST.
              </p>
            </div>
            <Button asChild variant="ghost">
              <Link to="/cart">
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Back to cart
              </Link>
            </Button>
          </header>

          <Stepper
            steps={[...STEPS]}
            current={step}
            label="Checkout progress"
            className="mt-8"
          />

          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
            <div className="min-w-0">
              <section
                aria-labelledby="step-heading"
                className="rounded-lg border border-border bg-card p-5 md:p-6"
              >
                <h2
                  id="step-heading"
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-heading text-lg font-bold uppercase tracking-wide outline-none"
                >
                  {step === 0
                    ? 'Your details'
                    : step === 1
                      ? 'Delivery or pickup'
                      : 'Payment'}
                </h2>

                {step === 0 ? (
                  <form onSubmit={handleStepSubmit} noValidate className="mt-5">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      We use these to send your receipt and tracking, and to reach
                      you if anything about the order needs confirming.
                    </p>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                      <Field
                        label="Full name"
                        htmlFor="checkout-name"
                        required
                        error={detailErrors.name}
                        className="sm:col-span-2"
                      >
                        <Input
                          id="checkout-name"
                          name="name"
                          autoComplete="name"
                          value={details.name}
                          onChange={(event) => {
                            setDetails((d) => ({ ...d, name: event.target.value }))
                            setDetailErrors((e) => ({ ...e, name: undefined }))
                          }}
                        />
                      </Field>

                      <Field
                        label="Email"
                        htmlFor="checkout-email"
                        required
                        error={detailErrors.email}
                      >
                        <Input
                          id="checkout-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          value={details.email}
                          onChange={(event) => {
                            setDetails((d) => ({ ...d, email: event.target.value }))
                            setDetailErrors((e) => ({ ...e, email: undefined }))
                          }}
                        />
                      </Field>

                      <Field
                        label="Phone"
                        htmlFor="checkout-phone"
                        required
                        error={detailErrors.phone}
                      >
                        <Input
                          id="checkout-phone"
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="0412 345 678"
                          value={details.phone}
                          onChange={(event) => {
                            setDetails((d) => ({ ...d, phone: event.target.value }))
                            setDetailErrors((e) => ({ ...e, phone: undefined }))
                          }}
                        />
                      </Field>

                      <Field
                        label="Company"
                        htmlFor="checkout-company"
                        hint="Optional — added to your tax invoice."
                        className="sm:col-span-2"
                      >
                        <Input
                          id="checkout-company"
                          name="company"
                          autoComplete="organization"
                          value={details.company}
                          onChange={(event) =>
                            setDetails((d) => ({ ...d, company: event.target.value }))
                          }
                        />
                      </Field>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
                      <Button type="submit" size="lg">
                        Continue to delivery
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>
                ) : null}

                {step === 1 ? (
                  <form onSubmit={handleStepSubmit} noValidate className="mt-5">
                    <FulfilmentPicker variant="checkout" />

                    {fulfilment === 'delivery' ? (
                      <div className="mt-6 grid gap-5 sm:grid-cols-2">
                        <Field
                          label="Street address"
                          htmlFor="checkout-line1"
                          required
                          error={addressErrors.line1}
                          className="sm:col-span-2"
                        >
                          <Input
                            id="checkout-line1"
                            name="line1"
                            autoComplete="address-line1"
                            value={address.line1}
                            onChange={(event) => {
                              setAddress((a) => ({ ...a, line1: event.target.value }))
                              setAddressErrors((e) => ({ ...e, line1: undefined }))
                            }}
                          />
                        </Field>

                        <Field
                          label="Suburb"
                          htmlFor="checkout-suburb"
                          required
                          error={addressErrors.suburb}
                        >
                          <Input
                            id="checkout-suburb"
                            name="suburb"
                            autoComplete="address-level2"
                            value={address.suburb}
                            onChange={(event) => {
                              setAddress((a) => ({ ...a, suburb: event.target.value }))
                              setAddressErrors((e) => ({ ...e, suburb: undefined }))
                            }}
                          />
                        </Field>

                        <Field
                          label="State"
                          htmlFor="checkout-state"
                          required
                          error={addressErrors.state}
                        >
                          <Select
                            id="checkout-state"
                            name="state"
                            autoComplete="address-level1"
                            placeholder="Choose a state"
                            value={address.state}
                            onChange={(event) => {
                              setAddress((a) => ({ ...a, state: event.target.value }))
                              setAddressErrors((e) => ({ ...e, state: undefined }))
                            }}
                          >
                            {AU_STATES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value} — {option.label}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field
                          label="Postcode"
                          htmlFor="checkout-postcode"
                          required
                          error={addressErrors.postcode}
                        >
                          <Input
                            id="checkout-postcode"
                            name="postcode"
                            inputMode="numeric"
                            autoComplete="postal-code"
                            maxLength={4}
                            placeholder="2161"
                            className="max-w-[9rem]"
                            value={address.postcode}
                            onChange={(event) => {
                              setAddress((a) => ({
                                ...a,
                                postcode: event.target.value
                                  .replace(/[^\d]/g, '')
                                  .slice(0, 4),
                              }))
                              setAddressErrors((e) => ({ ...e, postcode: undefined }))
                            }}
                          />
                        </Field>
                      </div>
                    ) : null}

                    <Field
                      label="Order notes"
                      htmlFor="checkout-notes"
                      hint="Optional — gate codes, forklift availability, purchase order number."
                      className="mt-6"
                    >
                      <Textarea
                        id="checkout-notes"
                        name="notes"
                        rows={3}
                        maxLength={1000}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    </Field>

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
                      <Button type="submit" size="lg">
                        Continue to payment
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => setStep(0)}
                      >
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                        Back
                      </Button>
                    </div>
                  </form>
                ) : null}

                {step === 2 ? (
                  <div className="mt-5">
                    <ReviewPanel
                      details={details}
                      address={deliveryAddress}
                      onEditDetails={() => setStep(0)}
                      onEditDelivery={() => setStep(1)}
                    />

                    <div className="mt-6">
                      <SquareCard
                        amount={totals.total}
                        idempotencyKey={idempotencyKey}
                        customer={customer}
                        fulfilment={fulfilment}
                        fittingTyres={fittingTyres}
                        promoCode={promo?.code}
                        address={deliveryAddress}
                        lines={paymentLines}
                        notes={notes.trim() || undefined}
                        onSuccess={handleSuccess}
                      />
                    </div>

                    <div className="mt-5">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStep(1)}
                      >
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                        Back to delivery
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>

              <TrustRow className="mt-6" />
            </div>

            <aside className="lg:sticky lg:top-24">
              <OrderSummary showLines collapsible heading="Order summary" />
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Square rejects keys over 45 characters; a UUID is 36. */
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Non-secure contexts (plain http on a LAN) have no randomUUID. This is only
  // a de-duplication key, not a secret, so a time-plus-random value is enough.
  return `spt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function ReviewPanel({
  details,
  address,
  onEditDetails,
  onEditDelivery,
}: {
  details: Details
  address?: { line1: string; suburb: string; state: string; postcode: string }
  onEditDetails: () => void
  onEditDelivery: () => void
}) {
  const fulfilment = useCart((s) => s.fulfilment)

  return (
    <dl className="grid gap-4 rounded-md border border-border bg-muted/40 p-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="flex items-center justify-between gap-2 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
          Contact
          <EditButton onClick={onEditDetails} label="Edit your details" />
        </dt>
        <dd className="mt-1 leading-relaxed">
          {details.name}
          {details.company ? (
            <>
              <br />
              {details.company}
            </>
          ) : null}
          <br />
          <span className="break-all text-muted-foreground">{details.email}</span>
          <br />
          <span className="text-muted-foreground">{details.phone}</span>
        </dd>
      </div>

      <div>
        <dt className="flex items-center justify-between gap-2 font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
          {fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
          <EditButton onClick={onEditDelivery} label="Edit delivery details" />
        </dt>
        <dd className="mt-1 leading-relaxed">
          {fulfilment === 'pickup' ? (
            <>
              {site.name}
              <br />
              <span className="text-muted-foreground">{site.warehouse.full}</span>
            </>
          ) : address ? (
            <>
              {address.line1}
              <br />
              <span className="text-muted-foreground">
                {address.suburb} {address.state} {address.postcode}
              </span>
            </>
          ) : null}
        </dd>
      </div>
    </dl>
  )
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded text-xs font-medium normal-case tracking-normal text-primary',
        'underline-offset-4 hover:underline focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
      )}
    >
      Edit
      <span className="sr-only"> — {label}</span>
    </button>
  )
}

function TrustRow({ className }: { className?: string }) {
  const items = [
    {
      icon: Receipt,
      title: 'GST included',
      body: 'Every price on the site includes GST, and your tax invoice is emailed with the receipt.',
    },
    {
      icon: BadgeCheck,
      title: 'Manufacturer warranty',
      body: 'All Greforce and Lionshead casings carry the full manufacturer warranty against defects.',
    },
    {
      icon: Truck,
      title: 'Free metro delivery',
      body: `Free to all metro orders, estimated ${site.commerce.metroDeliveryEstimate} from dispatch.`,
    },
  ]

  return (
    <ul className={cn('grid gap-3 sm:grid-cols-3', className)}>
      {items.map((item) => (
        <li
          key={item.title}
          className="rounded-md border border-border bg-card p-4"
        >
          <p className="flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wide">
            <item.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            {item.title}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {item.body}
          </p>
        </li>
      ))}
    </ul>
  )
}
