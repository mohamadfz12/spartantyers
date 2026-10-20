import type { Product } from '@/data/types'
import { POSITION_LABELS } from '@/data/products'
import { cn, formatNumber, specValue } from '@/lib/utils'
import { proportionsForProduct } from '@/components/three'

/** The note under any figure the maker has not published for this line. */
const UNPUBLISHED = 'Not in the published data for this line — we confirm it with your order'

export interface SpecRow {
  label: string
  value: string
  /** Shown under the value as the reason the number matters. */
  note?: string
}

/**
 * The manufacturer spec sheet, in the order a buyer reads it: what it fits
 * first, then what it is made of, then what it will do.
 *
 * Every figure is read or derived from the catalogue — load in kilograms from
 * the ISO load index, top speed from the speed symbol, overall diameter from
 * the same geometry the 3D wheel is built from. A figure the maker does not
 * publish for this line says so instead of showing a number.
 */
export function productSpecRows(product: Product): SpecRow[] {
  // Overall diameter depends on the size code alone, never the tread depth.
  const geometry = proportionsForProduct(product)

  return [
    { label: 'Size', value: product.size },
    {
      label: 'Axle position',
      value: product.positionLabel,
      note: product.position.map((p) => POSITION_LABELS[p]).join(', '),
    },
    { label: 'Application', value: product.application },
    { label: 'Ply rating', value: product.ply },
    { label: 'Measuring rim', value: `${product.rim}in` },
    {
      label: 'Tread depth',
      value: specValue(product.treadDepthMm, (mm) => `${mm}mm`),
      note: product.treadDepthMm != null ? 'When new — sets removal mileage' : UNPUBLISHED,
    },
    {
      label: 'Load index',
      value: specValue(product.loadIndex, (index) => index),
      note:
        product.maxLoadKg != null
          ? `${formatNumber(product.maxLoadKg)}kg maximum per tyre, single fitment`
          : UNPUBLISHED,
    },
    {
      label: 'Speed symbol',
      value: specValue(product.speedRating, (symbol) => symbol),
      note:
        product.maxSpeedKmh != null
          ? `${product.maxSpeedKmh}km/h sustained maximum`
          : UNPUBLISHED,
    },
    { label: 'Section width', value: `${product.sectionWidthMm}mm` },
    { label: 'Rim diameter', value: `${product.rimDiameterIn}in` },
    {
      label: 'Overall diameter',
      value: `${formatNumber(geometry.overallDiameterMm)}mm`,
      note: 'Calculated from section width, aspect ratio and rim diameter',
    },
    {
      label: 'Fuel rating',
      value: specValue(product.fuelRating, (rating) => rating, 'Not published'),
      note:
        product.fuelRating != null
          ? 'Rolling resistance, A best to D worst'
          : 'No EU tyre label published for this line',
    },
    {
      label: 'Pass-by noise',
      value: specValue(product.noiseDb, (db) => `${db}dB`, 'Not published'),
    },
    {
      label: 'Retreadable',
      value:
        product.retreadable == null ? 'Not published' : product.retreadable ? 'Yes' : 'No',
      note: product.retreadable ? 'Casing designed for two to three cycles' : undefined,
    },
    {
      label: 'Severe service',
      value: product.threePeak ? 'Yes' : 'No',
      note: product.threePeak ? 'Rated for mud, gravel and unsealed roads' : undefined,
    },
    { label: 'SKU', value: product.sku },
  ]
}

export interface SpecTableProps {
  product: Product
  /** Drops the explanatory notes for tight layouts such as the quick view. */
  dense?: boolean
  className?: string
  caption?: string
}

export function SpecTable({ product, dense = false, className, caption }: SpecTableProps) {
  const rows = productSpecRows(product)

  return (
    <table className={cn('w-full border-collapse text-sm', className)}>
      {caption ? (
        <caption className="sr-only">{caption}</caption>
      ) : (
        <caption className="sr-only">
          Full specifications for the {product.brand} {product.model} in {product.size}
        </caption>
      )}
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-border last:border-b-0">
            <th
              scope="row"
              className={cn(
                'w-1/2 py-2.5 pr-3 text-left align-top font-heading text-xs font-bold uppercase tracking-wide text-muted-foreground',
                dense && 'py-2',
              )}
            >
              {row.label}
            </th>
            <td className={cn('py-2.5 text-right align-top', dense && 'py-2')}>
              <span className="font-semibold">{row.value}</span>
              {!dense && row.note ? (
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {row.note}
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
