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
 * Every spec below (pattern, size, ply, rim, tread depth, load index,
 * speed symbol, axle position) is taken from the Greforce and Lionshead
 * manufacturer data sheets Spartan Tyres publishes. Commercial fields
 * (price, stock, ratings) sit alongside them.
 * ------------------------------------------------------------------ */

interface Spec {
  pattern: string
  brand: BrandName
  size: string
  ply: string
  rim: string
  treadDepthMm: number
  loadIndex: string
  speedRating: string
  rawPosition: keyof typeof POSITION_MAP
  application: Application
  tread: TreadFamily
  price: number
  discount?: number
  stock: number
  rating: number
  reviewCount: number
  fuelRating: Product['fuelRating']
  noiseDb: number
  retreadable: boolean
  threePeak?: boolean
  headline: string
  description: string
  highlights: string[]
}

const SPECS: Spec[] = [
  {
    pattern: 'GRD57', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 21.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: 365, stock: 184, rating: 4.7, reviewCount: 63,
    fuelRating: 'B', noiseDb: 73, retreadable: true, threePeak: true,
    headline: 'Deep-lug drive tyre built for interstate mileage',
    description:
      'The GRD57 is Greforce\'s long-haul drive workhorse. A 21.5mm deep block pattern with stone-ejector bars delivers traction from new right through to the retread, while the wide-belt casing keeps the footprint square under full GVM. It is the pattern most of our interstate linehaul customers standardise on.',
    highlights: [
      '21.5mm deep lug pattern for maximum removal mileage',
      'Stone ejectors protect the belt package on regional roads',
      'Reinforced 18PR casing rated to 3150kg per tyre',
      'Designed for two to three retread cycles',
    ],
  },
  {
    pattern: 'G-PILOT X1', brand: 'Greforce', size: '295/80R22.5', ply: '20PR', rim: '9.00',
    treadDepthMm: 17.0, loadIndex: '154/150', speedRating: 'K', rawPosition: 'Steer & Trailer',
    application: 'Long Haul', tread: 'rib', price: 469, discount: 12, stock: 96, rating: 4.8, reviewCount: 48,
    fuelRating: 'A', noiseDb: 71, retreadable: true,
    headline: 'Five-rib steer tyre with class-leading rolling resistance',
    description:
      'The G-PILOT X1 is the premium steer and trailer fitment in the Greforce range. Five continuous ribs and a low-heat tread compound cut rolling resistance to an A rating, and the 20PR casing carries 3750kg per tyre. Drivers consistently report straighter tracking and quieter running at highway speed.',
    highlights: [
      'A-rated rolling resistance — up to 7.5% fuel saving',
      'Five continuous ribs for precise, stable steering',
      '20PR casing rated to 3750kg per tyre',
      'Wide 295mm section on a 9.00 rim for even wear',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '275/70R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 14.0, loadIndex: '146/143', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Regional', tread: 'rib', price: 335, stock: 142, rating: 4.6, reviewCount: 37,
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
    pattern: 'GRT33', brand: 'Greforce', size: '255/70R22.5', ply: '16PR', rim: '7.50',
    treadDepthMm: 14.0, loadIndex: '140/137', speedRating: 'M', rawPosition: 'Trailer',
    application: 'Regional', tread: 'trailer', price: 319, stock: 78, rating: 4.5, reviewCount: 21,
    fuelRating: 'B', noiseDb: 71, retreadable: true,
    headline: 'Narrow-section trailer rib for tight-clearance builds',
    description:
      'The 255/70R22.5 GRT33 suits trailer builds where clearance is tight and a 275 section will not fit. Same proven four-rib tread, lighter 16PR casing, and a 7.50 rim fitment that drops unsprung weight without giving up tread life.',
    highlights: [
      'Fits trailer builds where a 275 section will not clear',
      'Lighter 16PR casing reduces unsprung weight',
      'Free-rolling rib pattern for long, even trailer wear',
      'Rated to 2500kg per tyre at 140 load index',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 13.5, loadIndex: '148/145', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Regional', tread: 'rib', price: 299, discount: 10, stock: 263, rating: 4.6, reviewCount: 91,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'The volume 11R22.5 steer fitment',
    description:
      'If you run 11R22.5 on the front, this is the value benchmark. The GRT33 in the classic 11R size pairs a 13.5mm four-rib tread with an 18PR casing rated to 3150kg, and we hold it in depth year round so fleet re-orders ship same week.',
    highlights: [
      'Deepest-held stock line in our warehouse',
      'Classic 11R22.5 fitment — direct swap for most steer axles',
      '18PR casing rated to 3150kg per tyre',
      'Consistent batch-to-batch performance',
    ],
  },
  {
    pattern: 'GRT33', brand: 'Greforce', size: '9.5R17.5', ply: '18PR', rim: '6.75',
    treadDepthMm: 13.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'rib', price: 235, stock: 54, rating: 4.4, reviewCount: 18,
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
    pattern: 'GR999', brand: 'Greforce', size: '215/75R17.5', ply: '18PR', rim: '6.00',
    treadDepthMm: 15.5, loadIndex: '135/133', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 215, stock: 61, rating: 4.5, reviewCount: 24,
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
    pattern: 'GR999', brand: 'Greforce', size: '9.5R17.5', ply: '16PR', rim: '6.75',
    treadDepthMm: 15.0, loadIndex: '139/137', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 249, stock: 43, rating: 4.4, reviewCount: 15,
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
    pattern: 'GR999', brand: 'Greforce', size: '235/75R17.5', ply: '18PR', rim: '6.75',
    treadDepthMm: 15.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 239, discount: 8, stock: 88, rating: 4.6, reviewCount: 31,
    fuelRating: 'B', noiseDb: 71, retreadable: false,
    headline: 'The popular 235/75R17.5 drive fitment',
    description:
      'The widest and most capable of the GR999 family. A 235mm section on a 6.75 rim with 15.5mm of block tread gives medium rigids real drive grip, and the 18PR casing takes 2725kg per tyre for fully loaded tipper and crane-truck work.',
    highlights: [
      'Widest GR999 section for maximum drive footprint',
      '18PR casing rated to 2725kg per tyre',
      'Suits tippers, crane trucks and heavy rigids',
      'Currently on promotion',
    ],
  },
  {
    pattern: 'G-ARMOR A68', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 13.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'All Position',
    application: 'Mixed Service', tread: 'rib', price: 309, stock: 117, rating: 4.7, reviewCount: 44,
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
    pattern: 'GR612', brand: 'Greforce', size: '235/75R17.5', ply: '18PR', rim: '6.75',
    treadDepthMm: 12.5, loadIndex: '143/141', speedRating: 'J', rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'rib', price: 229, stock: 72, rating: 4.3, reviewCount: 19,
    fuelRating: 'B', noiseDb: 70, retreadable: false,
    headline: 'Economy steer rib for light commercial',
    description:
      'GR612 is the entry point into the Greforce light-truck range. A straightforward five-rib highway tread on an 18PR casing — no frills, predictable wear, and the lowest cost per fitment we stock in 17.5in.',
    highlights: [
      'Lowest-cost 235/75R17.5 steer fitment we hold',
      'Five-rib highway tread for predictable wear',
      'Quiet 70dB running',
      'Ideal for high-turnover rental and hire fleets',
    ],
  },
  {
    pattern: 'GR612', brand: 'Greforce', size: '265/70R19.5', ply: '18PR', rim: '7.50',
    treadDepthMm: 12.5, loadIndex: '143/141', speedRating: 'K', rawPosition: 'All Position',
    application: 'Urban Delivery', tread: 'rib', price: 299, stock: 38, rating: 4.4, reviewCount: 16,
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
    pattern: 'GRD1212', brand: 'Greforce', size: '275/70R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 21.5, loadIndex: '146/143 or 148/145', speedRating: 'J/K', rawPosition: 'All Position',
    application: 'On / Off Road', tread: 'lug', price: 389, stock: 64, rating: 4.7, reviewCount: 27,
    fuelRating: 'C', noiseDb: 75, retreadable: true, threePeak: true,
    headline: 'Deep all-position lug for on/off road duty',
    description:
      'An unusual and useful tyre: 21.5mm of aggressive lug tread rated for all three axle positions. GRD1212 is what we recommend for tippers, agitators and civil work where the truck spends half its life on a site and half on the highway.',
    highlights: [
      '21.5mm aggressive lug with all-position rating',
      'Built for tippers, agitators and civil contractors',
      'Dual load index — 146/143 or 148/145 depending on batch',
      'Self-cleaning tread evacuates mud and clay',
    ],
  },
  {
    pattern: 'GRD35', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 21.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: 359, stock: 156, rating: 4.6, reviewCount: 58,
    fuelRating: 'B', noiseDb: 74, retreadable: true, threePeak: true,
    headline: 'Deep drive lug in the classic 11R size',
    description:
      'GRD35 brings 21.5mm of deep drive tread to the 11R22.5 fitment at a lower price point than the GRD57. The tread blocks are slightly more closed, which trades a little loose-surface bite for noticeably quieter highway running.',
    highlights: [
      '21.5mm deep drive tread at a sharp price',
      'More closed blocks — quieter than an open lug',
      'M speed rating for 130km/h operation',
      'Held in depth for fleet re-orders',
    ],
  },
  {
    pattern: 'G-PILOT X3', brand: 'Greforce', size: '295/80R22.5', ply: '20PR', rim: '9.00',
    treadDepthMm: 21.0, loadIndex: '154/150', speedRating: 'K', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: 489, discount: 10, stock: 72, rating: 4.8, reviewCount: 41,
    fuelRating: 'B', noiseDb: 73, retreadable: true, threePeak: true,
    headline: 'Premium 295/80 drive tyre — the X1\'s partner',
    description:
      'G-PILOT X3 is the drive-axle counterpart to the X1 steer tyre. Run them together and you get a matched 295/80R22.5 set: the X1 steering and the X3 pulling, both on 20PR casings rated to 3750kg. This is the top of the Greforce linehaul range.',
    highlights: [
      'Matched set with the G-PILOT X1 steer tyre',
      '21mm deep drive tread on a 20PR casing',
      'Rated to 3750kg per tyre — highest in the range bar the GR666',
      'Premium linehaul specification',
    ],
  },
  {
    pattern: 'GR881', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 15.0, loadIndex: '148/145', speedRating: 'M', rawPosition: 'All Position',
    application: 'Mixed Service', tread: 'rib', price: 315, stock: 94, rating: 4.5, reviewCount: 33,
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
    pattern: 'GR666', brand: 'Greforce', size: '385/65R22.5', ply: '24PR', rim: '11.75',
    treadDepthMm: 14.5, loadIndex: '164', speedRating: 'K', rawPosition: 'Steer & Trailer',
    application: 'Long Haul', tread: 'rib', price: 529, stock: 47, rating: 4.7, reviewCount: 22,
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
    pattern: 'HD01M', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 23.0, loadIndex: '148/145', speedRating: 'L', rawPosition: 'Drive',
    application: 'On / Off Road', tread: 'lug', price: 395, stock: 58, rating: 4.8, reviewCount: 36,
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
    pattern: 'GR678', brand: 'Greforce', size: '265/70R19.5', ply: '18PR', rim: '7.50',
    treadDepthMm: 15.0, loadIndex: '143/141', speedRating: 'K', rawPosition: 'Drive',
    application: 'Regional', tread: 'block', price: 315, stock: 4, rating: 4.5, reviewCount: 14,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'Drive-axle block pattern in 19.5in',
    description:
      'The drive partner to the GR612 in 265/70R19.5. A 15mm block tread gives medium rigids and buses proper drive traction in a size that is often only available as an all-position compromise.',
    highlights: [
      'Purpose-built drive tread in 265/70R19.5',
      '15mm block depth for genuine traction',
      'Pairs with the GR612 all-position for a full set',
      'Low stock — contact us for lead times on volume',
    ],
  },
  {
    pattern: 'GRD37', brand: 'Greforce', size: '11R22.5', ply: '16PR', rim: '8.25',
    treadDepthMm: 20.0, loadIndex: '146/143', speedRating: 'L', rawPosition: 'Drive',
    application: 'Regional', tread: 'lug', price: 339, stock: 102, rating: 4.4, reviewCount: 26,
    fuelRating: 'B', noiseDb: 74, retreadable: true,
    headline: 'Lighter 16PR deep-lug drive tyre',
    description:
      'GRD37 offers 20mm of drive tread on a lighter 16PR casing. Where you do not need the full 3150kg rating, the weight saving across eight drive positions is worth real payload — and the price is lower too.',
    highlights: [
      '16PR casing saves weight across eight drive positions',
      '20mm deep lug tread',
      'Rated to 3000kg per tyre',
      'Lower cost where full 18PR rating is not required',
    ],
  },
  {
    pattern: 'HD02', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 23.5, loadIndex: '148/145', speedRating: 'L', rawPosition: 'Drive',
    application: 'On / Off Road', tread: 'lug', price: 399, stock: 0, rating: 4.9, reviewCount: 29,
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
    pattern: 'GR622', brand: 'Greforce', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 19.5, loadIndex: '148/145', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: 349, stock: 131, rating: 4.5, reviewCount: 39,
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
    pattern: 'LA301E', brand: 'Lionshead', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 14.5, loadIndex: '149/146', speedRating: 'L', rawPosition: 'All Position',
    application: 'Regional', tread: 'rib', price: 305, stock: 88, rating: 4.6, reviewCount: 34,
    fuelRating: 'B', noiseDb: 72, retreadable: true,
    headline: 'Lionshead all-position with a 149 load index',
    description:
      'The LA301E carries a 149 load index — one step above most 11R22.5 competitors at 3250kg per tyre. Combined with an all-position rating and 14.5mm of rib tread, it is the Lionshead answer for operators running at maximum legal axle mass.',
    highlights: [
      '149 load index — 3250kg per tyre, above the 11R22.5 norm',
      'All-position rating for flexible fitment',
      '14.5mm rib tread with reinforced shoulders',
      'Built for operators at maximum legal axle mass',
    ],
  },
  {
    pattern: 'LD317E', brand: 'Lionshead', size: '11R22.5', ply: '18PR', rim: '8.25',
    treadDepthMm: 18.0, loadIndex: '149/146', speedRating: 'M', rawPosition: 'Drive',
    application: 'Long Haul', tread: 'lug', price: 345, discount: 7, stock: 119, rating: 4.7, reviewCount: 45,
    fuelRating: 'B', noiseDb: 73, retreadable: true, threePeak: true,
    headline: 'Lionshead drive tyre, 149 load index',
    description:
      'LD317E is the drive partner to the LA301E, sharing the same uprated 149 load index. An 18mm closed-shoulder lug pattern delivers linehaul traction with the even wear that closed shoulders produce, and the M rating allows 130km/h.',
    highlights: [
      'Matched 149 load index with the LA301E all-position',
      'Closed-shoulder lug for even drive wear',
      '18mm tread depth with M speed rating',
      'Rated to 3250kg per tyre',
    ],
  },
  {
    pattern: 'LA302E', brand: 'Lionshead', size: '215/75R17.5', ply: '16PR', rim: '6.00',
    treadDepthMm: 12.5, loadIndex: '127/124 or 135/133', speedRating: 'M/J', rawPosition: 'Trailer',
    application: 'Urban Delivery', tread: 'trailer', price: 199, stock: 5, rating: 4.2, reviewCount: 11,
    fuelRating: 'B', noiseDb: 70, retreadable: false,
    headline: 'Entry-price trailer tyre for light builds',
    description:
      'The most affordable tyre in our catalogue. LA302E is a closed-shoulder trailer rib for light tandem trailers and plant floats, available in two load ratings depending on batch — check the sidewall against your plate before fitting.',
    highlights: [
      'Lowest price point in the Spartan catalogue',
      'Closed-shoulder trailer rib for long, free-rolling life',
      'Dual load rating — 127/124 or 135/133 by batch',
      'Only 5 left in stock',
    ],
  },
  {
    pattern: 'LD328E', brand: 'Lionshead', size: '235/75R17.5', ply: '18PR', rim: '6.75',
    treadDepthMm: 15.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Drive',
    application: 'Urban Delivery', tread: 'block', price: 245, stock: 67, rating: 4.5, reviewCount: 20,
    fuelRating: 'B', noiseDb: 71, retreadable: false,
    headline: 'Lionshead 17.5in drive tyre',
    description:
      'LD328E gives 15.5mm of open block tread in the common 235/75R17.5 light-truck drive size. A direct alternative to the Greforce GR999 at a slightly higher price point, with a marginally more open shoulder for wet grip.',
    highlights: [
      '15.5mm open block tread for wet-surface traction',
      'More open shoulder than the GR999 equivalent',
      '18PR casing rated to 2725kg per tyre',
      'Popular on refrigerated metro rigids',
    ],
  },
  {
    pattern: 'LS306E', brand: 'Lionshead', size: '235/75R17.5', ply: '18PR', rim: '6.75',
    treadDepthMm: 12.5, loadIndex: '143/141', speedRating: 'L', rawPosition: 'Steer & Trailer',
    application: 'Urban Delivery', tread: 'rib', price: 225, discount: 11, stock: 95, rating: 4.4, reviewCount: 23,
    fuelRating: 'B', noiseDb: 70, retreadable: false,
    headline: 'Lionshead steer rib for light commercial',
    description:
      'LS306E completes the Lionshead 17.5in offering as the steer and trailer fitment. Run it with the LD328E on the drive and you have a full Lionshead set for a medium rigid at a lower total cost than most branded alternatives.',
    highlights: [
      'Pairs with the LD328E for a complete Lionshead set',
      'Five-rib steer tread for straight tracking',
      'Quiet 70dB running for metro work',
      'Currently discounted',
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

function buildProduct(spec: Spec, index: number): Product {
  const { sectionWidthMm, rimDiameterIn } = parseSize(spec.size)
  const li = primaryLoadIndex(spec.loadIndex)
  const symbol = primarySpeedSymbol(spec.speedRating)
  const position = POSITION_MAP[spec.rawPosition]

  const discountPrice =
    spec.discount != null
      ? roundMoney(spec.price * (1 - spec.discount / 100))
      : undefined

  const tags = [
    spec.application,
    ...position.map((p) => POSITION_LABELS[p]),
    spec.brand,
    `${spec.treadDepthMm}mm tread`,
  ]
  if (spec.retreadable) tags.push('Retreadable')
  if (spec.threePeak) tags.push('Severe service')
  if (spec.fuelRating === 'A') tags.push('Fuel saver')

  return {
    id: `${slugify(spec.brand)}-${slugify(spec.pattern)}-${slugify(spec.size)}`,
    sku: `SPT-${spec.brand.slice(0, 2).toUpperCase()}${String(index + 1).padStart(3, '0')}`,
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
    maxLoadKg: LOAD_INDEX_KG[li] ?? 0,
    maxSpeedKmh: SPEED_SYMBOL_KMH[symbol] ?? 0,
    rimDiameterIn,
    sectionWidthMm,

    price: spec.price,
    discount: spec.discount,
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
 * Derived collections & lookups
 * ------------------------------------------------------------------ */

export const productById = new Map(products.map((p) => [p.id, p]))

export const getProduct = (id: string): Product | undefined => productById.get(id)

export const effectivePrice = (p: Product): number => p.discountPrice ?? p.price

export const dealProducts = products
  .filter((p) => p.discount != null)
  .sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0))

export const featuredProducts = [
  'greforce-g-pilot-x1-295-80r22-5',
  'greforce-grd57-11r22-5',
  'greforce-gr666-385-65r22-5',
  'lionshead-ld317e-11r22-5',
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

export const priceRange = {
  min: Math.min(...products.map(effectivePrice)),
  max: Math.max(...products.map(effectivePrice)),
}

export const inStockCount = products.filter((p) => p.stock > 0).length

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
    .sort((a, b) => score(b) - score(a) || effectivePrice(a) - effectivePrice(b))
    .slice(0, limit)
}
