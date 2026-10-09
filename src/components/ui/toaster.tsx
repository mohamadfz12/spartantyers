import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks'
import { useToasts, type Toast } from '@/store/ui'

const DEFAULT_DURATION = 4000

const ICONS = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const

const ICON_TONE = {
  default: 'text-primary',
  success: 'text-emerald-500',
  error: 'text-destructive',
} as const

const ACCENT = {
  default: 'before:bg-primary',
  success: 'before:bg-emerald-500',
  error: 'before:bg-destructive',
} as const

/**
 * Mount once, near the app root. Reads straight from the `useToasts` store so
 * any module can raise a toast without prop drilling.
 */
export function Toaster({ className }: { className?: string }) {
  const toasts = useToasts((state) => state.toasts)
  const dismiss = useToasts((state) => state.dismiss)

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className={cn(
        'pointer-events-none fixed z-[200] flex flex-col gap-2.5',
        'inset-x-4 bottom-4 items-center',
        'sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm sm:items-end',
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastRow({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const reduced = useReducedMotion()
  const variant = toast.variant ?? 'default'
  const Icon = ICONS[variant]

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const duration = toast.duration ?? DEFAULT_DURATION

  useEffect(() => {
    // 0 means "sticky until dismissed".
    if (duration === 0) return
    timer.current = setTimeout(() => onDismiss(toast.id), duration)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = undefined
    }
  }, [duration, toast.id, onDismiss])

  const handleDismiss = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = undefined
    }
    onDismiss(toast.id)
  }

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.97 }}
      transition={
        reduced ? { duration: 0 } : { duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }
      }
      className={cn(
        'pointer-events-auto relative w-full overflow-hidden rounded-lg',
        'border border-border bg-popover text-popover-foreground shadow-lift',
        'flex items-start gap-3 py-3 pl-4 pr-3 sm:w-auto sm:min-w-[20rem]',
        // Left accent rail, tinted per variant.
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        ACCENT[variant],
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_TONE[variant])}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-heading text-sm font-bold leading-snug">{toast.title}</p>
        {toast.description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {toast.description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label={`Dismiss notification: ${toast.title}`}
        className={cn(
          '-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          'text-muted-foreground transition-colors duration-200 ease-brand',
          'hover:bg-accent hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
