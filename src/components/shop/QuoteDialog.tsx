import { site } from '@/config/site'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { EnquiryForm } from '@/components/marketing/EnquiryForm'
import { useQuote } from '@/store/ui'
import { ProductThumb } from './ProductThumb'

/**
 * The quote form for price-on-application lines.
 *
 * Mounted once in App and opened with `requestQuote()` from wherever the
 * visitor is — a card, the quick view, the compare table or the product
 * page. The enquiry lands in the admin inbox tagged as a quote, and its first
 * line names the exact SKU whatever the visitor types, so the quote can be
 * priced without a phone call to find out which tyre it was for.
 */
export function QuoteDialog() {
  const product = useQuote((state) => state.product)
  const quantity = useQuote((state) => state.quantity)
  const close = useQuote((state) => state.close)

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      {product ? (
        <DialogContent key={product.id} size="lg" className="p-0">
          <DialogHeader className="border-b border-border">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 rounded-md bg-muted p-1">
                <ProductThumb brand={product.brand} model={product.model} tread={product.tread} />
              </div>
              <div className="min-w-0">
                <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-primary">
                  Request a quote
                </p>
                <DialogTitle>
                  {product.brand} {product.model}{' '}
                  <span className="font-mono normal-case">{product.size}</span>
                </DialogTitle>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  SKU {product.sku} · {product.ply} · {product.positionLabel}
                </p>
              </div>
            </div>
            <DialogDescription>
              This line is price on application: it is built to order, so the
              price depends on quantity and the production run. Tell us how many
              and we will come back with price and lead time, usually within one
              business day.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6">
            <EnquiryForm
              enquiryType="Quote request"
              messagePrefix={`Quote request: ${product.brand} ${product.model} ${product.size} (SKU ${product.sku})`}
              extras={[
                {
                  id: 'quantity',
                  label: 'Quantity',
                  kind: 'text',
                  placeholder: 'How many tyres?',
                  required: true,
                },
              ]}
              defaults={{ quantity: String(quantity) }}
              messageRequired={false}
              messageLabel="Anything else we should know?"
              messagePlaceholder="Delivery suburb or pickup, when you need them, fleet or trade account details."
              submitLabel="Request a quote"
              successTitle="Quote request received"
              successBody={`Thanks — we have your request for the ${product.brand} ${product.model} in ${product.size} and will come back with price and lead time, usually within one business day. If it is urgent, call ${site.phone.display}.`}
            />
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
