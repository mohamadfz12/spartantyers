import { site } from '@/config/site'
import { products } from './products'

export interface BrandEntry {
  name: string
  /** True when we hold it in the Yennora warehouse ready to ship. */
  stocked: boolean
  href: string
  external: boolean
  origin: string
  blurb: string
  /** Number of SKUs we carry — derived, so it can never drift from the catalogue. */
  skuCount: number
}

/**
 * Two brands are stocked; everything else is sourced through the partner
 * business. That distinction is the single most important thing a visitor
 * needs to understand on this page, so it is modelled explicitly rather than
 * left to the copy.
 */
const SOURCED_HREF = site.partner.tyresUrl

function skuCount(name: string): number {
  return products.filter((p) => p.brand === name).length
}

export const brands: BrandEntry[] = [
  {
    name: 'Greforce',
    stocked: true,
    href: '/shop?brand=Greforce',
    external: false,
    origin: 'Manufactured for the Australian commercial market',
    blurb:
      'Our core range. Twenty-two patterns across steer, drive, trailer and all-position fitments, from the 13.5mm GRT33 highway rib to the 23.5mm HD02 off-highway drive lug.',
    skuCount: skuCount('Greforce'),
  },
  {
    name: 'Lionshead',
    stocked: true,
    href: '/shop?brand=Lionshead',
    external: false,
    origin: 'Manufactured for the Australian commercial market',
    blurb:
      'The uprated alternative. The LA301E and LD317E both carry a 149 load index — 3250kg per tyre, a step above the 11R22.5 norm — for operators running at maximum legal axle mass.',
    skuCount: skuCount('Lionshead'),
  },
  {
    name: 'Bridgestone',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'Japan',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Michelin',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'France',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Goodyear',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'United States',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Continental',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'Germany',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Pirelli',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'Italy',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Dunlop',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'United Kingdom',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Hankook',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'South Korea',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
  {
    name: 'Yokohama',
    stocked: false,
    href: SOURCED_HREF,
    external: true,
    origin: 'Japan',
    blurb: 'Premium commercial range, available to order through our partner network.',
    skuCount: 0,
  },
]

export const stockedBrands = brands.filter((b) => b.stocked)
export const sourcedBrands = brands.filter((b) => !b.stocked)

export const BRANDS_SUBTITLE =
  'Greforce and Lionshead are in stock and ready to ship from Yennora. Every other major brand is available through our partner network at 1 Truck Stop.'
