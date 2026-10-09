import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/hooks'

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
  baseId: string
  layoutId: string
  register: (value: string, node: HTMLButtonElement | null) => void
  order: React.MutableRefObject<string[]>
  nodes: React.MutableRefObject<Map<string, HTMLButtonElement>>
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Tabs>`)
  return ctx
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue: string
  /** Controlled value. When supplied, `onValueChange` owns the transitions. */
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
}

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const baseId = useId()

  const value = controlled ?? uncontrolled

  const setValue = useCallback(
    (next: string) => {
      if (controlled === undefined) setUncontrolled(next)
      onValueChange?.(next)
    },
    [controlled, onValueChange],
  )

  const order = useRef<string[]>([])
  const nodes = useRef<Map<string, HTMLButtonElement>>(new Map())

  const register = useCallback((tabValue: string, node: HTMLButtonElement | null) => {
    if (node) {
      nodes.current.set(tabValue, node)
      if (!order.current.includes(tabValue)) order.current.push(tabValue)
    } else {
      nodes.current.delete(tabValue)
      order.current = order.current.filter((v) => v !== tabValue)
    }
  }, [])

  const ctx = useMemo<TabsContextValue>(
    () => ({
      value,
      setValue,
      baseId,
      layoutId: `tabs-indicator-${baseId}`,
      register,
      order,
      nodes,
    }),
    [value, setValue, baseId, register],
  )

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn('flex flex-col', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

/* ------------------------------------------------------------------ *
 * TabsList
 * ------------------------------------------------------------------ */

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible name for the tab set. */
  label?: string
}

export function TabsList({ className, label, children, ...props }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={label ?? 'Tabs'}
      aria-orientation="horizontal"
      className={cn(
        'no-scrollbar relative flex items-stretch gap-1 overflow-x-auto border-b border-border',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * TabsTrigger
 * ------------------------------------------------------------------ */

export interface TabsTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string
}

export function TabsTrigger({
  value,
  className,
  children,
  onKeyDown,
  disabled,
  ...props
}: TabsTriggerProps) {
  const ctx = useTabs('TabsTrigger')
  const reduced = useReducedMotion()
  const selected = ctx.value === value

  const activate = (next: string) => {
    ctx.setValue(next)
    ctx.nodes.current.get(next)?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return

    const list = ctx.order.current
    const index = list.indexOf(value)
    if (index === -1 || list.length === 0) return

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        activate(list[(index + 1) % list.length])
        break
      case 'ArrowLeft':
        event.preventDefault()
        activate(list[(index - 1 + list.length) % list.length])
        break
      case 'Home':
        event.preventDefault()
        activate(list[0])
        break
      case 'End':
        event.preventDefault()
        activate(list[list.length - 1])
        break
      default:
        break
    }
  }

  return (
    <button
      ref={(node) => ctx.register(value, node)}
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      // Roving tabindex: only the selected tab is in the tab sequence.
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => ctx.setValue(value)}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative shrink-0 whitespace-nowrap px-4 py-3',
        'font-heading text-sm font-bold uppercase tracking-wide',
        'transition-colors duration-200 ease-brand',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-40',
        selected ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children}

      {selected ? (
        reduced ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
          />
        ) : (
          <motion.span
            aria-hidden="true"
            layoutId={ctx.layoutId}
            className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          />
        )
      ) : null}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * TabsContent
 * ------------------------------------------------------------------ */

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  /** Keep the panel mounted while hidden (preserves scroll / form state). */
  forceMount?: boolean
}

export function TabsContent({
  value,
  className,
  children,
  forceMount = false,
  ...props
}: TabsContentProps) {
  const ctx = useTabs('TabsContent')
  const reduced = useReducedMotion()
  const selected = ctx.value === value

  if (!selected && !forceMount) return null

  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      hidden={!selected}
      tabIndex={0}
      className={cn(
        'pt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
      {...props}
    >
      {selected && !reduced ? (
        <motion.div
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {children}
        </motion.div>
      ) : (
        children
      )}
    </div>
  )
}
