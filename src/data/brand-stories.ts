/**
 * Why Greforce and why Lionshead: the story of each brand we stock.
 *
 * One source for the website's "Why Greforce" / "Why Lionshead" sections and
 * for the AI assistant's brand knowledge (api/_lib/ai/rules.ts), so the two
 * can never tell a customer different things.
 *
 * Every manufacturer fact here was read on the maker's own website or
 * listings in October 2026 (greforcetire.com, lionsheadgroup.com and the
 * makers' published product tables). Things that could not be confirmed —
 * founding dates, plant locations, any link between the two makers — are
 * deliberately left out rather than guessed.
 */

import { products } from './products.js'
import type { Product } from './types.js'

export interface BrandStory {
  brand: 'Greforce' | 'Lionshead'
  /** Anchor id on the page, e.g. #why-greforce. */
  anchor: string
  title: string
  tagline: string
  /** Two or three short paragraphs. */
  story: string[]
  highlights: Array<{ title: string; body: string }>
  facts: Array<{ label: string; value: string }>
  /** A video from the brand's own channel, or null when it has none. */
  video: { id: string; title: string; channel: string } | null
  /** Patterns to show as the brand's best known, in order. */
  heroPatterns: string[]
  /** Extra background for the AI assistant only. */
  aiNotes: string[]
}

export const brandStories: BrandStory[] = [
  {
    brand: 'Greforce',
    anchor: 'why-greforce',
    title: 'Why Greforce',
    tagline: 'Mid-to-high-end commercial radials, engineered for long distance.',
    story: [
      'Greforce is made by Shandong Greforce Tire Co., Ltd. (also trading as Shandong Kaixuan Tire), an integrated tyre company in Qingdao, China that designs, builds and exports its own truck and bus radials. The maker positions Greforce as a mid-to-high-end brand, and exports more than a million tyres a year to over 120 countries across the Americas, Oceania, Africa, the Middle East, Asia and Europe.',
      'Its casings are designed on balanced contour theory and checked with finite element simulation, by a technical team with more than 20 years of tyre design behind it. The aim is the one a fleet cares about: high wear resistance, high casing strength and a low cost per kilometre.',
      'It is our core range: patterns for every axle, from the G-PILOT X1 and X3 linehaul pair to the 23.5mm HD02 drive lug and the HD01M, which Greforce calls its longest-wearing drive tyre.',
    ],
    highlights: [
      {
        title: 'Engineered, not copied',
        body: 'Contours designed on balanced contour theory and proven by finite element simulation, for even wear and a casing that holds its shape under load.',
      },
      {
        title: 'Certified for the world',
        body: 'ISO 9001 quality management, and tyres certified to DOT, ECE R54 and R117, US EPA SmartWay, China CCC, GCC, SASO, SIRIM and more.',
      },
      {
        title: 'Built for long haul',
        body: 'Long-haul and regional patterns with deep treads (up to 23.5mm), stone ejectors, self-cleaning grooves and tie-bars that stop blocks squirming into uneven wear.',
      },
      {
        title: 'Premium casing, fair price',
        body: 'The maker’s promise is mid-to-high-end quality at a competitive price, with stable stock behind it: we hold the range in depth at Yennora.',
      },
    ],
    facts: [
      { label: 'Made by', value: 'Shandong Greforce Tire Co., Ltd., Qingdao, China' },
      { label: 'Positioning', value: 'Mid-to-high-end' },
      { label: 'Exported to', value: '120+ countries' },
      { label: 'Patterns made', value: '100+' },
      { label: 'Certifications', value: 'ISO 9001, DOT, ECE R54/R117, SmartWay, CCC, GCC, SASO, SIRIM' },
    ],
    video: { id: 'zcG_VQSOnYE', title: 'Never stop | Greforce Tire', channel: 'Greforce Tire (official)' },
    heroPatterns: ['G-PILOT X1', 'G-PILOT X3', 'HD01M', 'GR666'],
    aiNotes: [
      'Greforce maker: Shandong Greforce Tire Co., Ltd., which also uses the name Shandong Kaixuan Tire Co., Ltd. Offices in the Qingdao free trade zone, Shandong, China. It also owns the LANWOO brand and calls both mid-to-high-end.',
      'The maker claims more than 30 years of factory history, more than 100 patterns, and exports of more than a million tyres a year (its own profile also says 800,000) to 120 to 150 countries. Its truck range is grouped as Long Haul (highway), Regional (mixed road) and Mining.',
      'Certificates the maker shows: ISO 9001, ISO 45001, DOT, ECE R54 and R117, SmartWay, CCC, GCC, SASO, SIRIM, EAC, COP, SNI. It does not say which patterns are SmartWay verified, so do not claim it for a specific tyre.',
      'Design: balanced contour theory with finite element simulation; a technical team with more than 20 years of R&D experience; full quality control from raw material to delivery. No named compound technologies are published.',
      'The maker’s own claim policy covers manufacturing faults for three years from the production date, pro-rata on wear. Customers buying from us are covered by our warranty terms (manufacturing defects until the tread wears to 1.6mm), so quote ours, not the maker’s.',
      'Of the patterns we stock, only the HD01M is promoted by the maker for retreadability (full-width protector ply); our product pages say which tyres are retreadable, so use search_tyres for that.',
      'Known Greforce patterns not in our range include the GR777 (super single), GR998, GRD33 and the LANWOO brand. We can try to source sizes we do not stock: offer a sourcing request.',
      'Do not state a founding year, a factory location or capacity, an employee count, or any connection to another tyre brand: none of these is confirmed by the maker.',
    ],
  },
  {
    brand: 'Lionshead',
    anchor: 'why-lionshead',
    title: 'Why Lionshead',
    tagline: 'Honest value radials for regional and vocational fleets.',
    story: [
      'Lionshead is made by Lionshead Group (Qingdao Lionshead Tyre Co., Ltd.) in Qingdao, China. The group began in 2010 as a maker of the chemistry that goes inside a tyre (rubber adhesives, phenolic resins, dispersants and accelerators), and launched the Lionshead tyre brand in 2022 on that know-how.',
      'Its philosophy is plain: a relentless commitment to quality at a fair price, held by a tight cost-control system. The E-series patterns we stock are its economic line, so they suit fleets that want a sound radial without paying for a premium badge.',
      'We carry it where it makes the most sense: 11R22.5 for regional work and 17.5in for light trucks, from the versatile LA301E all-position to the deep-lug LD330E drive.',
    ],
    highlights: [
      {
        title: 'Rubber chemistry roots',
        body: 'A group that made the adhesives, resins and accelerators other factories use, before it made tyres of its own.',
      },
      {
        title: 'Certified',
        body: 'An ISO 9001 tyre plant, and tyres certified to DOT, ECE, CCC, GCC, SASO, INMETRO and SNI, among others.',
      },
      {
        title: 'Value without shortcuts',
        body: 'The E-series is Lionshead’s economic tier: a steel-belted tubeless radial at a price that keeps cost per kilometre down on regional and vocational work.',
      },
      {
        title: 'A pattern for every axle',
        body: 'All-position, drive and steer and trailer patterns in the sizes regional fleets run most, all held in stock at Yennora.',
      },
    ],
    facts: [
      { label: 'Made by', value: 'Lionshead Group (Qingdao Lionshead Tyre Co., Ltd.), Qingdao, China' },
      { label: 'Group founded', value: '2010 (tyres since 2022)' },
      { label: 'Positioning', value: 'Value (E-series economic line)' },
      { label: 'Certifications', value: 'ISO 9001 plant; DOT, ECE, CCC, GCC, SASO, INMETRO, SNI' },
    ],
    video: null,
    heroPatterns: ['LA301E', 'LD316E', 'LD317E', 'LA313E'],
    aiNotes: [
      'Lionshead maker: Lionshead Group, Qingdao Lionshead Tyre Co., Ltd., No. 161 Changjiang West Road, Qingdao, China. Founded in 2010 making rubber chemicals (rubber adhesive, phenolic resin, dispersant, accelerant); started its tyre business in 2022 with the LIONSHEAD brand and added SOONOVA in 2023. General manager: Arthur Wan.',
      'Certifications claimed: the tyre plant has ISO 9001; tyres certified with DOT, ECE, CCC, NOM, GCC, SASO, LATU, INMETRO, SNI and SONCAP. Its supplier listing also names IATF 16949 and ISO 17025.',
      'Its stated philosophy: relentless commitment to quality with fair (average) pricing, and an ever-evolving cost control system. It has exhibited at Automechanika Dubai and Shanghai and MIAPEX in 2023, and Equip Auto Algeria in 2024.',
      'In the maker’s own price table the E suffix marks its Economic tier (for example LA301E against the High Quality LA301). Every Lionshead pattern we stock is an E pattern, so describe them as Lionshead’s value line.',
      'Pattern letters: LA patterns are all-position, LD are drive, LS are steer and trailer. LD317E is a drive pattern the maker describes as suited to snow-covered roads.',
      'Do not confuse it with LionsHead Specialty Tire & Wheel of Indiana, USA, an unrelated company making RV and trailer tyres; their videos and reviews are not about our Lionshead.',
      'The maker publishes no warranty for Australia, so quote our warranty terms (manufacturing defects until the tread wears to 1.6mm). Do not state a factory location, capacity, retreadability for a specific pattern, or any connection to another tyre brand: none is confirmed.',
    ],
  },
]

export const storyFor = (brand: string) => brandStories.find((s) => s.brand === brand)

/** Each pattern we stock, once, with the sizes we carry it in. */
export function patternsOf(brand: string): Array<{ model: string; sizes: string[]; sample: Product }> {
  const byModel = new Map<string, Product[]>()
  for (const p of products.filter((x) => x.brand === brand)) {
    byModel.set(p.model, [...(byModel.get(p.model) ?? []), p])
  }
  return [...byModel.entries()].map(([model, list]) => ({ model, sizes: list.map((p) => p.size), sample: list[0]! }))
}

/**
 * Every pattern we stock, in words, for the AI assistant: what it is for,
 * where it fits, its construction and what the maker says about it. Prices
 * and stock are deliberately absent: the assistant's tools give those live.
 */
export function patternGuide(): string[] {
  const lines: string[] = []
  for (const story of brandStories) {
    for (const { model, sizes, sample } of patternsOf(story.brand)) {
      const all = products.filter((p) => p.brand === story.brand && p.model === model)
      const specs = all
        .map((p) =>
          [
            p.size,
            p.ply,
            p.loadIndex && p.speedRating ? `${p.loadIndex}${p.speedRating}` : null,
            p.treadDepthMm != null ? `${p.treadDepthMm}mm tread` : null,
            p.threePeak ? '3PMSF severe service' : null,
            p.retreadable ? 'retreadable' : null,
            p.fuelRating ? `fuel ${p.fuelRating}` : null,
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join('; ')
      lines.push(
        `- ${story.brand} ${model} (${sample.positionLabel}, ${sample.application}, ${sample.tread} tread; ${sizes.length > 1 ? `sizes ${sizes.join(', ')}` : sizes[0]}): ${sample.headline}. ${sample.description} Features: ${sample.highlights.join('; ')}. Specs: ${specs}.`,
      )
    }
  }
  return lines
}
