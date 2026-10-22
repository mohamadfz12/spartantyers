import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/** SSR-safe layout effect. */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/* ------------------------------------------------------------------ */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * True when the visitor has asked for reduced motion. Every animation in the
 * app checks this and degrades to an instant state change.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}

export function useIsTouch(): boolean {
  return useMediaQuery('(hover: none) and (pointer: coarse)')
}

/* ------------------------------------------------------------------ */

/**
 * Document scroll progress, 0 at the top and 1 at the bottom. Also mirrored
 * onto `--scroll-progress` so pure-CSS effects can read it.
 */
export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight
      const next = scrollable > 0 ? window.scrollY / scrollable : 0
      setProgress(next)
      document.documentElement.style.setProperty(
        '--scroll-progress',
        next.toFixed(4),
      )
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return progress
}

/** Raw window.scrollY, rAF-throttled. */
export function useScrollY(): number {
  const [y, setY] = useState(0)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setY(window.scrollY)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return y
}

/** `true` once the page has scrolled past `offset` — used to condense the header. */
export function useScrolledPast(offset = 24): boolean {
  const [past, setPast] = useState(false)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setPast(window.scrollY > offset)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [offset])

  return past
}

/** Scroll direction, latched so tiny jitters don't flip it. */
export function useScrollDirection(threshold = 8): 'up' | 'down' {
  const [direction, setDirection] = useState<'up' | 'down'>('up')
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = window.scrollY
    let frame = 0

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        if (Math.abs(y - lastY.current) < threshold) return
        setDirection(y > lastY.current ? 'down' : 'up')
        lastY.current = y
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [threshold])

  return direction
}

/* ------------------------------------------------------------------ */

/**
 * Progress of an element through the viewport: 0 as its top enters the bottom
 * of the viewport, 1 as its bottom leaves the top. The backbone of every
 * scroll-linked effect on the site.
 */
export function useElementScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    let frame = 0
    const update = () => {
      frame = 0
      const rect = node.getBoundingClientRect()
      const total = window.innerHeight + rect.height
      const travelled = window.innerHeight - rect.top
      setProgress(Math.min(Math.max(travelled / total, 0), 1))
    }

    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return { ref, progress }
}

/** Fires once when the element first enters the viewport. */
export function useInViewOnce<T extends HTMLElement>(margin = '-80px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || inView) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [inView, margin])

  return { ref, inView }
}

/* ------------------------------------------------------------------ */

/** Normalised −1..1 pointer position within an element, for tilt/magnet effects. */
export function usePointerWithin<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0, active: false })

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      setPointer({
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
        active: true,
      })
    }
    const onLeave = () => setPointer({ x: 0, y: 0, active: false })

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return { ref, pointer }
}

/** Normalised −1..1 pointer position across the whole window. */
export function useWindowPointer(enabled = true) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const onMove = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setPointer({
          x: (event.clientX / window.innerWidth) * 2 - 1,
          y: (event.clientY / window.innerHeight) * 2 - 1,
        })
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [enabled])

  return pointer
}

/* ------------------------------------------------------------------ */

/** Counts from 0 to `target` with an ease-out curve once triggered. */
export function useCountUp(target: number, duration = 1600, start = false) {
  const [value, setValue] = useState(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!start) return
    if (reduced) {
      setValue(target)
      return
    }

    let frame = 0
    const began = performance.now()

    const tick = (now: number) => {
      const t = Math.min((now - began) / duration, 1)
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setValue(target * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, start, reduced])

  return value
}

/* ------------------------------------------------------------------ */

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* quota or private mode — non-fatal */
    }
  }, [key, value])

  return [value, setValue] as const
}

/**
 * Widest a classic scrollbar is ever reported. Chrome/Edge are 15–17px,
 * Firefox up to ~20px.
 */
const MAX_SCROLLBAR_WIDTH = 24

/**
 * Locks body scroll while `locked`, compensating for the scrollbar it removes
 * so the page underneath does not visibly jump sideways.
 *
 * `innerWidth - clientWidth` is the usual way to measure that gutter, but it is
 * only a scrollbar when it is scrollbar-sized. Under mobile emulation, browser
 * zoom, or any environment where the visual and layout viewports disagree, the
 * difference can be tens of pixels — and padding the body by that much shoves
 * the whole fixed overlay off the side of the screen. So the value is sanity
 * checked before it is trusted.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const { overflow, paddingRight } = document.body.style
    const root = document.documentElement

    const gutter = window.innerWidth - root.clientWidth
    const scrollbarPresent = root.scrollHeight > root.clientHeight
    const plausible = gutter > 0 && gutter <= MAX_SCROLLBAR_WIDTH

    document.body.style.overflow = 'hidden'
    if (scrollbarPresent && plausible) {
      // Add to whatever padding the page already has rather than replacing it.
      const existing = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight || '0',
      )
      document.body.style.paddingRight = `${existing + gutter}px`
    }

    return () => {
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
    }
  }, [locked])
}

export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return
    const onPointerDown = (event: PointerEvent) => {
      const node = ref.current
      if (!node || node.contains(event.target as Node)) return
      handler()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [ref, handler, enabled])
}

export function useEscapeKey(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [handler, enabled])
}

/** Copy-to-clipboard with a transient `copied` flag. */
export function useCopyToClipboard(resetAfter = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), resetAfter)
        return true
      } catch {
        return false
      }
    },
    [resetAfter],
  )

  return { copied, copy }
}

/** Tracks an element's size via ResizeObserver. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect
      setSize({ width: box.width, height: box.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

/** Returns true after the first paint — lets us defer heavy 3D work. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

/**
 * The part of the screen the customer can see, while `active`. On iPhones the on-screen keyboard
 * covers the page without resizing it, so a full-screen sheet is sized to this instead. Null when
 * it is the same as the page (no keyboard), so the sheet's own CSS applies.
 */
export function useVisibleViewport(active: boolean): { height: number; top: number } | null {
  const [visible, setVisible] = useState<{ height: number; top: number } | null>(null)
  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null
    if (!active || !viewport) return
    const update = () => {
      const same = Math.abs(viewport.height - window.innerHeight) < 2 && viewport.offsetTop < 1
      setVisible((old) => {
        if (same) return old === null ? old : null
        const next = { height: Math.round(viewport.height), top: Math.round(viewport.offsetTop) }
        return old && old.height === next.height && old.top === next.top ? old : next
      })
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      setVisible(null)
    }
  }, [active])
  return visible
}
