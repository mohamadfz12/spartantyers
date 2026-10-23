import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Mail,
  MapPin,
  Package,
  PenLine,
  Search,
  Truck,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import { Badge, Button, Field, Input } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { site } from '@/config/site'
import { formatDueDate } from '@/lib/account-checkout'
import type { Order } from '@/data/types'
import { useCopyToClipboard } from '@/hooks'
import {
  cn,
  formatDate,
  isValidEmail,
  money,
  moneyExact,
  pluralise,
} from '@/lib/utils'

interface ConfirmationState {
  order?: Order
  receiptUrl?: string
}

/**
 * Order confirmation and receipt.
 *
 * The happy path never hits the network: checkout hands the order over in
 * router state, so the page paints the moment the charge succeeds. A refresh or
 * a bookmarked link loses that state, which is what the lookup form is for —
 * and `/api/orders` requires the reference *and* the email, so the page cannot
 * be used to read somebody else's order.
 */
export default function OrderConfirmation() {
  const { reference = '' } = useParams<{ reference: string }>()
  const location = useLocation()
  const passed = (location.state ?? null) as ConfirmationState | null

  const [order, setOrder] = useState<Order | null>(passed?.order ?? null)
  const receiptUrl = passed?.receiptUrl

  return (
    <>
      <Seo
        title={
          order
            ? `Order ${order.reference} confirmed | ${site.name}`
            : reference
              ? `Order ${reference} | ${site.name}`
              : `Find your order | ${site.name}`
        }
        description="Your Spartan Tyres order confirmation and receipt."
        noIndex
      />

      <div className="section-tight">
        <div className="shell max-w-4xl">
          {order ? (
            <Confirmed order={order} receiptUrl={receiptUrl} />
          ) : (
            <Lookup reference={reference} onFound={setOrder} />
          )}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Confirmed
 * ------------------------------------------------------------------ */

function Confirmed({ order, receiptUrl }: { order: Order; receiptUrl?: string }) {
  const { copied, copy } = useCopyToClipboard()
  const gst = Math.round((order.total - order.total / (1 + site.commerce.gstRate)) * 100) / 100
  const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  // A pay-later order is invoiced to the customer's account: not paid yet, due on a date.
  const onAccount = order.payment === 'account'
  const dueText = onAccount && order.dueDate ? formatDueDate(order.dueDate) : null

  return (
    <>
      <header className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
        >
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </span>

        <h1 className="display-3 mt-5">Order confirmed</h1>
        <p className="lede mt-3">
          Thanks{order.customer.name ? `, ${order.customer.name.split(/\s+/)[0]}` : ''} —{' '}
          {onAccount
            ? 'your order is on your account and locked in.'
            : 'your payment went through and your order is locked in.'}
        </p>

        {onAccount ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You can see it, with your statement and tax invoice, in{' '}
            <Link to="/account" className="font-semibold text-primary underline-offset-4 hover:underline">
              My account
            </Link>
            .
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            A confirmation has been sent to{' '}
            <span className="font-semibold text-foreground">{order.customer.email}</span>
          </p>
        )}
      </header>

      {/* Reference */}
      <div className="mt-8 rounded-lg border border-primary/40 bg-primary/5 p-5 text-center md:p-6">
        <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
          Your order reference
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <p className="font-mono text-2xl font-bold tracking-wider sm:text-3xl">
            {order.reference}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copy(order.reference)}
          >
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
            <span className="sr-only"> order reference {order.reference}</span>
          </Button>
        </div>

        <p aria-live="polite" className="sr-only">
          {copied ? 'Order reference copied to clipboard.' : ''}
        </p>

        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Quote this reference in any call or email about the order. Placed{' '}
          {formatDate(order.createdAt)}.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {onAccount ? (
            <Badge variant="primary" data-testid="confirm-on-account">
              {dueText ? `On account, due ${dueText}` : 'On account'}
            </Badge>
          ) : (
            <Badge variant="success">Paid</Badge>
          )}
          <Badge variant="outline">
            {order.fulfilment === 'pickup' ? 'Warehouse pickup' : 'Delivery'}
          </Badge>
          {order.promoCode ? <Badge variant="primary">{order.promoCode}</Badge> : null}
        </div>

        {receiptUrl ? (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'mt-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary',
              'underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
          >
            View your Square receipt
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      {/* Next step for this fulfilment method */}
      <section
        aria-labelledby="fulfilment-next-heading"
        className="mt-6 rounded-lg border border-border bg-card p-5 md:p-6"
      >
        <h2
          id="fulfilment-next-heading"
          className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide"
        >
          {order.fulfilment === 'pickup' ? (
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Truck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          )}
          {order.fulfilment === 'pickup' ? 'Collecting your order' : 'Your delivery'}
        </h2>

        {order.fulfilment === 'pickup' ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your order will be ready for collection at {site.name},{' '}
              {site.warehouse.full}. A member of our team will contact you when
              it's ready to collect.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {site.hours.label}
            </p>
            <a
              href={site.warehouse.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary',
                'underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              Open in Google Maps
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
            {order.fittingTyres > 0 ? (
              <p className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Wheel fitting booked for {order.fittingTyres}{' '}
                {pluralise(order.fittingTyres, 'tyre')} at{' '}
                {money(site.commerce.fittingFeePerTyre)} each. Allow extra time on
                collection day.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Free delivery applies to all metro orders. If your delivery address
              is outside our metro delivery area, a member of our team will
              contact you to arrange shipping and confirm any additional costs.
            </p>
            {order.address ? (
              <address className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm not-italic leading-relaxed">
                <span className="font-semibold">{order.customer.name}</span>
                {order.customer.company ? (
                  <>
                    <br />
                    {order.customer.company}
                  </>
                ) : null}
                <br />
                {order.address.line1}
                <br />
                {order.address.suburb} {order.address.state} {order.address.postcode}
              </address>
            ) : null}
          </>
        )}
      </section>

      {/* What happens next */}
      <section
        aria-labelledby="next-steps-heading"
        className="mt-6 rounded-lg border border-border bg-card p-5 md:p-6"
      >
        <h2
          id="next-steps-heading"
          className="font-heading text-base font-bold uppercase tracking-wide"
        >
          What happens next
        </h2>

        <ol className="mt-4 space-y-4">
          {[
            onAccount
              ? {
                  icon: CreditCard,
                  title: 'Invoiced to your account',
                  body: dueText
                    ? `This order is on your account and is due on ${dueText}. Pay it from your statement in My account, or at the counter.`
                    : 'This order is on your account. Pay it from your statement in My account, or at the counter.',
                }
              : {
                  icon: CreditCard,
                  title: 'Payment processed securely',
                  body: 'Your card payment has been processed securely by Square. We never see or store your card details.',
                },
            {
              icon: Package,
              title: `Packaged at our warehouse within ${site.commerce.dispatchWindow}`,
              body: `Your tyres are picked and packaged at our ${site.warehouse.suburb} warehouse within ${site.commerce.dispatchWindow}.`,
            },
            {
              icon: Mail,
              title: 'Check your order any time',
              body: `Use your order reference and email on the order page, or sign in to My account, to see where your order is up to. For anything urgent, call ${site.phone.display}.`,
            },
            {
              icon: PenLine,
              title: 'Signature required on delivery',
              body: 'A signature is required on delivery, so please make sure someone is on site to receive the order.',
            },
          ].map((entry, index) => (
            <li key={entry.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-primary/5 font-heading text-sm font-bold tabular-nums text-primary"
              >
                {index + 1}
              </span>
              <span className="min-w-0 pt-1">
                <span className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
                  <entry.icon
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  {entry.title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {entry.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Itemised order */}
      <section
        aria-labelledby="order-items-heading"
        className="mt-6 rounded-lg border border-border bg-card"
      >
        <h2
          id="order-items-heading"
          className="border-b border-border p-5 font-heading text-base font-bold uppercase tracking-wide md:p-6"
        >
          Your order
          <span className="ml-2 font-sans text-sm font-normal normal-case tracking-normal text-muted-foreground">
            {itemCount} {pluralise(itemCount, 'tyre')}
          </span>
        </h2>

        <ul className="divide-y divide-border">
          {order.lines.map((line) => (
            <li
              key={`${line.sku}-${line.size}`}
              className="flex flex-wrap items-baseline justify-between gap-2 p-4 md:px-6"
            >
              <span className="min-w-0">
                <span className="block font-heading text-sm font-bold">{line.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {line.size} &middot; SKU {line.sku} &middot; {line.quantity} &times;{' '}
                  {money(line.unitPrice)}
                </span>
              </span>
              <span className="font-heading text-sm font-bold tabular-nums">
                {money(line.unitPrice * line.quantity)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="space-y-2 border-t border-border p-5 text-sm md:p-6">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{money(order.subtotal)}</dd>
          </div>

          {order.discount > 0 ? (
            <div className="flex justify-between gap-3 text-primary">
              <dt>Discount{order.promoCode ? ` (incl. ${order.promoCode})` : ''}</dt>
              <dd className="font-semibold tabular-nums">
                &minus;{money(order.discount)}
              </dd>
            </div>
          ) : null}

          {order.fittingTotal > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                Wheel fitting ({order.fittingTyres} &times;{' '}
                {money(site.commerce.fittingFeePerTyre)})
              </dt>
              <dd className="tabular-nums">{money(order.fittingTotal)}</dd>
            </div>
          ) : null}

          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              {order.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}
            </dt>
            <dd className="font-medium text-primary">
              {order.fulfilment === 'pickup' ? site.warehouse.suburb : 'Free to metro'}
            </dd>
          </div>

          <div className="flex justify-between gap-3 border-t border-border pt-3">
            <dt className="font-heading text-base font-bold uppercase tracking-wide">
              {onAccount ? 'Total on account' : 'Total paid'}
            </dt>
            <dd className="font-heading text-xl font-black tabular-nums">
              {money(order.total)}
            </dd>
          </div>

          <div className="flex justify-end">
            <dt className="sr-only">GST included</dt>
            <dd className="text-xs text-muted-foreground">
              Includes {moneyExact(gst)} GST
            </dd>
          </div>
        </dl>
      </section>

      {order.notes ? (
        <section className="mt-6 rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="font-heading text-sm font-bold uppercase tracking-wide">
            Your notes
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {order.notes}
          </p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link to="/shop">
            <Package aria-hidden="true" className="h-4 w-4" />
            Keep shopping
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/contact">Contact our team</Link>
        </Button>
      </div>

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
        <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>
          Questions about this order? Call{' '}
          <a
            href={site.phone.href}
            className="rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {site.phone.display}
          </a>{' '}
          or email{' '}
          <a
            href={`mailto:${site.email.sales}`}
            className="rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {site.email.sales}
          </a>
          . We're open {site.hours.short}.
        </span>
      </p>
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Lookup — for a refresh or a direct visit, where router state is gone
 * ------------------------------------------------------------------ */

function Lookup({
  reference: knownReference,
  onFound,
}: {
  /** Empty on `/order`, where the customer types the reference themselves. */
  reference: string
  onFound: (order: Order) => void
}) {
  const [typedReference, setTypedReference] = useState('')
  const reference = knownReference || typedReference.trim()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return

    if (!reference) {
      setError('Please enter your order reference (it starts with SPT-).')
      return
    }

    if (!isValidEmail(email)) {
      setError('Please enter the email address used on the order.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await api.lookupOrder(reference, email.trim())
      onFound(result.order)
    } catch (caught) {
      const unreachable =
        !(caught instanceof ApiError) || caught.status === 0 || caught.status === 408
      setError(
        unreachable
          ? `We couldn't reach our order service just now. Please check your connection and try again, or call ${site.phone.display}.`
          : caught.message,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted"
        >
          <Search className="h-8 w-8 text-muted-foreground" />
        </span>

        <h1 className="display-3 mt-5">Find your order</h1>
        <p className="lede mt-3">
          For your security we need the email address on the order before we can
          show it.
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-md rounded-lg border border-border bg-card p-5 md:p-6">
        {knownReference ? (
          <dl className="flex items-baseline justify-between gap-3 border-b border-border pb-4">
            <dt className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
              Reference
            </dt>
            <dd className="font-mono text-base font-bold tracking-wider">
              {knownReference}
            </dd>
          </dl>
        ) : null}

        <form
          onSubmit={handleSubmit}
          noValidate
          className={knownReference ? 'mt-5' : undefined}
        >
          {knownReference ? null : (
            <Field
              label="Order reference"
              htmlFor="lookup-reference"
              required
              className="mb-5"
            >
              <Input
                id="lookup-reference"
                name="reference"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="SPT-XXXX-XXXX"
                value={typedReference}
                onChange={(event) => {
                  setTypedReference(event.target.value)
                  if (error) setError(null)
                }}
                className="font-mono"
              />
            </Field>
          )}
          <Field
            label="Email on the order"
            htmlFor="lookup-email"
            required
            error={error ?? undefined}
          >
            <Input
              id="lookup-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (error) setError(null)
              }}
            />
          </Field>

          <Button type="submit" size="lg" className="mt-5 w-full" loading={loading}>
            <Search aria-hidden="true" className="h-4 w-4" />
            Find my order
          </Button>

          <p aria-live="polite" role="status" className="sr-only">
            {error ?? (loading ? 'Looking up your order.' : '')}
          </p>
        </form>

        <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Can't find it? Your confirmation email has the reference and a copy of
            the receipt. Or call{' '}
            <a
              href={site.phone.href}
              className="rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {site.phone.display}
            </a>{' '}
            and we'll look it up for you.
          </span>
        </p>
      </div>
    </>
  )
}
