import { brands as allBrands, type BrandEntry } from '@/data/brands'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand/BrandMark'
import { Marquee } from '@/components/motion'

/**
 * A quiet ticker of every brand name, used as a supporting device rather than
 * a claim: stocked brands and partner-sourced brands are not distinguished
 * here, because this is decoration. The /brands page makes the distinction
 * explicitly and is the only place that should.
 */
export function BrandWall({
  entries = allBrands,
  className,
}: {
  entries?: BrandEntry[]
  className?: string
}) {
  return (
    <div className={cn('py-2', className)}>
      <Marquee speed="slow">
        {entries.map((brand) => (
          <span
            key={brand.name}
            className="flex w-40 shrink-0 items-center justify-center px-6 opacity-70 transition-opacity duration-300 hover:opacity-100 sm:w-48"
          >
            <BrandMark name={brand.name} size="sm" />
          </span>
        ))}
      </Marquee>
    </div>
  )
}
