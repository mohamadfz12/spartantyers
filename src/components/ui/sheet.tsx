import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBodyScrollLock, useEscapeKey, useReducedMotion } from '@/hooks'
import { useFocusTrap } from './use-overlay'

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

interface SheetContextValue {
  close: () => void
  titleId: string
}

const SheetContext = createContext<SheetContextValue | null>(null)

function useSheet(component: string): SheetContextValue {
  const ctx = useContext(SheetContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Sheet>`)
  return ctx
}

/* ------------------------------------------------------------------ *
 * Sheet
 * ------------------------------------------------------------------ */

export type SheetSide = 'left' | 'right' | 'bottom'

const PANEL_POSITION: Record<SheetSide, string> = {
  left: 'inset-y-0 left-0 h-full w-[88vw] max-w-sm border-r',
  right: 'inset-y-0 right-0 h-full w-[88vw] max-w-sm border-l',
  bottom:
    'inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-lg border-t',
}

const OFFSCREEN: Record<SheetSide, { x?: string; y?: string }> = {
  left: { x: '-100%' },
  right: { x: '100%' },
  bottom: { y: '100%' },
}

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: SheetSide
  /** Id of an external element naming the sheet, instead of SheetTitle. */
  labelledBy?: string
  className?: string
  children: React.ReactNode
}

export function Sheet({
  open,
  onOpenChange,
  side = 'right',
  labelledBy,
  className,
  children,
}: SheetProps) {
  const uid = useId()
  const titleId = `sheet-title-${uid}`
  const panelRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  useBodyScrollLock(open)
  useEscapeKey(close, open)
  useFocusTrap(panelRef, open)

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const transition = reduced
    ? { duration: 0 }
    : { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] as const }

  return createPortal(
    <SheetContext.Provider value={{ close, titleId }}>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[100]">
            <motion.div
              aria-hidden="true"
              onClick={close}
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
              className="absolute inset-0 bg-background/70 backdrop-blur-md"
            />

            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy ?? titleId}
              initial={reduced ? { opacity: 0 } : OFFSCREEN[side]}
              animate={reduced ? { opacity: 1 } : { x: 0, y: 0 }}
              exit={reduced ? { opacity: 0 } : OFFSCREEN[side]}
              transition={transition}
              className={cn(
                'absolute z-10 flex flex-col overflow-y-auto border-border',
                'bg-card text-card-foreground shadow-lift',
                PANEL_POSITION[side],
                className,
              )}
            >
              {children}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </SheetContext.Provider>,
    document.body,
  )
}

/* ------------------------------------------------------------------ *
 * Parts
 * ------------------------------------------------------------------ */

export const SheetHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function SheetHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'sticky top-0 z-10 flex items-start justify-between gap-4',
        'border-b border-border bg-card/95 p-5 backdrop-blur',
        className,
      )}
      {...props}
    />
  )
})

export const SheetTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function SheetTitle({ className, id, ...props }, ref) {
  const ctx = useSheet('SheetTitle')
  return (
    <h2
      ref={ref}
      id={id ?? ctx.titleId}
      className={cn(
        'font-heading text-lg font-extrabold uppercase leading-tight tracking-tight',
        className,
      )}
      {...props}
    />
  )
})

export interface SheetCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const SheetClose = forwardRef<HTMLButtonElement, SheetCloseProps>(
  function SheetClose({ className, children, onClick, ...props }, ref) {
    const ctx = useSheet('SheetClose')

    return (
      <button
        ref={ref}
        type="button"
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) ctx.close()
        }}
        aria-label={children ? undefined : 'Close panel'}
        className={cn(
          children
            ? 'inline-flex items-center justify-center'
            : cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                'text-muted-foreground transition-colors duration-200 ease-brand',
                'hover:bg-accent hover:text-foreground',
              ),
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
        {...props}
      >
        {children ?? <X aria-hidden="true" className="h-4 w-4" />}
      </button>
    )
  },
)
