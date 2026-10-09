import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TreadFamily } from '@/data/types'
import { lerp } from '@/lib/utils'
import {
  carcassProfile,
  treadBlocks,
  wheelProportions,
  type WheelProportions,
} from './wheelGeometry'
import {
  brushedMetal,
  carcassTexture,
  rubberRoughness,
  type SidewallSpec,
} from './wheelTextures'

export interface TruckWheelProps {
  size: string
  tread: TreadFamily
  treadDepthMm: number
  sidewall: SidewallSpec
  rimStyle?: 'alloy' | 'steel'
  /**
   * Target separation along the axle: 0 assembled, 1 fully apart. The model
   * eases towards this internally in the render loop, so the caller can treat
   * it as a plain React value without re-rendering every frame.
   */
  explode?: number
  /** Skips the easing and snaps straight to `explode`. */
  snapExplode?: boolean
  /** Tread block count multiplier — lowered on weak hardware. */
  density?: number
  /** Adds an emissive glow to the tread, used to flag the selected axle. */
  treadGlow?: number
  /** Hides the rim and hub so the teardown can stage them separately. */
  parts?: Array<'tread' | 'carcass' | 'rim' | 'hub'>
}

const ALL_PARTS: NonNullable<TruckWheelProps['parts']> = [
  'tread',
  'carcass',
  'rim',
  'hub',
]

/**
 * A commercial truck wheel built entirely from parametric geometry.
 *
 * The whole assembly is modelled with the axle along +Y, because that is the
 * axis THREE.LatheGeometry revolves around. Callers wrap it in a group rotated
 * 90° about X to stand it up facing the camera, which also means spinning the
 * wheel is just `rotation.y` on this group — no gimbal surprises.
 */
/** Axial offset of each assembly at full explosion. */
const PART_OFFSETS = {
  tread: 0.95,
  carcass: 0.32,
  rim: -0.34,
  hub: -0.95,
} as const

export function TruckWheel({
  size,
  tread,
  treadDepthMm,
  sidewall,
  rimStyle = 'alloy',
  explode = 0,
  snapExplode = false,
  density = 1,
  treadGlow = 0,
  parts = ALL_PARTS,
}: TruckWheelProps) {
  const proportions = useMemo(
    () => wheelProportions(size, treadDepthMm),
    [size, treadDepthMm],
  )

  const treadGroup = useRef<THREE.Group>(null)
  const carcassGroup = useRef<THREE.Group>(null)
  const rimGroup = useRef<THREE.Group>(null)
  const hubGroup = useRef<THREE.Group>(null)
  const current = useRef(explode)

  useFrame((_, delta) => {
    current.current = snapExplode
      ? explode
      : lerp(current.current, explode, Math.min(delta, 0.05) * 4.5)

    const value = current.current
    if (treadGroup.current) treadGroup.current.position.y = value * PART_OFFSETS.tread
    if (carcassGroup.current)
      carcassGroup.current.position.y = value * PART_OFFSETS.carcass
    if (rimGroup.current) rimGroup.current.position.y = value * PART_OFFSETS.rim
    if (hubGroup.current) hubGroup.current.position.y = value * PART_OFFSETS.hub
  })

  const show = (part: (typeof ALL_PARTS)[number]) => parts.includes(part)

  return (
    <group>
      {show('tread') && (
        <group ref={treadGroup}>
          <Tread
            tread={tread}
            proportions={proportions}
            density={density}
            glow={treadGlow}
          />
        </group>
      )}

      {show('carcass') && (
        <group ref={carcassGroup}>
          <Carcass proportions={proportions} sidewall={sidewall} />
        </group>
      )}

      {show('rim') && (
        <group ref={rimGroup}>
          <Rim proportions={proportions} style={rimStyle} />
        </group>
      )}

      {show('hub') && (
        <group ref={hubGroup}>
          <Hub proportions={proportions} style={rimStyle} />
        </group>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ *
 * Carcass — the revolved tyre body
 * ------------------------------------------------------------------ */

/**
 * The revolved tyre body, with the branded sidewall mapped straight onto it.
 *
 * The branding lives in the carcass texture rather than on separate discs
 * precisely because the sidewall is curved: a flat disc placed at the widest
 * point of the bulge would float out past the shoulder near the crown and
 * z-fight with the tread. Mapping it onto the lathe means the markings follow
 * the real profile.
 */
function Carcass({
  proportions,
  sidewall,
}: {
  proportions: WheelProportions
  sidewall: SidewallSpec
}) {
  const geometry = useMemo(() => {
    const points = carcassProfile(proportions).map(
      ([radius, axial]) => new THREE.Vector2(radius, axial),
    )
    const lathe = new THREE.LatheGeometry(points, 120)
    lathe.computeVertexNormals()
    return lathe
  }, [proportions])

  const map = useMemo(() => carcassTexture(sidewall), [sidewall])
  const roughnessMap = useMemo(() => rubberRoughness(), [])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        map={map}
        roughnessMap={roughnessMap}
        roughness={0.92}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/* ------------------------------------------------------------------ *
 * Tread — instanced blocks
 * ------------------------------------------------------------------ */

function Tread({
  tread,
  proportions,
  density,
  glow,
}: {
  tread: TreadFamily
  proportions: WheelProportions
  density: number
  glow: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const { blocks } = useMemo(
    () => treadBlocks(tread, proportions, density),
    [tread, proportions, density],
  )

  const roughnessMap = useMemo(() => rubberRoughness(), [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const skewRotation = new THREE.Matrix4()
    const scale = new THREE.Matrix4()
    const tangential = new THREE.Vector3()
    const radial = new THREE.Vector3()
    const axial = new THREE.Vector3(0, 1, 0)

    blocks.forEach((block, index) => {
      const cos = Math.cos(block.angle)
      const sin = Math.sin(block.angle)

      // Local X runs around the circumference, local Y points radially out,
      // local Z runs across the tread. Right-handed: X × Y = Z.
      tangential.set(-sin, 0, cos)
      radial.set(cos, 0, sin)

      matrix.makeBasis(tangential, radial, axial)
      matrix.setPosition(block.radius * cos, block.axial, block.radius * sin)

      // Skew turns about the block's own radial axis, angling the lug.
      skewRotation.makeRotationY(block.skew)
      scale.makeScale(block.width, block.height, block.depth)
      matrix.multiply(skewRotation).multiply(scale)

      mesh.setMatrixAt(index, matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [blocks])

  return (
    <instancedMesh
      // Instance count is fixed at construction, so a pattern change has to
      // remount the mesh rather than mutate it.
      key={blocks.length}
      ref={meshRef}
      args={[null!, null!, blocks.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#1b1c20"
        roughnessMap={roughnessMap}
        roughness={0.88}
        metalness={0.05}
        emissive="#e1632a"
        emissiveIntensity={glow}
      />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ *
 * Rim
 * ------------------------------------------------------------------ */

const RIM_FINISH = {
  alloy: { color: '#bcc2ca', metalness: 0.94, roughness: 0.24 },
  steel: { color: '#70787f', metalness: 0.82, roughness: 0.46 },
} as const

function Rim({
  proportions,
  style,
}: {
  proportions: WheelProportions
  style: 'alloy' | 'steel'
}) {
  const { rimRadius, halfWidth } = proportions
  const finish = RIM_FINISH[style]
  const roughnessMap = useMemo(() => brushedMetal(), [])

  const barrelWidth = halfWidth * 1.9
  const faceOffset = halfWidth * 0.62

  // Six spokes reaching from the hub boss out to the barrel.
  const spokes = useMemo(() => {
    const count = 6
    return Array.from({ length: count }, (_, i) => (i * Math.PI * 2) / count)
  }, [])

  const spokeInner = rimRadius * 0.34
  const spokeOuter = rimRadius * 0.96
  const spokeLength = spokeOuter - spokeInner

  return (
    <group>
      {/* Barrel — open-ended so you can see through the wheel. */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry
          args={[rimRadius, rimRadius, barrelWidth, 72, 1, true]}
        />
        <meshStandardMaterial
          {...finish}
          roughnessMap={roughnessMap}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Bead flanges at each end. */}
      {[-1, 1].map((sign) => (
        <mesh
          key={sign}
          position={[0, (sign * barrelWidth) / 2, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <torusGeometry args={[rimRadius * 1.005, rimRadius * 0.035, 12, 72]} />
          <meshStandardMaterial {...finish} roughnessMap={roughnessMap} />
        </mesh>
      ))}

      {/* Spoked face, set inboard of the outer flange. */}
      <group position={[0, faceOffset, 0]}>
        {spokes.map((angle) => (
          <group key={angle} rotation={[0, -angle, 0]}>
            <mesh
              position={[spokeInner + spokeLength / 2, 0, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={[spokeLength, rimRadius * 0.14, rimRadius * 0.3]}
              />
              <meshStandardMaterial {...finish} roughnessMap={roughnessMap} />
            </mesh>
          </group>
        ))}

        {/* Outer ring tying the spokes into the barrel. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[rimRadius * 0.93, rimRadius * 0.055, 12, 72]} />
          <meshStandardMaterial {...finish} roughnessMap={roughnessMap} />
        </mesh>
      </group>

      {/* Valve stem — small, but its absence is the kind of thing you notice. */}
      <group rotation={[0, 0.6, 0]}>
        <mesh
          position={[rimRadius * 0.86, barrelWidth * 0.42, 0]}
          rotation={[0, 0, -0.35]}
          castShadow
        >
          <cylinderGeometry
            args={[rimRadius * 0.028, rimRadius * 0.034, rimRadius * 0.2, 12]}
          />
          <meshStandardMaterial color="#2b2e33" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ *
 * Hub & studs
 * ------------------------------------------------------------------ */

function Hub({
  proportions,
  style,
}: {
  proportions: WheelProportions
  style: 'alloy' | 'steel'
}) {
  const { rimRadius, halfWidth } = proportions
  const finish = RIM_FINISH[style]

  const hubRadius = rimRadius * 0.36
  const faceOffset = halfWidth * 0.62
  const studRadius = rimRadius * 0.23

  // Ten studs is the standard Australian heavy-vehicle pattern.
  const studs = useMemo(
    () => Array.from({ length: 10 }, (_, i) => (i * Math.PI * 2) / 10),
    [],
  )

  return (
    <group position={[0, faceOffset, 0]}>
      {/* Hub boss. */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry
          args={[hubRadius, hubRadius * 1.08, rimRadius * 0.22, 48]}
        />
        <meshStandardMaterial {...finish} />
      </mesh>

      {/* Machined centre cap. */}
      <mesh position={[0, rimRadius * 0.12, 0]}>
        <cylinderGeometry
          args={[hubRadius * 0.52, hubRadius * 0.58, rimRadius * 0.06, 32]}
        />
        <meshStandardMaterial color="#1f2125" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Wheel nuts — hex heads, so six radial segments. */}
      {studs.map((angle) => (
        <mesh
          key={angle}
          position={[
            Math.cos(angle) * studRadius,
            rimRadius * 0.13,
            Math.sin(angle) * studRadius,
          ]}
          rotation={[0, angle, 0]}
          castShadow
        >
          <cylinderGeometry
            args={[rimRadius * 0.055, rimRadius * 0.055, rimRadius * 0.08, 6]}
          />
          <meshStandardMaterial color="#9aa1a9" metalness={0.9} roughness={0.32} />
        </mesh>
      ))}
    </group>
  )
}
