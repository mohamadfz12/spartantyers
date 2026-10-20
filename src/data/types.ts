export type AxlePosition = 'steer' | 'drive' | 'trailer'

export type BrandName = 'Greforce' | 'Lionshead'

/** Visual tread family — drives both the SVG diagrams and the 3D tread geometry. */
export type TreadFamily = 'rib' | 'lug' | 'block' | 'trailer'

export type Application =
  | 'Long Haul'
  | 'Regional'
  | 'Mixed Service'
  | 'Urban Delivery'
  | 'On / Off Road'

export interface Product {
  id: string
  /** Spartan's catalogue SKU — the value encoded in the warehouse barcode. */
  sku: string
  brand: BrandName
  model: string
  size: string
  /** Normalised axle fitments this casing is rated for. */
  position: AxlePosition[]
  /** Human label exactly as the manufacturer specifies it. */
  positionLabel: string
  application: Application
  tread: TreadFamily

  ply: string
  rim: string
  /*
   * The manufacturer figures below are `null` where nothing is published for
   * this exact line. The page then says "to be confirmed" rather than show a
   * number nobody has checked.
   */
  /** Original tread depth in mm. */
  treadDepthMm: number | null
  loadIndex: string | null
  speedRating: string | null
  /** Derived from the single-fitment load index. */
  maxLoadKg: number | null
  /** Derived from the speed symbol. */
  maxSpeedKmh: number | null
  rimDiameterIn: number
  sectionWidthMm: number

  /**
   * Retail price per tyre, inc. GST — the RRP from Spartan's price list.
   * `null` is price on application (POA): the line is built to order, so it
   * is quoted per order rather than sold through the cart.
   */
  price: number | null
  discount?: number
  discountPrice?: number
  stock: number
  rating: number
  reviewCount: number

  /** EU tyre-label rolling-resistance class. */
  fuelRating: 'A' | 'B' | 'C' | 'D' | null
  /** EU tyre-label external noise. */
  noiseDb: number | null
  retreadable: boolean | null
  threePeak: boolean

  headline: string
  description: string
  highlights: string[]
  tags: string[]
}

export interface CartLine {
  id: string
  sku: string
  brand: string
  model: string
  size: string
  price: number
  image?: string
  tread: TreadFamily
  quantity: number
}

export interface Review {
  id: string
  author: string
  role: string
  location: string
  rating: number
  body: string
  productId?: string
  date: string
}

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  readMinutes: number
  date: string
  author: string
  /** Markdown-lite: `## ` headings, `- ` bullets, blank-line separated paragraphs. */
  body: string
}

export interface FaqItem {
  question: string
  answer: string
  category: string
}

export interface Order {
  id: string
  reference: string
  createdAt: string
  status: 'pending' | 'paid' | 'packing' | 'dispatched' | 'collected' | 'cancelled'
  fulfilment: 'delivery' | 'pickup'
  customer: {
    name: string
    email: string
    phone: string
    company?: string
  }
  address?: {
    line1: string
    suburb: string
    state: string
    postcode: string
  }
  lines: Array<{
    sku: string
    name: string
    size: string
    quantity: number
    unitPrice: number
  }>
  fittingTyres: number
  subtotal: number
  fittingTotal: number
  discount: number
  total: number
  promoCode?: string
  paymentId?: string
  notes?: string
}
