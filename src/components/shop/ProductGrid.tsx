import { useEffect, useState } from 'react'
import type { Product } from '@/data/types'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks'
import { ProductCard } from './ProductCard'

export interface ProductGridProps {
  products: Product[]
  onQuickView?: (product: Product) => void
  className?: string
  /** Cards beyond this index all share the last delay step. */
  staggerLimit?: number
}

/**
 * The catalogue grid.
 *
 * The entrance stagger runs exactly once, on the grid's first paint. Cards that
 * mount later — because a filter changed — arrive already in their final state,
 * so re-filtering never re-animates the whole page under the reader's eyes.
 * That is deliberately a plain CSS transition rather than `Stagger`, which
 * re-fires whenever its children change.
 */
export function ProductGrid({
  products: list,
  onQuickView,
  className,
  staggerLimit = 8,
}: ProductGridProps) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3',
        className,
      )}
    >
      {list.map((product, index) => (
        <div
          key={product.id}
          style={
            reduced || !shown
              ? undefined
              : { transitionDelay: `${Math.min(index, staggerLimit) * 55}ms` }
          }
          className={cn(
            'transition-[opacity,transform] duration-500 ease-brand',
            shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          )}
        >
          <ProductCard product={product} onQuickView={onQuickView} className="h-full" />
        </div>
      ))}
    </div>
  )
}
