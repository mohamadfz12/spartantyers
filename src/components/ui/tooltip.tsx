import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useIsTouch, useOnClickOutside, useReducedMotion } from '@/hooks'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Positioned purely with CSS transforms relative to the wrapper — no
 * positioning library in the bundle. Good enough for inline affordances;
 * if a tooltip would clip, choose a different `side` at the call site.
 */
const PLACEMENT: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 pb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 pt-2',
  left: 'right-full top-1/2 -translate-y-1/2 pr-2',
  right: 'left-full top-1/2 -translate-y-1/2 pl-2',
}

const ENTER_OFFSET: Record<TooltipSide, { x: number; y: number }> = {
  top: { x: 0, y: 4 },
  bottom: { x: 0, y: -4 },
  left: { x: 4, y: 0 },
  right: { x: -4, y: 0 },
}

export interface TooltipProps {
  content: React.ReactNode
  side?: TooltipSide
  /** Delay in ms before showing on hover. Focus and tap always show instantly. */
  delay?: number
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

export function Tooltip({
  content,
  side = 'top',
  delay = 120,
  className,
  contentClassName,
  children,
}: TooltipProps) {
  const uid = useId()
  const tooltipId = `tooltip-${uid}`
  const reduced = useReducedMotion()
  const isTouch = useIsTouch()

  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [])

  const show = useCallback(
    (immediate = false) => {
      clearTimer()
      if (immediate || delay <= 0) {
        setOpen(true)
        return
      }
      timer.current = setTimeout(() => setOpen(true), delay)
    },
    [clearTimer, delay],
  )

  const hide = useCallback(() => {
    clearTimer()
    setOpen(false)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  // Escape closes even while the trigger keeps focus.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, hide])

  // On touch there is no hover, so a tap toggles — and a tap elsewhere closes.
  useOnClickOutside(wrapperRef, hide, isTouch && open)

  const pointerHandlers = isTouch
    ? {
        onClick: () => (open ? hide() : show(true)),
      }
    : {
        onPointerEnter: () => show(),
        onPointerLeave: hide,
      }

  return (
    <span
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
      // Focus must reveal it too — keyboard users get the same information.
      onFocusCapture={() => show(true)}
      onBlurCapture={hide}
      {...pointerHandlers}
    >
      {/* The described element is the trigger subtree. */}
      <span aria-describedby={open ? tooltipId : undefined} className="inline-flex">
        {children}
      </span>

      {/*
        Two layers on purpose: the outer span owns the CSS `translate`
        centring, the inner motion span owns the animated transform — so
        framer-motion's inline transform can never clobber the placement.
      */}
      <span
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-[16rem]',
          PLACEMENT[side],
        )}
      >
        <AnimatePresence>
          {open ? (
            <motion.span
              key="tip"
              role="tooltip"
              id={tooltipId}
              initial={
                reduced
                  ? { opacity: 1 }
                  : { opacity: 0, ...ENTER_OFFSET[side], scale: 0.96 }
              }
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={reduced ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
              className={cn(
                'block rounded-md border border-border bg-popover px-2.5 py-1.5',
                'text-xs font-medium leading-snug text-popover-foreground shadow-lift',
                contentClassName,
              )}
            >
              {content}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </span>
  )
}
