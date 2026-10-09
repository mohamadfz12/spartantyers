import * as THREE from 'three'
import { SIDEWALL_BANDS } from './wheelGeometry'

/**
 * Every texture the wheel uses is drawn at runtime on a 2D canvas.
 *
 * That is deliberate: it means the 3D wheel has no binary asset dependency at
 * all (no .glb, no .hdr, no texture files), it survives any CDN outage, it adds
 * nothing to the bundle, and — most usefully — the sidewall can be stamped with
 * the actual brand, size and load index of the product being viewed.
 */

const textureCache = new Map<string, THREE.Texture>()

function cached(key: string, build: () => THREE.Texture): THREE.Texture {
  const hit = textureCache.get(key)
  if (hit) return hit
  const texture = build()
  textureCache.set(key, texture)
  return texture
}

/** Disposes every cached texture. Called when the 3D experience unmounts. */
export function disposeWheelTextures() {
  textureCache.forEach((texture) => texture.dispose())
  textureCache.clear()
}

function makeCanvas(size: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return { canvas, ctx }
}

/* ------------------------------------------------------------------ *
 * Carcass / sidewall
 * ------------------------------------------------------------------ */

export interface SidewallSpec {
  brand: string
  size: string
  loadIndex: string
  speedRating: string
  ply: string
  model: string
}

/** How many times the brand name repeats around the circumference. */
const BRAND_REPEATS = 3

/**
 * Renders one sidewall band to its own canvas: moulding rings, the brand name
 * repeated around the circumference, the size code, and the service
 * description a real casing carries.
 *
 * The band is drawn once and then blitted into the carcass texture twice —
 * mirrored vertically for the second sidewall, because `v` runs bead→shoulder
 * on one side and shoulder→bead on the other.
 *
 * Local y runs 0 (shoulder) → height (bead).
 */
function renderSidewallBand(
  width: number,
  height: number,
  spec: SidewallSpec,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  // Base rubber, lightest mid-band where the sidewall bulges towards the light.
  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, '#101114')
  base.addColorStop(0.35, '#1a1c21')
  base.addColorStop(0.75, '#141519')
  base.addColorStop(1, '#0b0c0e')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  /** Horizontal rule at a fraction of the band height — a concentric ring in 3D. */
  const ring = (at: number, colour: string, thickness: number) => {
    ctx.fillStyle = colour
    ctx.fillRect(0, Math.round(at * height), width, thickness)
  }

  ring(0.02, '#272a30', 3)
  ring(0.08, '#07080a', 5)
  ring(0.12, '#23252b', 2)
  ring(0.9, '#23252b', 2)
  ring(0.94, '#07080a', 6)
  ring(0.985, '#2a2c33', 3)

  // Fine radial knurling near the bead; catches the specular as it turns.
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 2
  const knurlStep = width / 240
  for (let x = 0; x < width; x += knurlStep) {
    ctx.beginPath()
    ctx.moveTo(x, height * 0.8)
    ctx.lineTo(x, height * 0.88)
    ctx.stroke()
  }

  const slot = width / BRAND_REPEATS

  for (let i = 0; i < BRAND_REPEATS; i++) {
    const cx = slot * (i + 0.5)

    // Brand name, moulded proud. The dark pass offset by a pixel fakes the
    // relief of a raised letter.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${Math.round(height * 0.3)}px Montserrat, "Arial Black", sans-serif`
    ctx.letterSpacing = `${Math.round(height * 0.05)}px`

    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.fillText(spec.brand.toUpperCase(), cx, height * 0.34 + 3)
    ctx.fillStyle = '#d9dbdf'
    ctx.fillText(spec.brand.toUpperCase(), cx, height * 0.34)

    // Size code — the single most important marking on a commercial casing.
    ctx.font = `700 ${Math.round(height * 0.15)}px Montserrat, Arial, sans-serif`
    ctx.letterSpacing = `${Math.round(height * 0.02)}px`
    ctx.fillStyle = '#9aa0a8'
    ctx.fillText(spec.size, cx, height * 0.56)

    // Service description, ply rating and pattern designation.
    ctx.font = `600 ${Math.round(height * 0.1)}px Montserrat, Arial, sans-serif`
    ctx.fillStyle = '#7c828a'
    ctx.fillText(
      `${spec.loadIndex}${spec.speedRating}   ${spec.ply}`,
      cx,
      height * 0.7,
    )

    ctx.font = `600 ${Math.round(height * 0.085)}px Montserrat, Arial, sans-serif`
    ctx.fillStyle = '#656b73'
    ctx.fillText(
      `${spec.model.toUpperCase()}  ·  TUBELESS RADIAL`,
      cx,
      height * 0.82,
    )
  }

  ctx.letterSpacing = '0px'
  return canvas
}

/**
 * The full carcass texture, mapped straight onto the lathe.
 *
 * `v` runs bead → sidewall → shoulder → crown → shoulder → sidewall → bead, so
 * the branding bands are placed at the exact `v` ranges `SIDEWALL_BANDS`
 * reports from the geometry. Drawing it this way — rather than floating a
 * separate branded disc over each side — means the markings follow the real
 * curvature of the sidewall and can never poke out past the shoulder.
 *
 * `u` runs around the circumference, so text drawn horizontally reads
 * tangentially, exactly as it is moulded on a real tyre.
 */
export function carcassTexture(spec: SidewallSpec): THREE.Texture {
  const key = `carcass:${spec.brand}|${spec.model}|${spec.size}|${spec.loadIndex}|${spec.speedRating}|${spec.ply}`

  return cached(key, () => {
    const W = 2048
    const H = 1024

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')

    // Everything that is not a branding band: bead heel, shoulder and the
    // crown (which the tread blocks sit on top of anyway).
    ctx.fillStyle = '#0d0e11'
    ctx.fillRect(0, 0, W, H)

    // CanvasTexture flips Y, so v = 0 is the BOTTOM of the canvas.
    const yFromV = (v: number) => (1 - v) * H

    const bands = [SIDEWALL_BANDS.first, SIDEWALL_BANDS.second] as const
    const bandHeight = Math.round(
      Math.abs(yFromV(bands[0][1]) - yFromV(bands[0][0])),
    )

    const band = renderSidewallBand(W, bandHeight, spec)

    bands.forEach((range, index) => {
      // Canvas y of the band's two edges; v increases upward in canvas space.
      const yHigh = yFromV(range[1])
      const top = Math.round(yHigh)

      ctx.save()
      ctx.translate(0, top)

      if (index === 1) {
        // The second sidewall runs shoulder→bead as v increases, the opposite
        // of the first — so flip it to keep the branding at the same radius.
        // Mirroring horizontally too means it reads correctly from this side.
        ctx.translate(W, bandHeight)
        ctx.scale(-1, -1)
      }

      ctx.drawImage(band, 0, 0)
      ctx.restore()
    })

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.anisotropy = 4
    return texture
  })
}

/* ------------------------------------------------------------------ *
 * Rubber surface detail
 * ------------------------------------------------------------------ */

/** Fine-grain rubber roughness map, tiled over the carcass and tread blocks. */
export function rubberRoughness(): THREE.Texture {
  return cached('rubber-roughness', () => {
    const SIZE = 256
    const { canvas, ctx } = makeCanvas(SIZE)

    ctx.fillStyle = '#b4b4b4'
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Speckle gives the rubber a cast, slightly matte read under the key light.
    const image = ctx.getImageData(0, 0, SIZE, SIZE)
    const { data } = image
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 46
      data[i] = Math.max(0, Math.min(255, data[i] + n))
      data[i + 1] = data[i]
      data[i + 2] = data[i]
    }
    ctx.putImageData(image, 0, 0)

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(6, 6)
    return texture
  })
}

/** Brushed-metal roughness for the rim face. */
export function brushedMetal(): THREE.Texture {
  return cached('brushed-metal', () => {
    const SIZE = 512
    const C = SIZE / 2
    const { canvas, ctx } = makeCanvas(SIZE)

    ctx.fillStyle = '#4a4a4a'
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Concentric brushing, the way a machined alloy face is finished.
    for (let r = 4; r < C; r += 2) {
      ctx.beginPath()
      ctx.arc(C, C, r, 0, Math.PI * 2)
      const shade = 58 + Math.random() * 34
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`
      ctx.lineWidth = 1 + Math.random()
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    return texture
  })
}

/* ------------------------------------------------------------------ *
 * Backdrop
 * ------------------------------------------------------------------ */

/**
 * A procedural equirectangular environment map.
 *
 * Polished alloy looks dead without something to reflect. Rather than fetch an
 * HDRI, this paints a two-softbox studio — a broad key strip above the horizon
 * and a narrower fill opposite — which is all the rim needs to pick up a
 * convincing highlight streak as it turns. Costs one 512x256 canvas.
 */
export function studioEnvironment(): THREE.Texture {
  return cached('studio-env', () => {
    const W = 512
    const H = 256
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')

    // Dark surround with a slightly brighter sky dome.
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#4a4f58')
    sky.addColorStop(0.42, '#21242a')
    sky.addColorStop(0.5, '#15171b')
    sky.addColorStop(1, '#090a0c')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)

    const softbox = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      intensity: number,
    ) => {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx)
      gradient.addColorStop(0, `rgba(255,255,255,${intensity})`)
      gradient.addColorStop(0.5, `rgba(255,255,255,${intensity * 0.35})`)
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.save()
      ctx.translate(cx, cy)
      ctx.scale(1, ry / rx)
      ctx.translate(-cx, -cy)
      ctx.fillStyle = gradient
      ctx.fillRect(cx - rx, cy - rx, rx * 2, rx * 2)
      ctx.restore()
    }

    // Key light, front-left and above.
    softbox(W * 0.3, H * 0.26, W * 0.26, H * 0.2, 1)
    // Fill, opposite side and lower.
    softbox(W * 0.78, H * 0.36, W * 0.16, H * 0.14, 0.45)
    // A warm kicker in the brand orange, so the chrome picks up the palette.
    const warm = ctx.createRadialGradient(W * 0.55, H * 0.6, 0, W * 0.55, H * 0.6, W * 0.2)
    warm.addColorStop(0, 'rgba(225,99,42,0.5)')
    warm.addColorStop(1, 'rgba(225,99,42,0)')
    ctx.fillStyle = warm
    ctx.fillRect(0, 0, W, H)

    const texture = new THREE.CanvasTexture(canvas)
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  })
}

/**
 * Vertical gradient used as the scene background. Cheaper and more controllable
 * than loading an HDRI, and it never depends on a remote asset.
 */
export function backdropTexture(top: string, bottom: string): THREE.Texture {
  return cached(`backdrop:${top}:${bottom}`, () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')

    const gradient = ctx.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, top)
    gradient.addColorStop(1, bottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 2, 256)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  })
}
