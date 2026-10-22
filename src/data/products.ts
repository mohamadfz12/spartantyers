import type {
  Application,
  AxlePosition,
  BrandName,
  Product,
  TreadFamily,
} from './types'

/* ------------------------------------------------------------------ *
 * Reference tables
 * ------------------------------------------------------------------ */

/** ISO/ETRTO load index → maximum load in kilograms (single fitment). */
const LOAD_INDEX_KG: Record<number, number> = {
  121: 1450, 122: 1500, 123: 1550, 124: 1600, 125: 1650, 126: 1700,
  127: 1750, 128: 1800, 129: 1850, 130: 1900, 131: 1950, 132: 2000,
  133: 2060, 134: 2120, 135: 2180, 136: 2240, 137: 2300, 138: 2360,
  139: 2430, 140: 2500, 141: 2575, 142: 2650, 143: 2725, 144: 2800,
  145: 2900, 146: 3000, 147: 3075, 148: 3150, 149: 3250, 150: 3350,
  151: 3450, 152: 3550, 153: 3650, 154: 3750, 155: 3875, 156: 4000,
  157: 4125, 158: 4250, 159: 4375, 160: 4500, 161: 4625, 162: 4750,
  163: 4875, 164: 5000, 165: 5150, 166: 5300,
}

/** Speed symbol → maximum sustained speed in km/h. */
const SPEED_SYMBOL_KMH: Record<string, number> = {
  F: 80, G: 90, J: 100, K: 110, L: 120, M: 130, N: 140, P: 150, Q: 160,
}

const POSITION_MAP: Record<string, AxlePosition[]> = {
  Drive: ['drive'],
  Trailer: ['trailer'],
  'Steer & Trailer': ['steer', 'trailer'],
  'All Position': ['steer', 'drive', 'trailer'],
}

export const POSITION_LABELS: Record<AxlePosition, string> = {
  steer: 'Steer',
  drive: 'Drive',
  trailer: 'Trailer',
}

/* ------------------------------------------------------------------ *
 * Raw specification sheet
 *
 * The range, SKUs, ply ratings, fitments and prices follow Spartan's own
 * catalogues (Range Catalogue RETAIL, June 2026, and the Lionshead Barcode
 * Catalogue). Each SKU is the value printed in the barcode, and `price` is
 * the published RRP inc. GST — or `null` where the price list says POA:
 * price on application / build to order. Trade pricing is deliberately not
 * held here; the bundle is public.
 *
 * The remaining specs (rim, tread depth, load index, speed symbol) come
 * from the Greforce and Lionshead manufacturer data sheets. Where a maker
 * publishes nothing for the exact line, the field is `null` and the site
 * says "to be confirmed" — the lines added from the June 2026 catalogue
 * have no published EU label, for instance. Stock and ratings are
 * commercial fields kept alongside them.
 *
 * Checked against the makers' published tables in October 2026:
 *  - LA301E in 11R22.5 is 148/145M. It was listed here as 149/146, which is
 *    Lionshead's figure for 11R24.5, so it overstated the load by 100kg.
 *  - LD317E had the same 149/146 with no published row behind it, so its
 *    load index is now confirmed per quote rather than repeated.
 *  - GRT33 in 11R22.5 is M rated (was L).
 *  - LD316E in 11R22.5 has 23mm of tread (was 20mm), per Lionshead's LD316 row.
 *  - LA302E 215/75R17.5 and LD328E 235/75R17.5: the sizes and SKUs are from
 *    the Lionshead Barcode Catalogue, but Lionshead publishes no data for
 *    these sizes (LA302 only in 7.00R16, LD328E only in 315/80R22.5). Their
 *    tread depth, load index, speed symbol and EU label had no source, so
 *    they are now confirmed per quote. Both are built to order.
 * ------------------------------------------------------------------ */

interface Spec {
  pattern: string
  brand: BrandName
  size: string
  sku: string
  ply: string
  rim: string
  treadDepthMm: number | null
  loadIndex: string | null
  speedRating: string | null
  rawPosition: keyof typeof POSITION_MAP
  application: Application
  tread: TreadFamily
  /** RRP inc. GST, or `null` for price on application. */
  price: number | null
  discount?: number
  stock: number
  rating: number
  reviewCount: number
  fuelRating: Product['fuelRating']
  noiseDb: number | null
  retreadable: boolean | null
  threePeak?: boolean
  headline: string
  description: string
  highlights: string[]
}

const SPECS: Spec[] = [
  {
    pattern: 'GRD57', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GRD57', ply: '18PR', rim: '8.25',
    treadDepthMm: 21.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: null, stock: 0, rating: 4.7, reviewCount: 63,
    fuelRating: 'B', noiseDb: 73, retreadable: true, threePeak: true,
    headline: 'Deep-lug drive tyre built for interstate mileage',
    description:
      'The GRD57 is Greforce\'s long-haul drive workhorse. A 21.5mm deep block pattern with stone-ejector bars delivers traction from new right through to the retread, while the wide-belt casing keeps the footprint square under full GVM. It is built to order and quoted per order, which suits the way linehaul fleets buy it — a full drive group at a time.',
    highlights: [
      '21.5mm deep lug pattern for maximum removal mileage',
      'Stone ejectors protect the belt package on regional roads',
      'Reinforced 18PR casing rated to 3150kg per tyre',
      'Designed for two to three retread cycles',
    ],
  },
  {
    pattern: 'G-PILOT X1', brand: 'Greforce', size: '295/80R22.5', sku: 'GRF-29580R225-GPILOTX1', ply: '20PR', rim: '9.00',
    treadDepthMm: 17.0, loadIndex: '154/150', speedRating: 'K', rawPosition: 'Steer & Trailer',
    application: 'Long Haul', tread: 'rib', price: 330, stock: 96, rating: 4.8, reviewCount: 48,
    fuelRating: 'A', noiseDb: 71, retreadable: true,
    headline: 'Five-rib steer tyre with class-leading rolling resistance',
    description:
      'The G-PILOT X1 is the premium steer and trailer fitment in the Greforce range. Five continuous ribs and a low-heat tread compound cut rolling resistance to an A rating, and the 20PR casing carries 3750kg per tyre. Drivers consistently report straighter tracking and quieter running at highway speed.',
    highlights: [
      'Five-rib highway steer pattern for stable, true tracking',
      'High-mileage casing built for long-haul and regional steer',
      'A-rated rolling resistance — up to 7.5% fuel saving',
      '20PR casing rated to 3750kg per tyre',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '275/70R22.5', sku: 'GRF-27570R225-GRT33', ply: '18PR', rim: '8.25',
    treadDepthMm: 14.0, loadIndex: '146/143', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Regional', tread: 'rib', price: 250, stock: 142, rating: 4.6, reviewCount: 37,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'All-rounder steer and trailer rib for regional work',
    description:
      'GRT33 is the pattern we ship most of. A four-rib highway tread with a reinforced shoulder handles the mix of highway and suburban running that regional operators actually do, and the low-profile 275/70 section keeps overall height down on tautliners.',
    highlights: [
      'Four-rib highway tread with reinforced shoulders',
      'Resists irregular wear on mixed highway and urban routes',
      'Low-profile section for height-critical trailers',
      'Available across four sizes for fleet standardisation',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '255/70R22.5', sku: 'GRF-25570R225-GRT33', ply: '16PR', rim: '7.50',
    treadDepthMm: 14.0, loadIndex: '140/137', speedRating: 'M', rawPosition: 'Steer & Trailer',
    application: 'Regional', tread: 'trailer', price: null, stock: 0, rating: 4.5, reviewCount: 21,
    fuelRating: 'B', noiseDb: 71, retreadable: true,
    headline: 'Narrow-section GRT33 for tight-clearance builds',
    description:
      'The 255/70R22.5 GRT33 suits steer and trailer fitments where clearance is tight and a 275 section will not fit. Same proven four-rib tread, lighter 16PR casing, and a 7.50 rim fitment that drops unsprung weight without giving up tread life. Built to order and quoted per order.',
    highlights: [
      'Fits steer and trailer positions where a 275 section will not clear',
      'Lighter 16PR casing reduces unsprung weight',
      'Free-rolling rib pattern for long, even wear',
      'Rated to 2500kg per tyre at 140 load index',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GRT33', ply: '18PR', rim: '8.25',
    treadDepthMm: 13.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Steer & Trailer',
    application: 'Regional', tread: 'rib', price: null, stock: 0, rating: 4.6, reviewCount: 91,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'Four-rib 11R22.5 steer and trailer fitment',
    description:
      'If you run 11R22.5 on the front, this is the straightforward choice. The GRT33 in the classic 11R size pairs a 13.5mm four-rib tread with an 18PR casing rated to 3150kg. It is built to order, so it is quoted on quantity — send us your fleet volume and we will come back with price and lead time.',
    highlights: [
      'Classic 11R22.5 fitment — direct swap for most steer axles',
      '13.5mm four-rib tread for even, predictable wear',
      '18PR casing rated to 3150kg per tyre',
      'Consistent batch-to-batch performance',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '9.5R17.5', sku: 'GRF-95R175-GRT33', ply: '18PR', rim: '6.75',
    treadDepthMm: 13.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'rib', price: 175, stock: 54, rating: 4.4, reviewCount: 18,
    fuelRating: 'B', noiseDb: 70, retreadable: false,
    headline: 'Light-truck rib for metro distribution',
    description:
      'A 17.5in fitment for rigid-body delivery trucks and pantechs working metro runs. The rib pattern resists the scrubbing that kerb-to-kerb city work inflicts on light-truck tyres, and the 18PR casing handles a fully freighted body.',
    highlights: [
      'Built for stop-start metro delivery duty',
      'Scrub-resistant rib pattern for kerbside work',
      '18PR casing for fully freighted rigid bodies',
      'Quiet 70dB running in built-up areas',
    ],
  },
  {
    pattern: 'GR999', brand: 'Greforce', size: '215/75R17.5', sku: 'GRF-21575R175-GR999', ply: '18PR', rim: '6.00',
    treadDepthMm: 15.5, loadIndex: '135/133', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 165, stock: 61, rating: 4.5, reviewCount: 24,
    fuelRating: 'B', noiseDb: 71, retreadable: false,
    headline: 'Block-pattern light-truck drive tyre',
    description:
      'GR999 gives rigid delivery trucks genuine drive traction without the noise penalty of a deep lug. The open block pattern bites on wet ramps and unsealed yards, while 15.5mm of tread depth is unusually generous for a 17.5in fitment.',
    highlights: [
      '15.5mm tread depth — deep for a 17.5in drive tyre',
      'Open blocks for traction on wet ramps and yards',
      'Even wear under the torque of a loaded rigid',
      'Strong value per kilometre for metro fleets',
    ],
  },
  {
    pattern: 'GR999', brand: 'Greforce', size: '9.5R17.5', sku: 'GRF-95R175-GR999', ply: '16PR', rim: '6.75',
    treadDepthMm: 15.0, loadIndex: '139/137', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 180, stock: 43, rating: 4.4, reviewCount: 15,
    fuelRating: 'B', noiseDb: 71, retreadable: false,
    headline: 'Drive traction for 9.5R17.5 rigids',
    description:
      'The 9.5R17.5 GR999 is the drive-axle partner to the GRT33 in the same size, letting metro operators run one rim size across the truck. Lighter 16PR construction keeps the tare down on body-built vehicles.',
    highlights: [
      'Matches the 9.5R17.5 GRT33 for a single-rim-size truck',
      'Lighter 16PR casing protects payload allowance',
      'Open block tread for loading-dock traction',
      'Rated to 2430kg per tyre',
    ],
  },
  {
    pattern: 'GR999', brand: 'Greforce', size: '235/75R17.5', sku: 'GRF-23575R175-GR999', ply: '18PR', rim: '6.75',
    treadDepthMm: 15.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 170, stock: 88, rating: 4.6, reviewCount: 31,
    fuelRating: 'B', noiseDb: 71, retreadable: false,
    headline: 'The popular 235/75R17.5 drive fitment',
    description:
      'The widest and most capable of the GR999 family. A 235mm section on a 6.75 rim with 15.5mm of block tread gives medium rigids real drive grip, and the 18PR casing takes 2725kg per tyre for fully loaded tipper and crane-truck work.',
    highlights: [
      'Widest GR999 section for maximum drive footprint',
      '18PR casing rated to 2725kg per tyre',
      'Suits tippers, crane trucks and heavy rigids',
      'Closed-shoulder drive pattern balancing grip and mileage',
    ],
  },
  {
    pattern: 'G-ARMOR A68', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GARMORA68', ply: '18PR', rim: '8.25',
    treadDepthMm: 13.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'All Position',
    application: 'Mixed Service', tread: 'rib', price: null, stock: 0, rating: 4.7, reviewCount: 44,
    fuelRating: 'B', noiseDb: 73, retreadable: true,
    headline: 'Armoured all-position casing for mixed service',
    description:
      'G-ARMOR A68 is the fitment for operators who cannot predict where the truck will be tomorrow. A cut-and-chip resistant compound over a reinforced sidewall means one tyre specification works on steer, drive or trailer across sealed and unsealed roads.',
    highlights: [
      'One specification fits steer, drive and trailer',
      'Cut-and-chip resistant compound for unsealed roads',
      'Reinforced sidewall resists kerb and rock damage',
      'Simplifies inventory for mixed-fleet operators',
    ],
  },
  {
    pattern: 'GR612', brand: 'Greforce', size: '235/75R17.5', sku: 'GRF-23575R175-GR612', ply: '18PR', rim: '6.75',
    treadDepthMm: 12.5, loadIndex: '143/141', speedRating: 'J', rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'rib', price: 175, stock: 72, rating: 4.3, reviewCount: 19,
    fuelRating: 'B', noiseDb: 70, retreadable: false,
    headline: 'Economy steer rib for light commercial',
    description:
      'GR612 is the entry point into the Greforce light-truck range. A straightforward five-rib highway tread on an 18PR casing — no frills, predictable wear, and a sharp price for a 235/75R17.5 steer fitment.',
    highlights: [
      'Five-rib highway tread for predictable wear',
      'Reinforced shoulder resists kerbing and scrub',
      'Quiet 70dB running',
      'Ideal for high-turnover rental and hire fleets',
    ],
  },
  {
    pattern: 'GR612', brand: 'Greforce', size: '265/70R19.5', sku: 'GRF-26570R195-GR612', ply: '18PR', rim: '7.50',
    treadDepthMm: 12.5, loadIndex: '143/141', speedRating: 'K', rawPosition: 'All Position',
    application: 'Urban Delivery', tread: 'rib', price: 220, stock: 38, rating: 4.4, reviewCount: 16,
    fuelRating: 'B', noiseDb: 71, retreadable: true,
    headline: 'All-position 19.5in rib for medium rigids',
    description:
      'The 19.5in fitment that bridges light truck and heavy commercial. Rated all-position, so a single GR612 specification covers every axle on a medium rigid, bus or motorhome running the increasingly common 265/70R19.5 size.',
    highlights: [
      'All-position rating simplifies 19.5in fleets',
      'Popular fitment on buses and motorhomes',
      'Retreadable casing extends total service life',
      'Rated to 2725kg per tyre',
    ],
  },
  {
    pattern: 'GRD1212', brand: 'Greforce', size: '275/70R22.5', sku: 'GRF-27570R225-GRD1212', ply: '18PR', rim: '8.25',
    treadDepthMm: 21.5, loadIndex: '146/143 or 148/145', speedRating: 'J/K', rawPosition: 'All Position',
    application: 'On / Off Road', tread: 'lug', price: null, stock: 0, rating: 4.7, reviewCount: 27,
    fuelRating: 'C', noiseDb: 75, retreadable: true, threePeak: true,
    headline: 'Deep all-position lug for on/off road duty',
    description:
      'An unusual and useful tyre: 21.5mm of aggressive lug tread rated for all three axle positions. GRD1212 is what we recommend for tippers, agitators and civil work where the truck spends half its life on a site and half on the highway. Built to order and quoted per order.',
    highlights: [
      '21.5mm aggressive lug with all-position rating',
      'Built for tippers, agitators and civil contractors',
      'Dual load index — 146/143 or 148/145 depending on batch',
      'Self-cleaning tread evacuates mud and clay',
    ],
  },
  {
    pattern: 'GRD35', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GRD35', ply: '18PR', rim: '8.25',
    treadDepthMm: 21.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: null, stock: 0, rating: 4.6, reviewCount: 58,
    fuelRating: 'B', noiseDb: 74, retreadable: true, threePeak: true,
    headline: 'Deep drive lug in the classic 11R size',
    description:
      'GRD35 brings 21.5mm of deep drive tread to the 11R22.5 fitment. The tread blocks are slightly more closed than the GRD57\'s, which trades a little loose-surface bite for noticeably quieter highway running.',
    highlights: [
      '21.5mm deep drive tread',
      'More closed blocks — quieter than an open lug',
      'M speed rating for 130km/h operation',
      'Built to order — quoted on fleet volumes',
    ],
  },
  {
    pattern: 'G-PILOT X3', brand: 'Greforce', size: '295/80R22.5', sku: 'GRF-29580R225-GPILOTX3', ply: '20PR', rim: '9.00',
    treadDepthMm: 21.0, loadIndex: '154/150', speedRating: 'K', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: 330, stock: 72, rating: 4.8, reviewCount: 41,
    fuelRating: 'B', noiseDb: 73, retreadable: true, threePeak: true,
    headline: 'Premium 295/80 drive tyre — the X1\'s partner',
    description:
      'G-PILOT X3 is the drive-axle counterpart to the X1 steer tyre. Run them together and you get a matched 295/80R22.5 set: the X1 steering and the X3 pulling, both on 20PR casings rated to 3750kg. A deep block pattern on a cut- and chip-resistant compound means it does not give up when the work leaves the bitumen.',
    highlights: [
      'Matched set with the G-PILOT X1 steer tyre',
      'Deep block drive pattern for maximum traction',
      'Cut- and chip-resistant compound for regional and on/off-road work',
      'Rated to 3750kg per tyre — highest in the range bar the GR666',
    ],
  },
  {
    pattern: 'GR881', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GR881', ply: '18PR', rim: '8.25',
    treadDepthMm: 15.0, loadIndex: '148/145', speedRating: 'M', rawPosition: 'All Position',
    application: 'Mixed Service', tread: 'rib', price: null, stock: 0, rating: 4.5, reviewCount: 33,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'All-position 11R22.5 with extra tread depth',
    description:
      'GR881 sits between the GRT33 and the G-ARMOR: an all-position 11R22.5 with 15mm of tread rather than 13.5mm. The extra depth is worth having if you rotate tyres through positions over their life rather than retiring them in place.',
    highlights: [
      '15mm tread — 1.5mm deeper than the GRT33',
      'All-position rating suits rotation programmes',
      'Rated to 3150kg per tyre',
      'Retreadable casing',
    ],
  },
  {
    pattern: 'GR666', brand: 'Greforce', size: '385/65R22.5', sku: 'GRF-38565R225-GR666', ply: '24PR', rim: '11.75',
    treadDepthMm: 14.5, loadIndex: '164', speedRating: 'K', rawPosition: 'Steer & Trailer',
    application: 'Long Haul', tread: 'rib', price: 330, stock: 47, rating: 4.7, reviewCount: 22,
    fuelRating: 'A', noiseDb: 72, retreadable: true,
    headline: 'Super-single for maximum axle load',
    description:
      'The GR666 is a 385/65R22.5 super-single: a 24PR casing on an 11.75 rim rated to 5000kg on a single fitment. It is the standard choice for B-double lead trailers and any axle where you need maximum load with minimum tyre count.',
    highlights: [
      '164 load index — 5000kg on a single fitment',
      'Standard fitment for B-double lead trailers',
      'A-rated rolling resistance despite the load capacity',
      'Replaces a dual fitment, cutting weight and rolling resistance',
    ],
  },
  {
    pattern: 'HD01M', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-HD01M', ply: '18PR', rim: '8.25',
    treadDepthMm: 23.0, loadIndex: '148/145', speedRating: 'L', rawPosition: 'Drive',
    application: 'On / Off Road', tread: 'lug', price: 300, stock: 58, rating: 4.8, reviewCount: 36,
    fuelRating: 'C', noiseDb: 76, retreadable: true, threePeak: true,
    headline: '23mm of drive tread for the worst roads',
    description:
      'HD01M is a heavy-duty drive tyre with 23mm of tread — among the deepest commercial patterns available in 11R22.5. Built for logging, mining access roads and remote regional work where tyre life is measured in damage resistance, not kilometres.',
    highlights: [
      '23mm tread depth — near the maximum for 11R22.5',
      'Heavy-duty casing for logging and mine access roads',
      'Aggressive self-cleaning lug for mud and gravel',
      'Thick undertread supports multiple retreads',
    ],
  },
  {
    pattern: 'GR678', brand: 'Greforce', size: '265/70R19.5', sku: 'GRF-26570R195-GR678', ply: '18PR', rim: '7.50',
    treadDepthMm: 15.0, loadIndex: '143/141', speedRating: 'K', rawPosition: 'Drive',
    application: 'Regional', tread: 'block', price: null, stock: 0, rating: 4.5, reviewCount: 14,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'Drive-axle block pattern in 19.5in',
    description:
      'The drive partner to the GR612 in 265/70R19.5. A 15mm block tread gives medium rigids and buses proper drive traction in a size that is often only available as an all-position compromise.',
    highlights: [
      'Purpose-built drive tread in 265/70R19.5',
      '15mm block depth for genuine traction',
      'Pairs with the GR612 all-position for a full set',
      'Built to order — contact us for price and lead time',
    ],
  },
  {
    pattern: 'GRD37', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GRD37', ply: '16PR', rim: '8.25',
    treadDepthMm: 20.0, loadIndex: '146/143', speedRating: 'L', rawPosition: 'Drive',
    application: 'Regional', tread: 'lug', price: null, stock: 0, rating: 4.4, reviewCount: 26,
    fuelRating: 'B', noiseDb: 74, retreadable: true,
    headline: 'Lighter 16PR deep-lug drive tyre',
    description:
      'GRD37 offers 20mm of drive tread on a lighter 16PR casing. Where you do not need the full 3150kg rating, the weight saving across eight drive positions is worth real payload.',
    highlights: [
      '16PR casing saves weight across eight drive positions',
      '20mm deep lug tread',
      'Rated to 3000kg per tyre',
      'A lighter option where the full 18PR rating is not required',
    ],
  },
  {
    pattern: 'HD02', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-HD02', ply: '18PR', rim: '8.25',
    treadDepthMm: 23.5, loadIndex: '148/145', speedRating: 'L', rawPosition: 'Drive',
    application: 'On / Off Road', tread: 'lug', price: 300, stock: 0, rating: 4.9, reviewCount: 29,
    fuelRating: 'C', noiseDb: 76, retreadable: true, threePeak: true,
    headline: 'The deepest drive tread we stock',
    description:
      'At 23.5mm, HD02 has the deepest tread of any tyre in our range. It is a specialist fitment for the most punishing off-highway drive applications — and it sells out. Pre-order to secure stock from the next container.',
    highlights: [
      '23.5mm — deepest drive tread in the Spartan range',
      'Specialist off-highway and quarry fitment',
      'Highest customer rating in our catalogue',
      'Pre-order now — allocated from the next shipment',
    ],
  },
  {
    pattern: 'GR622', brand: 'Greforce', size: '11R22.5', sku: 'GRF-11R225-GR622', ply: '18PR', rim: '8.25',
    treadDepthMm: 19.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: null, stock: 0, rating: 4.5, reviewCount: 39,
    fuelRating: 'B', noiseDb: 73, retreadable: true,
    headline: 'Balanced-depth highway drive tyre',
    description:
      'GR622 trades a couple of millimetres of tread against lower rolling resistance and quieter running than the deep-lug patterns. For fleets doing high highway kilometres on sealed roads, that trade usually comes out ahead on total cost.',
    highlights: [
      '19.5mm tread optimised for sealed-road highway work',
      'Quieter and more fuel-efficient than a 21.5mm lug',
      'M speed rating for 130km/h operation',
      'Strong highway-kilometre economics',
    ],
  },

  /* ---- Lionshead ---- */
  {
    pattern: 'LA301E', brand: 'Lionshead', size: '11R22.5', sku: 'LH-11R225-LA301E', ply: '18PR', rim: '8.25',
    treadDepthMm: 14.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'All Position',
    application: 'Mixed Service', tread: 'rib', price: 220, stock: 88, rating: 4.6, reviewCount: 34,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'Versatile Lionshead all-position for mixed fleets',
    description:
      'The LA301E is the Lionshead all-rounder: an all-position pattern for mixed-service fleets, with 14.5mm of tread and a sturdy shoulder that resists kerbing and scrub. The 18PR casing is rated 148/145M — 3150kg per tyre at up to 130km/h — so one specification covers every axle on an 11R22.5 truck.',
    highlights: [
      'Versatile all-position pattern for mixed-service fleets',
      'Sturdy shoulder design resists kerbing and scrub',
      '18PR casing rated to 3150kg per tyre',
      'M speed rating for 130km/h operation',
    ],
  },
  {
    pattern: 'LD317E', brand: 'Lionshead', size: '11R22.5', sku: 'LH-11R225-LD317E', ply: '18PR', rim: '8.25',
    treadDepthMm: 18.0, loadIndex: null, speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: null, stock: 0, rating: 4.7, reviewCount: 45,
    fuelRating: 'B', noiseDb: 73, retreadable: true, threePeak: true,
    headline: 'Closed-shoulder Lionshead drive lug',
    description:
      'LD317E is a closed-shoulder Lionshead drive lug in 11R22.5: 18mm of tread laid out for the even wear that closed shoulders produce, with an M rating for 130km/h. It is built to order and quoted per order, and we confirm the load index with your quote.',
    highlights: [
      'Closed-shoulder lug for even drive wear',
      '18mm tread depth with M speed rating',
      'Drive partner to the LA301E all-position',
      'Built to order — quoted per order',
    ],
  },
  {
    pattern: 'LA302E', brand: 'Lionshead', size: '215/75R17.5', sku: 'LH-21575R175-LA302E', ply: '16PR', rim: '6.00',
    treadDepthMm: null, loadIndex: null, speedRating: null, rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'trailer', price: null, stock: 0, rating: 4.2, reviewCount: 11,
    fuelRating: null, noiseDb: null, retreadable: false,
    headline: 'Light-truck rib for steer and trailer builds',
    description:
      'LA302E is a closed-shoulder rib for light-truck steer and trailer axles — light tandem trailers, plant floats and light rigids. Lionshead publishes no data sheet for this size, so we confirm the load index, speed symbol and tread depth with your quote. Built to order and quoted per order.',
    highlights: [
      'Closed-shoulder rib for long, free-rolling life',
      'Lighter 16PR casing for tandem trailers and plant floats',
      'Load index and tread depth confirmed with your quote',
      'Built to order — quoted per order',
    ],
  },
  {
    pattern: 'LD328E', brand: 'Lionshead', size: '235/75R17.5', sku: 'LH-23575R175-LD328E', ply: '18PR', rim: '6.75',
    treadDepthMm: null, loadIndex: null, speedRating: null, rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: null, stock: 0, rating: 4.5, reviewCount: 20,
    fuelRating: null, noiseDb: null, retreadable: false,
    headline: 'Lionshead 17.5in drive tyre',
    description:
      'LD328E is an open block drive pattern in the common 235/75R17.5 light-truck drive size, a direct alternative to the Greforce GR999 with a more open shoulder for wet grip. Lionshead publishes its data sheet for the 315/80R22.5 only, so we confirm the load index, speed symbol and tread depth for this size with your quote. Built to order.',
    highlights: [
      'Open block tread for wet-surface traction',
      'More open shoulder than the GR999 equivalent',
      '18PR casing; load and tread confirmed with your quote',
      'Popular on refrigerated metro rigids',
    ],
  },
  {
    pattern: 'LS306E', brand: 'Lionshead', size: '235/75R17.5', sku: 'LH-23575R175-LS306E', ply: '18PR', rim: '6.75',
    treadDepthMm: 12.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'rib', price: null, stock: 0, rating: 4.4, reviewCount: 23,
    fuelRating: 'B', noiseDb: 70, retreadable: false,
    headline: 'Lionshead steer rib for light commercial',
    description:
      'LS306E completes the Lionshead 17.5in offering as the steer and trailer fitment. Run it with the LD328E on the drive and you have a full Lionshead set for a medium rigid.',
    highlights: [
      'Pairs with the LD328E for a complete Lionshead set',
      'Five-rib steer tread for straight tracking',
      'Quiet 70dB running for metro work',
      'Built to order — quoted per order',
    ],
  },

  /* ---- Added from the June 2026 range catalogue ----
   * Last in the sheet, so "newest to the range" sorts them first. Load and
   * speed for GRT52 and LD316E are the makers' published figures; Lionshead
   * publishes none for LA313E or LD330E, so those are confirmed per quote.
   * No EU label or retread data is published for any of the four. */
  {
    pattern: 'GRT52', brand: 'Greforce', size: '215/75R17.5', sku: 'GRF-21575R175-GRT52', ply: '18PR', rim: '6.00',
    treadDepthMm: 12.0, loadIndex: '135/133', speedRating: 'L', rawPosition: 'All Position',
    application: 'Urban Delivery', tread: 'rib', price: 175, stock: 0, rating: 0, reviewCount: 0,
    fuelRating: null, noiseDb: null, retreadable: null,
    headline: 'All-position highway rib for light trucks',
    description:
      'GRT52 is a highway rib for light-truck steer and all-position use in 215/75R17.5, the size behind a lot of light rigids and delivery trucks. The groove layout is designed for even wear and low rolling resistance, on an 18PR casing rated to 2180kg per tyre.',
    highlights: [
      'Highway rib for light-truck steer and all-position use',
      'Even wear with low rolling resistance',
      '18PR casing rated to 2180kg per tyre',
      'Pairs with the GR999 drive tyre in the same size',
    ],
  },
  {
    pattern: 'LD316E', brand: 'Lionshead', size: '11R22.5', sku: 'LH-11R225-LD316E', ply: '18PR', rim: '8.25',
    treadDepthMm: 23.0, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Regional', tread: 'lug', price: 220, stock: 0, rating: 0, reviewCount: 0,
    fuelRating: null, noiseDb: null, retreadable: null,
    headline: 'Deep-lug Lionshead drive tyre for regional work',
    description:
      'LD316E is a deep-lug drive pattern for traction and long mileage, on a robust 18PR casing engineered for regional drive duty. With 23mm of tread and an M speed rating it is a hard-working 11R22.5 drive fitment, and it partners the LA301E all-position in the same size.',
    highlights: [
      'Deep-lug drive pattern for traction and long mileage',
      'Robust casing engineered for regional drive duty',
      '23mm tread depth with M speed rating',
      '18PR casing rated to 3150kg per tyre',
    ],
  },
  {
    pattern: 'LA313E', brand: 'Lionshead', size: '11R22.5', sku: 'LH-11R225-LA313E', ply: '18PR', rim: '8.25',
    treadDepthMm: null, loadIndex: null, speedRating: null, rawPosition: 'Steer & Trailer',
    application: 'Regional', tread: 'rib', price: null, stock: 0, rating: 0, reviewCount: 0,
    fuelRating: null, noiseDb: null, retreadable: null,
    headline: 'Lionshead highway rib in 11R22.5',
    description:
      'LA313E is a straight multi-rib Lionshead pattern for 11R22.5 steer and trailer axles. It is built to order and quoted per order, and because Lionshead\'s published data does not cover the LA313E, we confirm the load index, speed symbol and tread depth with your quote.',
    highlights: [
      'Multi-rib highway pattern for steer and trailer axles',
      'Classic 11R22.5 fitment on an 18PR casing',
      'Full specification confirmed with your quote',
      'Built to order — quoted per order',
    ],
  },
  {
    pattern: 'LD330E', brand: 'Lionshead', size: '11R22.5', sku: 'LH-11R225-LD330E', ply: '18PR', rim: '8.25',
    treadDepthMm: 23.0, loadIndex: null, speedRating: null, rawPosition: 'Drive',
    application: 'On / Off Road', tread: 'lug', price: null, stock: 0, rating: 0, reviewCount: 0,
    fuelRating: null, noiseDb: null, retreadable: null,
    headline: 'Deep-tread Lionshead drive block',
    description:
      'LD330E is the deepest Lionshead drive pattern in 11R22.5: 23mm of open-shoulder block tread for traction on broken and unsealed surfaces, and long removal mileage. It is built to order and quoted per order, and we confirm the load index and speed symbol with your quote.',
    highlights: [
      '23mm open-shoulder block tread',
      'Traction on broken and unsealed surfaces',
      'Load index and speed symbol confirmed with your quote',
      'Built to order — quoted per order',
    ],
  },
]

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Pulls nominal section width (mm) and rim diameter (in) out of a size code. */
function parseSize(size: string): { sectionWidthMm: number; rimDiameterIn: number } {
  const metric = size.match(/^(\d{3})\/\d{2}R(\d{2}(?:\.\d)?)$/)
  if (metric) {
    return {
      sectionWidthMm: Number(metric[1]),
      rimDiameterIn: Number(metric[2]),
    }
  }
  const imperial = size.match(/^(\d+(?:\.\d+)?)R(\d{2}(?:\.\d)?)$/)
  if (imperial) {
    return {
      // Imperial section widths are quoted in inches.
      sectionWidthMm: Math.round(Number(imperial[1]) * 25.4),
      rimDiameterIn: Number(imperial[2]),
    }
  }
  return { sectionWidthMm: 0, rimDiameterIn: 0 }
}

function primaryLoadIndex(loadIndex: string): number {
  // Handles "148/145", "164" and "127/124 or 135/133".
  const first = loadIndex.match(/\d+/)
  return first ? Number(first[0]) : 0
}

function primarySpeedSymbol(speedRating: string): string {
  return speedRating.charAt(0).toUpperCase()
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function buildProduct(spec: Spec): Product {
  const { sectionWidthMm, rimDiameterIn } = parseSize(spec.size)
  const maxLoadKg =
    spec.loadIndex != null ? (LOAD_INDEX_KG[primaryLoadIndex(spec.loadIndex)] ?? 0) : null
  const maxSpeedKmh =
    spec.speedRating != null
      ? (SPEED_SYMBOL_KMH[primarySpeedSymbol(spec.speedRating)] ?? 0)
      : null
  const position = POSITION_MAP[spec.rawPosition]

  // A promotion only means something against a published price.
  const discount = spec.price != null ? spec.discount : undefined
  const discountPrice =
    spec.price != null && discount != null
      ? roundMoney(spec.price * (1 - discount / 100))
      : undefined

  const tags = [spec.application, ...position.map((p) => POSITION_LABELS[p]), spec.brand]
  if (spec.treadDepthMm != null) tags.push(`${spec.treadDepthMm}mm tread`)
  if (spec.retreadable) tags.push('Retreadable')
  if (spec.threePeak) tags.push('Severe service')
  if (spec.fuelRating === 'A') tags.push('Fuel saver')
  if (spec.price == null) tags.push('Price on application', 'POA', 'Built to order')

  return {
    id: `${slugify(spec.brand)}-${slugify(spec.pattern)}-${slugify(spec.size)}`,
    sku: spec.sku,
    brand: spec.brand,
    model: spec.pattern,
    size: spec.size,
    position,
    positionLabel: spec.rawPosition,
    application: spec.application,
    tread: spec.tread,

    ply: spec.ply,
    rim: spec.rim,
    treadDepthMm: spec.treadDepthMm,
    loadIndex: spec.loadIndex,
    speedRating: spec.speedRating,
    // 0 only if an index is missing from the tables above — `npm run check` fails on it.
    maxLoadKg,
    maxSpeedKmh,
    rimDiameterIn,
    sectionWidthMm,

    price: spec.price,
    discount,
    discountPrice,
    stock: spec.stock,
    rating: spec.rating,
    reviewCount: spec.reviewCount,

    fuelRating: spec.fuelRating,
    noiseDb: spec.noiseDb,
    retreadable: spec.retreadable,
    threePeak: spec.threePeak ?? false,

    headline: spec.headline,
    description: spec.description,
    highlights: spec.highlights,
    tags,
  }
}

export const products: Product[] = SPECS.map(buildProduct)

/* ------------------------------------------------------------------ *
 * Pricing
 *
 * A line either has a published price and goes through the cart, or it is
 * price on application and goes to a quote. Everything that does money
 * arithmetic narrows to `PricedProduct` first, so a POA line can never be
 * summed, sorted or charged as if it cost $0.
 * ------------------------------------------------------------------ */

export type PricedProduct = Product & { price: number }

/** True when the line has a published price and can be bought online. */
export function hasPrice(product: Product): product is PricedProduct {
  return product.price != null
}

/** What a customer pays per tyre before volume breaks, or `null` for POA. */
export function effectivePrice(product: PricedProduct): number
export function effectivePrice(product: Product): number | null
export function effectivePrice(product: Product): number | null {
  if (product.price == null) return null
  return product.discountPrice ?? product.price
}

/** The cheapest published price in a list, or `null` if every line is POA. */
export function lowestPrice(list: Product[]): number | null {
  const prices = list.filter(hasPrice).map((product) => effectivePrice(product))
  return prices.length ? Math.min(...prices) : null
}

/** By price either way, with price-on-application lines after every priced one. */
export function comparePrice(a: Product, b: Product, direction: 'asc' | 'desc' = 'asc'): number {
  const pa = effectivePrice(a)
  const pb = effectivePrice(b)
  if (pa == null || pb == null) return pa == null ? (pb == null ? 0 : 1) : -1
  return direction === 'asc' ? pa - pb : pb - pa
}

/* ------------------------------------------------------------------ *
 * Derived collections & lookups
 * ------------------------------------------------------------------ */

export const productById = new Map(products.map((p) => [p.id, p]))

export const getProduct = (id: string): Product | undefined => productById.get(id)

/** Lines with a published price — the ones the cart can sell. */
export const pricedProducts: PricedProduct[] = products.filter(hasPrice)

/** Price on application: built to order and quoted per order. */
export const poaProducts: Product[] = products.filter((p) => !hasPrice(p))

export const dealProducts: PricedProduct[] = pricedProducts
  .filter((p) => p.discount != null)
  .sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0))

export const featuredProducts = [
  'greforce-g-pilot-x1-295-80r22-5',
  'greforce-g-pilot-x3-295-80r22-5',
  'greforce-gr666-385-65r22-5',
  'lionshead-la301e-11r22-5',
]
  .map((id) => productById.get(id))
  .filter((p): p is Product => Boolean(p))

export const allSizes = [...new Set(products.map((p) => p.size))].sort((a, b) => {
  const ra = parseSize(a).rimDiameterIn
  const rb = parseSize(b).rimDiameterIn
  if (ra !== rb) return ra - rb
  return parseSize(a).sectionWidthMm - parseSize(b).sectionWidthMm
})

export const allRimDiameters = [...new Set(products.map((p) => p.rimDiameterIn))].sort(
  (a, b) => a - b,
)

export const allBrands: BrandName[] = ['Greforce', 'Lionshead']

export const allApplications = [...new Set(products.map((p) => p.application))] as Application[]

/** Range of published prices. POA lines have no price, so they sit outside it. */
export const priceRange = {
  min: Math.min(...pricedProducts.map((p) => effectivePrice(p))),
  max: Math.max(...pricedProducts.map((p) => effectivePrice(p))),
}

/** Priced lines with stock on the floor at Yennora. */
export let inStockCount = pricedProducts.filter((p) => p.stock > 0).length

/** Priced lines at zero stock, still sold as pre-orders. */
export let preOrderCount = pricedProducts.filter((p) => p.stock <= 0).length

/* ------------------------------------------------------------------ *
 * Live prices and stock
 *
 * The specs above are bundled with the site, but price, discount and
 * stock are set in the admin panel and stored in the database. The
 * browser fetches them from /api/inventory (see src/lib/live-catalogue.ts)
 * and applies them here, IN PLACE: every page imports these objects and
 * lists directly, so updating them is what makes a price changed in the
 * admin show everywhere, while the bundled values keep the site working
 * if the API is slow or down.
 *
 * Browser only. The API imports this module too, but it reads overrides
 * itself (api/_lib/catalogue.ts) and never calls this.
 * ------------------------------------------------------------------ */

type LiveFields = Pick<Product, 'id' | 'price' | 'discount' | 'discountPrice' | 'stock'>

const POA_TAGS = ['Price on application', 'POA', 'Built to order']

/** Applies live commercial fields. Returns true when anything changed. */
export function applyLiveCatalogue(live: LiveFields[]): boolean {
  let changed = false

  for (const update of live) {
    const product = productById.get(update.id)
    if (!product) continue
    const price = typeof update.price === 'number' ? update.price : null
    const discount = price != null && typeof update.discount === 'number' ? update.discount : undefined
    const discountPrice =
      price != null && typeof update.discountPrice === 'number' ? update.discountPrice : undefined
    const stock = typeof update.stock === 'number' ? update.stock : product.stock

    if (
      product.price === price &&
      product.discount === discount &&
      product.discountPrice === discountPrice &&
      product.stock === stock
    ) {
      continue
    }

    changed = true
    const wasPoa = product.price == null
    product.price = price
    product.discount = discount
    product.discountPrice = discountPrice
    product.stock = stock

    if (wasPoa !== (price == null)) {
      const tags = product.tags.filter((tag) => !POA_TAGS.includes(tag))
      product.tags = price == null ? [...tags, ...POA_TAGS] : tags
    }
  }

  if (!changed) return false

  // The derived lists are shared arrays, so they are refilled rather than replaced.
  const refill = <T,>(list: T[], next: T[]) => list.splice(0, list.length, ...next)
  refill(pricedProducts, products.filter(hasPrice))
  refill(poaProducts, products.filter((p) => !hasPrice(p)))
  refill(
    dealProducts,
    pricedProducts
      .filter((p) => p.discount != null)
      .sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0)),
  )
  if (pricedProducts.length) {
    priceRange.min = Math.min(...pricedProducts.map((p) => effectivePrice(p)))
    priceRange.max = Math.max(...pricedProducts.map((p) => effectivePrice(p)))
  }
  inStockCount = pricedProducts.filter((p) => p.stock > 0).length
  preOrderCount = pricedProducts.filter((p) => p.stock <= 0).length

  return true
}

/** Volume price breaks — applied automatically in the cart. */
export const PRICE_BREAKS = [
  { min: 4, discount: 0.03, label: '4+ tyres' },
  { min: 8, discount: 0.05, label: '8+ tyres' },
  { min: 20, discount: 0.08, label: '20+ tyres' },
  { min: 40, discount: 0.11, label: '40+ tyres' },
] as const

export function priceBreakFor(quantity: number) {
  return [...PRICE_BREAKS].reverse().find((b) => quantity >= b.min)
}

export function productsForPosition(position: AxlePosition): Product[] {
  return products.filter((p) => p.position.includes(position))
}

export function relatedProducts(product: Product, limit = 4): Product[] {
  const score = (other: Product) => {
    let s = 0
    if (other.size === product.size) s += 5
    if (other.brand === product.brand) s += 2
    if (other.application === product.application) s += 2
    if (other.position.some((p) => product.position.includes(p))) s += 3
    if (other.rimDiameterIn === product.rimDiameterIn) s += 1
    return s
  }
  return products
    .filter((p) => p.id !== product.id)
    .sort((a, b) => score(b) - score(a) || comparePrice(a, b))
    .slice(0, limit)
}
