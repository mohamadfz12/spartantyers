import { useEffect, useState } from 'react'
import { callLevels, useCall } from '@/store/call'

/**
 * The voice call's orb: it breathes, and swells with the voices, Spartan orange while the customer
 * talks and a cool steel blue while the assistant does. It dims while the call connects, and a
 * spinner arc runs round it while the call connects or the assistant is working something out.
 * Under reduced motion it is a still orb: no wobble, no rings, and a still ring instead of the
 * spinner. The voice levels and the call's state are read on every frame, so the orb never waits
 * for React. The glow fades out inside the canvas, so its edge never shows as a square.
 */
export function CallOrb({ size, mini = false }: { size: number; mini?: boolean }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const c = canvas
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.setAttribute('width', String(size * dpr))
    c.setAttribute('height', String(size * dpr))
    ctx.scale(dpr, dpr)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let raf = 0
    let mic = 0
    let out = 0
    /** 0: the customer's colour (orange), 1: the assistant's (steel blue). */
    let hue = 1
    const draw = (now: number) => {
      // Reduced motion: time stands still, so the orb is a calm, fixed shape.
      const t = still ? 0 : now / 1000
      const lv = callLevels()
      const v = useCall.getState().view
      const live = v?.phase === 'live'
      const busy = !!v && (v.phase === 'starting' || v.phase === 'connecting' || (live && (v.tool || v.talk === 'thinking')))
      mic += ((v?.muted ? 0 : lv.mic) - mic) * 0.25
      out += (lv.out - out) * 0.3
      const assistant = out > 0.02
      // A practice call has no microphone: the typed words, while they are being taken in, stand for it.
      const customer = mic > 0.06 || (!!v?.practice && v.lines.some((l) => l.who === 'you' && l.live))
      hue += ((assistant ? 1 : customer ? 0 : hue > 0.5 ? 1 : 0) - hue) * 0.06
      const energy = Math.min(1, Math.max(mic, out) * 1.6)
      const cx = size / 2
      const cy = size / 2
      const base = size * (mini ? 0.3 : 0.27)
      ctx.clearRect(0, 0, size, size)

      // Colours: Spartan orange (the customer) to steel blue (the assistant).
      const mix = (a: number[], b: number[]) => a.map((x, i) => Math.round(x + (b[i] - x) * hue))
      const [r1, g1, b1] = mix([254, 112, 55], [129, 170, 214])
      const [r2, g2, b2] = mix([175, 52, 9], [52, 88, 138])
      const dim = live ? 1 : 0.55

      const halo = ctx.createRadialGradient(cx, cy, base * 0.4, cx, cy, Math.min(size / 2, base * (1.9 + energy * 0.5)))
      halo.addColorStop(0, `rgba(${r1},${g1},${b1},${0.33 * dim})`)
      halo.addColorStop(1, `rgba(${r1},${g1},${b1},0)`)
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, size, size)

      // The wobbling blob.
      const amp = still ? 0.02 : 0.035 + energy * 0.22 + (busy ? 0.03 : 0)
      ctx.beginPath()
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2
        const n = Math.sin(a * 3 + t * 2.1) * 0.5 + Math.sin(a * 5 - t * 1.7) * 0.3 + Math.sin(a * 2 + t * 0.9) * 0.2
        const r = base * (1 + n * amp + (still ? 0 : Math.sin(t * 1.6) * 0.015))
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      const fill = ctx.createRadialGradient(cx - base * 0.35, cy - base * 0.4, base * 0.1, cx, cy, base * 1.2)
      fill.addColorStop(0, `rgba(255,255,255,${0.85 * dim})`)
      fill.addColorStop(0.25, `rgba(${r1},${g1},${b1},${dim})`)
      fill.addColorStop(1, `rgba(${r2},${g2},${b2},${dim})`)
      ctx.fillStyle = fill
      ctx.fill()

      // Rings pulsing out while someone talks (not under reduced motion).
      if (!mini && !still) {
        ctx.lineWidth = 1.5
        for (let k = 0; k < 2; k++) {
          const p = (t * 0.5 + k * 0.5) % 1
          ctx.strokeStyle = `rgba(${r1},${g1},${b1},${(1 - p) * 0.35 * (0.4 + energy)})`
          ctx.beginPath()
          ctx.arc(cx, cy, base * (1.05 + p * 0.7), 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // The spinner while connecting or working something out.
      if (busy) {
        ctx.lineWidth = mini ? 2.5 : 3.5
        ctx.lineCap = 'round'
        ctx.strokeStyle = live ? `rgba(${r1},${g1},${b1},0.9)` : 'rgba(150,150,150,0.85)'
        ctx.beginPath()
        if (still) {
          // A still ring says "working" without moving.
          ctx.globalAlpha = 0.45
          ctx.arc(cx, cy, base * 1.22, 0, Math.PI * 2)
        } else {
          const s0 = t * 3.2
          ctx.arc(cx, cy, base * 1.22, s0, s0 + Math.PI * 0.6)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [canvas, size, mini])

  return <canvas ref={setCanvas} aria-hidden="true" style={{ width: size, height: size, display: 'block' }} />
}
