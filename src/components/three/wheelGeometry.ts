import type { Product, TreadFamily } from '@/data/types'

/**
 * Turns a real tyre size code into the proportions the 3D wheel is built from.
 *
 * The model is normalised so the outer radius is always 1.0 — so a 385/65R22.5
 * super-single genuinely renders wider and squatter than a 215/75R17.5, and
 * the rim fills proportionally more of a low-profile casing. The silhouette is
 * driven by the catalogue, not by art direction.
 */

export interface WheelProportions {
  /** Section width / overall diameter — half the tyre's width in model units. */
  halfWidth: number
  /** Rim radius in model units. */
  rimRadius: number
  /** Carcass crown radius; tread blocks sit on top of this up to 1.0. */
  crownRadius: number
  /** Radial height of the tread blocks. */
  treadHeight: number
  /** Overall diameter in millimetres, for the spec readout. */
  overallDiameterMm: number
  /** Section width in millimetres. */
  sectionWidthMm: number
}

const MM_PER_INCH = 25.4

/** Parses a size code into section width (mm), aspect ratio (%) and rim (in). */
export function parseTyreSize(size: string): {
  sectionWidthMm: number
  aspectRatio: number
  rimDiameterIn: number
} {
  const metric = size.match(/^(\d{3})\/(\d{2})R(\d{2}(?:\.\d)?)$/)
  if (metric) {
    return {
      sectionWidthMm: Number(metric[1]),
      aspectRatio: Number(metric[2]),
      rimDiameterIn: Number(metric[3]),
    }
  }

  // Imperial sizes such as 11R22.5 and 9.5R17.5 quote width in inches and
  // carry no aspect ratio — the industry convention for these is ~92%.
  const imperial = size.match(/^(\d+(?:\.\d+)?)R(\d{2}(?:\.\d)?)$/)
  if (imperial) {
    return {
      sectionWidthMm: Number(imperial[1]) * MM_PER_INCH,
      aspectRatio: 92,
      rimDiameterIn: Number(imperial[2]),
    }
  }

  // Fall back to the most common commercial fitment.
  return { sectionWidthMm: 279, aspectRatio: 92, rimDiameterIn: 22.5 }
}

export function wheelProportions(
  size: string,
  treadDepthMm: number,
): WheelProportions {
  const { sectionWidthMm, aspectRatio, rimDiameterIn } = parseTyreSize(size)

  const rimMm = rimDiameterIn * MM_PER_INCH
  const sidewallMm = sectionWidthMm * (aspectRatio / 100)
  const overallDiameterMm = rimMm + sidewallMm * 2

  // Outer radius is 1.0, so one model unit is half the overall diameter.
  const unitMm = overallDiameterMm / 2

  const halfWidth = sectionWidthMm / 2 / unitMm
  const rimRadius = rimMm / 2 / unitMm

  // Tread depth is exaggerated ~1.9x. At true scale 21.5mm of tread on a
  // 1046mm casing is 4% of the radius, which reads as flat on screen; this
  // keeps the relative differences between patterns honest while staying legible.
  const treadHeight = Math.min((treadDepthMm / unitMm) * 1.9, 0.12)

  return {
    halfWidth,
    rimRadius,
    crownRadius: 1 - treadHeight,
    treadHeight,
    overallDiameterMm: Math.round(overallDiameterMm),
    sectionWidthMm: Math.round(sectionWidthMm),
  }
}

/**
 * Representative tread depth per family, for drawing only: a build with no
 * catalogue match in the Wheel Lab, or a line whose maker publishes no depth.
 * Never shown as the product's own figure.
 */
export const NOMINAL_TREAD_DEPTH_MM: Record<TreadFamily, number> = {
  rib: 14,
  lug: 21.5,
  block: 15.5,
  trailer: 12.5,
}

/** The depth to draw: the published figure, or the family's nominal one. */
export function drawnTreadDepth(product: Pick<Product, 'treadDepthMm' | 'tread'>): number {
  return product.treadDepthMm ?? NOMINAL_TREAD_DEPTH_MM[product.tread]
}

export function proportionsForProduct(product: Product): WheelProportions {
  return wheelProportions(product.size, drawnTreadDepth(product))
}

/* ------------------------------------------------------------------ *
 * Carcass profile
 * ------------------------------------------------------------------ */

/**
 * The 2D profile revolved to make the tyre carcass, as [radius, axial] pairs.
 * Runs bead → sidewall bulge → shoulder → crown → shoulder → sidewall → bead,
 * with the crown very slightly domed the way a loaded casing actually sits.
 */
/**
 * THREE.LatheGeometry assigns `v` by profile-point index, not by arc length:
 * `v = j / (points.length - 1)`. So the texture bands that carry the sidewall
 * branding are pinned to specific indices in `carcassProfile` below.
 *
 * Points 1–4 are one sidewall (bead → bulge → shoulder) and points 12–15 are
 * the other, mirrored. Exported so the texture generator and the geometry can
 * never drift apart.
 */
export const CARCASS_PROFILE_LENGTH = 17

const lastIndex = CARCASS_PROFILE_LENGTH - 1

export const SIDEWALL_BANDS = {
  /** v range of the first sidewall: bead at the low end, shoulder at the high. */
  first: [1 / lastIndex, 4 / lastIndex] as const,
  /** v range of the second sidewall: shoulder at the low end, bead at the high. */
  second: [12 / lastIndex, 15 / lastIndex] as const,
}

export function carcassProfile(
  proportions: WheelProportions,
): Array<[number, number]> {
  const { rimRadius: r, crownRadius: c, halfWidth: w } = proportions

  // Sidewall bulges a little past the section width at its widest point.
  const bulge = w * 1.04

  const half: Array<[number, number]> = [
    [r * 0.995, -w * 0.9],
    [r * 1.02, -w * 0.97],
    [r + (c - r) * 0.18, -bulge],
    [r + (c - r) * 0.45, -bulge],
    [r + (c - r) * 0.72, -w * 0.99],
    [c * 0.985, -w * 0.84],
    [c, -w * 0.7],
    [c * 1.004, -w * 0.35],
    [c * 1.006, 0],
    [c * 1.004, w * 0.35],
    [c, w * 0.7],
    [c * 0.985, w * 0.84],
    [r + (c - r) * 0.72, w * 0.99],
    [r + (c - r) * 0.45, bulge],
    [r + (c - r) * 0.18, bulge],
    [r * 1.02, w * 0.97],
    [r * 0.995, w * 0.9],
  ]

  return half
}

/* ------------------------------------------------------------------ *
 * Tread patterns
 * ------------------------------------------------------------------ */

export interface TreadSpec {
  /** Axial rows of blocks across the crown. */
  rows: number
  /** Blocks around the circumference, per row. */
  blocksPerRow: number
  /** Fraction of each circumferential pitch that is groove rather than block. */
  gapRatio: number
  /** Fraction of each row's axial width that is groove. */
  axialGapRatio: number
  /** Offset alternate rows by half a pitch. */
  stagger: boolean
  /** Block skew in radians — angled lugs throw water and bite on loose ground. */
  skew: number
  /** Rows at the edges run as solid, closed shoulders. */
  closedShoulders: boolean
  /** Human description used in the Wheel Lab readout. */
  label: string
  detail: string
}

export const TREAD_SPECS: Record<TreadFamily, TreadSpec> = {
  rib: {
    rows: 5,
    blocksPerRow: 72,
    gapRatio: 0.14,
    axialGapRatio: 0.16,
    stagger: false,
    skew: 0,
    closedShoulders: false,
    label: 'Five-rib highway',
    detail:
      'Continuous circumferential ribs with fine lateral sipes. Straight tracking, low rolling resistance and even wear — the steer and trailer pattern.',
  },
  lug: {
    rows: 2,
    blocksPerRow: 22,
    gapRatio: 0.44,
    axialGapRatio: 0.1,
    stagger: true,
    skew: 0.26,
    closedShoulders: false,
    label: 'Deep open lug',
    detail:
      'Two rows of deep, skewed lugs separated by wide self-cleaning grooves. Maximum traction under torque and the deepest removal mileage — the drive pattern.',
  },
  block: {
    rows: 4,
    blocksPerRow: 30,
    gapRatio: 0.3,
    axialGapRatio: 0.14,
    stagger: true,
    skew: 0.12,
    closedShoulders: false,
    label: 'Staggered block',
    detail:
      'Four staggered block rows. Biting edges in every direction for wet ramps and unsealed yards, without the noise of a deep open lug — the regional and metro drive pattern.',
  },
  trailer: {
    rows: 5,
    blocksPerRow: 84,
    gapRatio: 0.08,
    axialGapRatio: 0.12,
    stagger: false,
    skew: 0,
    closedShoulders: true,
    label: 'Closed-shoulder rib',
    detail:
      'Tight ribs with solid, closed shoulders. Free-rolling, scrub-resistant and built for the long even wear a non-powered axle should deliver — the trailer pattern.',
  },
}

/** One tread block, in the wheel's local space (axle along Y). */
export interface BlockPlacement {
  /** Angle around the circumference, radians. */
  angle: number
  /** Axial position. */
  axial: number
  /** Radial centre of the block. */
  radius: number
  /** Circumferential (tangential) size. */
  width: number
  /** Radial size. */
  height: number
  /** Axial size. */
  depth: number
  skew: number
}

/**
 * Lays out every tread block for a pattern. Returns plain data so the caller
 * can feed it straight into an InstancedMesh without touching three.js here.
 */
export function treadBlocks(
  family: TreadFamily,
  proportions: WheelProportions,
  /** Lets the Wheel Lab reduce block count on weaker hardware. */
  density = 1,
): { blocks: BlockPlacement[]; spec: TreadSpec } {
  const spec = TREAD_SPECS[family]
  const { crownRadius, treadHeight, halfWidth } = proportions

  const blocksPerRow = Math.max(8, Math.round(spec.blocksPerRow * density))
  const treadWidth = halfWidth * 2 * 0.84
  const rowPitch = treadWidth / spec.rows

  const blocks: BlockPlacement[] = []

  for (let row = 0; row < spec.rows; row++) {
    const isShoulder = row === 0 || row === spec.rows - 1

    // Shoulders are chamfered down a touch — real casings round off at the edge.
    const shoulderDrop = isShoulder ? treadHeight * 0.22 : 0
    const height = treadHeight - shoulderDrop
    const radius = crownRadius + height / 2

    const axial = -treadWidth / 2 + rowPitch * (row + 0.5)
    const depth = rowPitch * (1 - spec.axialGapRatio)

    // A closed shoulder is one continuous ring, so it gets no circumferential gap.
    const solid = spec.closedShoulders && isShoulder
    const gapRatio = solid ? 0 : spec.gapRatio
    const count = solid ? Math.max(blocksPerRow, 96) : blocksPerRow

    const pitch = (Math.PI * 2) / count
    const offset = spec.stagger && row % 2 === 1 ? pitch / 2 : 0

    for (let i = 0; i < count; i++) {
      const angle = i * pitch + offset
      blocks.push({
        angle,
        axial,
        radius,
        // Arc length at this radius, less the groove.
        width: pitch * radius * (1 - gapRatio),
        height,
        depth,
        skew: solid ? 0 : spec.skew,
      })
    }
  }

  return { blocks, spec }
}

/* ------------------------------------------------------------------ *
 * Exploded-view layout
 * ------------------------------------------------------------------ */

export interface ExplodedPart {
  key: 'tread' | 'carcass' | 'rim' | 'hub'
  label: string
  /** Axial offset at full explosion. */
  offset: number
  blurb: string
}

/** Axial separation of each assembly, used by the Wheel Lab teardown. */
export const EXPLODED_PARTS: ExplodedPart[] = [
  {
    key: 'tread',
    label: 'Tread & cap compound',
    offset: 0.95,
    blurb:
      'The wearing surface. Depth here is what you are buying — it sets removal mileage and whether the casing is worth retreading.',
  },
  {
    key: 'carcass',
    label: 'Casing & belt package',
    offset: 0.32,
    blurb:
      'Steel belts over a radial ply casing. This is the structural part that carries the load and survives two to three retread cycles.',
  },
  {
    key: 'rim',
    label: 'Rim & bead seat',
    offset: -0.34,
    blurb:
      'The bead locks against the rim flange to hold air. Rim width has to match the tyre — our spec sheets list the correct measuring rim for every size.',
  },
  {
    key: 'hub',
    label: 'Hub & stud pattern',
    offset: -0.95,
    blurb:
      'Ten studs on most Australian heavy fitments. Torque to spec and re-check after the first loaded run.',
  },
]
