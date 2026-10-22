import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CreditCard,
  Lock,
  Phone,
  ShieldCheck,
} from 'lucide-react'
import { ApiError, api } from '@/lib/api'
import { site } from '@/config/site'
import { assistantConversationForOrder } from '@/lib/ai/link'
import { cn, isValidPostcode, money } from '@/lib/utils'
import { Button, Field, Input } from '@/components/ui'

/* ------------------------------------------------------------------ *
 * Square Web Payments SDK — minimal structural types
 *
 * The SDK is loaded from Square's CDN at runtime (no npm dependency), so
 * nothing declares these for us. Only the surface this file touches is typed.
 * ------------------------------------------------------------------ */

interface SquareTokenError {
  message?: string
  detail?: string
  field?: string
  type?: string
}

interface SquareTokenResult {
  status: string
  token?: string
  errors?: SquareTokenError[]
}

interface SquareCardInstance {
  attach: (selector: string) => Promise<void>
  tokenize: () => Promise<SquareTokenResult>
  destroy: () => Promise<boolean | void>
}

interface SquareWalletInstance {
  attach: (selector: string) => Promise<void>
  tokenize: () => Promise<SquareTokenResult>
  destroy: () => Promise<boolean | void>
}

type SquarePaymentRequest = Record<string, unknown>

interface SquarePayments {
  card: (options?: Record<string, unknown>) => Promise<SquareCardInstance>
  paymentRequest: (options: Record<string, unknown>) => SquarePaymentRequest
  afterpayClearpay?: (
    request: SquarePaymentRequest,
  ) => Promise<SquareWalletInstance>
  verifyBuyer: (
    token: string,
    details: Record<string, unknown>,
  ) => Promise<{ token?: string } | null>
}

interface SquareSdk {
  payments: (applicationId: string, locationId: string) => SquarePayments
}

declare global {
  interface Window {
    Square?: SquareSdk
  }
}

const SDK_SRC = {
  production: 'https://web.squarecdn.com/v1/square.js',
  sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js',
} as const

const SDK_TIMEOUT_MS = 10_000

const SDK_FAILED =
  'Could not load the Square payment library. Please check your connection or call us.'

/**
 * Injects (or reuses) Square's script tag and resolves with `window.Square`.
 *
 * A second mount must not append a second tag, so an existing tag with the same
 * src is awaited instead. A tag that already failed never fires `load` again,
 * which is what the timeout is for.
 */
function loadSquareSdk(environment: 'sandbox' | 'production'): Promise<SquareSdk> {
  if (window.Square) return Promise.resolve(window.Square)

  const src = environment === 'production' ? SDK_SRC.production : SDK_SRC.sandbox

  return new Promise<SquareSdk>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(SDK_FAILED)), SDK_TIMEOUT_MS)

    const settle = () => {
      clearTimeout(timer)
      if (window.Square) resolve(window.Square)
      else reject(new Error(SDK_FAILED))
    }

    const onError = () => {
      clearTimeout(timer)
      reject(new Error(SDK_FAILED))
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    )

    if (existing) {
      existing.addEventListener('load', settle, { once: true })
      existing.addEventListener('error', onError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.addEventListener('load', settle, { once: true })
    script.addEventListener('error', onError, { once: true })
    document.head.appendChild(script)
  })
}

/* ------------------------------------------------------------------ */

export interface SquareCardResult {
  reference: string
  orderId: string
  paymentId: string
  /** The server's authoritative total — never the client's. */
  total: number
  receiptUrl?: string
}

export interface SquareCardProps {
  /**
   * Client-side total, used ONLY for the Square buyer-verification challenge
   * and the Afterpay payment request. The amount actually charged is recomputed
   * server-side from the product ids below.
   */
  amount: number
  /**
   * One key per checkout attempt, reused across retries of the same order.
   * Minted by the checkout page, never here — a remount must not change it.
   */
  idempotencyKey: string
  customer: { name: string; email: string; phone: string; company?: string }
  fulfilment: 'delivery' | 'pickup'
  fittingTyres: number
  promoCode?: string
  address?: { line1: string; suburb: string; state: string; postcode: string }
  /** Ids and quantities only. Prices are never sent. */
  lines: Array<{ id: string; quantity: number }>
  notes?: string
  onSuccess: (result: SquareCardResult) => void
}

type ConfigState =
  | { phase: 'loading' }
  | {
      phase: 'ready'
      applicationId: string
      locationId: string
      environment: 'sandbox' | 'production'
      afterpayEnabled: boolean
      afterpayMaxOrder: number
    }
  /** Square env vars are missing — 503 from `/api/square/config`. */
  | { phase: 'unavailable'; message: string }
  | { phase: 'error'; message: string }

type Method = 'card' | 'afterpay'

export function SquareCard({
  amount,
  idempotencyKey,
  customer,
  fulfilment,
  fittingTyres,
  promoCode,
  address,
  lines,
  notes,
  onSuccess,
}: SquareCardProps) {
  const [config, setConfig] = useState<ConfigState>({ phase: 'loading' })
  const [payments, setPayments] = useState<SquarePayments | null>(null)
  const [sdkError, setSdkError] = useState<string | null>(null)

  const [method, setMethod] = useState<Method>('card')
  const [cardStatus, setCardStatus] = useState<
    'idle' | 'attaching' | 'ready' | 'error'
  >('idle')
  const [walletStatus, setWalletStatus] = useState<
    'idle' | 'attaching' | 'ready' | 'error'
  >('idle')

  const [billingPostcode, setBillingPostcode] = useState('')
  const [postcodeError, setPostcodeError] = useState<string | null>(null)
  /** Latched: once a valid postcode has been entered the card field stays up. */
  const [postcodeUnlocked, setPostcodeUnlocked] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const cardRef = useRef<SquareCardInstance | null>(null)
  const walletRef = useRef<SquareWalletInstance | null>(null)

  /* ---- 1. Config ------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    api
      .squareConfig()
      .then((result) => {
        if (cancelled) return
        setConfig({ phase: 'ready', ...result })
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        // 503 means Square is not configured on this deployment. That is an
        // operational state with a real answer — the phone — not an error.
        if (caught instanceof ApiError && caught.status === 503) {
          setConfig({ phase: 'unavailable', message: caught.message })
          return
        }
        setConfig({
          phase: 'error',
          message:
            caught instanceof ApiError && caught.status >= 400
              ? caught.message
              : `We couldn't reach our payment service. Please check your connection and try again, or call ${site.phone.display} to place your order.`,
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  /* ---- 2. SDK + payments instance -------------------------------- */

  useEffect(() => {
    if (config.phase !== 'ready') return
    let cancelled = false

    loadSquareSdk(config.environment)
      .then((sdk) => {
        if (cancelled) return
        setPayments(sdk.payments(config.applicationId, config.locationId))
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setSdkError(caught instanceof Error ? caught.message : SDK_FAILED)
      })

    return () => {
      cancelled = true
    }
  }, [config])

  /* ---- 3. Card field -------------------------------------------- */

  useEffect(() => {
    if (isValidPostcode(billingPostcode)) setPostcodeUnlocked(true)
  }, [billingPostcode])

  useEffect(() => {
    if (!payments || method !== 'card' || !postcodeUnlocked) return

    let cancelled = false
    let instance: SquareCardInstance | null = null
    setCardStatus('attaching')

    payments
      .card()
      .then(async (card) => {
        instance = card
        await card.attach('#card-container')
        if (cancelled) {
          await card.destroy().catch(() => undefined)
          return
        }
        cardRef.current = card
        setCardStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setCardStatus('error')
      })

    return () => {
      cancelled = true
      if (cardRef.current === instance) cardRef.current = null
      // Destroying the instance is what stops a card iframe (and its
      // postMessage listeners) leaking across remounts of this step.
      void instance?.destroy().catch(() => undefined)
    }
  }, [payments, method, postcodeUnlocked])

  /* ---- 4. Afterpay ----------------------------------------------- */

  const afterpaySupported =
    payments != null && typeof payments.afterpayClearpay === 'function'

  const afterpayWithinCap =
    config.phase === 'ready' && amount <= config.afterpayMaxOrder

  const afterpayOffered = config.phase === 'ready' && config.afterpayEnabled

  const afterpayUsable = afterpayOffered && afterpayWithinCap && afterpaySupported

  useEffect(() => {
    if (!payments || method !== 'afterpay' || !afterpayUsable) return
    const create = payments.afterpayClearpay
    if (!create) return

    let cancelled = false
    let instance: SquareWalletInstance | null = null
    setWalletStatus('attaching')

    const request = payments.paymentRequest({
      countryCode: 'AU',
      currencyCode: 'AUD',
      total: { amount: amount.toFixed(2), label: 'Total' },
    })

    create
      .call(payments, request)
      .then(async (wallet) => {
        instance = wallet
        await wallet.attach('#afterpay-container')
        if (cancelled) {
          await wallet.destroy().catch(() => undefined)
          return
        }
        walletRef.current = wallet
        setWalletStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setWalletStatus('error')
      })

    return () => {
      cancelled = true
      if (walletRef.current === instance) walletRef.current = null
      void instance?.destroy().catch(() => undefined)
    }
  }, [payments, method, afterpayUsable, amount])

  /* ---- 5. Submit -------------------------------------------------- */

  const charge = useCallback(
    async (sourceId: string, verificationToken?: string) => {
      setStatus('Processing your payment…')
      const assistantChat = assistantConversationForOrder()

      const result = await api.createPayment({
        sourceId,
        ...(verificationToken ? { verificationToken } : {}),
        // Reused verbatim on every retry of this attempt, so a double-click or
        // a retry after a network blip cannot charge the card twice.
        idempotencyKey,
        fulfilment,
        fittingTyres,
        ...(promoCode ? { promoCode } : {}),
        customer,
        ...(fulfilment === 'delivery' && address ? { address } : {}),
        // Ids and quantities only — the server reprices from the catalogue.
        lines,
        ...(notes ? { notes } : {}),
        // Not an input to the price: the server refuses to charge anything
        // other than the total this button showed.
        expectedTotal: amount,
        // Set only when the assistant's card put tyres in this cart, so staff see the chat with the order.
        ...(assistantChat ? { conversationId: assistantChat } : {}),
      })

      onSuccess({
        reference: result.reference,
        orderId: result.orderId,
        paymentId: result.paymentId,
        total: result.total,
        ...(result.receiptUrl ? { receiptUrl: result.receiptUrl } : {}),
      })
    },
    [
      address,
      amount,
      customer,
      fittingTyres,
      fulfilment,
      idempotencyKey,
      lines,
      notes,
      onSuccess,
      promoCode,
    ],
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting) return

    if (!isValidPostcode(billingPostcode)) {
      setPostcodeError('Please enter a valid Australian postcode (4 digits).')
      return
    }
    setPostcodeError(null)

    const instance = method === 'card' ? cardRef.current : walletRef.current
    if (!payments || !instance) {
      setPaymentError(
        'The payment form is still loading. Please wait a moment and try again.',
      )
      return
    }

    setSubmitting(true)
    setPaymentError(null)
    setStatus(
      method === 'afterpay'
        ? 'Opening Afterpay…'
        : 'Checking your card details…',
    )

    try {
      const tokenResult = await instance.tokenize()

      if (tokenResult.status !== 'OK' || !tokenResult.token) {
        const detail =
          tokenResult.errors
            ?.map((error) => error.detail ?? error.message)
            .filter(Boolean)
            .join(' ') || null

        setStatus(null)
        setPaymentError(
          detail ??
            (tokenResult.status === 'Cancel'
              ? 'Payment cancelled. Your card has not been charged.'
              : 'We could not read those card details. Please check them and try again.'),
        )
        return
      }

      let verificationToken: string | undefined

      if (method === 'card') {
        setStatus('Verifying with your bank…')
        try {
          const [givenName, ...rest] = customer.name.trim().split(/\s+/)
          const verification = await payments.verifyBuyer(tokenResult.token, {
            // Display amount for the SCA challenge; the charge is server-priced.
            amount: amount.toFixed(2),
            currencyCode: 'AUD',
            intent: 'CHARGE',
            billingContact: {
              givenName: givenName || customer.name,
              familyName: rest.join(' ') || undefined,
              email: customer.email,
              countryCode: 'AU',
              postalCode: billingPostcode.trim(),
              ...(address
                ? {
                    addressLines: [address.line1],
                    city: address.suburb,
                    state: address.state,
                  }
                : {}),
            },
          })
          verificationToken = verification?.token ?? undefined
        } catch {
          // Strong Customer Authentication is not always required, and some
          // card/issuer combinations reject the challenge outright. Blocking a
          // good sale over an optional step would be worse than proceeding.
          verificationToken = undefined
        }
      }

      await charge(tokenResult.token, verificationToken)
    } catch (caught) {
      setStatus(null)
      // Square's own `errors[].detail` is surfaced verbatim by the API, so a
      // decline reads as a decline. The form keeps its values for the retry —
      // and the same idempotency key, so a successful retry cannot double-charge.
      setPaymentError(
        caught instanceof ApiError
          ? caught.message
          : `Something went wrong taking your payment. Your card may not have been charged — please call ${site.phone.display} before trying again.`,
      )
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- Render ---------------------------------------------------- */

  if (config.phase === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        Loading secure payment…
      </div>
    )
  }

  // Square env vars missing: no card field at all, just the way to order.
  if (config.phase === 'unavailable' || config.phase === 'error') {
    return (
      <PaymentUnavailable
        message={config.message}
        tone={config.phase === 'unavailable' ? 'info' : 'error'}
      />
    )
  }

  const cardBlocked = sdkError != null || cardStatus === 'error'
  const payDisabled =
    submitting ||
    cardBlocked ||
    (method === 'card' && cardStatus !== 'ready') ||
    (method === 'afterpay' && walletStatus !== 'ready')

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <fieldset>
        <legend className="font-heading text-sm font-bold uppercase tracking-wide">
          Payment method
        </legend>

        <div className="mt-3 space-y-2">
          <MethodOption
            value="card"
            checked={method === 'card'}
            onSelect={() => setMethod('card')}
            title="Credit or debit card"
            description="Visa, Mastercard and American Express, processed by Square."
            icon={CreditCard}
          />

          {afterpayOffered ? (
            <MethodOption
              value="afterpay"
              checked={method === 'afterpay'}
              onSelect={() => setMethod('afterpay')}
              disabled={!afterpayWithinCap || !afterpaySupported}
              title="Afterpay"
              description={
                !afterpayWithinCap
                  ? `Afterpay is available for orders up to ${money(config.afterpayMaxOrder)}. This order is ${money(amount)}, so please pay by card.`
                  : !afterpaySupported
                    ? 'Afterpay is unavailable right now — this browser session did not load Afterpay support from Square. Please pay by card.'
                    : "Pay in 4 interest-free instalments with Afterpay. You'll confirm the payment with Afterpay, then return here."
              }
              icon={ShieldCheck}
            />
          ) : null}
        </div>
      </fieldset>

      {sdkError ? (
        <Alert tone="error">
          {SDK_FAILED}{' '}
          <a
            href={site.phone.href}
            className="font-semibold underline underline-offset-4"
          >
            {site.phone.display}
          </a>
        </Alert>
      ) : null}

      {/* The billing postcode is required before the card field is created —
          it is what Square's buyer verification is checked against. */}
      <Field
        label="Billing postcode"
        htmlFor="billing-postcode"
        required
        error={postcodeError ?? undefined}
        hint="The postcode on your card statement. Needed before we can show the secure card field."
      >
        <Input
          id="billing-postcode"
          name="billingPostcode"
          value={billingPostcode}
          inputMode="numeric"
          autoComplete="billing postal-code"
          maxLength={4}
          placeholder="2161"
          className="max-w-[9rem]"
          onChange={(event) => {
            setBillingPostcode(event.target.value.replace(/[^\d]/g, '').slice(0, 4))
            if (postcodeError) setPostcodeError(null)
          }}
        />
      </Field>

      {method === 'card' ? (
        <div className={cn(sdkError && 'hidden')}>
          <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Card details
          </p>

          {!postcodeUnlocked ? (
            <p className="mt-2 rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Enter your billing postcode above to load the secure card field.
            </p>
          ) : null}

          {/* Square replaces this node with its hosted card iframe. */}
          <div
            id="card-container"
            className={cn(
              'mt-2 min-h-[3.25rem] rounded-md',
              postcodeUnlocked ? '' : 'hidden',
            )}
          />

          {cardStatus === 'attaching' ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Loading the secure card field…
            </p>
          ) : null}

          {cardStatus === 'error' ? (
            <Alert tone="error" className="mt-2">
              The secure card field could not be created. Please reload the page,
              or call{' '}
              <a
                href={site.phone.href}
                className="font-semibold underline underline-offset-4"
              >
                {site.phone.display}
              </a>{' '}
              to place your order by phone.
            </Alert>
          ) : null}
        </div>
      ) : (
        <div className={cn(sdkError && 'hidden')}>
          <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
            Afterpay
          </p>
          <div id="afterpay-container" className="mt-2 min-h-[3.25rem]" />
          {walletStatus === 'attaching' ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Loading Afterpay…
            </p>
          ) : null}
          {walletStatus === 'error' ? (
            <Alert tone="error" className="mt-2">
              Afterpay could not be started. Please choose card payment instead.
            </Alert>
          ) : null}
        </div>
      )}

      {paymentError ? <Alert tone="error">{paymentError}</Alert> : null}

      {/* Single live region for everything the buyer needs to hear. */}
      <p aria-live="polite" role="status" className="sr-only">
        {paymentError ?? status ?? ''}
      </p>

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={payDisabled}
      >
        <Lock aria-hidden="true" className="h-4 w-4" />
        {method === 'afterpay'
          ? `Continue with Afterpay — ${money(amount)}`
          : `Pay ${money(amount)} securely`}
      </Button>

      {status && submitting ? (
        <p className="text-center text-xs text-muted-foreground">{status}</p>
      ) : null}

      <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-primary" />
        <span>
          Your payment information is encrypted and secure. We never store your
          card details.
        </span>
      </p>
    </form>
  )
}

/* ------------------------------------------------------------------ */

function PaymentUnavailable({
  message,
  tone,
}: {
  message: string
  tone: 'info' | 'error'
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-lg border p-5 md:p-6',
        tone === 'error'
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-amber-500/40 bg-amber-500/10',
      )}
    >
      <h3 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-600" />
        Card payment unavailable
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Your cart is saved. Call us on{' '}
        <a
          href={site.phone.href}
          className="rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {site.phone.display}
        </a>{' '}
        and we'll place the order for you over the phone. We're open{' '}
        {site.hours.short}.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <a href={site.phone.href}>
            <Phone aria-hidden="true" className="h-4 w-4" />
            Call {site.phone.display}
          </a>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href={`mailto:${site.email.sales}`}>Email {site.email.sales}</a>
        </Button>
      </div>
    </div>
  )
}

function MethodOption({
  value,
  checked,
  onSelect,
  title,
  description,
  icon: Icon,
  disabled = false,
}: {
  value: string
  checked: boolean
  onSelect: () => void
  title: string
  description: string
  icon: typeof CreditCard
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex gap-3 rounded-lg border p-4 transition-colors duration-200',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        'focus-within:ring-offset-background',
        disabled
          ? 'cursor-not-allowed border-border bg-muted/40 opacity-70'
          : checked
            ? 'cursor-pointer border-primary bg-primary/5'
            : 'cursor-pointer border-border bg-card hover:border-primary/50',
      )}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />

      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-primary' : 'border-input',
        )}
      >
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full bg-primary transition-transform duration-200',
            checked ? 'scale-100' : 'scale-0',
          )}
        />
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
          <Icon
            aria-hidden="true"
            className={cn(
              'h-4 w-4 shrink-0',
              checked ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  )
}

function Alert({
  tone,
  className,
  children,
}: {
  tone: 'error' | 'info'
  className?: string
  children: React.ReactNode
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-sm leading-relaxed',
        tone === 'error'
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-border bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
