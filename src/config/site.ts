/**
 * Single source of truth for every brand-level fact on the site.
 *
 * Renaming / rebranding the whole project is a change to this file only —
 * nothing else hard-codes the business name, phone number or address.
 */

export const site = {
  name: 'Spartan Tyres',
  legalName: 'Spartan Tyres Pty Ltd',
  shortName: 'Spartan',
  domain: 'spartantrucktyres.com.au',
  url: 'https://spartantrucktyres.com.au',
  tagline: "Australia's Trusted Commercial Tyre Supplier",
  description:
    'Spartan Tyres supplies commercial truck, bus and trailer tyres online across Australia. Bulk pricing, consistent stock and fast delivery from our Sydney warehouse.',
  foundedYear: 2019,

  phone: {
    display: '1300 846 024',
    href: 'tel:1300846024',
    e164: '+611300846024',
  },
  email: {
    sales: 'sales@spartantrucktyres.com.au',
    accounts: 'accounts@spartantrucktyres.com.au',
  },

  /** Registered head office. */
  office: {
    street: '12 Pine Road',
    suburb: 'Yennora',
    state: 'NSW',
    postcode: '2161',
    country: 'AU',
    get full() {
      return `${this.street}, ${this.suburb} ${this.state} ${this.postcode}`
    },
    mapsUrl:
      'https://www.google.com/maps/search/?api=1&query=12+Pine+Road+Yennora+NSW+2161',
  },

  /** Warehouse customers collect from — deliberately a different street number. */
  warehouse: {
    street: '10 Pine Rd',
    suburb: 'Yennora',
    state: 'NSW',
    postcode: '2161',
    get full() {
      return `${this.street}, ${this.suburb} ${this.state} ${this.postcode}`
    },
    mapsUrl:
      'https://www.google.com/maps/search/?api=1&query=10+Pine+Rd+Yennora+NSW+2161',
  },

  hours: {
    label: 'Monday to Friday, 8:00 AM – 6:00 PM AEST',
    short: 'Mon–Fri 8am–6pm AEST',
    opens: '08:00',
    closes: '18:00',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  },

  /** Sister business that covers fitting, washing and the brands we don't stock. */
  partner: {
    name: '1 Truck Stop',
    url: 'https://1truckstop.com.au',
    tyresUrl: 'https://1truckstop.com.au/truck-tyres/',
    phone: { display: '1300 376 304', href: 'tel:1300376304' },
    address: '12 Pine Road, Yennora NSW 2161',
    services: [
      'Truck Wash',
      'RTA Wash & Inspection',
      'Wheel Alignment',
      'Tyre Fitting',
    ],
  },

  commerce: {
    currency: 'AUD',
    currencySymbol: '$',
    /** GST is included in every displayed price. */
    gstRate: 0.1,
    freeMetroDelivery: true,
    fittingFeePerTyre: 70,
    bulkThreshold: 20,
    afterpayMaxOrder: 2000,
    dispatchWindow: '1 business day',
    metroDeliveryEstimate: '2–3 business days',
    metroCities: [
      'Sydney',
      'Melbourne',
      'Brisbane',
      'Adelaide',
      'Perth',
      'Canberra',
      'Gold Coast',
      'Newcastle',
      'Wollongong',
      'Hobart',
      'Darwin',
    ],
  },

  social: {
    facebook: 'https://www.facebook.com/',
    linkedin: 'https://www.linkedin.com/',
    instagram: 'https://www.instagram.com/',
  },

  analytics: {
    /** Google Ads / GA4 tag carried over from the existing site. */
    gtagId: 'AW-18326248165',
  },
} as const

export const nav = {
  primary: [
    { label: 'Shop', href: '/shop' },
    { label: 'Deals', href: '/deals' },
    { label: 'Wheel Lab', href: '/wheel-lab', badge: '3D' },
    { label: 'Tyre Finder', href: '/finder' },
    { label: 'Fleet', href: '/fleet-solutions' },
    { label: 'Wholesale', href: '/wholesale' },
  ],
  secondary: [
    { label: 'Brands', href: '/brands' },
    { label: 'Range', href: '/products' },
    { label: 'Guide', href: '/guide' },
    { label: 'Blog', href: '/blog' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  footer: [
    {
      title: 'Shop',
      links: [
        { label: 'All Tyres', href: '/shop' },
        { label: 'Steer Tyres', href: '/shop?position=steer' },
        { label: 'Drive Tyres', href: '/shop?position=drive' },
        { label: 'Trailer Tyres', href: '/shop?position=trailer' },
        { label: 'Current Deals', href: '/deals' },
        { label: 'Tyre Finder', href: '/finder' },
      ],
    },
    {
      title: 'Business',
      links: [
        { label: 'Fleet Solutions', href: '/fleet-solutions' },
        { label: 'Wholesale', href: '/wholesale' },
        { label: 'Brands', href: '/brands' },
        { label: 'Full Range', href: '/products' },
        { label: 'Wheel Lab', href: '/wheel-lab' },
      ],
    },
    {
      title: 'Support',
      links: [
        { label: 'Contact Us', href: '/contact' },
        { label: 'Shipping & Delivery', href: '/shipping' },
        { label: 'Returns & Warranty', href: '/returns' },
        { label: 'FAQ', href: '/faq' },
        { label: 'Tyre Guide', href: '/guide' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About Spartan', href: '/about' },
        { label: 'Blog', href: '/blog' },
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms & Conditions', href: '/terms' },
      ],
    },
  ],
} as const

export type NavItem = { label: string; href: string; badge?: string }
