import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { useIsMobile, useReducedMotion } from '@/hooks'
import { useRenderQuality } from '@/store/ui'
import { cn } from '@/lib/utils'
import type { Product, TreadFamily } from '@/data/types'
import { StaticWheel, WheelSpinner } from './StaticWheel'

export { StaticWheel, WheelSpinner } from './StaticWheel'
export { TREAD_SPECS, EXPLODED_PARTS, parseTyreSize, wheelProportions } from './wheelGeometry'
export type { TreadSpec, ExplodedPart } from './wheelGeometry'

/**
 * Every three.js import is behind this dynamic boundary, so the ~600KB WebGL
 * chunk is only fetched for visitors who will actually see a 3D wheel — and
 * never on a first paint.
 */
const Scene = lazy(async () => {
  const module = await import('./scene')
  return { default: module.HeroWheelScene }
})

const ProductScene = lazy(async () => {
  const module = await import('./scene')
  return { default: module.ProductWheelScene }
})

const ConfigScene = lazy(async () => {
  const module = await import('./scene')
  return { default: module.ConfiguratorScene }
})

const CompactScene = lazy(async () => {
  const module = await import('./scene')
  return { default: module.CompactWheelScene }
})

/* ------------------------------------------------------------------ *
 * Capability detection
 * ------------------------------------------------------------------ */

let webglSupport: boolean | null = null

/** Probes for a usable WebGL context once and caches the answer. */
function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport
  if (typeof window === 'undefined') return false

  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    webglSupport = Boolean(gl)

    // Release the probe context immediately rather than waiting for GC —
    // browsers cap the number of live WebGL contexts quite low.
    if (gl && 'getExtension' in gl) {
      const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
  } catch {
    webglSupport = false
  }

  return webglSupport
}

/** Resolves whether a 3D canvas should mount at all, and at what quality. */
function useRenderDecision() {
  const quality = useRenderQuality((s) => s.quality)
  const reducedMotion = useReducedMotion()
  const isMobile = useIsMobile()
  const [supported, setSupported] = useState(false)

  useEffect(() => setSupported(supportsWebGL()), [])

  const enabled = supported && quality !== 'off'

  return {
    enabled,
    reducedMotion,
    // Fewer tread blocks and a lower DPR ceiling on phones and in balanced mode.
    density: quality === 'balanced' ? 0.55 : isMobile ? 0.7 : 1,
    quality,
    supported,
  }
}

/* ------------------------------------------------------------------ *
 * Shared frame
 * ------------------------------------------------------------------ */

interface FrameProps {
  children: ReactNode
  fallback: ReactNode
  className?: string
  /** Delay mounting the canvas until the frame scrolls into view. */
  lazyMount?: boolean
  label: string
}

function WheelFrame({
  children,
  fallback,
  className,
  lazyMount = true,
  label,
}: FrameProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(!lazyMount)
  const [failed, setFailed] = useState(false)

  // Hold off mounting the canvas until the frame is nearly on screen, so a
  // wheel far down the page costs nothing until it is about to be seen.
  useEffect(() => {
    if (!lazyMount || inView) return
    const node = containerRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [lazyMount, inView])

  // A lost context or a driver crash must not take the page down with it —
  // fall back to the SVG wheel and stay put.
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const onLost = (event: Event) => {
      event.preventDefault()
      setFailed(true)
    }
    node.addEventListener('webglcontextlost', onLost, true)
    return () => node.removeEventListener('webglcontextlost', onLost, true)
  }, [])

  return (
    <div ref={containerRef} className={cn('relative', className)} aria-label={label}>
      {inView && !failed ? (
        <Suspense fallback={fallback}>{children}</Suspense>
      ) : (
        fallback
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Public components
 * ------------------------------------------------------------------ */

export function HeroWheel({
  product,
  className,
}: {
  product: Product
  className?: string
}) {
  const { enabled, reducedMotion, density } = useRenderDecision()

  const fallback = (
    <div className="flex h-full w-full items-center justify-center p-6">
      <StaticWheel
        tread={product.tread}
        label={product.brand}
        size={product.size}
        spin={!reducedMotion}
        className="max-h-full max-w-full drop-shadow-2xl"
        title={`${product.brand} ${product.model} ${product.size}`}
      />
    </div>
  )

  if (!enabled) return <div className={cn('relative', className)}>{fallback}</div>

  return (
    <WheelFrame
      className={className}
      fallback={fallback}
      lazyMount={false}
      label={`Interactive 3D model of a ${product.brand} ${product.model} ${product.size} truck tyre`}
    >
      <Scene product={product} reducedMotion={reducedMotion} density={density} />
    </WheelFrame>
  )
}

export function ProductWheel({
  product,
  className,
  autoRotate = true,
}: {
  product: Product
  className?: string
  autoRotate?: boolean
}) {
  const { enabled, reducedMotion, density } = useRenderDecision()

  const fallback = (
    <div className="flex h-full w-full items-center justify-center p-8">
      <StaticWheel
        tread={product.tread}
        label={product.brand}
        size={product.size}
        className="max-h-full max-w-full"
        title={`${product.brand} ${product.model} ${product.size}`}
      />
    </div>
  )

  if (!enabled) return <div className={cn('relative', className)}>{fallback}</div>

  return (
    <WheelFrame
      className={className}
      fallback={fallback}
      label={`Interactive 3D model of the ${product.brand} ${product.model} in ${product.size} — drag to rotate`}
    >
      <ProductScene
        product={product}
        reducedMotion={reducedMotion}
        autoRotate={autoRotate}
        density={density}
      />
    </WheelFrame>
  )
}

export interface WheelConfiguratorProps {
  size: string
  tread: TreadFamily
  treadDepthMm: number
  sidewall: {
    brand: string
    model: string
    size: string
    loadIndex: string
    speedRating: string
    ply: string
  }
  rimStyle: 'alloy' | 'steel'
  explode: number
  spinSpeed: number
  glow?: number
  visibleParts?: Array<'tread' | 'carcass' | 'rim' | 'hub'>
  className?: string
}

export function WheelConfigurator({ className, ...props }: WheelConfiguratorProps) {
  const { enabled, reducedMotion } = useRenderDecision()

  const fallback = (
    <div className="flex h-full w-full items-center justify-center p-8">
      <StaticWheel
        tread={props.tread}
        label={props.sidewall.brand}
        size={props.size}
        className="max-h-full max-w-full"
      />
    </div>
  )

  if (!enabled) return <div className={cn('relative', className)}>{fallback}</div>

  return (
    <WheelFrame
      className={className}
      fallback={<WheelSpinner label="Loading wheel lab" className="h-full" />}
      lazyMount={false}
      label="Interactive 3D tyre configurator — drag to rotate, scroll to zoom"
    >
      <ConfigScene {...props} reducedMotion={reducedMotion} />
    </WheelFrame>
  )
}

export function CompactWheel({
  tread,
  size = '11R22.5',
  treadDepthMm = 18,
  brand = 'Greforce',
  className,
  /** Small decorative wheels stay 2D unless 3D is explicitly worth it. */
  force3d = false,
}: {
  tread: TreadFamily
  size?: string
  treadDepthMm?: number
  brand?: string
  className?: string
  force3d?: boolean
}) {
  const { enabled, reducedMotion, quality } = useRenderDecision()

  const fallback = (
    <StaticWheel tread={tread} label={brand} className={cn('h-full w-full', className)} />
  )

  if (!enabled || !force3d || quality !== 'high') {
    return fallback
  }

  return (
    <WheelFrame
      className={cn('h-full w-full', className)}
      fallback={fallback}
      label={`3D model of a ${tread} pattern truck tyre`}
    >
      <CompactScene
        tread={tread}
        size={size}
        treadDepthMm={treadDepthMm}
        brand={brand}
        reducedMotion={reducedMotion}
      />
    </WheelFrame>
  )
}
