import type { Review } from './types'

/* ------------------------------------------------------------------ *
 * Customer reviews
 *
 * The bodies carried over from the existing Spartan Tyres site are
 * reproduced verbatim — they are the client's own content and must
 * not be reworded. Each review is attached to the catalogue line it
 * most sensibly describes (steer/rib patterns for wet-highway and
 * tracking comments, drive/lug patterns for traction comments, and
 * so on).
 * ------------------------------------------------------------------ */

export const reviews: Review[] = [
  {
    id: 'rev-001',
    author: 'Craig M.',
    role: 'Fleet Manager',
    location: 'Wetherill Park, NSW',
    rating: 5,
    body: 'Fitted these across our fleet and the wear has been remarkably even. We are getting noticeably more kilometres out of them than the brand we ran previously.',
    productId: 'greforce-grt33-11r22-5',
    date: '2026-08-29',
  },
  {
    id: 'rev-002',
    author: 'Stuart B.',
    role: 'Owner Driver',
    location: 'Albury, NSW',
    rating: 5,
    body: 'Confidence on wet highways has been excellent. They hold the road well in the rain and the truck tracks straight under a full load.',
    productId: 'greforce-g-pilot-x1-295-80r22-5',
    date: '2026-08-12',
  },
  {
    id: 'rev-003',
    author: 'Nadia K.',
    role: 'Transport Operations',
    location: 'Truganina, VIC',
    rating: 5,
    body: 'Price per tyre is competitive and the durability means we are not replacing them anywhere near as often. Good return for a busy operation.',
    productId: 'greforce-grt33-275-70r22-5',
    date: '2026-07-24',
  },
  {
    id: 'rev-004',
    author: 'Dean P.',
    role: 'Fleet Manager',
    location: 'Dandenong, VIC',
    rating: 5,
    body: 'Much quieter than expected for a commercial tyre and very stable at highway speed. The drivers have commented on the smoother ride.',
    productId: 'greforce-gr622-11r22-5',
    date: '2026-07-08',
  },
  {
    id: 'rev-005',
    author: 'Wes T.',
    role: 'Workshop Foreman',
    location: 'Dubbo, NSW',
    rating: 5,
    body: 'We run a lot of rough regional roads and these have shrugged off everything. No chunking or sidewall damage so far.',
    productId: 'greforce-g-armor-a68-11r22-5',
    date: '2026-06-27',
  },
  {
    id: 'rev-006',
    author: 'Michelle R.',
    role: 'Fleet Manager',
    location: 'Rocklea, QLD',
    rating: 5,
    body: 'Nothing flashy, they just do the job day in and day out. Even wear and predictable handling, which is exactly what we need.',
    productId: 'greforce-gr881-11r22-5',
    date: '2026-06-11',
  },
  {
    id: 'rev-007',
    author: 'Brett H.',
    role: 'Owner Driver',
    location: 'Shepparton, VIC',
    rating: 5,
    body: 'Ordered on the Friday and they were on the truck by the middle of the next week. The tyre itself has performed exactly as described.',
    productId: 'greforce-grd35-11r22-5',
    date: '2026-05-30',
  },
  {
    id: 'rev-008',
    author: 'Tony V.',
    role: 'Owner Driver',
    location: 'Tamworth, NSW',
    rating: 5,
    body: 'As an owner driver every dollar counts. These have given me the mileage I was promised and the fuel economy has been solid.',
    productId: 'greforce-grd37-11r22-5',
    date: '2026-05-14',
  },
  {
    id: 'rev-009',
    author: 'Angela S.',
    role: 'Transport Operations',
    location: 'Bunbury, WA',
    rating: 5,
    body: 'Smooth, quiet and dependable for our passenger work. The casing still looks great and should be a candidate for a retread down the track.',
    productId: 'greforce-gr612-265-70r19-5',
    date: '2026-04-26',
  },
  {
    id: 'rev-010',
    author: 'Rhys C.',
    role: 'Workshop Foreman',
    location: 'Kewdale, WA',
    rating: 5,
    body: 'Rotated at the recommended intervals and the wear pattern has been textbook. Looking like we will get a full life out of them.',
    productId: 'lionshead-la301e-11r22-5',
    date: '2026-04-09',
  },
  {
    id: 'rev-011',
    author: 'Grant W.',
    role: 'Fleet Manager',
    location: 'Townsville, QLD',
    rating: 5,
    body: 'Through a brutal summer of long runs these held up without any heat issues and they are holding pressure well too.',
    productId: 'greforce-grd57-11r22-5',
    date: '2026-03-22',
  },
  {
    id: 'rev-012',
    author: 'Peter O.',
    role: 'Owner Driver',
    location: 'Toowoomba, QLD',
    rating: 5,
    body: 'Was unsure about trying a different brand but these have won me over. Grip, wear and comfort all tick the box.',
    productId: 'lionshead-ld317e-11r22-5',
    date: '2026-03-05',
  },
  {
    id: 'rev-013',
    author: 'Lisa F.',
    role: 'Transport Operations',
    location: 'Direk, SA',
    rating: 5,
    body: 'We run at max GVM most days and these handle the weight without squirming. Very planted under brakes as well.',
    productId: 'greforce-gr666-385-65r22-5',
    date: '2026-02-18',
  },
  {
    id: 'rev-014',
    author: 'Sam D.',
    role: 'Fleet Manager',
    location: 'Yennora, NSW',
    rating: 5,
    body: 'Second set now and the consistency is what keeps me coming back. Performance has not dropped off between batches.',
    productId: 'greforce-g-pilot-x3-295-80r22-5',
    date: '2026-02-02',
  },
  {
    id: 'rev-015',
    author: 'Jarrod L.',
    role: 'Workshop Foreman',
    location: 'Wacol, QLD',
    rating: 5,
    body: 'Noticeably better traction pulling out of yards and on loose surfaces compared to the tyres we were running before.',
    productId: 'greforce-gr999-235-75r17-5',
    date: '2026-01-19',
  },
  {
    id: 'rev-016',
    author: 'Hayden G.',
    role: 'Owner Driver',
    location: 'Mount Gambier, SA',
    rating: 4,
    body: 'Wear and grip are good and the value is hard to beat. Ride is on the firmer side when running empty, but we are still happy overall.',
    productId: 'greforce-grt33-255-70r22-5',
    date: '2025-12-15',
  },

  /* ---- Later reviews, same operator voice ---- */
  {
    id: 'rev-017',
    author: 'Marco Z.',
    role: 'Workshop Foreman',
    location: 'Dandenong, VIC',
    rating: 5,
    body: 'On a pair of metro rigids that get kerbed daily and the shoulders are still clean after six months. The scrubbing that killed the last set has not happened.',
    productId: 'lionshead-ls306e-235-75r17-5',
    date: '2025-11-27',
  },
  {
    id: 'rev-018',
    author: 'Kane R.',
    role: 'Maintenance Supervisor',
    location: 'Tamworth, NSW',
    rating: 4,
    body: 'Bought for the tipper work and the lug clears itself properly in wet clay. Louder on the highway than the rib we came off, but that was the trade we wanted.',
    productId: 'greforce-grd1212-275-70r22-5',
    date: '2025-11-06',
  },
  {
    id: 'rev-019',
    author: 'Trent A.',
    role: 'Transport Operations',
    location: 'Truganina, VIC',
    rating: 5,
    body: 'Second changeover on our reefer rigids. The drives are wearing evenly despite all the stop-start work and they pull off a wet dock without fuss.',
    productId: 'lionshead-ld328e-235-75r17-5',
    date: '2025-10-18',
  },
  {
    id: 'rev-020',
    author: 'Colin McK.',
    role: 'Depot Manager',
    location: 'Townsville, QLD',
    rating: 5,
    body: 'Tread depth was the reason we went with these and after a year on mine access roads there is plenty left. The casings look sound enough to send away for a retread.',
    productId: 'greforce-hd01m-11r22-5',
    date: '2025-09-24',
  },
  {
    id: 'rev-021',
    author: 'Daniel E.',
    role: 'Fleet Manager',
    location: 'Direk, SA',
    rating: 5,
    body: 'Running these with the matching drive tyre and the set has worn evenly front to back. Our fuel figures are down about two per cent on the old set, which pays for the difference.',
    productId: 'greforce-g-pilot-x1-295-80r22-5',
    date: '2025-08-29',
  },
  {
    id: 'rev-022',
    author: 'Narelle J.',
    role: 'Owner Driver',
    location: 'Bunbury, WA',
    rating: 5,
    body: 'Cheapest tyre on the site and it has done the job on our plant float. No pretensions about it, but for the money I have nothing to complain about.',
    productId: 'lionshead-la302e-215-75r17-5',
    date: '2025-07-15',
  },
]

/* ------------------------------------------------------------------ *
 * Derived collections & lookups
 * ------------------------------------------------------------------ */

export function reviewsForProduct(productId: string): Review[] {
  return reviews
    .filter((review) => review.productId === productId)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Mean rating for a product, to one decimal place. Returns 0 when unreviewed. */
export function averageRating(productId: string): number {
  const matching = reviewsForProduct(productId)
  if (matching.length === 0) return 0
  const total = matching.reduce((sum, review) => sum + review.rating, 0)
  return Math.round((total / matching.length) * 10) / 10
}

/** Six five-star reviews chosen for a spread of roles and states. */
export const featuredReviews: Review[] = [
  'rev-001',
  'rev-002',
  'rev-011',
  'rev-013',
  'rev-020',
  'rev-005',
]
  .map((id) => reviews.find((review) => review.id === id))
  .filter((review): review is Review => Boolean(review))
