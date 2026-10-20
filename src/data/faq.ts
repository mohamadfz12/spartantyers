import type { FaqItem } from './types'
import { allSizes, poaProducts, pricedProducts, products } from './products'

/* ------------------------------------------------------------------ *
 * Frequently asked questions
 *
 * Every answer here must stay consistent with src/config/site.ts, and
 * counts come from the catalogue so they cannot drift from it.
 * Order within each category runs from the most commonly asked down.
 * ------------------------------------------------------------------ */

const lineCount = (brand: string) => products.filter((p) => p.brand === brand).length

export const faqs: FaqItem[] = [
  /* ---- Ordering ---- */
  {
    category: 'Ordering',
    question: 'Is there a minimum order?',
    answer:
      'No. You can order a single tyre or forty, and there is no minimum spend for free metro delivery. Volume price breaks start at 4 tyres and are applied automatically in the cart, so there is no need to ask for them.',
  },
  {
    category: 'Ordering',
    question: 'How do I find the right size for my truck?',
    answer:
      'Read the size off the sidewall of the tyre currently on the vehicle - something like 11R22.5 or 295/80R22.5 - and enter it in our Tyre Finder, or filter the shop by size. Check the load index and speed symbol that follow the size as well, because two tyres in the same size can carry different ratings. If you want it confirmed before you order, send us a photo of the sidewall and the rim stamping on 1300 846 024 and we will check it against your vehicle plate.',
  },
  {
    category: 'Ordering',
    question: 'What happens if I order the wrong size?',
    answer:
      'As long as the tyres are unused and in original condition with no mounting marks, you can return them within 30 days for a refund or exchange. Return shipping may apply, because verifying the fitment before ordering is the buyer\'s responsibility. Call us on 1300 846 024 before you fit anything if you are unsure - we would much rather check the specification with you than process a return.',
  },
  {
    category: 'Ordering',
    question: 'Can I order a tyre that is showing out of stock?',
    answer:
      'Yes. Out-of-stock lines can be pre-ordered, which allocates you stock from the next shipment rather than putting you on a waiting list. Normal dispatch and handling times apply once the container lands. The HD02 in 11R22.5 is the line this happens to most often, so if you run that fitment it is worth ordering ahead of your replacement cycle.',
  },
  {
    category: 'Ordering',
    question: 'Some tyres show POA instead of a price. What does that mean?',
    answer: `POA is price on application. Those ${poaProducts.length} lines are built to order rather than held on the floor, so the price depends on the quantity and the production run. Use Request a quote on the product page, or call 1300 846 024, and we will come back with price and lead time - usually within one business day. Nothing is charged until you have accepted the quote.`,
  },

  /* ---- Delivery & Pickup ---- */
  {
    category: 'Delivery & Pickup',
    question: 'How much does delivery cost and how long does it take?',
    answer:
      'Delivery is free to all metro areas with no minimum spend - Sydney, Melbourne, Brisbane, Adelaide, Perth, Canberra, Gold Coast, Newcastle, Wollongong, Hobart and Darwin. We dispatch from our Yennora warehouse within 1 business day and metro delivery usually takes 2 to 3 business days from there. Delivery is handled by third-party couriers, so those timeframes are estimates rather than guarantees, and a signature is required on every delivery.',
  },
  {
    category: 'Delivery & Pickup',
    question: 'What happens if my address is outside your metro delivery area?',
    answer:
      'Order online as normal. There is no upfront freight charge at checkout for non-metro addresses. Once the order is placed, our team contacts you to arrange the delivery and confirm the cost before anything is dispatched, so you are never committed to a freight figure you have not seen. If you would rather know before you order, call 1300 846 024 and we will tell you what is involved.',
  },
  {
    category: 'Delivery & Pickup',
    question: 'Can I track my order?',
    answer:
      'Yes. You get an order confirmation email with a tracking number, a second notification when the order is dispatched, and real-time tracking through the courier. You can also check the status of any order through your account on our site.',
  },
  {
    category: 'Delivery & Pickup',
    question: 'Can I collect my order, and can you fit the tyres?',
    answer:
      'Yes. Choose Pickup at checkout and collect free of charge from our warehouse at 10 Pine Rd, Yennora NSW 2161 - we will contact you when the order is ready. Pickup orders can also add professional wheel fitting at $70 per tyre, ticked at checkout, which is done on site while you wait. Fitting is only available on pickup orders; for delivered orders we can point you to a fitter in your area.',
  },
  {
    category: 'Delivery & Pickup',
    question: 'Can you deliver to a depot, and how are bulk orders shipped?',
    answer:
      'Yes, we deliver to commercial depots and business addresses Australia-wide, and a depot address is usually easier than a street address because someone is there to sign. Orders of 4 or more tyres ship palletised; for 20 or more we arrange bulk freight specifically so the consignment arrives as a forklift job rather than tyres rolled off a tail lift. Every tyre is individually wrapped and labelled regardless of order size.',
  },

  /* ---- Products & Fitment ---- */
  {
    category: 'Products & Fitment',
    question: 'Do you fit tyres?',
    answer:
      'We are an online and phone supplier, not a fitting workshop, so delivered orders arrive as loose tyres for your own fitter. The one exception is warehouse pickup: choose Pickup at checkout and you can add professional wheel fitting at $70 per tyre at our Yennora site. Our sister business 1 Truck Stop operates from the same Yennora address and does tyre fitting, wheel alignment, truck wash and RTA wash and inspection - call them on 1300 376 304.',
  },
  {
    category: 'Products & Fitment',
    question: 'Which brands do you stock, and can you get the ones you do not?',
    answer:
      `We carry Greforce and Lionshead ourselves - ${products.length} lines across ${allSizes.length} sizes from 17.5in light truck up to 385/65R22.5 super-singles, with ${pricedProducts.length} held in our own warehouse ready to ship and ${poaProducts.length} built to order. Bridgestone, Michelin, Goodyear, Continental, Pirelli, Dunlop, Hankook and Yokohama are available through our partner 1 Truck Stop rather than from our stock. For those, call 1 Truck Stop on 1300 376 304 or go to https://1truckstop.com.au/truck-tyres/.`,
  },
  {
    category: 'Products & Fitment',
    question: 'What is the difference between Greforce and Lionshead?',
    answer:
      `Greforce is the broader of the two ranges with ${lineCount('Greforce')} of our ${products.length} lines, spanning everything from the economy GR612 light-truck rib through the GRT33 volume fitments to the premium G-PILOT linehaul patterns and the 23.5mm HD02 off-highway drive tyre. Lionshead is a focused ${lineCount('Lionshead')}-line range of value radials for regional and vocational fleets: the LA301E all-position and LA313E rib with the LD316E, LD317E and LD330E drive patterns in 11R22.5, plus 17.5in fitments in the LA302E, LD328E and LS306E. Both are specified to the same standard - it is a difference in range coverage, not in quality tier.`,
  },
  {
    category: 'Products & Fitment',
    question: 'How do I work out the load index I need?',
    answer:
      'Start with the axle mass on your vehicle compliance plate and divide it by the number of tyres on that axle, then pick a tyre whose load index meets or exceeds that figure. Load index is a code, not a weight: 143 is 2725kg, 146 is 3000kg, 148 is 3150kg, 149 is 3250kg and 154 is 3750kg. Where a tyre is marked 148/145, the first number applies to a single fitment and the second to duals, which carry slightly less per tyre. Some lines ship with two ratings depending on batch - our GRD1212 is 146/143 or 148/145 - so always check the sidewall of what arrives, or call 1300 846 024 and we will work it out with you.',
  },
  {
    category: 'Products & Fitment',
    question: 'Are these tyres road legal in Australia?',
    answer:
      'Yes. Everything we sell is a new commercial radial carrying its full size, load index and speed symbol markings on the sidewall, supplied for on-highway use in Australia. Compliance in practice comes down to fitting a tyre whose load index and speed symbol meet or exceed the requirements on your vehicle compliance plate, and keeping tread depth above the 1.6mm minimum. If you tell us your axle masses we will confirm a fitment meets them before you order.',
  },
  {
    category: 'Products & Fitment',
    question: 'Can my old casings be retreaded, and do you take old tyres away?',
    answer:
      'Most of our 22.5in and 19.5in lines are specified as retreadable, typically for two to three cycles on a sound casing - the spec table on each product page says which - while our 17.5in light-truck lines are not built for it. We sell new tyres only - we do not sell retreads or run a used-tyre collection service - but we can point you to retreaders through our partner network if you have casings worth processing. Scrap casings should go to a licensed tyre recycler, which your fitter will usually handle as part of the changeover.',
  },

  /* ---- Payment ---- */
  {
    category: 'Payment',
    question: 'What payment methods do you accept?',
    answer:
      'All major credit and debit cards through Square, Afterpay on orders up to $2,000, and bank transfer. Card payments are processed by Square and encrypted end to end - we never see or store your card details.',
  },
  {
    category: 'Payment',
    question: 'How does Afterpay work, and is there a limit?',
    answer:
      'Afterpay splits your order into four interest-free instalments and is available on orders up to $2,000. Choose Afterpay at checkout, confirm the payment with Afterpay, and you are returned to our site to finish the order. Orders above $2,000 need card payment or bank transfer.',
  },
  {
    category: 'Payment',
    question: 'Can I pay by bank transfer or set up an account?',
    answer:
      'Bank transfer is available on any order - choose it at checkout and we will send the account details with your invoice. Goods are dispatched once the transfer clears, so allow an extra business day or two for the funds to land. For regular fleet and trade buyers wanting an account facility, email accounts@spartantrucktyres.com.au with your business details and volumes.',
  },
  {
    category: 'Payment',
    question: 'Are your prices GST inclusive, and will I get a tax invoice?',
    answer:
      'Every price shown on the site is GST inclusive, so the figure in the cart is the figure you pay. A tax invoice showing the GST component separately is emailed with your order confirmation, and you can download it again from your account at any time. If you need the invoice reissued to a different entity name for your accounts, email sales@spartantrucktyres.com.au with the order number.',
  },

  /* ---- Warranty & Returns ---- */
  {
    category: 'Warranty & Returns',
    question: 'What warranty comes with my tyres?',
    answer:
      'All tyres are covered by the manufacturer\'s warranty against defects in materials and workmanship, running from the date of purchase until the tread wears to 1.6mm. That covers manufacturing faults; it does not cover damage from road hazards, underinflation, overloading, misalignment or fitting errors. These rights sit alongside the guarantees you have under Australian Consumer Law, which nothing in our policy limits.',
  },
  {
    category: 'Warranty & Returns',
    question: 'What is road hazard protection?',
    answer:
      'It is an optional add-on covering damage from potholes, nails, glass and other road debris for the first 2 years - the kind of damage a manufacturer defect warranty specifically excludes. Ask about it at checkout or call 1300 846 024 before you order. It is worth considering if your trucks spend significant time on unsealed or poorly maintained roads.',
  },
  {
    category: 'Warranty & Returns',
    question: 'How do I make a warranty claim?',
    answer:
      'Email sales@spartantrucktyres.com.au or call 1300 846 024 with your order number, photos of the tyre and the four-digit date code from the sidewall, and the odometer reading or kilometres run. We issue a Return Merchandise Authorisation number and arrange assessment of the tyre. If the claim is approved as a manufacturing defect we cover the freight both ways and replace or refund the tyre.',
  },
  {
    category: 'Warranty & Returns',
    question: 'Can I return tyres I have not used?',
    answer:
      'Yes. Unused tyres can be returned within 30 days of purchase for a full refund, provided they are in original condition with no mounting marks or damage. Return shipping charges may apply unless the return is our error or the tyre is defective. Mounted or fitted tyres cannot be returned unless they are defective under warranty.',
  },
  {
    category: 'Warranty & Returns',
    question: 'What if my tyres arrive damaged?',
    answer:
      'Every tyre is inspected before it leaves the warehouse and individually wrapped, with pallets used on orders of 4 or more, so transit damage is rare. If it does happen it is covered for full replacement. Photograph the damage and the packaging before you unwrap any further, then call 1300 846 024 or email sales@spartantrucktyres.com.au with your order number - we cover all freight on transit damage claims.',
  },

  /* ---- Fleet & Wholesale ---- */
  {
    category: 'Fleet & Wholesale',
    question: 'Do you offer volume discounts?',
    answer:
      'Yes, and they are published rather than negotiated: 3% off 4 or more tyres, 5% off 8 or more, 8% off 20 or more and 11% off 40 or more. The breaks apply across the whole order rather than per line, so putting three vehicles worth of tyres on one order often moves you up a tier. They are calculated automatically in the cart.',
  },
  {
    category: 'Fleet & Wholesale',
    question: 'Do you sell to the public, or to trade only?',
    answer:
      'Both. Owner-drivers buying two tyres and national fleets buying two hundred order through the same site at the same published prices, and the volume breaks are the only thing that changes with quantity. We also supply independent tyre shops, auto retailers and workshops who resell - if that is you, talk to us about contract pricing rather than ordering at list.',
  },
  {
    category: 'Fleet & Wholesale',
    question: 'Can we set up a fleet contract with custom pricing?',
    answer:
      'Yes. Fleet contracts cover fixed pricing on your nominated fitments, scheduled depot deliveries aligned to your replacement cycle, bulk freight arrangements for 20 or more tyres, and a named contact who knows your fleet. Send your fitment list and annual volumes to sales@spartantrucktyres.com.au or call 1300 846 024 and we will come back with a proposal, usually within a business day.',
  },
  {
    category: 'Fleet & Wholesale',
    question: 'Can you source rare or hard-to-find sizes?',
    answer:
      `Usually. Our own range covers ${allSizes.length} sizes across Greforce and Lionshead, and anything outside that we source through our partner 1 Truck Stop and our wider supplier network. Send us the size, load index and speed symbol you need plus the quantity, and we will come back with availability, lead time and price before you commit to anything.`,
  },
]

/* ------------------------------------------------------------------ *
 * Derived collections
 * ------------------------------------------------------------------ */

export const faqCategories: string[] = [...new Set(faqs.map((f) => f.category))]

export const faqsByCategory: Record<string, FaqItem[]> = faqCategories.reduce<
  Record<string, FaqItem[]>
>((acc, category) => {
  acc[category] = faqs.filter((f) => f.category === category)
  return acc
}, {})
