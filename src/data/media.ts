/**
 * Photography and brand artwork, migrated from the existing Spartan Tyres
 * site and re-encoded to WebP (11.4MB of PNG/JPEG → 1.4MB, same pixels).
 *
 * Everything here is served from `public/img/` so Vite leaves the filenames
 * alone and the browser can cache them independently of the JS bundle.
 *
 * A note on the tyre product shot: the original site used a single generic
 * render for every SKU, and that render carries another manufacturer's
 * sidewall branding. Putting it on a Greforce or Lionshead product card would
 * misrepresent the item, so product imagery stays with the generated wheel —
 * which shows the correct brand, size and tread pattern for each SKU. The
 * photograph is used for editorial and category contexts instead.
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

/**
 * The photographic half of a product gallery.
 *
 * Both shots came from the existing site and are the same two images for
 * every SKU — there is no per-product photography yet. The tread close-up
 * leads because it is brand-neutral and genuinely representative of a block
 * pattern; the full-tyre render follows, and both are labelled as
 * illustrative. The generated wheel remains in the gallery as the one view
 * that is accurate to the specific product: correct brand, size and tread.
 *
 * Replacing these with real shots of Greforce and Lionshead stock is a change
 * to this array alone.
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
