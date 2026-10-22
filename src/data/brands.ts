import { site } from '../config/site.js'
import { products } from './products.js'

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
 * Two brands are stocked; everything else is ordered in on request. That
 * distinction is the single most important thing a visitor needs to
 * understand on this page, so it is modelled explicitly rather than left to
 * the copy.
 */
const SOURCED_HREF = '/contact'

function skuCount(name: string): number {
  return products.filter((p) => p.brand === name).length
}

function patternCount(name: string): number {
  return new Set(products.filter((p) => p.brand === name).map((p) => p.model)).size
}

export const brands: BrandEntry[] = [
  {
    name: 'Greforce',
    stocked: true,
    href: '/shop?brand=Greforce',
    external: false,
    origin: 'Manufactured for the Australian commercial market',
    blurb: `Our core range: commercial truck and bus radials for long-haul, regional and on/off-road work. ${patternCount('Greforce')} patterns across steer, drive, trailer and all-position fitments, from the G-PILOT linehaul pair to the 23.5mm HD02 off-highway drive lug.`,
    skuCount: skuCount('Greforce'),
  },
  {
    name: 'Lionshead',
    stocked: true,
    href: '/shop?brand=Lionshead',
    external: false,
    origin: 'Manufactured for the Australian commercial market',
    blurb: `Value commercial radials for regional and vocational fleets. ${patternCount('Lionshead')} patterns in 11R22.5 and 17.5in, from the versatile LA301E all-position to the 23mm LD330E drive block.`,
    skuCount: skuCount('Lionshead'),
  },
  {
    name: 'Bridgestone',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'Japan',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Michelin',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'France',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Goodyear',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'United States',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Continental',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'Germany',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Pirelli',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'Italy',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Dunlop',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'United Kingdom',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Hankook',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'South Korea',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
  {
    name: 'Yokohama',
    stocked: false,
    href: SOURCED_HREF,
    external: false,
    origin: 'Japan',
    blurb: 'Premium commercial range, available to order on request.',
    skuCount: 0,
  },
]

export const stockedBrands = brands.filter((b) => b.stocked)
export const sourcedBrands = brands.filter((b) => !b.stocked)

export const BRANDS_SUBTITLE =
  `Greforce and Lionshead are in stock and ready to ship from Yennora. Every other major brand is available to order on request: call us on ${site.phone.display}.`
