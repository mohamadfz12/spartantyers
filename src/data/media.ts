/**
 * Photography and brand artwork, migrated from the existing Spartan Tyres
 * site and re-encoded to WebP (11.4MB of PNG/JPEG → 1.4MB, same pixels).
 *
 * Everything here is served from `public/img/` so Vite leaves the filenames
 * alone and the browser can cache them independently of the JS bundle.
 *
 * A note on the generic tyre shot: the original site used a single render
 * for every SKU, and that render carries another manufacturer's sidewall
 * branding. It is only ever shown labelled as illustrative, and only on lines
 * that have no photograph of their own (see `productPhotos` below).
 */

export interface Media {
  src: string
  /** Empty string marks the image as decorative. */
  alt: string
  width: number
  height: number
}

const img = (
  file: string,
  alt: string,
  width: number,
  height: number,
): Media => ({ src: `/img/${file}`, alt, width, height })

/* ------------------------------------------------------------------ *
 * Brand
 * ------------------------------------------------------------------ */

export const logos = {
  /** Horizontal lockup — the primary mark. Dark plate is part of the artwork. */
  horizontal: img('spartan-logo.webp', 'Spartan Tyres', 1200, 319),
  mark: img('spartan-logo-mark.webp', 'Spartan Tyres', 1195, 314),
  vertical: img('spartan-logo-vertical.webp', 'Spartan Tyres', 1000, 1132),
} as const

/**
 * Manufacturer wordmarks, as published on the existing Spartan Tyres site.
 * Only the two stocked brands are shown as artwork by default; the rest fall
 * back to typographic marks (see `src/components/brand/BrandMark.tsx`), which
 * keeps third-party trademarks off pages that merely list what we can source.
 */
export const brandLogos: Record<string, Media> = {
  Greforce: img('brand-greforce.webp', 'Greforce', 1200, 224),
  Lionshead: img('brand-lionshead.webp', 'Lionshead', 933, 511),
  Bridgestone: img('brand-bridgestone.webp', 'Bridgestone', 400, 254),
  Michelin: img('brand-michelin.webp', 'Michelin', 374, 113),
  Goodyear: img('brand-goodyear.webp', 'Goodyear', 1200, 733),
  Continental: img('brand-continental.webp', 'Continental', 400, 73),
  Pirelli: img('brand-pirelli.webp', 'Pirelli', 663, 199),
  Dunlop: img('brand-dunlop.webp', 'Dunlop', 400, 60),
  Hankook: img('brand-hankook.webp', 'Hankook', 800, 141),
  Yokohama: img('brand-yokohama.webp', 'Yokohama', 310, 45),
}

/* ------------------------------------------------------------------ *
 * Photography
 * ------------------------------------------------------------------ */

export const photos = {
  highwaySunset: img(
    'truck-highway-sunset.webp',
    'Prime mover on an Australian highway at sunset',
    1408,
    768,
  ),
  longHaul: img(
    'truck-long-haul.webp',
    'Long-haul prime mover and trailer on an open highway',
    1280,
    896,
  ),
  cityDelivery: img(
    'truck-city-delivery.webp',
    'Rigid delivery truck working an urban route',
    1280,
    896,
  ),
  offRoad: img(
    'truck-off-road.webp',
    'Construction tipper on an unsealed site road',
    1280,
    896,
  ),
  treadDetail: img(
    'tread-detail.webp',
    'Close detail of a commercial truck tyre tread pattern',
    1024,
    1024,
  ),
  tyreProduct: img(
    'tyre-product.webp',
    'Commercial truck tyre mounted on a steel rim',
    1024,
    1024,
  ),
  tyreLineup: img(
    'tyre-lineup.webp',
    'A range of commercial truck tyres side by side',
    1000,
    667,
  ),
  warehouseRacks: img(
    'warehouse-racks.webp',
    'Truck tyres stacked on steel racking in the Yennora warehouse',
    612,
    408,
  ),
  warehouseAisle: img(
    'warehouse-aisle.webp',
    'Aisle of commercial tyre stock in a distribution warehouse',
    612,
    411,
  ),
  warehouseStacks: img(
    'warehouse-stacks.webp',
    'Stacked commercial tyre inventory ready for dispatch',
    612,
    416,
  ),
  warehouseInterior: img(
    'warehouse-interior.webp',
    'Interior of the Spartan Tyres distribution warehouse',
    612,
    411,
  ),
  partnerTruckStop: img(
    'partner-truckstop.webp',
    '1 Truck Stop facility at Yennora',
    231,
    146,
  ),
} as const

export const afterpay = {
  banner: img(
    'afterpay-banner.webp',
    'Pay in 4 interest-free instalments with Afterpay',
    1200,
    148,
  ),
  mobile: img(
    'afterpay-mobile.webp',
    'Pay in 4 interest-free instalments with Afterpay',
    360,
    200,
  ),
} as const

/* ------------------------------------------------------------------ *
 * Application → imagery
 *
 * Maps the catalogue's `application` field onto the photography, so a
 * category card always shows the kind of work that tyre is built for.
 * ------------------------------------------------------------------ */

export const applicationPhoto: Record<string, Media> = {
  'Long Haul': photos.longHaul,
  Regional: photos.highwaySunset,
  'Urban Delivery': photos.cityDelivery,
  'On / Off Road': photos.offRoad,
  'Mixed Service': photos.treadDetail,
}

/* ------------------------------------------------------------------ *
 * Product gallery
 * ------------------------------------------------------------------ */

export interface GalleryShot extends Media {
  /** Short label for the thumbnail. */
  label: string
  /**
   * True when the photograph is generic stock rather than a shot of this
   * exact SKU. Surfaced in the UI so a buyer is never misled about what they
   * are looking at.
   */
  illustrative: boolean
}

/* ------------------------------------------------------------------ *
 * Product photography
 *
 * The manufacturer shots from Spartan's June 2026 catalogues: the Range
 * Catalogue for every Greforce and Lionshead line with a published price,
 * and the Lionshead Barcode Catalogue for the rest of Lionshead. Each was
 * cropped to the tyre (dropping the wordmark printed into the Greforce
 * artwork), set on white and squared, so a grid of them reads evenly.
 *
 * They are keyed by pattern, not SKU — the catalogue uses one shot per
 * pattern across every size, and so do we.
 *
 * Two deliberate gaps:
 *  - LS306E. The barcode catalogue prints the LD328E drive-block shot
 *    against it, but LS306E is a steer rib. Showing it would misdescribe the
 *    tyre, so LS306E keeps the generated wheel until a real shot exists.
 *  - LD330E. The only shot is a crop of the upper half of the tyre: good for
 *    the tread, wrong for a product card. It is a gallery detail only.
 * ------------------------------------------------------------------ */

export interface ProductPhoto extends Media {
  /**
   * A whole-tyre shot that can stand for the product on a card. `false` marks
   * a partial crop that only belongs in the product gallery.
   */
  wholeTyre: boolean
}

/** Every shot is square; `size` is its edge in pixels. */
const shot = (file: string, alt: string, size: number, wholeTyre = true): ProductPhoto => ({
  ...img(`products/${file}.webp`, alt, size, size),
  wholeTyre,
})

const productPhotos: Record<string, ProductPhoto> = {
  'Greforce|GR666': shot('greforce-gr666', 'Greforce GR666 super-single truck tyre', 353),
  'Greforce|G-PILOT X1': shot('greforce-g-pilot-x1', 'Greforce G-PILOT X1 steer tyre', 900),
  'Greforce|G-PILOT X3': shot('greforce-g-pilot-x3', 'Greforce G-PILOT X3 drive tyre', 547),
  'Greforce|GRT33': shot('greforce-grt33', 'Greforce GRT33 rib-pattern truck tyre', 352),
  'Greforce|GRT52': shot('greforce-grt52', 'Greforce GRT52 rib-pattern truck tyre', 352),
  'Greforce|GR612': shot('greforce-gr612', 'Greforce GR612 rib-pattern truck tyre', 353),
  'Greforce|GR999': shot('greforce-gr999', 'Greforce GR999 block-pattern drive tyre', 354),
  'Greforce|HD01M': shot('greforce-hd01m', 'Greforce HD01M drive tyre', 352),
  'Greforce|HD02': shot('greforce-hd02', 'Greforce HD02 drive tyre', 354),
  'Lionshead|LA301E': shot('lionshead-la301e', 'Lionshead LA301E all-position truck tyre', 900),
  'Lionshead|LA302E': shot('lionshead-la302e', 'Lionshead LA302E rib-pattern truck tyre', 900),
  'Lionshead|LA313E': shot('lionshead-la313e', 'Lionshead LA313E rib-pattern truck tyre', 900),
  'Lionshead|LD316E': shot('lionshead-ld316e', 'Lionshead LD316E drive tyre', 526),
  'Lionshead|LD317E': shot('lionshead-ld317e', 'Lionshead LD317E drive tyre', 900),
  'Lionshead|LD328E': shot('lionshead-ld328e', 'Lionshead LD328E drive tyre', 900),
  'Lionshead|LD330E': shot(
    'lionshead-ld330e',
    'Close-up of the Lionshead LD330E drive tread',
    271,
    false,
  ),
}

/** Every photograph of a pattern, whole-tyre or not. */
export function productPhotoFor(product: {
  brand: string
  model: string
}): ProductPhoto | undefined {
  return productPhotos[`${product.brand}|${product.model}`]
}

/** The photograph that can stand for the product on a card or a cart line. */
export function productCardPhoto(product: {
  brand: string
  model: string
}): ProductPhoto | undefined {
  const photo = productPhotoFor(product)
  return photo?.wholeTyre ? photo : undefined
}

/** Every file referenced above — checked against `public/img` by `npm run check`. */
export const productPhotoFiles: string[] = Object.values(productPhotos).map(
  (photo) => photo.src,
)

/**
 * Illustrative stock photography for lines with no photograph of their own.
 *
 * Both shots came from the existing site and are the same two images for
 * every such SKU. The tread close-up leads because it is brand-neutral and
 * genuinely representative of a block pattern; the full-tyre render follows,
 * and both are labelled as illustrative. The generated wheel stays in the
 * gallery as the view that is accurate to the product's brand, size and tread.
 */
export const productGallery: GalleryShot[] = [
  {
    ...photos.treadDetail,
    alt: 'Close detail of a commercial truck tyre tread, showing block depth and siping',
    label: 'Tread',
    illustrative: true,
  },
  {
    ...photos.tyreProduct,
    alt: 'A commercial truck tyre mounted on a steel rim, three-quarter view',
    label: 'Fitted',
    illustrative: true,
  },
]

/** Imagery for the four customer segments on the home page, in order. */
export const segmentPhotos: Media[] = [
  photos.warehouseRacks,
  photos.warehouseAisle,
  photos.longHaul,
  photos.offRoad,
]
