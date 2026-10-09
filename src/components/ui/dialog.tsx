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
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBodyScrollLock, useEscapeKey, useReducedMotion } from '@/hooks'
import { useFocusTrap } from './use-overlay'

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

interface DialogContextValue {
  open: boolean
  close: () => void
  titleId: string
  descriptionId: string
  labelledBy?: string
  /** True once a <DialogDescription> has mounted — keeps aria refs honest. */
  hasDescription: boolean
  setHasDescription: (has: boolean) => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

function useDialog(component: string): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Dialog>`)
  return ctx
}

/* ------------------------------------------------------------------ *
 * Dialog root
 * ------------------------------------------------------------------ */

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Id of an external element that names the dialog, instead of DialogTitle. */
  labelledBy?: string
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, labelledBy, children }: DialogProps) {
  const uid = useId()
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  useBodyScrollLock(open)
  useEscapeKey(close, open)

  const [mounted, setMounted] = useState(false)
  const [hasDescription, setHasDescription] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  return createPortal(
    <DialogContext.Provider
      value={{
        open,
        close,
        titleId: `dialog-title-${uid}`,
        descriptionId: `dialog-desc-${uid}`,
        labelledBy,
        hasDescription,
        setHasDescription,
      }}
    >
      <AnimatePresence>{open ? children : null}</AnimatePresence>
    </DialogContext.Provider>,
    document.body,
  )
}

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/** Motion-aware props so consumers can still pass style/handlers through. */
export interface DialogContentProps
  extends Omit<HTMLMotionProps<'div'>, 'children'> {
  size?: DialogSize
  /** Hides the built-in top-right close button. */
  hideClose?: boolean
  children?: React.ReactNode
}

export function DialogContent({
  className,
  size = 'md',
  hideClose = false,
  children,
  ...props
}: DialogContentProps) {
  const ctx = useDialog('DialogContent')
  const reduced = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusTrap(panelRef, ctx.open)

  const transition = reduced
    ? { duration: 0 }
    : { duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] as const }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      {/* Backdrop — clicking it closes; clicking the panel does not. */}
      <motion.div
        aria-hidden="true"
        onClick={ctx.close}
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
        aria-labelledby={ctx.labelledBy ?? ctx.titleId}
        aria-describedby={ctx.hasDescription ? ctx.descriptionId : undefined}
        initial={reduced ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        transition={transition}
        className={cn(
          'relative z-10 w-full overflow-hidden rounded-lg border border-border',
          'bg-card text-card-foreground shadow-lift',
          'max-h-[calc(100dvh-2rem)] overflow-y-auto',
          SIZES[size],
          className,
        )}
        {...props}
      >
        {!hideClose ? (
          <DialogClose className="absolute right-3 top-3 z-20" />
        ) : null}
        {children}
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Parts
 * ------------------------------------------------------------------ */

export const DialogHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function DialogHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-2 p-6 pb-4 pr-14', className)}
      {...props}
    />
  )
})

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function DialogTitle({ className, id, ...props }, ref) {
  const ctx = useDialog('DialogTitle')
  return (
    <h2
      ref={ref}
      id={id ?? ctx.titleId}
      className={cn(
        'font-heading text-xl font-extrabold uppercase leading-tight tracking-tight',
        className,
      )}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function DialogDescription({ className, id, ...props }, ref) {
  const ctx = useDialog('DialogDescription')
  const { setHasDescription } = ctx

  useEffect(() => {
    setHasDescription(true)
    return () => setHasDescription(false)
  }, [setHasDescription])

  return (
    <p
      ref={ref}
      id={id ?? ctx.descriptionId}
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
})

export const DialogFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function DialogFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col-reverse gap-3 border-t border-border p-6 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  )
})

export interface DialogCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Replace the default icon button with your own trigger content. */
  asIcon?: boolean
}

export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(
  function DialogClose({ className, children, onClick, asIcon = true, ...props }, ref) {
    const ctx = useDialog('DialogClose')

    return (
      <button
        ref={ref}
        type="button"
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) ctx.close()
        }}
        aria-label={children ? undefined : 'Close dialog'}
        className={cn(
          children
            ? 'inline-flex items-center justify-center'
            : cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-md',
                'text-muted-foreground transition-colors duration-200 ease-brand',
                'hover:bg-accent hover:text-foreground',
              ),
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
        {...props}
      >
        {children ?? (asIcon ? <X aria-hidden="true" className="h-4 w-4" /> : 'Close')}
      </button>
    )
  },
)
