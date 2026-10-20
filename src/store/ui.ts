import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AxlePosition, Product } from '@/data/types'

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

type Theme = 'light' | 'dark'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'spartan-theme' },
  ),
)

/** Keeps the `dark` class on <html> in sync with the store. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

/* ------------------------------------------------------------------ *
 * Comparison tray
 * ------------------------------------------------------------------ */

const MAX_COMPARE = 4

interface CompareState {
  ids: string[]
  toggle: (id: string) => void
  remove: (id: string) => void
  clear: () => void
  has: (id: string) => boolean
  isFull: () => boolean
}

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((state) => {
          if (state.ids.includes(id)) {
            return { ids: state.ids.filter((x) => x !== id) }
          }
          if (state.ids.length >= MAX_COMPARE) return state
          return { ids: [...state.ids, id] }
        }),
      remove: (id) => set((state) => ({ ids: state.ids.filter((x) => x !== id) })),
      clear: () => set({ ids: [] }),
      has: (id) => get().ids.includes(id),
      isFull: () => get().ids.length >= MAX_COMPARE,
    }),
    { name: 'spartan-compare' },
  ),
)

export { MAX_COMPARE }

/* ------------------------------------------------------------------ *
 * Shared axle selection
 *
 * The axle a visitor picks on the home page follows them into the shop,
 * the finder and the Wheel Lab — one decision, remembered everywhere.
 * ------------------------------------------------------------------ */

interface AxleState {
  axle: AxlePosition
  setAxle: (axle: AxlePosition) => void
}

export const useAxle = create<AxleState>()(
  persist(
    (set) => ({
      axle: 'drive',
      setAxle: (axle) => set({ axle }),
    }),
    { name: 'spartan-axle' },
  ),
)

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error'
  /** Milliseconds; 0 keeps it until dismissed. */
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  clear: () => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = Math.random().toString(36).slice(2, 10)
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    return id
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

/** Imperative helper so non-component code can raise a toast. */
export const toast = (toast: Omit<Toast, 'id'>) => useToasts.getState().push(toast)

/* ------------------------------------------------------------------ *
 * Quote requests
 *
 * Price-on-application lines are quoted rather than sold, from a card, the
 * quick view, the compare table or the product page. One dialog serves all
 * of them (mounted in App), so this only records which line and how many.
 * ------------------------------------------------------------------ */

interface QuoteState {
  product: Product | null
  quantity: number
  open: (product: Product, quantity?: number) => void
  close: () => void
}

export const useQuote = create<QuoteState>((set) => ({
  product: null,
  quantity: 4,
  open: (product, quantity = 4) => set({ product, quantity }),
  close: () => set({ product: null }),
}))

/** Imperative helper, mirroring `toast`. */
export const requestQuote = (product: Product, quantity?: number) =>
  useQuote.getState().open(product, quantity)

/* ------------------------------------------------------------------ *
 * Recently viewed
 * ------------------------------------------------------------------ */

interface RecentState {
  ids: string[]
  record: (id: string) => void
}

export const useRecentlyViewed = create<RecentState>()(
  persist(
    (set) => ({
      ids: [],
      record: (id) =>
        set((state) => ({
          ids: [id, ...state.ids.filter((x) => x !== id)].slice(0, 8),
        })),
    }),
    { name: 'spartan-recent' },
  ),
)

/* ------------------------------------------------------------------ *
 * 3D quality preference
 *
 * Visitors on weak hardware (or who simply don't want it) can dial the
 * wheel down to a static render without losing the rest of the site.
 * ------------------------------------------------------------------ */

export type RenderQuality = 'high' | 'balanced' | 'off'

interface QualityState {
  quality: RenderQuality
  setQuality: (quality: RenderQuality) => void
}

export const useRenderQuality = create<QualityState>()(
  persist(
    (set) => ({
      quality: 'high',
      setQuality: (quality) => set({ quality }),
    }),
    { name: 'spartan-quality' },
  ),
)
