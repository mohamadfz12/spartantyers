import { useEffect, useRef } from 'react'

/**
 * Everything the browser will let a user tab to, minus the things that are
 * present but inert. Shared by Dialog and Sheet.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (node) =>
      !node.hasAttribute('disabled') &&
      node.getAttribute('aria-hidden') !== 'true' &&
      // offsetParent is null for display:none subtrees (and for fixed roots,
      // which is why we also allow a measurable client rect).
      (node.offsetParent !== null || node.getClientRects().length > 0),
  )
}

/**
 * Traps Tab/Shift+Tab inside `ref` while `active`, moves initial focus into
 * the overlay, and restores focus to whatever was focused beforehand on close.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement>,
  active: boolean,
): void {
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const container = ref.current
    if (container) {
      // Prefer an explicit autofocus target, then the first focusable, then
      // the container itself so screen readers land inside the overlay.
      const autofocus = container.querySelector<HTMLElement>('[data-autofocus]')
      const target = autofocus ?? getFocusable(container)[0] ?? container
      if (target === container && !container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1')
      }
      // Defer a frame so framer-motion has mounted the content.
      const frame = requestAnimationFrame(() => target.focus({ preventScroll: true }))
      return () => cancelAnimationFrame(frame)
    }
  }, [active, ref])

  // Separate effect so focus restoration survives the content unmounting.
  useEffect(() => {
    if (!active) return
    return () => {
      const node = previouslyFocused.current
      if (node && document.contains(node)) node.focus({ preventScroll: true })
    }
  }, [active])

  useEffect(() => {
    if (!active) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const container = ref.current
      if (!container) return

      const focusable = getFocusable(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeEl = document.activeElement as HTMLElement | null

      if (!activeEl || !container.contains(activeEl)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus({ preventScroll: true })
        return
      }

      if (event.shiftKey && activeEl === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [active, ref])
}
