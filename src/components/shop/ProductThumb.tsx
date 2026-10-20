import type { TreadFamily } from '@/data/types'
import { productCardPhoto } from '@/data/media'
import { cn } from '@/lib/utils'
import { StaticWheel } from '@/components/three'

export interface ProductThumbProps {
  brand: string
  model: string
  tread: TreadFamily
  className?: string
  /** Names the image. Leave empty where the surrounding link already does. */
  alt?: string
}

/**
 * A small product image for cart lines, lists and comparisons: the real
 * photograph where the catalogue has one, otherwise the generated wheel in
 * the line's tread family. Fills its container either way.
 */
export function ProductThumb({ brand, model, tread, className, alt = '' }: ProductThumbProps) {
  const photo = productCardPhoto({ brand, model })

  if (photo) {
    return (
      <img
        src={photo.src}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        className={cn('h-full w-full rounded bg-white object-contain', className)}
      />
    )
  }

  return <StaticWheel tread={tread} title={alt || undefined} className={className} />
}
