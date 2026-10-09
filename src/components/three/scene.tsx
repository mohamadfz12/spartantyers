import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Product, TreadFamily } from '@/data/types'
import { lerp } from '@/lib/utils'
import { TruckWheel } from './TruckWheel'
import { proportionsForProduct, TREAD_SPECS } from './wheelGeometry'
import { disposeWheelTextures, studioEnvironment } from './wheelTextures'

/**
 * All three.js usage lives in this module (and the modules it imports) so that
 * Vite can keep it in a single lazily-fetched chunk. Nothing on the critical
 * path imports it directly — `index.tsx` wraps it in React.lazy.
 */

/* ------------------------------------------------------------------ *
 * Imperative input refs
 *
 * Scroll position and pointer position are read inside useFrame rather than
 * held in React state. Driving a 60fps animation through setState would
 * re-render the whole tree every frame; a ref costs nothing.
 * ------------------------------------------------------------------ */

function useScrollRef() {
  const ref = useRef(0)

  useEffect(() => {
    const update = () => {
      ref.current = window.scrollY
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return ref
}

function usePointerRef(enabled: boolean) {
  const ref = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return
    const update = (event: PointerEvent) => {
      ref.current.x = (event.clientX / window.innerWidth) * 2 - 1
      ref.current.y = (event.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', update, { passive: true })
    return () => window.removeEventListener('pointermove', update)
  }, [enabled])

  return ref
}

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

function StudioEnvironment() {
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const texture = studioEnvironment()
    const previous = scene.environment
    scene.environment = texture
    return () => {
      scene.environment = previous
    }
  }, [scene])

  return null
}

/** Three-point rig plus a brand-coloured rim light. */
function Lights({ intensity = 1 }: { intensity?: number }) {
  return (
    <>
      <ambientLight intensity={0.4 * intensity} />
      <directionalLight
        position={[4.5, 6, 5]}
        intensity={2.1 * intensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      >
        <orthographicCamera attach="shadow-camera" args={[-3, 3, 3, -3, 0.1, 20]} />
      </directionalLight>
      <directionalLight position={[-5, 2.5, -3]} intensity={0.75 * intensity} color="#9fc4e8" />
      {/* Rim light in the brand orange, behind and below. */}
      <spotLight
        position={[-1.5, -2, -5]}
        angle={0.9}
        penumbra={1}
        intensity={2.4 * intensity}
        color="#e1632a"
      />
      <pointLight position={[0, 0, 4]} intensity={0.5 * intensity} color="#ffffff" />
    </>
  )
}

interface StageProps {
  children: ReactNode
  cameraPosition?: [number, number, number]
  fov?: number
  shadows?: boolean
  className?: string
  /** Lowers the device pixel ratio ceiling on weaker hardware. */
  maxDpr?: number
}

function Stage({
  children,
  cameraPosition = [0, 0.4, 4.2],
  fov = 38,
  shadows = true,
  maxDpr = 2,
}: StageProps) {
  // Canvas textures are cached module-wide; release them when 3D goes away.
  useEffect(() => () => disposeWheelTextures(), [])

  return (
    <Canvas
      dpr={[1, maxDpr]}
      shadows={shadows}
      camera={{ position: cameraPosition, fov }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <AdaptiveDpr pixelated={false} />
      <StudioEnvironment />
      <Lights />
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  )
}

/* ------------------------------------------------------------------ *
 * Hero scene
 * ------------------------------------------------------------------ */

interface HeroSceneProps {
  product: Product
  reducedMotion: boolean
  density?: number
}

function HeroWheelRig({ product, reducedMotion, density = 1 }: HeroSceneProps) {
  const outer = useRef<THREE.Group>(null)
  const spinner = useRef<THREE.Group>(null)

  const scrollRef = useScrollRef()
  const pointerRef = usePointerRef(!reducedMotion)
  const proportions = useMemo(() => proportionsForProduct(product), [product])

  const sidewall = useMemo(
    () => ({
      brand: product.brand,
      model: product.model,
      size: product.size,
      loadIndex: product.loadIndex,
      speedRating: product.speedRating,
      ply: product.ply,
    }),
    [product],
  )

  useFrame((state, delta) => {
    const spin = spinner.current
    const group = outer.current
    if (!spin || !group) return

    // Clamp delta so a backgrounded tab doesn't snap the wheel on return.
    const dt = Math.min(delta, 0.05)

    if (reducedMotion) {
      spin.rotation.y = 0.35
      group.rotation.set(-0.12, 0.42, 0)
      return
    }

    // Scroll drives rotation: the wheel rolls as the page moves. A constant
    // idle rate on top keeps it alive when the visitor is not scrolling.
    spin.rotation.y = scrollRef.current * -0.0042 + state.clock.elapsedTime * 0.14

    // Pointer tilts the whole assembly, eased so it feels weighted.
    const { x, y } = pointerRef.current
    group.rotation.y = lerp(group.rotation.y, 0.42 + x * 0.3, dt * 3.2)
    group.rotation.x = lerp(group.rotation.x, -0.12 + y * 0.18, dt * 3.2)

    // A slow bob, amplitude tied to nothing else so it never fights the tilt.
    group.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.045
  })

  return (
    <>
      <group ref={outer} rotation={[-0.12, 0.42, 0]} scale={1.42}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <group ref={spinner}>
            <TruckWheel
              size={product.size}
              tread={product.tread}
              treadDepthMm={product.treadDepthMm}
              sidewall={sidewall}
              density={density}
            />
          </group>
        </group>
      </group>

      <ContactShadows
        position={[0, -proportions.crownRadius * 1.52, 0]}
        opacity={0.55}
        scale={7}
        blur={2.6}
        far={3}
        resolution={512}
        color="#000000"
      />
    </>
  )
}

export function HeroWheelScene(props: HeroSceneProps) {
  return (
    <Stage cameraPosition={[0, 0.25, 4.6]} fov={36}>
      <HeroWheelRig {...props} />
    </Stage>
  )
}

/* ------------------------------------------------------------------ *
 * Product scene — orbitable, sits on the product detail page
 * ------------------------------------------------------------------ */

interface ProductSceneProps {
  product: Product
  reducedMotion: boolean
  autoRotate?: boolean
  density?: number
}

function ProductWheelRig({
  product,
  reducedMotion,
  autoRotate = true,
}: ProductSceneProps) {
  const spinner = useRef<THREE.Group>(null)

  const sidewall = useMemo(
    () => ({
      brand: product.brand,
      model: product.model,
      size: product.size,
      loadIndex: product.loadIndex,
      speedRating: product.speedRating,
      ply: product.ply,
    }),
    [product],
  )

  useFrame((_, delta) => {
    if (!spinner.current || reducedMotion || !autoRotate) return
    spinner.current.rotation.y += Math.min(delta, 0.05) * 0.26
  })

  return (
    <>
      <group rotation={[Math.PI / 2, 0, 0]} scale={1.32}>
        <group ref={spinner}>
          <TruckWheel
            size={product.size}
            tread={product.tread}
            treadDepthMm={product.treadDepthMm}
            sidewall={sidewall}
          />
        </group>
      </group>

      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.5}
        scale={6}
        blur={2.4}
        far={3}
        resolution={512}
      />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={2.6}
        maxDistance={6.5}
        minPolarAngle={Math.PI * 0.18}
        maxPolarAngle={Math.PI * 0.82}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
      />
    </>
  )
}

export function ProductWheelScene(props: ProductSceneProps) {
  return (
    <Stage cameraPosition={[1.4, 0.9, 3.9]} fov={38}>
      <ProductWheelRig {...props} />
    </Stage>
  )
}

/* ------------------------------------------------------------------ *
 * Configurator scene — the Wheel Lab centrepiece
 * ------------------------------------------------------------------ */

export interface ConfiguratorSceneProps {
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
  /** 0 assembled → 1 fully exploded. */
  explode: number
  spinSpeed: number
  reducedMotion: boolean
  /** Highlights the tread when the selected axle matches the pattern. */
  glow?: number
  visibleParts?: Array<'tread' | 'carcass' | 'rim' | 'hub'>
}

function ConfiguratorRig({
  size,
  tread,
  treadDepthMm,
  sidewall,
  rimStyle,
  explode,
  spinSpeed,
  reducedMotion,
  glow = 0,
  visibleParts,
}: ConfiguratorSceneProps) {
  const spinner = useRef<THREE.Group>(null)
  const assembly = useRef<THREE.Group>(null)
  const scaleRef = useRef(1.3)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)

    // Pull back as the wheel comes apart so the whole teardown stays in frame.
    // Tracks the same target the model eases its parts towards.
    const targetScale = 1.3 - explode * 0.3
    scaleRef.current = reducedMotion
      ? targetScale
      : lerp(scaleRef.current, targetScale, dt * 4.5)
    assembly.current?.scale.setScalar(scaleRef.current)

    if (spinner.current && !reducedMotion) {
      spinner.current.rotation.y += dt * spinSpeed
    }
  })

  return (
    <>
      <group ref={assembly} rotation={[Math.PI / 2, 0, 0]} scale={1.3}>
        <group ref={spinner}>
          <TruckWheel
            size={size}
            tread={tread}
            treadDepthMm={treadDepthMm}
            sidewall={sidewall}
            rimStyle={rimStyle}
            explode={explode}
            snapExplode={reducedMotion}
            treadGlow={glow}
            parts={visibleParts}
          />
        </group>
      </group>

      <ContactShadows
        position={[0, -1.55, 0]}
        opacity={0.45}
        scale={7}
        blur={2.8}
        far={3}
        resolution={512}
      />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={2.8}
        maxDistance={7}
        minPolarAngle={Math.PI * 0.14}
        maxPolarAngle={Math.PI * 0.86}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.75}
      />
    </>
  )
}

export function ConfiguratorScene(props: ConfiguratorSceneProps) {
  return (
    <Stage cameraPosition={[1.8, 1.1, 4.2]} fov={38}>
      <ConfiguratorRig {...props} />
    </Stage>
  )
}

/* ------------------------------------------------------------------ *
 * Compact scene — small decorative wheel for cards and section breaks
 * ------------------------------------------------------------------ */

export function CompactWheelScene({
  tread,
  size = '11R22.5',
  treadDepthMm = 18,
  brand = 'Greforce',
  reducedMotion,
}: {
  tread: TreadFamily
  size?: string
  treadDepthMm?: number
  brand?: string
  reducedMotion: boolean
}) {
  return (
    <Stage cameraPosition={[0, 0.1, 3.6]} fov={34} shadows={false} maxDpr={1.5}>
      <CompactRig
        tread={tread}
        size={size}
        treadDepthMm={treadDepthMm}
        brand={brand}
        reducedMotion={reducedMotion}
      />
    </Stage>
  )
}

function CompactRig({
  tread,
  size,
  treadDepthMm,
  brand,
  reducedMotion,
}: {
  tread: TreadFamily
  size: string
  treadDepthMm: number
  brand: string
  reducedMotion: boolean
}) {
  const spinner = useRef<THREE.Group>(null)
  const spec = TREAD_SPECS[tread]

  useFrame((_, delta) => {
    if (!spinner.current || reducedMotion) return
    spinner.current.rotation.y += Math.min(delta, 0.05) * 0.4
  })

  return (
    <group rotation={[Math.PI / 2, 0, 0]} scale={1.5}>
      <group ref={spinner}>
        <TruckWheel
          size={size}
          tread={tread}
          treadDepthMm={treadDepthMm}
          density={0.6}
          sidewall={{
            brand,
            model: spec.label,
            size,
            loadIndex: '148/145',
            speedRating: 'M',
            ply: '18PR',
          }}
        />
      </group>
    </group>
  )
}
