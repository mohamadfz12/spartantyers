import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from 'framer-motion'
import {
  Children,
  useEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from 'react'
import {
  useCountUp,
  useInViewOnce,
  useMediaQuery,
  useReducedMotion,
} from '@/hooks'
import { cn, formatNumber } from '@/lib/utils'

/**
 * The site's motion vocabulary.
 *
 * Every component here checks `useReducedMotion()` and collapses to a plain,
 * fully-visible, non-animated render when motion is not wanted — so the page
 * is never left mid-transition or invisible for someone who opted out.
 */

/* ------------------------------------------------------------------ *
 * Reveal
 * ------------------------------------------------------------------ */

type Direction = 'up' | 'down' | 'left' | 'right' | 'scale' | 'none'

const OFFSETS: Record<Direction, { x: number; y: number; scale: number }> = {
  up: { x: 0, y: 36, scale: 1 },
  down: { x: 0, y: -36, scale: 1 },
  left: { x: 40, y: 0, scale: 1 },
  right: { x: -40, y: 0, scale: 1 },
  scale: { x: 0, y: 14, scale: 0.94 },
  none: { x: 0, y: 0, scale: 1 },
}

export interface RevealProps {
  children: ReactNode
  direction?: Direction
  delay?: number
  duration?: number
  className?: string
  as?: ElementType
  /** Re-animate every time it scrolls into view rather than only the first. */
  repeat?: boolean
}

export function Reveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  className,
  as = 'div',
  repeat = false,
}: RevealProps) {
  const reduced = useReducedMotion()
  const wide = useMediaQuery('(min-width: 768px)')

  /*
   * Horizontal reveals slide in from 40px off-axis, which on a narrow screen
   * is 40px of horizontal overflow for as long as the element is waiting to
   * animate. That widens the layout viewport on mobile, which widens every
   * fixed overlay, which pushes the nav drawer off the edge of the screen.
   *
   * Containing it with `overflow` is not an option — any overflow value on an
   * ancestor kills `position: sticky`. So below the breakpoint, sideways
   * reveals simply become vertical ones. At that width the two read almost
   * identically anyway.
   */
  const resolved =
    !wide && (direction === 'left' || direction === 'right') ? 'up' : direction

  const offset = OFFSETS[resolved]
  const Component = motion[as as 'div'] ?? motion.div

  if (reduced) {
    const Plain = as as ElementType
    return <Plain className={className}>{children}</Plain>
  }

  return (
    <Component
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      viewport={{ once: !repeat, margin: '-70px' }}
      transition={{ duration, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </Component>
  )
}

/* ------------------------------------------------------------------ *
 * Stagger
 * ------------------------------------------------------------------ */

const STAGGER_PARENT: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}

const STAGGER_CHILD: Variants = {
  hidden: { opacity: 0, y: 28 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

/** Wraps a list so each direct child arrives in sequence. */
export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: ReactNode
  className?: string
  gap?: number
}) {
  const reduced = useReducedMotion()

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      variants={{
        ...STAGGER_PARENT,
        shown: { transition: { staggerChildren: gap, delayChildren: 0.05 } },
      }}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '-70px' }}
    >
      {Children.map(children, (child, index) => (
        <motion.div key={index} variants={STAGGER_CHILD}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ *
 * Parallax
 * ------------------------------------------------------------------ */

/** Moves its children against the scroll as the section passes the viewport. */
export function Parallax({
  children,
  speed = 0.25,
  className,
}: {
  children: ReactNode
  speed?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', `${speed * 100}%`])

  return (
    <div ref={ref} className={className}>
      {reduced ? children : <motion.div style={{ y }}>{children}</motion.div>}
    </div>
  )
}

/**
 * Exposes a section's own scroll progress as a MotionValue, for callers that
 * want to drive several properties from one pass.
 */
export function useSectionProgress<T extends HTMLElement>(
  offset: [string, string] = ['start end', 'end start'],
) {
  const ref = useRef<T>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    // framer-motion's offset tuple type is narrower than its runtime support.
    offset: offset as never,
  })
  return { ref, progress: scrollYProgress as MotionValue<number> }
}

/* ------------------------------------------------------------------ *
 * Magnetic
 * ------------------------------------------------------------------ */

/**
 * Pulls towards the cursor on hover. Applied to primary calls to action, where
 * the extra millimetre of movement makes the target feel eager.
 */
export function Magnetic({
  children,
  strength = 0.3,
  className,
}: {
  children: ReactNode
  strength?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 220, damping: 18, mass: 0.4 })
  const springY = useSpring(y, { stiffness: 220, damping: 18, mass: 0.4 })

  useEffect(() => {
    if (reduced) return
    const node = ref.current
    if (!node) return

    const onMove = (event: PointerEvent) => {
      // Ignore touch — there is no hover to respond to.
      if (event.pointerType === 'touch') return
      const rect = node.getBoundingClientRect()
      x.set((event.clientX - (rect.left + rect.width / 2)) * strength)
      y.set((event.clientY - (rect.top + rect.height / 2)) * strength)
    }
    const onLeave = () => {
      x.set(0)
      y.set(0)
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [reduced, strength, x, y])

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div ref={ref} className={className} style={{ x: springX, y: springY }}>
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ *
 * Tilt
 * ------------------------------------------------------------------ */

/** 3D card tilt following the pointer, with a specular sheen that tracks it. */
export function Tilt({
  children,
  className,
  max = 9,
  sheen = true,
}: {
  children: ReactNode
  className?: string
  max?: number
  sheen?: boolean
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  const rotateX = useSpring(useTransform(py, [-1, 1], [max, -max]), {
    stiffness: 180,
    damping: 20,
  })
  const rotateY = useSpring(useTransform(px, [-1, 1], [-max, max]), {
    stiffness: 180,
    damping: 20,
  })
  const sheenX = useTransform(px, [-1, 1], ['0%', '100%'])
  const sheenY = useTransform(py, [-1, 1], ['0%', '100%'])

  useEffect(() => {
    if (reduced) return
    const node = ref.current
    if (!node) return

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = node.getBoundingClientRect()
      px.set(((event.clientX - rect.left) / rect.width) * 2 - 1)
      py.set(((event.clientY - rect.top) / rect.height) * 2 - 1)
    }
    const onLeave = () => {
      px.set(0)
      py.set(0)
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    }
  }, [reduced, px, py])

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      ref={ref}
      className={cn('relative [transform-style:preserve-3d]', className)}
      style={{ rotateX, rotateY, perspective: 900 }}
    >
      {children}
      {sheen ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [background:radial-gradient(240px_circle_at_var(--sx)_var(--sy),rgba(255,255,255,0.14),transparent_70%)] group-hover:opacity-100"
          style={{ '--sx': sheenX, '--sy': sheenY } as unknown as CSSProperties}
        />
      ) : null}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ *
 * Text effects
 * ------------------------------------------------------------------ */

/**
 * Animates a heading in word by word, each word rising out of a clipping mask.
 *
 * The trigger deliberately watches the OUTER element rather than using
 * `whileInView` on the words themselves. Each word starts translated fully
 * below its `overflow-hidden` wrapper, and IntersectionObserver accounts for
 * clipping by an ancestor — so an observer on the word would report it as
 * never visible, the animation would never start, and the heading would stay
 * permanently blank. Observing the unclipped parent breaks that deadlock.
 */
export function SplitText({
  text,
  className,
  wordClassName,
  delay = 0,
  as: Tag = 'span',
}: {
  text: string
  className?: string
  wordClassName?: string
  delay?: number
  as?: ElementType
}) {
  const reduced = useReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLElement>('-40px')
  const words = text.split(' ')

  if (reduced) return <Tag className={className}>{text}</Tag>

  return (
    <Tag ref={ref} className={className}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="inline-block overflow-hidden align-bottom"
        >
          <motion.span
            className={cn('inline-block', wordClassName)}
            initial={{ y: '110%' }}
            animate={inView ? { y: '0%' } : { y: '110%' }}
            transition={{
              duration: 0.62,
              delay: delay + index * 0.055,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  )
}

/* ------------------------------------------------------------------ *
 * Counter
 * ------------------------------------------------------------------ */

/** Counts up once on entering view. Used for the stat strip. */
export function Counter({
  value,
  suffix = '',
  prefix = '',
  decimals = 0,
  className,
  duration = 1700,
}: {
  value: number
  suffix?: string
  prefix?: string
  decimals?: number
  className?: string
  duration?: number
}) {
  const { ref, inView } = useInViewOnce<HTMLSpanElement>('-60px')
  const current = useCountUp(value, duration, inView)

  const display =
    decimals > 0 ? current.toFixed(decimals) : formatNumber(Math.round(current))

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Marquee
 * ------------------------------------------------------------------ */

/**
 * Infinite horizontal ticker. The content is rendered twice and translated by
 * exactly −50%, which is what makes the loop seamless.
 */
export function Marquee({
  children,
  speed = 'normal',
  className,
  pauseOnHover = true,
  reverse = false,
}: {
  children: ReactNode
  speed?: 'normal' | 'slow'
  className?: string
  pauseOnHover?: boolean
  reverse?: boolean
}) {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <div className={cn('flex gap-10 overflow-x-auto no-scrollbar', className)}>
        {children}
      </div>
    )
  }

  return (
    <div className={cn('mask-fade-x overflow-hidden', className)}>
      <div
        className={cn(
          'flex w-max',
          speed === 'slow' ? 'animate-marquee-slow' : 'animate-marquee',
          pauseOnHover && 'hover:[animation-play-state:paused]',
          reverse && '[animation-direction:reverse]',
        )}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Scroll progress bar
 * ------------------------------------------------------------------ */

/** Thin reading-progress bar pinned under the header. */
export function ScrollProgressBar({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 320, damping: 40 })

  return (
    <motion.div
      aria-hidden
      className={cn(
        'fixed left-0 top-0 z-[60] h-[3px] w-full origin-left bg-gradient-to-r from-primary via-ember-400 to-primary',
        className,
      )}
      style={{ scaleX }}
    />
  )
}

export { motion, AnimatePresence } from 'framer-motion'
