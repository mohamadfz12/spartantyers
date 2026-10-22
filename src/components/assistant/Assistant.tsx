import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MessageSquare, Phone, Send, Sparkles, SquarePen, X } from 'lucide-react'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'
import { MESSAGE_MAX } from '@/lib/ai/protocol'
import { useBodyScrollLock, useEscapeKey, useMediaQuery, useReducedMotion, useVisibleViewport } from '@/hooks'
import { useCompare } from '@/store/ui'
import {
  PHONE_QUERY,
  checkStatus,
  resumeWaiting,
  setNavigator,
  useAssistant,
} from '@/store/assistant'
import { Button, fieldSkin } from '@/components/ui'
import { AnimatePresence, motion } from '@/components/motion'
import { startCall, useCall } from '@/store/call'
import { CallLayer } from './CallScreen'
import { MessageView } from './MessageView'

const SUGGESTIONS = [
  'Do you have 11R22.5 drive tyres in stock?',
  'Which tyre suits my trailer?',
  'How long is delivery to Brisbane?',
  'Can you fit the tyres when I pick up?',
]

const WELCOME =
  "G'day! Ask me about truck, bus and trailer tyres, sizes, stock, delivery or fitting. I can find the right tyre and put the order on screen for you."

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** How long an answer may go quiet before the chat says it is checking something. */
const QUIET_MS = 1500

/**
 * The customer assistant: a pair of launcher pills (Ask us, and Call when calls are on), the chat
 * panel, and the call screen (src/components/assistant/CallScreen.tsx). Replaces the old chat
 * widget. Everything it says comes from the server's assistant (api/ai/[action].ts), or from the
 * quick answers in src/lib/ai/fallback.ts when that is unavailable; the stores
 * (src/store/assistant.ts for the chat, src/store/call.ts for a call) hold the state.
 */
export default function Assistant() {
  return (
    <>
      <Chat />
      <CallLayer />
    </>
  )
}

function Chat() {
  const open = useAssistant((s) => s.open)
  const aside = useAssistant((s) => s.aside)
  const messages = useAssistant((s) => s.messages)
  const busy = useAssistant((s) => s.busy)
  const typing = useAssistant((s) => s.typing)
  const activity = useAssistant((s) => s.activity)
  const mode = useAssistant((s) => s.mode)
  const voice = useAssistant((s) => s.voice)
  const setOpen = useAssistant((s) => s.setOpen)
  const setAside = useAssistant((s) => s.setAside)
  // While a call is on (or its end is on screen) the pills and the chat's side pill step out of the way.
  const inCall = useCall((s) => s.view !== null)

  const [draft, setDraft] = useState('')
  const [quiet, setQuiet] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const headingRef = useRef<HTMLParagraphElement>(null)
  const nearBottom = useRef(true)
  const started = useRef(false)

  const reduced = useReducedMotion()
  const phone = useMediaQuery(PHONE_QUERY)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // The assistant has no place in the admin panel.
  const hidden = pathname.startsWith('/admin')
  // The page only stops scrolling while the panel is really on screen (open, on a phone, and not hidden).
  const visible = useVisibleViewport(open && phone && !hidden)
  useBodyScrollLock(open && phone && !hidden)

  // The compare tray is a full-width bar pinned to the bottom; lift the pills and the panel clear of it.
  const compareActive = useCompare((s) => s.ids.length > 0)
  const trayVisible =
    compareActive &&
    !pathname.startsWith('/compare') &&
    !pathname.startsWith('/checkout') &&
    !pathname.startsWith('/admin')

  // The router's navigate, for the pages the assistant opens (it works from the store too).
  useEffect(() => {
    setNavigator(navigate)
    return () => setNavigator(null)
  }, [navigate])

  useEffect(() => {
    if (started.current) return
    started.current = true
    // Asks whether the assistant is on, and whether calls are (the Call pill only shows if they are).
    checkStatus(true)
    // The page reloaded mid-answer: that answer is collected.
    resumeWaiting()
  }, [])

  // Opening the panel asks again whether the assistant can answer (it may be back since last time).
  useEffect(() => {
    if (!open) return
    checkStatus(true)
    setAside(null)
    // A computer: the box, ready to type. A touch screen: the heading, so a screen reader starts at
    // the top of the chat and the keyboard does not pop up over it.
    const pointerFine = window.matchMedia('(pointer: fine)').matches
    ;(pointerFine ? inputRef.current : headingRef.current)?.focus({ preventScroll: true })
  }, [open, setAside])

  // In quick-answer mode, look again every so often while the panel is open (the store limits it to once a minute).
  useEffect(() => {
    if (!open || mode !== 'quick') return
    const timer = window.setInterval(() => checkStatus(), 15_000)
    return () => window.clearInterval(timer)
  }, [open, mode])

  const close = useCallback(() => setOpen(false), [setOpen])
  useEscapeKey(close, open)

  // After the panel closes, focus goes back to where the customer opened it (a pill).
  const focusBack = () =>
    window.requestAnimationFrame(() => {
      const now = document.activeElement
      // Focus the customer put somewhere else on the page stays where it is.
      if (now && now !== document.body && !panelRef.current?.contains(now)) return
      document.getElementById('assistant-aside')?.focus()
      if (document.activeElement === document.body || document.activeElement === now) {
        document.getElementById('assistant-launcher')?.focus()
      }
    })

  // The answer goes quiet while a tool works: say so rather than showing nothing.
  useEffect(() => {
    setQuiet(false)
    if (!busy) return
    const timer = window.setTimeout(() => setQuiet(true), QUIET_MS)
    return () => window.clearTimeout(timer)
  }, [busy, activity, typing])

  // Stay at the bottom as the answer streams in, unless the customer scrolled up to read.
  useLayoutEffect(() => {
    const node = listRef.current
    if (!node || !nearBottom.current) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'auto' })
  }, [messages, typing, quiet, open, visible?.height])

  // Finished answers are announced to screen readers from their own polite region (the streaming
  // list is not live, which would read an answer out piece by piece).
  const lastBot = [...messages].reverse().find((m) => m.from === 'bot')
  const announced = useRef(lastBot?.id ?? 0)
  useEffect(() => {
    if (busy || !lastBot || lastBot.id === announced.current) return
    announced.current = lastBot.id
    setAnnouncement([lastBot.text, ...(lastBot.notes ?? [])].join(' '))
  }, [busy, lastBot])

  // Back to the box when an answer is done, so the next question can be typed straight away.
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy && open && window.matchMedia('(pointer: fine)').matches) {
      inputRef.current?.focus({ preventScroll: true })
    }
    wasBusy.current = busy
  }, [busy, open])

  // The box grows with what is typed, up to a few lines.
  useLayoutEffect(() => {
    const node = inputRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`
  }, [draft, open])

  if (hidden) return null

  const send = (text: string) => {
    const question = text.trim()
    if (!question || busy) return
    nearBottom.current = true
    setDraft('')
    useAssistant.getState().ask(question)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(draft)
    }
  }

  // Keeps Tab inside the panel on phones, where it covers the page.
  const trap = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab' || !phone || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null,
    )
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === headingRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // A link in an answer was followed: on a phone the panel steps aside so the page can be seen.
  const onNavigate = () => {
    if (phone) useAssistant.setState({ open: false, aside: 'Opened a page' })
  }

  const onScroll = () => {
    const node = listRef.current
    if (node) nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120
  }

  const quick = mode === 'quick'
  const showTyping = busy && (typing || quiet)
  const launcherShown = !open && !aside && !inCall
  const lastIsMine = messages[messages.length - 1]?.from === 'me'

  return (
    <>
      {/* Launcher pills. Hidden while the panel is open; lifted clear of the compare tray. */}
      <AnimatePresence>
        {launcherShown ? (
          <motion.div
            key="launcher"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: trayVisible ? -76 : 0 }}
            exit={{ opacity: 0, y: 16, transition: { duration: reduced ? 0 : 0.15 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex items-center gap-2 md:bottom-6 md:right-6 md:gap-2.5"
          >
            {voice ? (
              <button
                id="assistant-call"
                type="button"
                // Starts inside the tap: phones only give the microphone and sound to a tap.
                onClick={startCall}
                aria-label="Talk to the Spartan Tyres assistant"
                className="relative inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-charcoal px-4 font-heading text-xs font-bold uppercase tracking-wide text-charcoal-foreground shadow-lift transition-transform hover:-translate-y-0.5 active:scale-95 md:h-14 md:px-5 md:text-sm"
              >
                {!reduced ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 animate-pulse-ring rounded-full border-2 border-steel-400/60"
                  />
                ) : null}
                <Phone className="relative h-5 w-5" aria-hidden="true" />
                <span className="relative max-[359px]:sr-only">Call</span>
              </button>
            ) : null}
            <button
              id="assistant-launcher"
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open the Spartan Tyres assistant"
              aria-haspopup="dialog"
              className="relative inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 font-heading text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition-transform hover:-translate-y-0.5 active:scale-95 md:h-14 md:px-5 md:text-sm"
            >
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
              Ask us
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* After the assistant opened a page on a narrow screen: a pill that brings the chat back. */}
      {aside && !open && !inCall ? (
        <div
          className={cn(
            'fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 flex items-center gap-1 rounded-2xl border border-primary/40 bg-charcoal py-1.5 pl-1.5 pr-1.5 text-charcoal-foreground shadow-lift',
            'bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-6 md:left-auto md:right-6 md:w-[22rem]',
            trayVisible && 'bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)]',
          )}
        >
          <button
            id="assistant-aside"
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`${aside}. Back to the chat`}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-1.5 text-left"
          >
            <span aria-hidden="true" className="relative grid h-2.5 w-2.5 shrink-0 place-items-center">
              <span className={cn('absolute h-2.5 w-2.5 rounded-full bg-primary', !reduced && 'animate-ping opacity-60')} />
              <span className="h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{busy ? 'Still answering' : aside}</span>
              <span className="block text-xs text-charcoal-foreground/60">Back to the chat</span>
            </span>
            <MessageSquare className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setAside(null)}
            aria-label="Dismiss"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-charcoal-foreground/60 transition-colors hover:bg-white/10 hover:text-charcoal-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* Panel */}
      <AnimatePresence onExitComplete={focusBack}>
        {open ? (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Spartan Tyres assistant"
            aria-modal={phone ? true : undefined}
            onKeyDown={trap}
            initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96, transition: { duration: reduced ? 0 : 0.18 } }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={phone && visible ? { top: visible.top + 8, height: visible.height - 16, bottom: 'auto' } : undefined}
            className={cn(
              'fixed z-[60] flex origin-bottom-right flex-col overflow-hidden border border-primary/30 bg-background shadow-lift',
              // Phones: nearly the whole screen, 8px in from every edge and clear of the notches.
              'max-sm:bottom-[max(0.5rem,env(safe-area-inset-bottom))] max-sm:left-[max(0.5rem,env(safe-area-inset-left))] max-sm:right-[max(0.5rem,env(safe-area-inset-right))] max-sm:top-[max(0.5rem,env(safe-area-inset-top))] max-sm:rounded-xl',
              // Larger screens: a card in the corner.
              'sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100svh-6rem))] sm:w-[410px] sm:max-w-[calc(100vw-2.5rem)] sm:rounded-xl',
              trayVisible && 'sm:bottom-[6.5rem] sm:h-[min(640px,calc(100svh-11rem))]',
            )}
          >
            <header className="flex shrink-0 items-center gap-2.5 border-b border-white/10 bg-charcoal px-3 py-3 text-charcoal-foreground sm:px-4">
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary max-[359px]:hidden">
                <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-charcoal',
                    quick ? 'bg-amber-400' : 'bg-green-400',
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  ref={headingRef}
                  tabIndex={-1}
                  role="heading"
                  aria-level={2}
                  className="font-heading text-[0.8125rem] font-bold uppercase leading-tight tracking-wide focus:outline-none sm:text-sm"
                >
                  Spartan Tyres assistant
                </p>
                <p className="mt-0.5 truncate text-[0.7rem] text-white/60">
                  {quick ? 'Quick answers' : 'AI assistant'} · answers about Spartan Tyres
                </p>
              </div>
              {voice ? (
                <button
                  type="button"
                  onClick={startCall}
                  aria-label="Call the assistant: talk instead of typing"
                  title="Talk instead of typing"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-primary transition-colors hover:bg-white/10 max-[359px]:w-9"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => useAssistant.getState().reset()}
                disabled={messages.length === 0 && !busy}
                aria-label="New conversation"
                title="New conversation"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
              >
                <SquarePen className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close the assistant"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div
              ref={listRef}
              onScroll={onScroll}
              aria-busy={busy}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3.5 py-4 sm:px-4"
            >
              {messages.length === 0 ? (
                <div>
                  <p className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-[0.9375rem] leading-relaxed sm:text-sm">
                    {WELCOME}
                  </p>
                  <p className="mb-2 mt-4 font-heading text-[0.6rem] font-bold uppercase tracking-brand text-muted-foreground">
                    Try asking
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={busy}
                        onClick={() => send(suggestion)}
                        className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-left text-[0.8125rem] leading-snug transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <MessageView key={message.id} message={message} onNavigate={onNavigate} />
                ))
              )}

              {showTyping ? (
                <div
                  role="status"
                  className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-3.5"
                >
                  <span className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                        style={{ animationDelay: `${index * 0.12}s` }}
                      />
                    ))}
                  </span>
                  <span className={cn('text-xs text-muted-foreground', !quiet && 'sr-only')}>
                    {quiet ? 'Checking...' : 'The assistant is typing'}
                  </span>
                </div>
              ) : null}
              {busy && lastIsMine && !showTyping ? <span className="sr-only">Waiting for an answer</span> : null}
            </div>

            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>

            {/* Short screens (a phone on its side, or with the keyboard up) drop the extras by CSS, not by focus: a layout that moves while a button is tapped misses the tap. */}
            <div className="shrink-0 border-t border-border bg-card px-4 py-2 [@media(max-height:560px)]:hidden">
              <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
                Prefer to talk?
                <a
                  href={site.phone.href}
                  className="flex items-center gap-1 rounded font-semibold text-primary hover:underline"
                >
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  {site.phone.display}
                </a>
              </p>
            </div>

            <div className="shrink-0 border-t border-border">
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  send(draft)
                }}
                className="flex items-end gap-2 p-3"
              >
                <label htmlFor="assistant-input" className="sr-only">
                  Your message
                </label>
                <textarea
                  ref={inputRef}
                  id="assistant-input"
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={MESSAGE_MAX}
                  enterKeyHint="send"
                  // Read-only (not disabled) while an answer is written, so the keyboard stays up on a phone.
                  readOnly={busy}
                  autoComplete="off"
                  placeholder="Ask about sizes, delivery, fitment..."
                  // 16px on phones: iOS zooms the page in on any smaller text box.
                  className={cn(
                    fieldSkin,
                    'min-h-11 min-w-0 flex-1 resize-none py-2.5 text-base leading-snug sm:text-sm',
                  )}
                />
                <Button
                  type="submit"
                  size="icon"
                  loading={busy}
                  disabled={!draft.trim()}
                  // Tapping Send must not take focus from the box: the layout would shift under the tap.
                  onMouseDown={(event) => event.preventDefault()}
                  aria-label="Send message"
                  className="shrink-0"
                >
                  {busy ? null : <Send className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </form>
              {draft.length >= MESSAGE_MAX - 150 ? (
                <p
                  className={cn(
                    'px-4 pb-1 text-right text-xs tabular-nums',
                    draft.length >= MESSAGE_MAX ? 'text-destructive' : 'text-muted-foreground',
                  )}
                  aria-live="polite"
                >
                  {draft.length}/{MESSAGE_MAX}
                </p>
              ) : null}
              <p className="px-4 pb-2.5 text-center text-[0.65rem] leading-snug text-muted-foreground [@media(max-height:560px)]:hidden">
                AI assistant: it can make mistakes. Prices and stock are confirmed at checkout.
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
