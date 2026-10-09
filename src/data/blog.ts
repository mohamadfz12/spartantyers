import type { BlogPost } from './types'

/* ------------------------------------------------------------------ *
 * Editorial
 *
 * Long-form content written for Australian fleet operators and
 * owner-drivers. Bodies are markdown-lite: `## ` headings, `- `
 * bullets, `> ` callouts and blank-line separated paragraphs.
 * Newest post first.
 * ------------------------------------------------------------------ */

export const blogPosts: BlogPost[] = [
  {
    slug: 'bulk-tyre-buying-guide-for-fleets',
    title: 'Buying Tyres in Bulk: A Practical Guide for Fleets',
    excerpt:
      'Cut your SKU count, forecast replacement cycles properly, stack the volume breaks and consolidate freight. How disciplined fleets buy tyres for less.',
    category: 'Fleet Management',
    readMinutes: 6,
    date: '2026-09-21',
    author: 'Priya Raman, Fleet Accounts Manager',
    body: `Most fleets do not have a tyre price problem. They have a tyre buying problem: ordering reactively, in ones and twos, from whoever answers the phone, across a fitment list that has quietly grown to thirty-odd part numbers. The unit price looks fine on every invoice and the annual spend is still twenty per cent higher than it needs to be.

Here is what the operators who have fixed it do.

## Step one: count your fitments, then cut them

Pull twelve months of tyre invoices and list every distinct size you bought. Most mixed fleets of 30 to 60 vehicles are carrying between fifteen and thirty fitments, and a lot of that is historical: a body builder specified something unusual once, a used truck came in on a different size, nobody revisited it.

Standardising does three things: it lifts the quantity on each line, which moves you up the price break table; it makes a spare on the shelf useful to more than one vehicle; and it stops you paying premium freight for single-tyre emergency orders.

The practical targets:

- One steer fitment per vehicle class. Across heavy prime movers that is usually 11R22.5 or 295/80R22.5, not both.
- One drive fitment per duty cycle. Highway and off-highway work genuinely need different patterns, but you rarely need three patterns for two duty cycles.
- One trailer fitment per trailer family. If you run tautliners and flat tops at the same height, there is rarely a reason for two sizes.
- An all-position pattern on the vehicles whose work is unpredictable. The Greforce G-ARMOR A68 and the Lionshead LA301E in 11R22.5 both carry an all-position rating, so one line item covers all three axles.

Going from twenty-two fitments to nine is not unusual on a first pass, and that alone typically moves your average order quantity from four tyres to twelve - the difference between a three per cent break and a five per cent break on every order.

## Step two: forecast instead of reacting

A tyre is one of the few consumables you can genuinely predict. You know the removal mileage you get from each position and the kilometres each vehicle does per month, which is enough to build a replacement calendar. Work it per axle group rather than per tyre:

- Record fitment date and odometer every time a tyre goes on. A spreadsheet is fine; the data matters more than the system.
- After two or three cycles you have a reliable removal mileage per position per duty cycle - something like 95,000 km for metro drives, 220,000 km for linehaul drives, 180,000 km for linehaul steers.
- Divide by the vehicle's monthly kilometres to get a replacement month for each axle group, then roll it into a twelve-month view of demand by size.

The payoff is that you stop buying in ones and twos. If four trucks need drives in March, you order sixteen tyres in one hit in February instead of four orders across six weeks. You also stop being surprised, which is what drives the panic purchases.

## Step three: use the price breaks deliberately

Our volume breaks are published and automatic in the cart, so there is no negotiation required to access them:

- 4 or more tyres: 3 per cent
- 8 or more tyres: 5 per cent
- 20 or more tyres: 8 per cent
- 40 or more tyres: 11 per cent

The breaks apply across the whole order, not per line, which matters more than it sounds. If three vehicles need different sizes in the same month, putting all three on one order can take the lot from zero discount to eight per cent. The forecast from step two is what surfaces those opportunities.

Work out what the breaks are worth before you change anything. A fleet buying 400 tyres a year at an average of $330 spends $132,000. Moving from a blended three per cent discount to a blended eight per cent is $6,600 a year, for no change other than when you press the button.

> The jump from 8 per cent to 11 per cent needs a 40-tyre order, which for most mid-size fleets is a quarterly order rather than a monthly one. Check your storage before you chase it: forty 11R22.5 tyres is a reasonable chunk of a depot bay.

## Step four: consolidate the freight

Freight is where reactive buying quietly bleeds money. Metro delivery is free with no minimum spend, so there the saving is your time. Outside metro it is a direct cost, and a single tyre to a regional depot does not cost a twentieth of what twenty cost to move.

For orders of 20 tyres or more we arrange bulk freight specifically: palletised consignments to your depot rather than individual tyres through a parcel network, which makes unloading a forklift job rather than four people rolling tyres off a tail lift.

If your address is outside our metro delivery area, order normally - there is no upfront freight charge at checkout. Our team contacts you after the order is placed to arrange the delivery and confirm the cost before dispatch, so you are never committed to a freight figure you have not seen.

## Step five: stop splitting the supply

The instinct to keep three suppliers honest against each other is understandable and usually counterproductive on tyres. Split the volume and none of them see enough of your business to hold stock for you, you sit in a lower break with all three, and your fitment list drifts apart again as each pushes what they happen to have.

What you get from concentrating the volume:

- Stock held in depth on the lines you actually buy. Our GRT33 in 11R22.5 sits above 250 units for that reason.
- One person who knows your fleet and your fitment list, so a re-order is a phone call rather than a specification exercise.
- Rare sizes through one channel. Brands we do not stock come via our partner 1 Truck Stop, so an odd fitment stays in the same conversation.

The honest exception is a sole-supply deal with no price review. Concentrate the volume, but put an annual review in the diary and keep one benchmark quote a year. That is the discipline, not splitting every order three ways.

## Getting started

Send us twelve months of tyre invoices, or just your fitment list and monthly kilometres. We will come back with a consolidated fitment proposal, the break tier it puts you in, and a delivery schedule that matches your replacement calendar. Call 1300 846 024 or email sales@spartantrucktyres.com.au.`,
  },
  {
    slug: 'choosing-truck-tyres-for-australian-conditions',
    title: 'Choosing Truck Tyres for Australian Conditions',
    excerpt:
      'Heat, distance and unsealed roads punish tyres differently to the northern hemisphere duty cycles most patterns are designed around. How to spec for here.',
    category: 'Buying Guide',
    readMinutes: 6,
    date: '2026-08-18',
    author: 'Dave Marsden, Technical Manager',
    body: `Most commercial tyre patterns are designed around European or North American duty cycles: moderate temperatures, dense road networks, short stage lengths, sealed surfaces almost everywhere. Australian heavy transport is none of those things. The same tyre that runs 300,000 km on a German motorway can come off a Hay Plain run at 180,000 km, and the difference is not build quality. Here is what this country does to tyres, and how to spec around it.

## Heat is the primary enemy

A tyre destroys itself with its own waste heat. Every revolution flexes the sidewall and the tread, converting fuel energy into heat inside the rubber, which the casing normally sheds to the air. On a 42-degree day over a road surface sitting at 60-plus degrees, eight hours of running with no stop long enough to cool down, it cannot shed it fast enough.

What follows: the compound softens and wears faster, belt-to-tread adhesion degrades, and eventually you get tread separation. A casing cooked once is compromised even if it looks fine.

Specifying for heat means:

- Correct cold pressure, every time. Underinflation is a heat problem before it is a wear problem.
- Load index headroom. A tyre at 95 per cent of its rated load runs hotter than the same tyre at 80 per cent. The Lionshead LA301E and LD317E both carry a 149 load index in 11R22.5 - 3250kg against the 3150kg most 11R22.5 lines offer - which is a heat margin as much as a load margin.
- A speed rating that covers your operation. An M-rated casing is built to shed heat at 130 km/h, so at 100 km/h it has margin. A J-rated casing at 100 km/h has very little.
- Not buying the deepest tread available unless you need it. A 23.5mm block has more rubber to flex and more insulation holding heat in the belt package - a legitimate trade on gravel, a bad one for a highway truck.

## Distance changes what wears out

A truck doing Melbourne to Perth is not doing the same job as one doing forty drops around Dandenong, and almost nothing about the ideal tyre is the same.

On long sealed stages, rolling resistance and even wear dominate. Nothing cuts the tyre, nothing scrubs it, and total cost comes down to fuel and how evenly the tread wears. This is where you pay for a low-rolling-resistance casing and get the money back. The Greforce G-PILOT X1 in 295/80R22.5 carries an A rating with five continuous ribs, and the GR666 super-single manages an A rating despite a 164 load index worth 5000kg single. Run the X1 on the steer with the matching G-PILOT X3 on the drive and you have a deliberate linehaul set, not whatever was cheapest that month.

On metro and regional work the enemy is mechanical: kerbing, scrubbing on tight turns, torque into the drive tread at every set of lights. Tread depth matters less here than tread stiffness and shoulder strength. Our GRT33 in 275/70R22.5 and 11R22.5 is the pattern we ship most of for that reason - a four-rib highway tread with reinforced shoulders that resists the irregular wear mixed routes cause. In 17.5in, the GRT33 and Lionshead LS306E do the same job on the steer, with the GR999 or LD328E on the drive.

## Unsealed roads and cut-and-chip

Well under half of Australia's road network is sealed. Any operator in agriculture, livestock, mining access, forestry or civil spends real time on gravel, and gravel attacks tyres in a specific way.

Cut-and-chip is the failure mode. Sharp aggregate cuts into the tread face, then the next impact levers out a chip of rubber. Water and dirt get into the cut, it propagates toward the belt, and the tyre is finished long before the tread is worn out. You can have a tyre with 14mm left that has to come off.

What actually resists it:

- A cut-and-chip compound rather than a fuel-optimised one. These are opposite design goals: a low-hysteresis compound is less tear-resistant almost by definition.
- Reinforced sidewalls. On gravel the sidewall takes rock strikes a highway tyre never sees.
- Stone ejectors in the tread grooves. Without them stones wedge in and drill down into the belt package. The Greforce GRD57 has them, which is why it survives regional work better than its depth alone suggests.
- Self-cleaning tread geometry for mud and clay. A blocked tread has no traction.

For genuinely mixed work the G-ARMOR A68 in 11R22.5 is the specification I recommend most often: a cut-and-chip resistant compound over a reinforced sidewall with an all-position rating, so one tyre covers every axle on a truck whose week is unpredictable. For tippers, agitators and civil contractors splitting time between site and highway, the GRD1212 in 275/70R22.5 is unusual and useful - 21.5mm of aggressive lug still rated all-position.

At the extreme end - logging and mine access roads - the HD01M at 23mm and the HD02 at 23.5mm in 11R22.5 exist because there tyre life is measured in damage resistance, not kilometres. They are noisier and cost you fuel, which is the correct trade when the alternative is a cut casing every six weeks.

## Load against speed

Every casing has a load-speed relationship: carry more and you must go slower, go faster and you must carry less. The sidewall figures are the maximum of each, not both at once.

The practical version for Australian work: if you run at or near maximum legal axle mass, do not also run at the top of the speed rating in summer. That combination is what produces heat failures. If you cannot avoid either, buy the load index headroom - two steer tyres at 3250kg give 6500kg against a 6000kg axle, where 3150kg tyres give 6300kg, legal but with nothing spare.

## Specification checklist

- Read your plate for axle mass, then pick a load index with margin, not just compliance.
- Decide honestly what share of your kilometres are unsealed. Over about 15 per cent, buy the cut-resistant compound and accept the fuel penalty.
- Match pattern to position. Drive tread on a steer axle wears irregularly and steers badly.
- For sealed-road linehaul pay for rolling resistance; for everything else pay for casing strength.
- If your fleet does more than one of these jobs, use an all-position pattern on the unpredictable vehicles rather than compromising everything.

If you are not sure which side of those trades you sit on, call 1300 846 024 with your axle loads, typical stage length and a rough split of sealed against unsealed kilometres. That is enough to spec it properly.`,
  },
  {
    slug: 'cutting-fuel-costs-with-rolling-resistance',
    title: 'Cutting Fuel Costs With Rolling Resistance',
    excerpt:
      'Tyres account for roughly a third of the fuel a highway truck burns. What the A to G rating actually measures, where it pays, and what it costs you in tread.',
    category: 'Fleet Management',
    readMinutes: 6,
    date: '2026-07-13',
    author: 'Dave Marsden, Technical Manager',
    body: `On a loaded highway truck at cruise, roughly a third of the fuel burned goes on overcoming tyre rolling resistance, with aerodynamic drag taking most of the rest. That makes tyre choice one of the few fuel levers you can pull with a purchase order rather than a capital project.

The problem is that the saving is real but modest, it is easy to overstate, and it comes with a trade-off most marketing material does not mention.

## What rolling resistance actually is

A rolling tyre is not a rigid wheel. The contact patch flattens as it enters the road and springs back as it leaves, and the sidewall flexes with it. Rubber is not perfectly elastic, so some of the energy put into that deformation does not come back out as motion. It comes out as heat. That lost energy, revolution after revolution, is rolling resistance, and your engine pays for it in diesel.

Three things drive it:

- Compound hysteresis - how much energy the rubber loses when flexed and released. Low-hysteresis compounds use more silica and less carbon black.
- Tread mass and depth. More rubber flexing means more loss, and that is the trade-off we come back to below.
- Casing construction and inflation pressure. An underinflated tyre deforms more per revolution, which is why pressure discipline and rolling resistance are the same conversation.

## Reading the A to G rating

Commercial tyres are graded from A, the best, to G, the worst, on measured rolling resistance coefficient. The gap between adjacent letters is smaller than most people assume.

Taken end to end, moving a full set from the worst end of the scale to an A rating is quoted as being worth up to 7.5 per cent in fuel. That is the headline figure and it is a ceiling, not an expectation. It assumes you replace every tyre on the vehicle, that the truck is doing steady highway work, and that nothing else about the operation changes.

In our own range, the Greforce G-PILOT X1 in 295/80R22.5 and the GR666 super-single in 385/65R22.5 both carry an A rating. Most of the range sits at B. The deep-lug off-highway patterns, the GRD1212 and the HD01M, sit at C, which is exactly what you would expect from 21 to 23mm of aggressive tread.

> A realistic expectation for a partial upgrade - say, going A-rated on the steer and trailer positions while keeping a deep B-rated drive tyre - is 2 to 3 per cent. That is still worth real money. It just is not 7.5 per cent.

## The worked numbers for a B-double

Put figures on it, because this is a decision that only makes sense arithmetically.

Assume a B-double doing 200,000 km a year at 55 L/100km. That is 110,000 litres of diesel. At $2.00 a litre, $220,000 a year in fuel for one unit.

- A 2 per cent fuel saving is $4,400 a year.
- A 3 per cent saving is $6,600 a year.
- The theoretical 7.5 per cent ceiling would be $16,500 a year.

Now the cost side. Moving the two steer positions from a $335 B-rated tyre to a $469 A-rated G-PILOT X1 costs $268 extra per truck per set. Even if you gain nothing on the trailer positions, a 1 per cent fuel saving on this unit is $2,200 a year against a $268 one-off premium. The payback is measured in weeks, not years.

Across a fleet of ten units, 3 per cent is $66,000 a year. That is the scale at which this stops being a technical preference and becomes a budget line.

The super-single case is stronger again. The GR666 replaces a dual fitment with one tyre on an 11.75 rim. You lose two tyres of rolling resistance per axle end and a meaningful amount of unsprung weight, and you still get 5000kg of capacity on a single fitment at a 164 load index. For a trailer group that does not need the redundancy of duals, that is the single biggest rolling-resistance change available.

## Where it does not pay

Fuel-efficient tyres pay for themselves on steady-state highway running. The further your duty cycle gets from that, the weaker the case.

- Metro distribution. A truck doing sixty drops a day spends its fuel on acceleration and braking, not on overcoming steady rolling resistance. Tread life, kerb resistance and scrub resistance matter far more. The GRT33 in 9.5R17.5 or the Lionshead LS306E in 235/75R17.5 are the right answers here, and neither is chosen for its fuel rating.
- Off-highway and unsealed work. A low-hysteresis compound is, almost by definition, less tear-resistant. Fit an A-rated highway tyre to a truck doing 30 per cent gravel and you will lose far more to cut-and-chip removals than you ever save in diesel.
- Short stage, high-torque work. Tippers, agitators, anything that spends its day on and off site. Buy casing strength.

## The tread depth trade-off

Here is the part that gets left out. Low rolling resistance and deep tread are in direct tension. A 21.5mm drive lug has more rubber flexing per revolution than a 19.5mm one, so it costs more fuel. But it also gives you more kilometres before removal and a better retread candidate.

Our GR622 in 11R22.5 is deliberately built on that trade: 19.5mm of tread instead of the 21.5mm on the GRD35 and GRD57, in exchange for lower rolling resistance and quieter running. For a fleet doing high kilometres on sealed roads, the maths usually favours the shallower tyre. For anyone on mixed roads it usually does not.

Work it out per kilometre rather than arguing about it: take the annual fuel saving, take the removal mileage difference, convert both to cents per kilometre and compare. With Australian fuel prices where they are, the shallower tyre usually wins on sealed-road linehaul.

## Do the free things first

The best A-rated tyre on the market still wastes fuel if it is running 15 per cent under pressure or fighting a misaligned axle. Before you spend anything:

- Get cold pressures right and keep them right. This is worth more than a letter grade on the sidewall.
- Fix alignment. A dragging axle is a permanent fuel penalty and an irregular wear generator.
- Match duals properly. Mismatched diameters mean one tyre is permanently scrubbing.
- Keep tread patterns consistent across an axle.

Get those four right, then buy the rolling resistance. In that order the rating on the sidewall delivers what it promises.`,
  },
  {
    slug: 'retreading-commercial-tyres-worth-it',
    title: 'Is Retreading Commercial Tyres Still Worth It?',
    excerpt:
      'A sound casing can carry two or three lives of tread. Here is how to work out your real cost per kilometre, and which casings are worth keeping.',
    category: 'Fleet Management',
    readMinutes: 6,
    date: '2026-06-16',
    author: 'Priya Raman, Fleet Accounts Manager',
    body: `When you buy a truck tyre you are buying two things: a quantity of tread rubber and a casing. The tread is consumed and gone. The casing, if it survives the first life intact, is a reusable asset worth a significant fraction of what you paid.

Fleets that treat the casing as an asset generally run 25 to 35 per cent lower cost per kilometre than fleets that treat a worn tyre as scrap. That is the whole argument for retreading, and it stands or falls on whether you can actually keep casings intact.

To be clear about our own position: we sell new tyres, not retreads. What we do is stock casings built to be retreaded, and point customers at retreaders through our partner network when a casing is worth processing. The maths below is what we use when customers ask whether it is worth it.

## What a casing is actually worth

A commercial retread typically costs 35 to 45 per cent of the equivalent new tyre, including inspection, buffing, new tread and curing. You supply the casing.

So when you scrap a sound casing you throw away the difference between the new price and the retread price. On a $365 drive tyre with a retread at 40 per cent, that is around $219 in the bin.

A premium casing designed for multiple lives will take two or three retread cycles. Our GRD57 in 11R22.5 is specified for two to three cycles, and the HD01M carries a thick undertread specifically to support multiple retreads. Three lives out of one casing changes the economics completely.

## The worked example

Take a linehaul drive position. Assume a GRD57 at $365, and a conservative 170,000 km of removal mileage on the first life.

New tyre only, scrapped at removal:

- $365 for 170,000 km
- 0.215 cents per kilometre

Same casing, two retreads at 40 per cent of new price, with retread lives coming in slightly shorter at 140,000 km each:

- $365 plus $146 plus $146 equals $657
- Total distance 170,000 plus 140,000 plus 140,000 equals 450,000 km
- 0.146 cents per kilometre

That is a 32 per cent reduction in cost per kilometre from the same purchase decision, achieved by not scrapping the casing.

Now compare the alternative strategy, buying cheaper and scrapping:

- A $270 non-retreadable budget tyre delivering 120,000 km
- 0.225 cents per kilometre

The budget tyre is $95 cheaper on the invoice and 54 per cent more expensive per kilometre than the retreaded premium casing. This is the single most common mistake in fleet tyre purchasing: optimising the invoice instead of the kilometre.

> Run these numbers with your own removal mileages, not mine. The structure of the calculation matters more than my assumptions. If you do not know your removal mileages, that is the first problem to fix.

## Which of our patterns are retreadable

There is a clean dividing line in our catalogue, and it follows rim diameter.

Retreadable - every 22.5in and 19.5in line we stock:

- Greforce GRD57, GRD35, GRD37, GR622, HD01M, HD02 - drive patterns in 11R22.5
- Greforce G-PILOT X1 and G-PILOT X3 in 295/80R22.5
- Greforce GRT33 in 275/70R22.5, 255/70R22.5 and 11R22.5
- Greforce G-ARMOR A68, GR881 in 11R22.5
- Greforce GRD1212 in 275/70R22.5
- Greforce GR666 super-single in 385/65R22.5
- Greforce GR612 and GR678 in 265/70R19.5
- Lionshead LA301E and LD317E in 11R22.5

Not retreadable - the 17.5in light-truck lines:

- Greforce GRT33 and GR999 in 9.5R17.5
- Greforce GR999 in 215/75R17.5 and 235/75R17.5
- Greforce GR612 in 235/75R17.5
- Lionshead LA302E in 215/75R17.5
- Lionshead LD328E and LS306E in 235/75R17.5

That is not an accident of specification. Light-truck casings are built lighter and cheaper, the retread cost would be a much larger share of the new price, and the metro duty cycles they run tend to damage casings through kerbing. For 17.5in fitments, buy on cost per kilometre of the single life and do not plan around a second one.

If you run a 19.5in fleet - buses, motorhomes, medium rigids - the GR612 all-position and GR678 drive in 265/70R19.5 are both retreadable, which is worth knowing because many 19.5in options are not.

## When to retread and when not to

Retread when:

- The casing is structurally sound, with no impact damage and no repaired sidewalls.
- The tyre was bought as a premium casing designed for multiple lives.
- The position is drive or trailer. Most Australian fleets, and most risk managers, prefer new tyres on steer positions of heavy vehicles.
- You keep records, so casing age and history are actually known rather than assumed.
- The casing is under about six years old. Rubber ages whether it is working or not.

Replace instead when:

- There is any sidewall damage, bulge, or evidence of the tyre having been run flat or badly underinflated. A casing that has been cooked is finished regardless of how it looks.
- The history is unknown. A casing off a used truck with no records is not worth the processing cost.
- It is a steer position on a heavy vehicle. The consequence of a steer failure is not comparable to a drive failure.
- The tread was run past the legal minimum into the belt package. Once you expose belt, the casing is scrap.

## Protecting the casing is the real work

Retreading is not a decision you make at removal. It is the result of how the tyre was looked after for its whole first life.

- Pressure discipline. Running underinflated builds heat in the casing, and heat damage is permanent and invisible. It is the single biggest cause of casings failing inspection.
- Never run a flat, not even to the next exit. One flat run destroys the beads and lower sidewall.
- Repair properly. A correctly applied internal patch-plug is retreadable; a roadside string plug is not.
- Pull tyres at the right depth. Running into the belts to squeeze out another month destroys a two-hundred-dollar asset.
- Record fitment date, odometer and position. Without records you will default to scrapping.

## The total-cost view

The cheapest tyre on the invoice is rarely the lowest total cost, and the gap is bigger than most operators expect. A premium casing retreaded twice typically beats a budget tyre scrapped after one life by 30 to 50 per cent per kilometre.

If you want help working out which of your fitments are worth building a casing programme around, call 1300 846 024 with your fitment list and removal mileages.`,
  },
  {
    slug: 'steer-drive-trailer-what-goes-where',
    title: 'Steer, Drive, Trailer: What Goes Where and Why',
    excerpt:
      'Each axle position asks for something different. What happens when you get it wrong, when an all-position tyre genuinely makes sense, and how to rotate.',
    category: 'Technical',
    readMinutes: 6,
    date: '2026-05-19',
    author: 'Dave Marsden, Technical Manager',
    body: `A heavy vehicle asks three different things of its tyres depending on where they sit. Fitting the wrong pattern to a position is not illegal and the truck will drive away, which is exactly why it keeps happening. The cost shows up six weeks later as irregular wear, poor steering feel and a tyre coming off at half its expected life.

## Steer: control and even wear

Steer tyres carry the front of the vehicle, do all the steering and provide most of the directional stability. They see high loads, continuous small corrections and significant lateral force in corners, but little driving torque.

That is why steer patterns are ribbed. Continuous circumferential ribs resist lateral deflection, which gives precise response and straight tracking, and they wear evenly because there are no independent blocks to squirm under load.

- Pattern: continuous ribs, typically four or five. Our GRT33 runs four ribs; the G-PILOT X1 runs five.
- Priorities: control, cornering stability, wet traction, even wear.
- Tread depth: moderate. 13.5 to 17mm is normal because depth here buys you less than stiffness does.
- Consequence of failure: immediate loss of directional control. Inspect these most closely and replace earliest.

## Drive: traction under torque

Drive tyres convert engine torque into forward motion. They handle the highest shear forces of any position, and they do it every time the driver touches the throttle or the engine brake.

Drive patterns are therefore block or lug designs, with independent tread elements that bite into the surface. Those blocks are deeper, because a drive tyre needs biting edges throughout its life, not just when new.

- Pattern: open or closed-shoulder lug and block. The GRD57 runs an open 21.5mm lug; the Lionshead LD317E runs an 18mm closed-shoulder lug for more even wear.
- Priorities: traction, torque resistance, removal mileage.
- Tread depth: deep. 15 to 23.5mm across our range.
- Expect drives to wear faster than steers or trailers. That is normal and not a fault.

## Trailer: free rolling and scrub resistance

Trailer tyres carry load and nothing else - no drive torque, no steering input. What they do get is scrubbing, because a trailer axle group does not follow the prime mover's exact path through a corner and the tyres are dragged sideways on every tight turn. So trailer patterns prioritise even free-rolling wear and strong sidewalls, with closed shoulders to resist the scrub.

- Pattern: closed-shoulder rib. Our GRT33 in 255/70R22.5 and the Lionshead LA302E are built this way.
- Priorities: durability, load capacity, low rolling resistance, retreadability.
- Trailer positions are where super-singles make the most sense. The GR666 in 385/65R22.5 carries 5000kg on a single fitment, replacing a dual pair with less weight and less rolling resistance.

## What actually happens if you fit a drive tyre to a steer axle

This comes up often enough to spell out, because the tyre will physically fit and the load rating is usually adequate.

- Wandering and vague steering. Independent tread blocks deflect laterally under cornering load in a way continuous ribs do not, and the driver feels it as the truck hunting.
- Rapid irregular wear. With no rib structure to stabilise them the blocks scuff on every steering input, giving heel-and-toe wear within weeks.
- Increased rolling resistance. More tread mass and more squirm, with none of the traction benefit that justifies it on a drive axle.
- Wet handling that is worse, not better, despite the aggressive look. Ribs evacuate water along continuous channels and resist aquaplaning better at speed.

The reverse - a steer rib on a drive axle - is less dangerous but still wasteful: you lose traction on wet ramps and loose surfaces, and the shallower tread gives far less removal mileage against the torque.

> The exception that is not an exception: fitting a steer-rated rib on a trailer axle is normal and correct. Most of our rib patterns are rated Steer and Trailer for exactly that reason. The casing requirements overlap; the drive requirements do not.

## All-position tyres: when they genuinely make sense

An all-position tyre is rated to run on steer, drive or trailer. It is a compromise by design: enough rib structure for steering stability, enough tread depth and biting edge for workable drive traction.

A compromise is right in three situations.

- The truck's work is genuinely unpredictable. If a prime mover might be on a highway run this week and a quarry access road next week, one specification across the truck beats one optimised for a duty cycle it will not be doing.
- You run a rotation programme. If tyres move through positions over their life, they need to be legal and effective in all of them. Our GR881 in 11R22.5 exists for this: an all-position casing with 15mm of tread rather than the 13.5mm of the GRT33, because rotating tyres need depth to give away.
- You are cutting SKU count. Consolidating the unpredictable vehicles onto one all-position line - the G-ARMOR A68 in 11R22.5, or the Lionshead LA301E with its 149 load index - can take several part numbers out of the system.

Where all-position does not make sense: a dedicated linehaul fleet doing the same sealed-road run every week. You know the duty cycle, so buy for it. A matched G-PILOT X1 steer and X3 drive will beat an all-position compromise on both fuel and removal mileage.

There is a practical argument for all-position in 19.5in too, simply because the size range is narrower. The GR612 in 265/70R19.5 turns up on buses, motorhomes and medium rigids for exactly that reason.

## Rotation programmes

Rotation is about catching irregular wear before it becomes terminal, and using up tread that would otherwise be left on a tyre coming off for another reason.

- Rotate every 40,000 to 80,000 km, or to your maintenance schedule. On high-kilometre linehaul the shorter end makes sense.
- Move tyres across the vehicle, not just front to back, to even out road camber. Australian roads crown consistently and tyres wear accordingly.
- Never move a drive-only pattern to a steer axle. If you want position flexibility, buy an all-position casing from the start.
- Match duals when you refit. Mismatched diameters mean the larger tyre carries more load and the smaller one scrubs.
- Record it. A rotation you cannot evidence did not happen as far as casing history and warranty claims go.

Every product page on our site lists the manufacturer's position label alongside the normalised fitments. If you want a fitment confirmed against your axle loads, call 1300 846 024.`,
  },
  {
    slug: 'tyre-pressure-management-australian-fleets',
    title: 'Tyre Pressure Management for Australian Fleets',
    excerpt:
      'Inflation pressure is the cheapest lever you have over tyre life and fuel use. Why hot readings mislead, what underinflation actually costs, and how to run a check.',
    category: 'Maintenance',
    readMinutes: 6,
    date: '2026-04-21',
    author: 'Luke Trevaskis, Warehouse and Logistics Manager',
    body: `Tyres are usually the third largest running cost in a road transport operation, behind fuel and wages. Inflation pressure is the single biggest influence on how long they last, and it costs nothing but discipline to get right. It is also the most consistently neglected item in heavy vehicle maintenance.

## Check cold, always

A pressure reading is only meaningful when the tyre is cold - the vehicle stationary for at least three hours, or driven less than about two kilometres at low speed.

The reason is gas physics. As a tyre works, flexing generates heat, the air inside expands and pressure rises. A tyre set to 110 psi cold can read 120 to 130 psi after three hours at highway speed on a hot day. That is normal and expected.

The problem is what people do with that reading. A driver checks a hot tyre, sees 125 psi against a 110 psi target, and bleeds air out to "correct" it. The tyre cools overnight and is now sitting at 95 psi - 14 per cent underinflated - and nobody knows. Bleeding hot tyres is one of the most reliable ways to destroy a set of tyres in an Australian summer.

If you have no choice but to check hot, do not adjust down. Note the reading, and only add air if it is below the cold target - a hot tyre reading under its cold target is seriously underinflated.

> Never bleed pressure from a hot tyre. If a hot tyre is reading high, that is the system working correctly.

## What underinflation actually costs

Underinflation changes the shape of the contact patch and increases how much the casing flexes per revolution. Three things follow.

First, heat. Flexing converts energy into heat inside the rubber, and the casing can only shed so much. This is the mechanism that actually kills tyres: tread separation, belt-edge failures, and casings that fail retread inspection months later. On a long run in 40-degree heat, an underinflated tyre has nowhere to dump it.

Second, wear. The industry rule of thumb is that 10 per cent underinflation costs 10 to 15 per cent of tread life, and 20 per cent under can cost a quarter of it. The wear is uneven too: shoulders go faster than the centre, because they carry load the flattened centre does not.

Third, fuel. A 10 per cent pressure shortfall adds roughly 1 per cent to fuel consumption. That sounds trivial until you scale it. A B-double doing 200,000 km a year at 55 L/100km burns 110,000 litres. One per cent is 1,100 litres, or about $2,200 at $2.00 a litre. For one vehicle, from one neglected check. Across ten units that is $22,000 a year.

And those three costs compound. The underinflated tyre burns more fuel while wearing out faster and accumulating casing damage that forfeits its retread value.

## Overinflation is not the safe option

Running hard is not a hedge. Overinflation reduces the contact patch, concentrates load in the centre of the tread and produces centre wear, a harsher ride and less grip, particularly in the wet.

The target is the manufacturer's recommended pressure for the load you actually carry, not the maximum figure moulded into the sidewall. That number is a structural limit, not a recommendation.

## Set pressure to the load, not a fleet default

This is where most fleets leave value on the table. They pick one number - 110 psi, say - and run it on everything.

Load and inflation pressure are directly related. A trailer running empty half the time does not need the same pressure as one at maximum legal mass. A steer axle at 6.0 tonnes needs a different figure to a drive group at 16.5 tonnes.

The practical approach:

- Get the load-inflation table for the specific tyre and size you run. Pressure targets are not transferable between sizes.
- Weigh or calculate your actual axle loads, loaded and unloaded if the vehicle runs both ways.
- Set pressure for the heaviest load the axle regularly carries, not the average. You cannot adjust mid-trip.
- Write the target on a sticker inside the driver's door or on the trailer headboard. A number that lives only in a manual does not exist.

## Running the weekly check

A proper weekly check takes one person about fifteen minutes per prime mover and trailer combination.

- Use a calibrated gauge. Workshop gauges drift, and one reading 8 psi low will systematically underinflate your whole fleet.
- Check every tyre, including inner duals and the spare. Inner duals get missed, and they are the ones that fail.
- Record the reading, not just the adjustment. A tyre needing 6 psi every week has a leak; you can only tell from a log.
- Inspect valve stems, cores and caps. Missing caps and perished stems are the most common slow-leak source on any fleet.
- Compare dual pressures against each other. A 10 psi difference means the higher tyre carries more load and the lower one scrubs.
- Look at the tread while the gauge is on. Shoulder wear points at underinflation, centre wear at overinflation.

## Where TPMS earns its keep

Tyre pressure monitoring systems measure pressure and usually temperature in real time and alert the driver to a drop. On larger fleets they pay back quickly, for one specific reason: they catch a deflating tyre before it overheats and destroys itself, which saves both the tyre and the roadside callout.

They are most valuable where manual checks are hardest - trailer inner duals, vehicles that do not return to a depot daily, and remote runs where a failure is expensive to recover from. The temperature channel is arguably more useful than the pressure channel, because a tyre running hot relative to its neighbours is telling you something before pressure moves at all.

For an owner-driver, a disciplined weekly manual check with a good gauge captures most of the same benefit. TPMS replaces a discipline problem with a technology cost.

## The short version

Check cold and never bleed a hot tyre. Set pressure to the load for your actual size. Log every reading so you can spot the slow leaks. Treat shoulder wear as a pressure problem until proven otherwise. Every 10 per cent under costs you roughly 10 per cent of the tyre and 1 per cent of your fuel.

For the load-inflation figures on a Greforce or Lionshead fitment you bought from us, call 1300 846 024 and we will send the manufacturer's table through.`,
  },
  {
    slug: 'signs-its-time-to-replace-truck-tyres',
    title: 'Signs It Is Time to Replace Your Truck Tyres',
    excerpt:
      'Tread depth is the obvious one. The wear pattern, the sidewall and the date code tell you more, and they tell you earlier.',
    category: 'Maintenance',
    readMinutes: 6,
    date: '2026-03-17',
    author: 'Dave Marsden, Technical Manager',
    body: `Tyres rarely fail without warning. They give you weeks of notice in the wear pattern, the sidewall and the pressure log, and most roadside failures come down to someone not reading those signs. Here is what to look for and what each sign is telling you about the cause.

## Tread depth: the floor, not the target

The legal minimum tread depth is 1.6mm across the tread face. That is a floor you must not go below, not a target to aim for.

Wet-weather grip falls away sharply in the last few millimetres. The tread's job is to give water somewhere to go so the rubber can touch the road, and with 2mm remaining there is almost no void volume left to do it.

- Measure in the main grooves with a depth gauge, at three points across the tread and three around the circumference. One reading tells you nothing about a tyre wearing unevenly.
- Check the tread wear indicators. Raised bars in the grooves sit at the minimum depth; level with them means the tyre is done.
- Plan removals above the limit. Most fleets pull steers at 4 to 5mm and drives at 3 to 4mm, which protects the casing for retreading and leaves wet-weather margin.

## Irregular wear: the pattern tells you the cause

A tyre worn out evenly has done its job. A tyre worn out unevenly is reporting a fault, and if you replace it without fixing the fault the new one wears the same way. This is the most valuable diagnostic information on the vehicle and it is free.

- Feathering: the tread ribs have a sharp edge on one side and a rounded edge on the other, so running your hand across the tread feels smooth one way and rough the other. This is a toe misalignment. The tyre is being dragged slightly sideways as it rolls. Fix the alignment; the tyre may be recoverable if you catch it early.
- Cupping or scalloping: dish-shaped depressions spaced evenly around the tyre, often with a corresponding vibration. This is the tyre bouncing rather than rolling, which means a suspension or balance problem: worn shock absorbers, a damaged bush, or an out-of-balance assembly. Common on steer axles and almost always a suspension fault rather than a tyre fault.
- One-sided wear: the inner or outer shoulder worn away while the rest of the tread has depth left. This is a camber problem, a bent axle, or on drive and trailer groups, axle misalignment. Check the alignment before you fit a replacement, or you will buy the same tyre again in three months.
- Centre wear: the middle of the tread worn out with good depth on both shoulders. This is overinflation. The contact patch has been reduced to the centre of the tyre and that is where all the load has gone.
- Shoulder wear on both sides: both shoulders worn with the centre intact. This is underinflation, the mirror image of the above. The tyre has been running flattened, carrying load on the shoulders. Note that this tyre may also have heat damage to the casing even though it looks serviceable.

> If you fit a new tyre without diagnosing an irregular wear pattern, you have bought a tyre and kept the problem. Check alignment, pressure history and suspension before you order the replacement.

## Sidewall damage: mostly not repairable

The sidewall is thin, flexes constantly and has no belt package protecting it, so damage there is a different proposition to tread damage.

- A bulge or bubble means the internal cords have failed and only rubber is containing the pressure. Take the vehicle out of service: it does not get better and it tends to fail at speed.
- Cuts or gouges that expose cord are not repairable. Any cord exposure means the tyre is scrap.
- Deep circumferential cracking at the base of the sidewall indicates the casing has been flexed beyond its design range - usually a long period of underinflation or overloading.
- Any tyre run flat, even briefly, should be inspected internally before it goes back on. The beads and lower sidewall take the damage and it is not visible from outside.

## Age and weathering

A tyre with plenty of tread can still be finished, because rubber oxidises whether the tyre is working or sitting on a rack. The manufacture date is a four-digit code on the sidewall: week, then year. A code reading 2325 means the twenty-third week of 2025.

- Inspect anything over five years old closely at every service, regardless of tread depth.
- Replace anything approaching ten years old even with tread remaining; casings that old are no longer viable retread candidates.
- Look for fine crazing on the tread face and in the sidewall flex zone - ozone and UV attack. Australian sun is harder on tyres than most climates.

## Pressure that will not hold

A tyre that repeatedly loses pressure after the valve stem and core have been replaced has a problem in the casing or at the bead, and another repair is a false economy. The rule we give customers: one properly applied internal patch-plug repair in the tread area, inspected from inside, is acceptable and keeps the casing retreadable. A second repair in the same tyre, any repair in the sidewall or shoulder, or a roadside string plug means plan the replacement.

## Retread or replace?

If the tread is worn out but the casing is sound you have a choice: retreading typically costs 35 to 45 per cent of a new tyre.

Retread when the casing is sound with no impact damage or sidewall repairs, the tyre was bought as a premium retreadable casing, the position is drive or trailer, and you have records of its history. Everything we stock in 22.5in and 19.5in is specified as retreadable; our 17.5in light-truck lines are not.

Replace when the casing has sidewall damage, has been run flat, or has an unknown history - and on steer axles of heavy vehicles, where the consequence of a failure is not comparable to a drive or trailer failure.

Five minutes a tyre once a week - cold pressure, depth gauge, a hand across the tread and eyes along both sidewalls - catches almost all of this before it becomes a breakdown. If you find a wear pattern you cannot explain, send us a photo of the tread and the sidewall on 1300 846 024 and we will tell you what we think is causing it.`,
  },
  {
    slug: 'reading-commercial-truck-tyre-sizes',
    title: 'How to Read a Commercial Truck Tyre Size',
    excerpt:
      '295/80R22.5 and 11R22.5 decoded, plus the load index table, speed symbols and what a PR rating actually means. Everything on the sidewall, explained.',
    category: 'Technical',
    readMinutes: 6,
    date: '2026-02-24',
    author: 'Dave Marsden, Technical Manager',
    body: `Buying the wrong size is the most expensive mistake a fleet can make, and it is almost always avoidable. Everything you need is moulded into the sidewall: once you can read it you can match a replacement with confidence and check it against the vehicle plate. Commercial tyres in Australia come in two formats, and you will often see both on the same truck.

## The metric format: 295/80R22.5

The format on most modern heavy fitments, read left to right.

- 295 is the nominal section width in millimetres, sidewall to sidewall at the widest point on the specified rim. It is not the tread width, which is narrower.
- 80 is the aspect ratio: the sidewall height as a percentage of the section width. Eighty per cent of 295mm gives a sidewall about 236mm tall.
- R means radial construction - casing plies running bead to bead under a stabilising steel belt package. Effectively every commercial tyre sold new in Australia is radial.
- 22.5 is the rim diameter in inches, and the one figure with no tolerance at all: a 22.5in tyre will not go on a 19.5in rim.

Change the aspect ratio and you change the rolling circumference, and with it your overall height, speedometer and driveline-derived distance figures. Dropping from a 295/80R22.5 to a 275/70R22.5 is sometimes done deliberately to buy height clearance on a tautliner; doing it by accident is a problem.

## The imperial format: 11R22.5

Still the volume format on Australian steer and drive positions.

- 11 is the nominal section width in inches, so roughly 279mm.
- R is radial construction again, and 22.5 the rim diameter in inches.

There is no aspect ratio quoted because imperial sizes carry an implied ratio of around 90 per cent, which is why an 11R22.5 stands taller than a 295/80R22.5 despite being narrower. It remains the most common heavy fitment in Australia and the deepest stock line in our warehouse.

## Load index: the number that matters most

After the size you will see something like 148/145M or 154/150K.

The first figure is the load index for a single fitment, the second for a dual fitment, which is lower because duals do not share load perfectly and run hotter. Load index is a coded value rather than a weight, so you need the table:

- 135 = 2180kg
- 143 = 2725kg
- 145 = 2900kg
- 146 = 3000kg
- 148 = 3150kg
- 149 = 3250kg
- 150 = 3350kg
- 154 = 3750kg
- 164 = 5000kg

So a 148/145 tyre carries 3150kg on its own, or 2900kg each in a dual pair. Two on a steer axle gives 6300kg against a 6.0 tonne axle. Eight drive tyres in duals at 2900kg gives 23,200kg against a 16.5 tonne tandem drive group.

Fitting a tyre with a lower load index than your axle requires is unsafe and a compliance problem, and it is easy to do by accident because two tyres in the same size can carry different indexes. Our Greforce GRT33 in 11R22.5 is 148/145; the Lionshead LA301E in the same size is 149/146, one step higher at 3250kg. If you run at maximum legal axle mass, that step is worth having.

Watch for sizes quoted with two load ratings - our GRD1212 is listed as 146/143 or 148/145 because both have shipped - and check the sidewall of what arrives against your vehicle plate before fitting.

> Match or exceed the load index on your plate. Never go below it to save money, and never assume two tyres in the same size are interchangeable until you have read both numbers.

## Speed symbol

The letter after the load index is the maximum sustained speed the casing is rated for:

- J = 100 km/h
- K = 110 km/h
- L = 120 km/h
- M = 130 km/h

For Australian heavy vehicle work you will almost always be choosing between J and M, and all four exceed the 100 km/h national heavy vehicle speed limit. So why care? Because the speed symbol is a heat specification, not a permission slip. A tyre run near its rated ceiling for hours in 40-degree heat works far harder than the same tyre at 90 km/h, and the rating is one of the design inputs that sets how much heat the casing can shed. An M-rated casing at 100 km/h has margin; a J-rated casing has very little, and heat is what actually kills commercial tyres here. Some patterns carry different symbols across batches, so read the sidewall in front of you.

## PR rating and what ply actually means

You will also see a figure like 16PR, 18PR, 20PR or 24PR. PR stands for ply rating, a legacy measure. An 18PR tyre does not contain eighteen plies of fabric; it means the casing is as strong as an old bias-ply tyre that did. In practice it is a quick proxy for casing strength, and therefore for load capacity and inflation pressure.

- 16PR: lighter fitments and weight-sensitive drive positions.
- 18PR: the Australian standard, and the majority of our range.
- 20PR: premium high-load linehaul, typically in 295/80R22.5.
- 24PR: super-singles such as 385/65R22.5.

A heavier PR casing is not automatically better. An 18PR casing across eight drive positions weighs more than a 16PR, and that weight comes off your payload. Our GRD37 exists for this reason: 20mm of drive tread on a lighter 16PR casing rated to 3000kg, for operators who do not need the full 3150kg.

## Rim width

The last specification that catches people out, quoted separately from the size code. Fit a wide tyre on a narrow rim and the shoulders roll under and wear early; fit a narrow tyre on a rim that is too wide and you stretch the casing and lose sidewall protection.

Our catalogue gives the spread: 11R22.5 specifies an 8.25 rim, 295/80R22.5 a 9.00, 265/70R19.5 a 7.50, 235/75R17.5 a 6.75, and the 385/65R22.5 super-single an 11.75.

## Putting it together

Take 295/80R22.5 154/150K 20PR on a 9.00 rim: a 295mm radial with a 236mm sidewall on a 22.5in rim, carrying 3750kg single or 3350kg in duals, rated to 110 km/h on a premium casing. That is a linehaul steer or trailer specification, and in our range it is the G-PILOT X1.

If you are not certain, check the compliance plate for axle mass and the sidewall of the tyre currently on the truck for everything else. Send us a photo on 1300 846 024 and we will confirm the fitment before you order.`,
  },
]

/* ------------------------------------------------------------------ *
 * Derived collections & lookups
 * ------------------------------------------------------------------ */

export const blogBySlug: Map<string, BlogPost> = new Map(
  blogPosts.map((post) => [post.slug, post]),
)

export const getPost = (slug: string): BlogPost | undefined => blogBySlug.get(slug)

export const blogCategories: string[] = [
  ...new Set(blogPosts.map((post) => post.category)),
]

/** Same category first, then most recent. Never returns the post itself. */
export function relatedPosts(slug: string, limit = 3): BlogPost[] {
  const current = blogBySlug.get(slug)
  if (!current) return blogPosts.slice(0, limit)

  return blogPosts
    .filter((post) => post.slug !== slug)
    .sort((a, b) => {
      const aSame = a.category === current.category ? 1 : 0
      const bSame = b.category === current.category ? 1 : 0
      if (aSame !== bSame) return bSame - aSame
      return b.date.localeCompare(a.date)
    })
    .slice(0, limit)
}
