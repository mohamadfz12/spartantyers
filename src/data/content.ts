import { site } from '../config/site.js'
import { allSizes, poaProducts, pricedProducts, products } from './products.js'

/* ------------------------------------------------------------------ *
 * Structured marketing and educational copy.
 *
 * Pages read from here rather than hard-coding prose, so a wording
 * change is a change to this file only. Numbers are derived from the
 * live catalogue and from src/config/site.ts wherever possible.
 *
 * `icon` values are lucide-react icon names, resolved by the consuming
 * component — never a React element.
 * ------------------------------------------------------------------ */

/* ---------------- shared shapes ---------------- */

export interface Stat {
  value: number
  suffix: string
  label: string
  detail: string
}

export interface IconCard {
  title: string
  body: string
  icon: string
}

export interface Step {
  step: number
  title: string
  body: string
}

export interface Pillar {
  title: string
  body: string
}

/* ---------------- derived catalogue figures ---------------- */

/** Live sum of on-hand units across every stocked line. */
const totalStockUnits = products.reduce((sum, product) => sum + product.stock, 0)

/** Rounded down to the nearest hundred so the headline figure is never overstated. */
const stockHeadline = Math.floor(totalStockUnits / 100) * 100

/** Published figures only — a line with no published value is left out of a range. */
function publishedRange(values: Array<number | null>): { min: number; max: number } {
  const known = values.filter((value): value is number => value != null)
  return { min: Math.min(...known), max: Math.max(...known) }
}

const treadRange = publishedRange(products.map((product) => product.treadDepthMm))
const noiseRange = publishedRange(products.map((product) => product.noiseDb))

/* ---------------- home page ---------------- */

export const homeStats: Stat[] = [
  {
    value: stockHeadline,
    suffix: '+',
    label: 'Tyres on the floor',
    detail: `On-hand count across the ${pricedProducts.length} Greforce and Lionshead lines we sell from stock at our Yennora warehouse.`,
  },
  {
    value: allSizes.length,
    suffix: '',
    label: 'Sizes in the range',
    detail:
      'From 215/75R17.5 light truck through to the 385/65R22.5 super-single — most held at Yennora, the rest built to order.',
  },
  {
    value: site.commerce.metroCities.length,
    suffix: '',
    label: 'Metro cities, free freight',
    detail: `Free delivery to every metro area with no minimum spend, typically ${site.commerce.metroDeliveryEstimate}.`,
  },
  {
    value: 1,
    suffix: ' day',
    label: 'Dispatch window',
    detail:
      'Orders placed before close on a business day are packed and away within one business day.',
  },
]

export const valueProps: IconCard[] = [
  {
    title: 'Bulk and volume pricing',
    body: 'Volume breaks are published rather than negotiated: 3% from 4 tyres, 5% from 8, 8% from 20 and 11% from 40. They apply across the whole order, not per line, and the cart works them out for you.',
    icon: 'Banknote',
  },
  {
    title: 'Deep stock, not a catalogue',
    body: `We hold ${pricedProducts.length} Greforce and Lionshead lines at Yennora and build ${poaProducts.length} more to order. A fleet re-order on a stocked line ships the same week rather than waiting on a container.`,
    icon: 'Warehouse',
  },
  {
    title: 'Fast Sydney dispatch',
    body: 'Every order ships from our own warehouse at Yennora, picked and packed within one business day. Tyres are individually wrapped, and orders of four or more go out palletised.',
    icon: 'Timer',
  },
  {
    title: 'Technical support that knows trucks',
    body: `Load indexes, speed symbols, rim widths and axle mass — send us a photo of your sidewall and we will confirm the fitment before you order. ${site.hours.short} on ${site.phone.display}.`,
    icon: 'Headphones',
  },
  {
    title: 'Warranty and returns cover',
    body: 'Manufacturer warranty against defects from purchase until the tread wears to 1.6mm, optional road hazard protection for the first two years, and 30 days to return unused tyres in original condition.',
    icon: 'ShieldCheck',
  },
  {
    title: 'Free metro delivery, no minimum',
    body: 'One tyre or forty, free to every metro area with no minimum spend. Outside metro, order as normal with no upfront freight charge and we confirm the cost with you before dispatch.',
    icon: 'Truck',
  },
]

export const howItWorks: Step[] = [
  {
    step: 1,
    title: 'Search by size or vehicle',
    body: 'Enter your tyre size or vehicle details in the Tyre Finder and get instant matches for your truck, bus or trailer. Filter by axle position and application to narrow it to the patterns built for your work.',
  },
  {
    step: 2,
    title: 'Compare specs and prices',
    body: 'Every line shows load index, speed symbol, tread depth, ply rating, rim width and rolling resistance side by side. Compare the real numbers, take advantage of our best price guarantee and current offers, then order.',
  },
  {
    step: 3,
    title: 'Free metro delivery to your depot',
    body: 'Free delivery on all metro orders, sent straight to your depot or business address. Outside metro? Order as normal with no upfront freight charge and our team will contact you to arrange it and confirm the cost before dispatch.',
  },
]

export const customerSegments: IconCard[] = [
  {
    title: 'Independent tyre shops and auto retailers',
    body: 'Independent tyre shops and auto retailers across Australia buy from us for consistent stock and competitive pricing. Mixed orders are welcome, so you can build an inventory across sizes rather than committing to a single pattern.',
    icon: 'Store',
  },
  {
    title: 'Automotive workshops',
    body: 'Workshops rely on our fast dispatch and technical expertise to keep their customers moving. One business day to dispatch and a phone number that reaches someone who can confirm a fitment is usually what matters most.',
    icon: 'Wrench',
  },
  {
    title: 'Fleet operators',
    body: 'Fleet operators choose us for bulk supply, reliable delivery and custom contract solutions that scale with the business. Fixed pricing on nominated fitments and scheduled depot delivery take the guesswork out of replacement cycles.',
    icon: 'Truck',
  },
  {
    title: 'Construction and civil contractors',
    body: 'Construction and civil contractors depend on tyres built for the toughest Australian conditions — cut-and-chip compounds, reinforced sidewalls and all-position patterns like the GRD1212 that handle a site in the morning and a highway in the afternoon.',
    icon: 'HardHat',
  },
]

export const fleetServices: IconCard[] = [
  {
    title: 'Bulk supply',
    body: 'Large volume orders at pricing that reflects them. We maintain extensive stock levels on the volume fitments so a fleet-sized order can be filled from the floor rather than scheduled against a shipment.',
    icon: 'Boxes',
  },
  {
    title: 'Custom contract pricing',
    body: 'Supply agreements tailored to your fleet: fixed pricing on your nominated fitments, agreed lead times, and a named account contact who knows your axle loads and your fitment list.',
    icon: 'FileSignature',
  },
  {
    title: 'Sydney dispatch in 24 to 48 hours',
    body: 'Sydney-based distribution with delivery right across Australia. Most orders are dispatched within 24 to 48 hours of payment clearing, and free metro freight applies with no minimum spend.',
    icon: 'Truck',
  },
  {
    title: 'Custom sourcing for rare sizes',
    body: `Cannot find the fitment you need? We source specialty and hard-to-find sizes through our partner ${site.partner.name} and our wider supplier network, and come back to you with availability, lead time and price before you commit.`,
    icon: 'Search',
  },
  {
    title: 'Technical support for load ratings and fitments',
    body: 'Expert guidance on specifications, load indexes, speed symbols and rim widths so the tyre matches your compliance plate rather than just the size you asked for. Send a photo of the sidewall and we will check it.',
    icon: 'Gauge',
  },
  {
    title: 'Scheduled depot delivery',
    body: 'Deliveries timed to your replacement calendar instead of your emergencies. For orders of 20 tyres or more we arrange bulk freight and palletised consignments direct to your depot.',
    icon: 'CalendarClock',
  },
]

export const wholesaleBenefits: IconCard[] = [
  {
    title: 'Trade pricing that scales',
    body: 'Published volume breaks from 4 tyres up to 11% at 40, with contract pricing beyond that for regular trade volumes. No per-order negotiation and no surprise list price.',
    icon: 'Banknote',
  },
  {
    title: 'Stock you can resell with confidence',
    body: `${pricedProducts.length} lines held at Yennora and ${poaProducts.length} more built to order, with consistent batch-to-batch specification, so a repeat order for a customer fits the same way as the first one.`,
    icon: 'Warehouse',
  },
  {
    title: 'Mixed orders, any combination',
    body: 'Flexible bulk ordering for automotive businesses. Build an order across sizes, brands and axle positions to suit your inventory rather than buying a pallet of one pattern.',
    icon: 'Boxes',
  },
  {
    title: 'Quotes back inside a business day',
    body: `Send your size list and quantities to ${site.email.sales} or call ${site.phone.display} and we will come back with pricing, stock position and lead time, usually the same business day.`,
    icon: 'FileText',
  },
  {
    title: 'Account facilities for regular buyers',
    body: `Dedicated support, streamlined re-ordering and account facilities for regular trade customers. Email ${site.email.accounts} with your business details to get set up.`,
    icon: 'Handshake',
  },
  {
    title: 'Full warranty on everything you sell on',
    body: 'Manufacturer warranty against defects from purchase until the tread reaches 1.6mm on every tyre, plus optional road hazard protection for the first two years, so you are not carrying the risk for your customer.',
    icon: 'ShieldCheck',
  },
]

/* ---------------- about ---------------- */

export const aboutStory: {
  lead: string
  paragraphs: string[]
  pillars: Pillar[]
} = {
  lead: `${site.legalName} is a Sydney-based supplier of commercial truck, bus and trailer tyres, selling online and over the phone to operators right across Australia.`,
  paragraphs: [
    'We supply a focused range of high-quality tyres chosen for performance, durability and value rather than breadth for its own sake. Greforce and Lionshead are stocked in our own warehouse at Yennora, which is why we can quote a real stock figure instead of a lead time.',
    'From independent workshops to national fleet operators, we deliver tyres that keep Australia moving — quickly, competitively and without the runaround. Orders are dispatched within one business day, metro delivery is free with no minimum spend, and non-metro freight is arranged and confirmed with you before anything leaves the warehouse.',
    `We are a supplier rather than a fitting workshop. Warehouse pickup customers can add professional wheel fitting at $${site.commerce.fittingFeePerTyre} per tyre at our Yennora site, and our sister business ${site.partner.name} operates from the same address for fitting, wheel alignment, truck wash and RTA wash and inspection.`,
    `Brands we do not hold ourselves — Bridgestone, Michelin, Goodyear, Continental, Pirelli, Dunlop, Hankook and Yokohama — are available through ${site.partner.name} on ${site.partner.phone.display}. We would rather point you to the right supplier than pretend we have something on the shelf.`,
    'Our commitment to service, combined with practical industry knowledge and a reliable logistics network, is what keeps businesses that demand straight answers coming back.',
  ],
  pillars: [
    {
      title: 'Industry experience',
      body: 'Our team brings decades of combined tyre industry experience, so you get expert advice and the right product for the job rather than whatever is easiest to sell. Load ratings, rim widths and axle mass are everyday conversations here.',
    },
    {
      title: 'Stock and logistics',
      body: `With Sydney-based dispatch from ${site.warehouse.full} and direct relationships with our manufacturers, we maintain consistent stock levels and fast delivery times across the lines operators actually re-order.`,
    },
    {
      title: 'Flexible service',
      body: 'Whether you need a single specialty tyre or bulk fleet supply, we tailor the service to the job. There is no minimum order, no minimum spend on metro freight, and no requirement to be a trade account to get a straight price.',
    },
    {
      title: 'Bulk buying power',
      body: 'Buying in container volumes and running a lean operation lets us offer market-leading prices without compromising on quality or service. The volume breaks are published so you can see exactly what scale is worth.',
    },
  ],
}

/* ---------------- /guide ---------------- */

export interface TyreGuide {
  sizeAnatomy: Array<{ part: string; meaning: string }>
  positions: Array<{
    key: 'steer' | 'drive' | 'trailer'
    title: string
    body: string
    bestFor: string
  }>
  performanceFactors: Pillar[]
  maintenanceTips: string[]
}

export const tyreGuide: TyreGuide = {
  sizeAnatomy: [
    {
      part: '295',
      meaning:
        'Section width in millimetres, measured sidewall to sidewall at the widest point on the specified rim. It is wider than the tread face, not the same thing.',
    },
    {
      part: '80',
      meaning:
        'Aspect ratio — the sidewall height as a percentage of the section width. Eighty per cent of 295mm gives a sidewall around 236mm tall. Imperial sizes such as 11R22.5 omit this figure and carry an implied ratio of roughly 90 per cent.',
    },
    {
      part: 'R',
      meaning:
        'Radial construction, which is standard for almost all modern commercial tyres. The casing plies run bead to bead under a stabilising steel belt package.',
    },
    {
      part: '22.5',
      meaning:
        'Rim diameter in inches. The one figure with no tolerance at all — a 22.5in tyre will not fit a 19.5in rim.',
    },
    {
      part: '154/150',
      meaning:
        'Load index. The first number is the maximum load for a single fitment, the second for a dual fitment, which carries slightly less per tyre. 154 is 3,750kg and 150 is 3,350kg. It is a coded value, not a weight, so it has to be read off the table.',
    },
    {
      part: 'K',
      meaning:
        'Speed symbol — the maximum sustained speed the casing is rated for. J is 100km/h, K is 110km/h, L is 120km/h and M is 130km/h. Treat it as a heat specification rather than a permission slip.',
    },
    {
      part: '20PR',
      meaning:
        'Ply rating. A legacy measure of casing strength: an 18PR tyre is as strong as an old bias-ply tyre with eighteen plies, not one that contains them. In our range 16PR is the lighter heavy fitment, 18PR the Australian standard, 20PR premium linehaul and 24PR the super-single.',
    },
  ],
  positions: [
    {
      key: 'steer',
      title: 'Steer',
      body: 'Mounted on the front axle, these tyres need excellent handling, even wear patterns and responsive steering characteristics. Continuous circumferential ribs resist lateral deflection, which is what gives precise response and straight tracking. Because a steer failure directly affects control, these are the tyres to inspect most closely and replace earliest.',
      bestFor: 'Control, cornering, wet traction',
    },
    {
      key: 'drive',
      title: 'Drive',
      body: 'Located on powered axles, these tyres require strong traction, durability and resistance to wear from torque and power delivery. Block and lug patterns with independent tread elements bite into the surface, and the tread is cut deeper so biting edges survive through the life of the tyre. Expect drives to wear faster than steers or trailers — that is normal, not a fault.',
      bestFor: 'Traction, fuel efficiency, longevity',
    },
    {
      key: 'trailer',
      title: 'Trailer',
      body: 'Designed for non-powered axles, these tyres prioritise durability, fuel efficiency and extended tread life for long-distance hauling. They see no drive torque and no steering input, but plenty of lateral scrub as the trailer follows the prime mover through corners, so closed shoulders and strong sidewalls matter more than tread depth.',
      bestFor: 'Durability, load capacity, retreadability',
    },
  ],
  performanceFactors: [
    {
      title: 'Rolling resistance',
      body: 'Lower rolling resistance reduces fuel consumption. Ratings run from A, the best, to G, the worst, and an A-rated tyre can save up to 7.5% in fuel costs against the worst end of the scale. On a highway truck, overcoming tyre rolling resistance accounts for roughly a third of total fuel burn, so this is one of the few fuel levers you can pull with a purchase order.',
    },
    {
      title: 'Load index and speed symbol',
      body: 'The load index must meet or exceed the axle mass on your compliance plate divided by the number of tyres on that axle. The speed symbol is really a heat rating: a casing built for 130km/h has margin at 100km/h, where one built for 100km/h has very little. Running at maximum legal mass and the top of the speed rating through an Australian summer is what produces heat failures.',
    },
    {
      title: 'Tread depth and duty cycle',
      body: `Deeper tread buys removal mileage and damage resistance but costs fuel, because more rubber flexes per revolution. Our range spans ${treadRange.min}mm economy ribs to a ${treadRange.max}mm off-highway drive lug. For sealed-road linehaul the shallower, quieter pattern usually wins on total cost; for gravel and site work the deep pattern wins on survival.`,
    },
    {
      title: 'Noise',
      body: `Measured in decibels. Lower noise improves driver comfort and helps with noise restrictions in built-up areas. Where a figure is published, our range runs from ${noiseRange.min}dB on the light-truck ribs to ${noiseRange.max}dB on the deep off-highway lugs — the aggressive pattern that survives a quarry access road is always going to be the louder one on the highway.`,
    },
    {
      title: 'Retreadability',
      body: 'Many commercial tyres can be retreaded two to three times, extending total life and reducing cost per kilometre by 25 to 35 per cent. It depends on the casing surviving its first life intact, which in practice means pressure discipline and never running a tyre flat. Most of our 22.5in and 19.5in lines are specified as retreadable — each product page says which — while the 17.5in light-truck lines are not built for it.',
    },
  ],
  maintenanceTips: [
    'Check tyre pressure weekly when tyres are cold — never bleed air from a hot tyre',
    'Inspect tread depth regularly (minimum 1.6mm legal limit)',
    'Rotate tyres every 40,000–80,000 km for even wear',
    'Check wheel alignment annually or when handling issues appear',
    'Replace tyres showing signs of damage, uneven wear, or aging',
  ],
}

/* ---------------- /shipping ---------------- */

export const deliveryZones: {
  metro: string[]
  note: string
  nonMetroSteps: string[]
  pickupPoints: Pillar[]
} = {
  metro: [...site.commerce.metroCities],
  note: `Free delivery on all metro orders with no minimum spend, estimated ${site.commerce.metroDeliveryEstimate} once dispatched. We dispatch from ${site.warehouse.full} within ${site.commerce.dispatchWindow}. Delivery is handled by trusted third-party couriers, so timeframes are estimates and are not guaranteed, and a signature is required on every delivery.`,
  nonMetroSteps: [
    'Order online as normal — there is no upfront freight charge for non-metro addresses',
    'A member of our team contacts you after the order is placed to arrange the delivery',
    'We confirm the delivery options and the cost with you before anything is dispatched',
    `Prefer to know first? Call ${site.phone.display} and we will tell you what is involved before you order`,
  ],
  pickupPoints: [
    {
      title: 'Collect free from Yennora',
      body: `Choose Pickup at checkout and collect your order from ${site.warehouse.full} at no charge. We will have it ready and contact you when it is good to collect — no delivery wait and no freight to arrange.`,
    },
    {
      title: `Optional wheel fitting, $${site.commerce.fittingFeePerTyre} per tyre`,
      body: `Pickup orders can add professional wheel fitting at $${site.commerce.fittingFeePerTyre} per tyre, ticked at checkout. Precise installation with proper equipment while you wait. Fitting is available on pickup orders only — delivered orders arrive as loose tyres for your own fitter.`,
    },
    {
      title: 'Bulk collection and depot freight',
      body: `Orders of ${site.commerce.bulkThreshold} tyres or more are palletised for forklift unloading, and we arrange bulk freight specifically rather than sending them through a parcel network. Call ${site.phone.display} to line up a collection time or a scheduled depot delivery.`,
    },
  ],
}

/* ---------------- /returns ---------------- */

export const warrantyTerms: Pillar[] = [
  {
    title: 'Manufacturer warranty',
    body: "All tyres are covered by the manufacturer's warranty against defects in materials and workmanship, from the date of purchase until the tread wears to 1.6mm. That covers manufacturing faults — it does not cover damage from road hazards, underinflation, overloading or misalignment. These terms sit alongside your rights under Australian Consumer Law, which nothing here limits.",
  },
  {
    title: 'Road hazard protection',
    body: 'Optional road hazard protection is available for the first 2 years, covering damage from potholes, nails, glass and other road debris — exactly the damage a defect warranty excludes. Ask about the protection plan at checkout, or call us before you order if your trucks spend real time on unsealed roads.',
  },
  {
    title: '30-day returns',
    body: 'Unused tyres may be returned within 30 days of purchase for a full refund. Tyres must be in original condition with no mounting marks or damage. Return shipping charges may apply unless the return is our error or the tyre is defective. Mounted tyres cannot be returned unless they are defective under warranty.',
  },
  {
    title: 'Delivery condition guarantee',
    body: 'We guarantee all tyres are in good condition on delivery. Every tyre is inspected before shipping, individually wrapped, and palletised on orders of four or more to prevent transit damage. Any delivery damage is covered for full replacement and we cover the freight both ways — photograph the damage and call us with your order number.',
  },
]
