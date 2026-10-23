import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Clock,
  Factory,
  MapPin,
  MessageSquareQuote,
  Package,
  Phone,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Truck,
} from 'lucide-react'
import type { Product } from '@/data/types'
import {
  PRICE_BREAKS,
  effectivePrice,
  getProduct,
  priceBreakFor,
  relatedProducts,
} from '@/data/products'
import { averageRating, reviewsForProduct } from '@/data/reviews'
import { deliveryZones, warrantyTerms } from '@/data/content'
import { site } from '@/config/site'
import { cn, formatDate, formatNumber, money, pluralise, specValue } from '@/lib/utils'
import { useCart } from '@/store/cart'
import { volumeUnit } from '@/lib/account-price-display'
import { usePriceView, YourPrice } from '@/components/shop/YourPrice'
import { requestQuote, toast, useRecentlyViewed, useRenderQuality } from '@/store/ui'
import { productGallery, productPhotoFor, type GalleryShot } from '@/data/media'
import {
  Badge,
  Button,
  Rating,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { ProductWheel, StaticWheel, TREAD_SPECS } from '@/components/three'
import { Reveal, Stagger } from '@/components/motion'
import { Seo, breadcrumbJsonLd } from '@/components/Seo'
import { ProductCard } from '@/components/shop/ProductCard'
import { QuantityStepper } from '@/components/shop/QuantityStepper'
import { SpecTable } from '@/components/shop/SpecTable'

/**
 * The client's pre-order wording. It used to promise stock "1–7 August",
 * which had long passed; the date is gone until there is a real one to give.
 */
const PRE_ORDER_COPY =
  'This tyre is currently out of stock. Pre-order now to secure yours — we will confirm the expected arrival with you, and normal shipping and handling times apply once stock is received.'

/** The gallery for one product: its own photograph first, stock shots only when it has none. */
function galleryFor(product: Product): { shots: GalleryShot[]; leadWithPhoto: boolean } {
  const own = productPhotoFor(product)
  if (!own) return { shots: productGallery, leadWithPhoto: false }
  return {
    shots: [{ ...own, label: own.wholeTyre ? 'Photo' : 'Tread', illustrative: false }],
    leadWithPhoto: own.wholeTyre,
  }
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const product = id ? getProduct(id) : undefined

  if (!product) return <NotFound requested={id} />
  return <Detail key={product.id} product={product} />
}

/* ------------------------------------------------------------------ *
 * Found
 * ------------------------------------------------------------------ */

function Detail({ product }: { product: Product }) {
  const add = useCart((state) => state.add)
  const record = useRecentlyViewed((state) => state.record)
  const quality = useRenderQuality((state) => state.quality)
  const setQuality = useRenderQuality((state) => state.setQuality)

  const [quantity, setQuantity] = useState(4)
  const { shots, leadWithPhoto } = useMemo(() => galleryFor(product), [product])
  /** Which gallery image is showing: the generated wheel, or a photo index. */
  const [shot, setShot] = useState<'wheel' | number>(leadWithPhoto ? 0 : 'wheel')

  useEffect(() => record(product.id), [record, product.id])

  // `price` is the public shelf price: it alone feeds the page title, description and structured data.
  // `view` is what THIS visitor sees in the buy box (their own account price when it beats the shelf price).
  const price = effectivePrice(product)
  const view = usePriceView(product)
  const unit = view.current ?? 0
  const outOfStock = view.buyable && product.stock <= 0
  const lowStock = view.buyable && product.stock > 0 && product.stock <= 5
  const maxQuantity = !view.buyable || outOfStock ? 200 : Math.max(product.stock, 1)

  const band = priceBreakFor(quantity)
  const nextBreak = PRICE_BREAKS.find((entry) => quantity < entry.min) ?? null

  const reviews = useMemo(() => reviewsForProduct(product.id), [product.id])
  const average = useMemo(() => averageRating(product.id), [product.id])
  const related = useMemo(() => relatedProducts(product), [product])
  const tread = TREAD_SPECS[product.tread]
  const photo = shot === 'wheel' ? null : shots[shot]

  const jsonLd = useMemo(() => {
    const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const own = productPhotoFor(product)

    const productLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `${product.brand} ${product.model} ${product.size}`,
      sku: product.sku,
      mpn: product.model,
      description: product.description,
      category: 'Commercial truck tyres',
      brand: { '@type': 'Brand', name: product.brand },
      ...(own ? { image: `${site.url}${own.src}` } : {}),
    }

    // A price-on-application line has no price to put in an Offer, and an
    // Offer without one is invalid — so POA lines simply carry none.
    if (price != null) {
      productLd.offers = {
        '@type': 'Offer',
        url: `${site.url}/product/${product.id}`,
        priceCurrency: 'AUD',
        price: price.toFixed(2),
        priceValidUntil: validUntil,
        availability: outOfStock
          ? 'https://schema.org/PreOrder'
          : 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
        seller: { '@type': 'Organization', name: site.legalName },
      }
    }

    const reviewed = reviewsForProduct(product.id)
    if (reviewed.length > 0) {
      productLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: averageRating(product.id),
        reviewCount: reviewed.length,
        bestRating: 5,
        worstRating: 1,
      }
    }

    return [
      productLd,
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: `${product.brand} ${product.model} ${product.size}`, path: `/product/${product.id}` },
      ]),
    ]
  }, [product, price, outOfStock])

  const handleAdd = () => {
    add(product, quantity)
    toast({
      title: outOfStock ? 'Added as pre-order' : 'Added to cart',
      description: `${quantity} × ${product.brand} ${product.model} — ${product.size}`,
      variant: 'success',
    })
  }

  const specFacts = [
    `${product.ply} casing`,
    product.treadDepthMm != null ? `${product.treadDepthMm}mm tread` : null,
    product.maxLoadKg != null ? `${formatNumber(product.maxLoadKg)}kg per tyre` : null,
  ].filter(Boolean)
  const specSummary = `${product.headline}. ${specFacts.join(', ')}.`

  return (
    <>
      <Seo
        title={`${product.brand} ${product.model} ${product.size} — ${price != null ? money(price) : 'Price on application'} | ${site.name}`}
        description={
          price != null
            ? `${specSummary} ${money(price)} per tyre inc. GST, ${outOfStock ? 'available to pre-order' : 'in stock at Yennora'}.`
            : `${specSummary} Built to order — request a quote for price and lead time.`
        }
        canonicalPath={`/product/${product.id}`}
        type="product"
        jsonLd={jsonLd}
      />

      {/* Breadcrumb -------------------------------------------- */}
      <nav aria-label="Breadcrumb" className="border-b border-border bg-card">
        <ol className="shell flex flex-wrap items-center gap-1.5 py-3 text-xs text-muted-foreground">
          <li>
            <Link to="/" className="transition-colors hover:text-primary">
              Home
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="h-3 w-3" />
          <li>
            <Link to="/shop" className="transition-colors hover:text-primary">
              Shop
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="h-3 w-3" />
          <li>
            <Link
              to={`/shop?size=${encodeURIComponent(product.size)}`}
              className="font-mono transition-colors hover:text-primary"
            >
              {product.size}
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="h-3 w-3" />
          <li aria-current="page" className="font-semibold text-foreground">
            {product.model}
          </li>
        </ol>
      </nav>

      {/* Hero -------------------------------------------------- */}
      <section className="shell grid gap-8 py-8 lg:grid-cols-2 lg:gap-12 lg:py-14">
        {/* Wheel */}
        <div>
          <div
            className={cn(
              'relative overflow-hidden rounded-lg border border-border',
              photo && !photo.illustrative
                ? 'bg-white'
                : 'bg-gradient-to-b from-muted/60 to-muted',
            )}
          >
            {photo == null ? (
              <>
                <ProductWheel
                  product={product}
                  className="h-[18rem] w-full sm:h-[24rem] lg:h-[30rem]"
                />
                {quality !== 'off' ? (
                  <p className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-[0.68rem] font-bold uppercase tracking-brand text-muted-foreground">
                    <RotateCcw aria-hidden="true" className="h-3 w-3" />
                    Drag to rotate · scroll to zoom
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <img
                  key={photo.src}
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  decoding="async"
                  className={cn(
                    'h-[18rem] w-full animate-in fade-in duration-300 sm:h-[24rem] lg:h-[30rem]',
                    photo.illustrative ? 'object-cover' : 'object-contain p-6',
                  )}
                />
                {/* A buyer should never have to guess whether a photo is of
                    the exact item. The stock shots are shared across lines
                    with no photograph of their own, so say so rather than
                    imply otherwise. */}
                {photo.illustrative ? (
                  <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-charcoal/90 to-transparent px-4 pb-3 pt-8 text-center text-[0.68rem] text-white/75">
                    Illustrative photograph. Switch to the 3D model for this
                    tyre's actual {product.brand} {product.model} sidewall and{' '}
                    {TREAD_SPECS[product.tread].label.toLowerCase()} pattern.
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* Gallery thumbnails. The catalogue photograph leads where there is
              one; otherwise the generated wheel does, as the only view that
              is accurate to this exact SKU. */}
          <div
            role="group"
            aria-label="Product images"
            className="mt-3 flex items-center gap-2"
          >
            {leadWithPhoto ? (
              <GalleryThumb image={shots[0]} active={shot === 0} onSelect={() => setShot(0)} />
            ) : null}

            <button
              type="button"
              aria-pressed={shot === 'wheel'}
              onClick={() => setShot('wheel')}
              title="Interactive 3D model of this tyre"
              className={cn(
                'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-muted p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                shot === 'wheel'
                  ? 'border-primary'
                  : 'border-border hover:border-primary/40',
              )}
            >
              <StaticWheel tread={product.tread} />
              <span className="sr-only">
                3D model of the {product.brand} {product.model}
              </span>
              <span
                aria-hidden="true"
                className="absolute bottom-0 right-0 rounded-tl bg-primary px-1 font-heading text-[0.55rem] font-black text-primary-foreground"
              >
                3D
              </span>
            </button>

            {shots.map((image, index) =>
              leadWithPhoto && index === 0 ? null : (
                <GalleryThumb
                  key={image.src}
                  image={image}
                  active={shot === index}
                  onSelect={() => setShot(index)}
                />
              ),
            )}

            {/* The 3D renderer stays optional for anyone who would rather not
                run WebGL at all. */}
            {shot === 'wheel' ? (
              <button
                type="button"
                onClick={() => setQuality(quality === 'off' ? 'high' : 'off')}
                className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {quality === 'off' ? 'Enable 3D' : 'Turn off 3D'}
              </button>
            ) : null}
          </div>
        </div>

        {/* Buy box */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/shop?brand=${encodeURIComponent(product.brand)}`}
              className="font-heading text-xs font-bold uppercase tracking-brand text-primary hover:underline"
            >
              {product.brand}
            </Link>
            {product.discount ? (
              <Badge variant="destructive" size="sm">
                Save {product.discount}%
              </Badge>
            ) : null}
            {product.fuelRating === 'A' ? (
              <Badge variant="success" size="sm">
                A-rated rolling resistance
              </Badge>
            ) : null}
            {product.threePeak ? (
              <Badge variant="outline" size="sm">
                Severe service
              </Badge>
            ) : null}
          </div>

          <h1 className="display-2 mt-2">{product.model}</h1>
          <p className="mt-2 font-mono text-lg font-semibold text-muted-foreground">
            {product.size} · {product.ply} · {product.positionLabel}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {product.reviewCount > 0 ? (
              <>
                <Rating
                  value={product.rating}
                  count={product.reviewCount}
                  size="md"
                  showValue
                />
                <span aria-hidden="true" className="text-border">
                  |
                </span>
              </>
            ) : null}
            <span className="font-mono text-xs text-muted-foreground">
              SKU {product.sku}
            </span>
          </div>

          <p className="lede mt-5">{product.description}</p>

          {!view.buyable ? (
            <PoaPanel
              product={product}
              quantity={quantity}
              onQuantityChange={setQuantity}
              maxQuantity={maxQuantity}
            />
          ) : (
          /* Price */
          <div className="mt-6 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-end gap-3">
              {view.yours ? (
                <YourPrice view={view} priceClassName="text-4xl" retailClassName="text-lg" />
              ) : (
                <>
                  <span className="font-heading text-4xl font-black leading-none">
                    {money(unit)}
                  </span>
                  {product.discountPrice != null && product.price != null ? (
                    <span className="text-lg text-muted-foreground line-through">
                      {money(product.price)}
                    </span>
                  ) : null}
                </>
              )}
              <span className="pb-1 text-sm text-muted-foreground">
                per tyre, inc. GST
              </span>
            </div>

            {/* Stock state */}
            <div className="mt-4">
              {outOfStock ? (
                <div className="rounded-md border border-border bg-muted/60 p-4">
                  <p className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
                    <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
                    Pre-order
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {PRE_ORDER_COPY}
                  </p>
                </div>
              ) : lowStock ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  <AlertCircle aria-hidden="true" className="h-4 w-4" />
                  Only {product.stock} left in stock
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <Check aria-hidden="true" className="h-4 w-4" />
                  In stock — {formatNumber(product.stock)} on the floor at Yennora
                </p>
              )}
            </div>

            {/* Quantity + add */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div>
                <label
                  htmlFor="detail-quantity"
                  className="mb-1.5 block font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
                >
                  Quantity
                </label>
                <QuantityStepper
                  id="detail-quantity"
                  label={`Quantity of ${product.brand} ${product.model} ${product.size}`}
                  value={quantity}
                  onChange={setQuantity}
                  max={maxQuantity}
                />
              </div>

              <Button
                onClick={handleAdd}
                size="lg"
                className="mt-6 flex-1 sm:mt-6"
                variant={outOfStock ? 'outline' : 'primary'}
              >
                <ShoppingCart aria-hidden="true" className="mr-2 h-5 w-5" />
                {outOfStock ? 'Pre-order' : 'Add to cart'}
              </Button>
            </div>

            {!outOfStock && quantity >= product.stock ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                That is everything we hold in this line. Call{' '}
                <a
                  href={site.phone.href}
                  className="font-semibold text-primary hover:underline"
                >
                  {site.phone.display}
                </a>{' '}
                for lead times on larger volumes.
              </p>
            ) : null}

            {/* Volume price breaks */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
                Volume pricing
              </p>

              <p className="mt-2 text-sm">
                <span className="font-heading text-lg font-black">
                  {money(band ? (volumeUnit(view, band.discount) ?? unit) : unit)}
                </span>{' '}
                <span className="text-muted-foreground">
                  each at {quantity} {pluralise(quantity, 'tyre')}
                  {view.yours
                    ? ': your account price, or the volume price when that is lower'
                    : band
                      ? ` — ${band.label}, ${Math.round(band.discount * 100)}% off`
                      : ''}
                </span>
              </p>

              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRICE_BREAKS.map((entry) => {
                  const active = band?.min === entry.min
                  return (
                    <li
                      key={entry.min}
                      className={cn(
                        'rounded-md border p-2.5 text-center transition-colors',
                        active
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-background',
                      )}
                    >
                      <p className="font-heading text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                        {entry.label}
                      </p>
                      <p
                        className={cn(
                          'mt-1 font-heading text-sm font-black tabular-nums',
                          active ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {money(volumeUnit(view, entry.discount) ?? unit)}
                      </p>
                      <p className="text-[0.65rem] text-muted-foreground">
                        {Math.round(entry.discount * 100)}% off
                      </p>
                    </li>
                  )
                })}
              </ul>

              {nextBreak ? (
                <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Sparkles
                    aria-hidden="true"
                    className="mt-px h-3.5 w-3.5 shrink-0 text-primary"
                  />
                  <span>
                    Add {nextBreak.min - quantity} more to reach {nextBreak.label} and
                    pay {money(volumeUnit(view, nextBreak.discount) ?? unit)} each. Volume
                    discounts apply automatically in the cart.
                  </span>
                </p>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  You are on our deepest break. Volume discounts apply
                  automatically in the cart.
                </p>
              )}
            </div>
          </div>
          )}

          {/* Highlights */}
          <ul className="mt-6 flex flex-col gap-2.5">
            {product.highlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15"
                >
                  <Check className="h-3 w-3 text-primary" strokeWidth={3} />
                </span>
                <span className="leading-relaxed">{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tabs -------------------------------------------------- */}
      <section className="shell pb-10 md:pb-16">
        <Tabs defaultValue="specs">
          <TabsList label="Product information">
            <TabsTrigger value="specs">Specifications</TabsTrigger>
            <TabsTrigger value="tread">Tread pattern</TabsTrigger>
            <TabsTrigger value="reviews">
              Reviews
              {reviews.length > 0 ? (
                <span className="ml-1.5 font-normal normal-case text-muted-foreground">
                  ({reviews.length})
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="warranty">Warranty &amp; returns</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
          </TabsList>

          {/* Specifications */}
          <TabsContent value="specs">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="font-heading text-sm font-bold uppercase tracking-brand text-muted-foreground">
                  Manufacturer specification
                </h2>
                <SpecTable product={product} className="mt-3" />
              </div>

              <aside className="rounded-lg border border-border bg-card p-5">
                <h2 className="font-heading text-sm font-bold uppercase tracking-brand text-muted-foreground">
                  Reading these numbers
                </h2>
                <dl className="mt-3 flex flex-col gap-4 text-sm">
                  <div>
                    <dt className="font-semibold">
                      Load index {product.loadIndex ?? 'to be confirmed'}
                    </dt>
                    <dd className="mt-1 leading-relaxed text-muted-foreground">
                      {product.maxLoadKg != null ? (
                        <>
                          {formatNumber(product.maxLoadKg)}kg per tyre on a single
                          fitment. Multiply by the number of tyres on the axle, then
                          check it against the axle rating on your plate — not the
                          other way round.
                        </>
                      ) : (
                        <>
                          Not in the published data for this line. We confirm it
                          with your order — check it against the axle rating on
                          your plate before anything is fitted.
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">
                      Speed symbol {product.speedRating ?? 'to be confirmed'}
                    </dt>
                    <dd className="mt-1 leading-relaxed text-muted-foreground">
                      {product.maxSpeedKmh != null ? (
                        <>
                          Rated to {product.maxSpeedKmh}km/h sustained. Every
                          Australian highway limit sits inside that, but a lower
                          symbol is worth knowing about if the truck is governed
                          higher.
                        </>
                      ) : (
                        <>
                          Not in the published data for this line. We confirm the
                          rated speed with your order.
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">
                      Measuring rim {product.rim}in
                    </dt>
                    <dd className="mt-1 leading-relaxed text-muted-foreground">
                      The rim width the published figures are measured on. Fitting a
                      narrower or wider rim changes the real section width and the
                      wear pattern.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">
                      Tread{' '}
                      {specValue(product.treadDepthMm, (mm) => `${mm}mm`, 'to be confirmed')}
                    </dt>
                    <dd className="mt-1 leading-relaxed text-muted-foreground">
                      Depth when new. Legal minimum is 1.6mm, so this is the usable
                      rubber you are buying — and what decides whether the casing is
                      worth sending away for a retread.
                    </dd>
                  </div>
                </dl>
              </aside>
            </div>
          </TabsContent>

          {/* Tread pattern */}
          <TabsContent value="tread">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
              <div className="rounded-lg border border-border bg-gradient-to-b from-muted/60 to-muted p-8">
                <StaticWheel
                  tread={product.tread}
                  label={product.brand}
                  size={product.size}
                  className="mx-auto max-h-[22rem] drop-shadow-2xl"
                  title={`${tread.label} pattern on the ${product.brand} ${product.model}`}
                />
              </div>

              <div>
                <Badge variant="primary">{product.tread} family</Badge>
                <h2 className="display-3 mt-3">{tread.label}</h2>
                <p className="lede mt-3">{tread.detail}</p>

                <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Stat
                    label="Tread depth"
                    value={specValue(product.treadDepthMm, (mm) => `${mm}mm`, 'TBC')}
                  />
                  <Stat
                    label="Pass-by noise"
                    value={specValue(product.noiseDb, (db) => `${db}dB`, 'Not published')}
                  />
                  <Stat label="Fuel rating" value={product.fuelRating ?? 'Not published'} />
                  <Stat
                    label="Retreadable"
                    value={
                      product.retreadable == null
                        ? 'Not published'
                        : product.retreadable
                          ? 'Yes'
                          : 'No'
                    }
                  />
                  <Stat
                    label="Severe service"
                    value={product.threePeak ? 'Rated' : 'No'}
                  />
                  <Stat label="Fitment" value={product.positionLabel} />
                </dl>

                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  Weighing it up against another pattern?{' '}
                  <Link to="/compare" className="font-semibold text-primary hover:underline">
                    Compare tyres side by side
                  </Link>
                  .
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Reviews */}
          <TabsContent value="reviews">
            {reviews.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6">
                <h2 className="font-heading text-lg font-bold uppercase tracking-wide">
                  No reviews on this line yet
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {product.reviewCount > 0 ? (
                    <>
                      This pattern carries a {product.rating.toFixed(1)} average from{' '}
                      {formatNumber(product.reviewCount)} ratings across our catalogue,
                      but nobody has written us a full review of it yet.
                    </>
                  ) : (
                    <>Nobody has rated or reviewed this line with us yet.</>
                  )}{' '}
                  Run a set and tell us how they went — call{' '}
                  <a
                    href={site.phone.href}
                    className="font-semibold text-primary hover:underline"
                  >
                    {site.phone.display}
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
                {/* Summary + histogram */}
                <div className="rounded-lg border border-border bg-card p-5">
                  <h2 className="font-heading text-sm font-bold uppercase tracking-brand text-muted-foreground">
                    Customer reviews
                  </h2>
                  <p className="mt-3 font-heading text-4xl font-black leading-none">
                    {average.toFixed(1)}
                  </p>
                  <Rating value={average} size="md" className="mt-2" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    From {reviews.length} written{' '}
                    {pluralise(reviews.length, 'review')} of this line
                  </p>

                  <ul className="mt-5 flex flex-col gap-1.5">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = reviews.filter(
                        (review) => Math.round(review.rating) === star,
                      ).length
                      const share = reviews.length
                        ? (count / reviews.length) * 100
                        : 0
                      return (
                        <li key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                            {star} ★
                          </span>
                          <span
                            className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                            role="img"
                            aria-label={`${count} of ${reviews.length} reviews gave ${star} stars`}
                          >
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${share}%` }}
                            />
                          </span>
                          <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">
                            {count}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {/* Reviews */}
                <ul className="flex flex-col gap-4">
                  {reviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-lg border border-border bg-card p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-heading text-sm font-bold">
                            {review.author}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {review.role} · {review.location}
                          </p>
                        </div>
                        <div className="text-right">
                          <Rating value={review.rating} size="sm" />
                          <p className="mt-1 text-xs text-muted-foreground">
                            <time dateTime={review.date}>
                              {formatDate(review.date)}
                            </time>
                          </p>
                        </div>
                      </div>
                      <blockquote className="mt-3 text-sm leading-relaxed">
                        {review.body}
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Warranty */}
          <TabsContent value="warranty">
            <div className="grid gap-4 sm:grid-cols-2">
              {warrantyTerms.map((term) => (
                <article
                  key={term.title}
                  className="rounded-lg border border-border bg-card p-5"
                >
                  <h2 className="font-heading text-base font-bold uppercase tracking-wide">
                    {term.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {term.body}
                  </p>
                </article>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Full terms are on our{' '}
              <Link to="/returns" className="font-semibold text-primary hover:underline">
                returns &amp; warranty page
              </Link>
              .
            </p>
          </TabsContent>

          {/* Delivery */}
          <TabsContent value="delivery">
            <div className="grid gap-5 lg:grid-cols-3">
              <article className="rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide">
                  <Truck aria-hidden="true" className="h-4 w-4 text-primary" />
                  Free metro delivery
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {deliveryZones.note}
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {deliveryZones.metro.map((city) => (
                    <li key={city}>
                      <Badge variant="outline" size="sm">
                        {city}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide">
                  <MapPin aria-hidden="true" className="h-4 w-4 text-primary" />
                  Outside metro
                </h2>
                <ol className="mt-3 flex flex-col gap-3">
                  {deliveryZones.nonMetroSteps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-relaxed">
                      <span
                        aria-hidden="true"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 font-heading text-[0.65rem] font-bold text-primary"
                      >
                        {index + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </article>

              <article className="rounded-lg border border-border bg-card p-5">
                <h2 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-wide">
                  <Package aria-hidden="true" className="h-4 w-4 text-primary" />
                  Pickup &amp; fitting
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {deliveryZones.pickupPoints.map((point) => (
                    <li key={point.title}>
                      <p className="text-sm font-semibold">{point.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {point.body}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 flex items-center gap-2 font-heading text-xs font-bold uppercase tracking-wide text-primary">
                  <Box aria-hidden="true" className="h-3.5 w-3.5" />
                  Fitting {money(site.commerce.fittingFeePerTyre)} per tyre
                </p>
              </article>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              Full detail on our{' '}
              <Link to="/shipping" className="font-semibold text-primary hover:underline">
                shipping &amp; delivery page
              </Link>
              , or call{' '}
              <a
                href={site.phone.href}
                className="font-semibold text-primary hover:underline"
              >
                {site.phone.display}
              </a>
              .
            </p>
          </TabsContent>
        </Tabs>
      </section>

      {/* Related ----------------------------------------------- */}
      {related.length > 0 ? (
        <section className="border-t border-border bg-card/40 py-12 md:py-16">
          <div className="shell">
            <Reveal>
              <p className="eyebrow">Also worth a look</p>
              <h2 className="display-3 mt-2">
                Fitments close to the {product.model}
              </h2>
              <p className="lede mt-3 max-w-2xl">
                Same size, same axle or the same job — ranked by how closely they
                match this tyre.
              </p>
            </Reveal>

            <Stagger className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} className="h-full" />
              ))}
            </Stagger>

            <div className="mt-8">
              <Button asChild variant="outline">
                <Link to={`/shop?size=${encodeURIComponent(product.size)}`}>
                  Every {product.size} we stock
                  <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */

/**
 * The buy box for a price-on-application line. Same quantity control as a
 * priced line, but it feeds a quote request instead of the cart — there is
 * no price to put a volume break against.
 */
function PoaPanel({
  product,
  quantity,
  onQuantityChange,
  maxQuantity,
}: {
  product: Product
  quantity: number
  onQuantityChange: (quantity: number) => void
  maxQuantity: number
}) {
  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <span className="font-heading text-4xl font-black leading-none">POA</span>
        <span className="pb-1 text-sm text-muted-foreground">Price on application</span>
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted/60 p-4">
        <p className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide">
          <Factory aria-hidden="true" className="h-4 w-4 text-primary" />
          Built to order
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This line is built to order rather than held on the floor, so it is
          priced per order. Tell us how many you need and we will come back with
          price and lead time, usually within one business day.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div>
          <label
            htmlFor="detail-quantity"
            className="mb-1.5 block font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground"
          >
            Quantity
          </label>
          <QuantityStepper
            id="detail-quantity"
            label={`Quantity of ${product.brand} ${product.model} ${product.size}`}
            value={quantity}
            onChange={onQuantityChange}
            max={maxQuantity}
          />
        </div>

        <Button
          onClick={() => requestQuote(product, quantity)}
          size="lg"
          className="mt-6 flex-1 sm:mt-6"
        >
          <MessageSquareQuote aria-hidden="true" className="mr-2 h-5 w-5" />
          Request a quote
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Rather talk it through? Call{' '}
        <a href={site.phone.href} className="font-semibold text-primary hover:underline">
          {site.phone.display}
        </a>{' '}
        — {site.hours.short}.
      </p>
    </div>
  )
}

function GalleryThumb({
  image,
  active,
  onSelect,
}: {
  image: GalleryShot
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      title={
        image.illustrative
          ? `${image.label} photograph (illustrative)`
          : `${image.label} — manufacturer photograph`
      }
      className={cn(
        'h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        image.illustrative ? null : 'bg-white p-0.5',
        active ? 'border-primary' : 'border-border hover:border-primary/40',
      )}
    >
      <img
        src={image.src}
        alt=""
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        className={cn('h-full w-full', image.illustrative ? 'object-cover' : 'object-contain')}
      />
      <span className="sr-only">{image.label} photograph</span>
    </button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <dt className="font-heading text-[0.6rem] font-bold uppercase tracking-brand text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-base font-black">{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Not found
 *
 * No redirect: a stale link or a typo should say so plainly, keep the URL
 * intact so it can be corrected, and hand over a way through.
 * ------------------------------------------------------------------ */

function NotFound({ requested }: { requested?: string }) {
  return (
    <>
      <Seo
        title={`Tyre not found | ${site.name}`}
        description="That tyre is not in our catalogue. Browse the full range or call our team to find the right fitment."
        noIndex
      />

      <section className="shell flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <div className="h-28 w-28 opacity-70">
          <StaticWheel tread="lug" title="Truck tyre" />
        </div>

        <Badge variant="warning" className="mt-6">
          Not in the catalogue
        </Badge>

        <h1 className="display-2 mt-4">We could not find that tyre</h1>

        <p className="lede mt-4 max-w-xl">
          {requested ? (
            <>
              Nothing in our range matches{' '}
              <span className="font-mono font-semibold text-foreground">
                {requested}
              </span>
              . The line may have been renamed, or the link may be incomplete.
            </>
          ) : (
            'No tyre was specified. Browse the range and pick a fitment.'
          )}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/shop">
              Browse all tyres
              <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/finder">Find my size</Link>
          </Button>
        </div>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <Phone aria-hidden="true" className="h-4 w-4 text-primary" />
          Know the size but not the pattern? Call{' '}
          <a
            href={site.phone.href}
            className="font-semibold text-primary hover:underline"
          >
            {site.phone.display}
          </a>{' '}
          — {site.hours.short}.
        </p>
      </section>
    </>
  )
}
