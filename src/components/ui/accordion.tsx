import {
  Children,
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks'

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

interface AccordionContextValue {
  type: 'single' | 'multiple'
  isOpen: (index: number) => boolean
  toggle: (index: number) => void
}

const AccordionContext = createContext<AccordionContextValue | null>(null)

/**
 * The Accordion hands each child its own index through context, rather than
 * children self-registering during render — deterministic under StrictMode's
 * double render and immune to list reordering.
 */
const AccordionIndexContext = createContext<number | null>(null)

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single' | 'multiple'
  /** Indices (0-based, in render order) open on first paint. */
  defaultOpen?: number[]
  children: React.ReactNode
}

export function Accordion({
  type = 'single',
  defaultOpen = [],
  className,
  children,
  ...props
}: AccordionProps) {
  const [open, setOpen] = useState<number[]>(() =>
    type === 'single' ? defaultOpen.slice(0, 1) : defaultOpen,
  )

  const isOpen = useCallback((index: number) => open.includes(index), [open])

  const toggle = useCallback(
    (index: number) => {
      setOpen((current) => {
        const alreadyOpen = current.includes(index)
        if (type === 'single') return alreadyOpen ? [] : [index]
        return alreadyOpen ? current.filter((i) => i !== index) : [...current, index]
      })
    },
    [type],
  )

  const value = useMemo<AccordionContextValue>(
    () => ({ type, isOpen, toggle }),
    [type, isOpen, toggle],
  )

  return (
    <AccordionContext.Provider value={value}>
      <div className={cn('divide-y divide-border', className)} {...props}>
        {Children.map(children, (child, index) => (
          <AccordionIndexContext.Provider value={index}>
            {child}
          </AccordionIndexContext.Provider>
        ))}
      </div>
    </AccordionContext.Provider>
  )
}

/* ------------------------------------------------------------------ *
 * Item
 * ------------------------------------------------------------------ */

export interface AccordionItemProps {
  title: React.ReactNode
  children: React.ReactNode
  /** Only consulted when the item is used outside an <Accordion>. */
  defaultOpen?: boolean
  className?: string
  triggerClassName?: string
  contentClassName?: string
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  className,
  triggerClassName,
  contentClassName,
}: AccordionItemProps) {
  const ctx = useContext(AccordionContext)
  const index = useContext(AccordionIndexContext) ?? 0
  const reduced = useReducedMotion()
  const uid = useId()

  const triggerId = `acc-trigger-${uid}`
  const panelId = `acc-panel-${uid}`

  // Standalone fallback: the item owns its own state when there's no provider.
  const [localOpen, setLocalOpen] = useState(defaultOpen)

  const open = ctx ? ctx.isOpen(index) : localOpen
  const onToggle = () => (ctx ? ctx.toggle(index) : setLocalOpen((o) => !o))

  return (
    <div className={cn('group', className)}>
      <h3 className="m-0">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            'flex w-full items-center justify-between gap-4 py-4 text-left',
            'font-heading text-base font-bold uppercase tracking-tight',
            'transition-colors duration-200 ease-brand hover:text-primary',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            open && 'text-primary',
            triggerClassName,
          )}
        >
          <span className="flex-1">{title}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground',
              reduced ? '' : 'transition-transform duration-300 ease-brand',
              open && 'rotate-180 text-primary',
            )}
          />
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }
            }
            className="overflow-hidden"
          >
            <div
              role="region"
              id={panelId}
              aria-labelledby={triggerId}
              className={cn(
                'pb-5 pr-8 text-sm leading-relaxed text-muted-foreground',
                contentClassName,
              )}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
