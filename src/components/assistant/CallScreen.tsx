import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Captions,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  RotateCcw,
  Send,
  TriangleAlert,
  Volume1,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { site } from '@/config/site'
import { cn } from '@/lib/utils'
import { captionLines, endedReason, hasSpoken, statusText, type CallLine } from '@/lib/ai/callView'
import { EMERGENCY } from '@/lib/ai/emergency'
import { clock } from '@/lib/ai/voice'
import { useBodyScrollLock, useEscapeKey, useMediaQuery, useReducedMotion, useVisibleViewport } from '@/hooks'
import { useCompare } from '@/store/ui'
import {
  addCallCardToCart,
  callCardFailed,
  callCardSent,
  callLevels,
  closeCall,
  dismissCallCard,
  endCall,
  expandCall,
  isGoing,
  minimizeCall,
  reopenPage,
  startCall,
  toggleLoud,
  toggleMute,
  toggleTranscript,
  typeInCall,
  useCall,
  type CallView,
} from '@/store/call'
import { Button, useFocusTrap } from '@/components/ui'
import { AnimatePresence, motion } from '@/components/motion'
import { CallOrb } from './CallOrb'
import { CartCardView } from './CartCardView'
import { EnquiryCardView } from './EnquiryCardView'
import { Actions } from './MessageView'

const TRY_SAYING = ['"Do you have 11R22.5 drive tyres?"', '"I need four steer tyres with fitting"', '"Where is my order?"']

/* ------------------------------------------------------------------ small helpers */

/** The time now (ms), updated every half second while the call is live, for the clock. */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [on])
  return now
}

/** Whether the customer is talking now (polled from the call's sound meter). */
function useHearing(on: boolean) {
  const [hearing, setHearing] = useState(false)
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setHearing(callLevels().mic > 0.08), 150)
    return () => clearInterval(timer)
  }, [on])
  return on && hearing
}

/** The call's time so far, "1:12", at `now` (ms). */
const callTime = (v: CallView, now: number) => clock(v.since ? Math.max(0, (v.endedAt || now) - v.since) / 1000 : 0)

/** Moves the keyboard focus to a heading when a screen appears (the button that was pressed has gone). */
function Heading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className={cn('font-heading text-xl font-extrabold uppercase leading-tight tracking-tight focus:outline-none sm:text-2xl', className)}
    >
      {children}
    </h2>
  )
}

/** One of the call's round buttons. `on` makes it an on/off button (Mute, Speaker, Transcript): screen readers hear "pressed". */
function RoundButton({
  icon: Icon,
  label,
  onClick,
  on,
  end,
  disabled,
  dense,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  on?: boolean
  end?: boolean
  disabled?: boolean
  dense?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        'group flex flex-col items-center gap-1.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45',
        dense ? 'min-w-14' : 'min-w-16',
      )}
    >
      <span
        className={cn(
          'grid place-items-center rounded-full transition-colors group-active:scale-95',
          end
            ? cn('bg-destructive text-destructive-foreground group-hover:bg-destructive/85', dense ? 'h-12 w-12' : 'h-16 w-16')
            : cn(
                'border border-border',
                dense ? 'h-11 w-11' : 'h-14 w-14',
                on ? 'bg-foreground text-background' : 'bg-muted text-foreground group-hover:border-primary group-hover:text-primary',
              ),
        )}
      >
        <Icon className={end ? (dense ? 'h-5 w-5' : 'h-6 w-6') : dense ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <span aria-hidden="true" className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
    </button>
  )
}

/** The customer's tag on a line of the call ("You"), in the site's orange. */
const YouTag = () => (
  <span className="mr-1.5 inline-block rounded bg-primary/15 px-1.5 align-[1px] font-heading text-[0.65rem] font-bold uppercase tracking-wide text-primary">
    You
  </span>
)

/** Three dots for words still being written down. */
const Dots = () => (
  <span className="inline-flex gap-1 align-middle" role="img" aria-label="transcribing">
    {[0, 1, 2].map((index) => (
      <span key={index} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${index * 0.12}s` }} />
    ))}
  </span>
)

/** The last few lines of the call, as they are said: the customer's in orange with a "You" tag; pages the assistant opened are buttons. */
function LiveCaptions({ lines, max, clamp }: { lines: CallLine[]; max: number; clamp?: boolean }) {
  const shown = captionLines(lines, max)
  if (!shown.length) return null
  return (
    <div aria-label="Live captions" className="flex w-full flex-col items-center gap-2">
      {shown.map((l) =>
        l.who === 'did' ? (
          <button
            key={l.id}
            type="button"
            onClick={() => l.to && reopenPage(l.to)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-steel-400/50 bg-steel-400/10 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{l.text}</span>
          </button>
        ) : (
          <p
            key={l.id}
            className={cn(
              'max-w-full text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere]',
              clamp && 'line-clamp-2',
              l.who === 'you' ? 'text-primary' : 'text-foreground',
            )}
          >
            {l.who === 'you' ? <YouTag /> : null}
            {l.text || !l.live ? l.text : <Dots />}
          </p>
        ),
      )}
    </div>
  )
}

/** The full transcript as a sheet over the call (the controls stay under it). */
function TranscriptSheet({ lines }: { lines: CallLine[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [lines])
  const shown = lines.filter((l) => l.text || l.live)
  return (
    <div role="region" aria-label="Transcript" className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-y border-border px-5 py-2">
        <p className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">Transcript</p>
        <button
          type="button"
          onClick={toggleTranscript}
          aria-label="Close the transcript"
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div ref={box} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-5 py-3 text-left">
        {shown.length === 0 ? <p className="py-2 text-center text-sm text-muted-foreground">Nothing said yet.</p> : null}
        {shown.map((l) =>
          l.who === 'did' ? (
            <p key={l.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{l.text}</span>
            </p>
          ) : (
            <p key={l.id} className={cn('text-sm leading-relaxed [overflow-wrap:anywhere]', l.live && 'opacity-70')}>
              {l.who === 'you' ? (
                <YouTag />
              ) : (
                <span className="mr-1.5 inline-block rounded bg-muted px-1.5 align-[1px] font-heading text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
                  Assistant
                </span>
              )}
              <span className={l.who === 'you' ? 'text-primary' : undefined}>{l.text || '...'}</span>
            </p>
          ),
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the call card */

/** The call's card: the same cart, quote and message cards as the chat, acting on the call. */
function CallCardBlock({ view: v }: { view: CallView }) {
  const card = v.card
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const key = card ? `${card.card.id}:${card.state}` : null
  // A new card scrolls into view with its buttons, so a phone's small window shows what to tap.
  useEffect(() => {
    if (!key) return
    // After the card has laid out (the orb shrinks around it), so its buttons end up in view.
    const timer = setTimeout(() => ref.current?.scrollIntoView({ block: 'end', behavior: reduced ? 'auto' : 'smooth' }), 300)
    return () => clearTimeout(timer)
  }, [key, reduced])
  if (!card) return null
  const c = card.card
  return (
    <div ref={ref} className="w-full scroll-mb-4 text-left">
      {c.kind === 'cart' ? (
        <CartCardView
          key={c.id}
          messageId={0}
          card={c}
          view={card}
          onAdd={() => addCallCardToCart(c)}
          onDismiss={() => dismissCallCard(c)}
        />
      ) : (
        <EnquiryCardView
          key={c.id}
          messageId={0}
          card={c}
          view={card}
          onSent={() => callCardSent(c)}
          onFailed={(message) => callCardFailed(c, message)}
          onDismiss={() => dismissCallCard(c)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ the call screen */

const callLink = (
  <Button asChild variant="outline">
    <a href={site.phone.href}>
      <Phone className="h-4 w-4" aria-hidden="true" />
      Call {site.phone.display}
    </a>
  </Button>
)

/**
 * The call: a full-screen blurred overlay with a centred card on a computer, and the whole screen on
 * a phone. The orb, what is happening, live captions, the card the assistant put up, and the
 * controls. Nothing said on the call is added to the chat's messages; staff read it with the chat.
 */
function CallScreen({ view: v }: { view: CallView }) {
  const reduced = useReducedMotion()
  const phone = useMediaQuery('(max-width: 639.98px)')
  const roomy = useMediaQuery('(min-height: 720px)')
  const short = useMediaQuery('(max-height: 700px)')
  const visible = useVisibleViewport(phone)
  const panelRef = useRef<HTMLElement>(null)
  const [typed, setTyped] = useState('')

  const live = v.phase === 'live'
  const going = isGoing(v)
  const now = useNow(live)
  const hearing = useHearing(live && !v.practice && !v.muted)
  const left = v.since ? v.seconds * 1000 - Math.max(0, now - v.since) : v.seconds * 1000
  const lastMinute = live && left < 60_000
  const cardUp = !!v.card && (v.card.state === 'pending' || v.card.state === 'working' || v.card.state === 'failed')
  const compact = cardUp || v.danger
  const minutes = Math.max(1, Math.round(v.seconds / 60))
  const orb = compact ? 76 : roomy || !phone ? 240 : 168
  // With a card or the safety steps up, the controls shrink so the card and its buttons get the room.
  const dense = compact && (phone || short)

  useBodyScrollLock(true)
  useFocusTrap(panelRef, true)
  const away = () => (going ? minimizeCall() : closeCall())
  useEscapeKey(away, true)

  const send = (event: FormEvent) => {
    event.preventDefault()
    if (!typed.trim()) return
    typeInCall(typed)
    setTyped('')
  }

  const status = statusText(v, hearing)

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.15 } }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      onMouseDown={(event) => event.target === event.currentTarget && away()}
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-charcoal/70 backdrop-blur-md sm:items-center sm:p-4"
    >
      <motion.section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Voice call with the Spartan Tyres assistant"
        initial={reduced ? false : { opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 32, scale: 0.97, transition: { duration: reduced ? 0 : 0.15 } }}
        transition={{ duration: reduced ? 0 : 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={phone && visible ? { height: visible.height, marginTop: visible.top } : undefined}
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-background text-foreground shadow-lift',
          'h-[100dvh] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:min-h-[min(680px,calc(100dvh-2rem))] sm:w-[460px] sm:rounded-2xl sm:border sm:border-primary/30',
        )}
      >
        <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-muted px-3.5 font-heading text-[0.7rem] font-bold uppercase tracking-wide">
            <Phone className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="whitespace-nowrap">
              Spartan Tyres AI
              {v.practice ? <span className="max-[399px]:sr-only"> · practice</span> : null}
            </span>
          </span>
          <span
            className={cn(
              'flex-1 text-center font-mono text-sm font-semibold tabular-nums',
              lastMinute ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {live || v.phase === 'ended' ? callTime(v, now) : ''}
          </span>
          <button
            type="button"
            onClick={away}
            aria-label={going ? 'Minimise the call (keep talking while you look at the website)' : 'Close the call screen'}
            title={going ? 'Keep talking while you browse' : 'Close'}
            className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-muted text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {going ? <Minimize2 className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" /> : <X className="h-5 w-5" aria-hidden="true" />}
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3">
            <div className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-3 text-center">
              {v.phase === 'error' ? (
                <>
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-destructive/15 text-destructive">
                    <TriangleAlert className="h-8 w-8" aria-hidden="true" />
                  </span>
                  <Heading>{v.errorTitle || 'Call could not start'}</Heading>
                  <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{v.message}</p>
                  {v.errorKind === 'mic' ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Tap the lock or settings icon by the address, choose Microphone, then Allow.
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap justify-center gap-2">
                    <Button onClick={startCall}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Try again
                    </Button>
                    {callLink}
                  </div>
                </>
              ) : v.phase === 'ended' ? (
                <>
                  <CallOrb size={96} />
                  <Heading>Call ended</Heading>
                  <div className="space-y-1 text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {endedReason(v.endReason) ? <p>{endedReason(v.endReason)}</p> : null}
                    <p>
                      {callTime(v, now)} · Thanks for calling {site.name}.
                    </p>
                  </div>
                  {v.shown.length > 0 ? (
                    <ul className="w-full space-y-1 rounded-xl border border-border bg-card px-4 py-3 text-left text-[0.8125rem]">
                      {v.shown.map((line, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{line}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-1 flex flex-wrap justify-center gap-2">
                    <Button onClick={startCall}>
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      Call again
                    </Button>
                    {v.lines.some((l) => l.text) ? (
                      <Button variant="outline" onClick={toggleTranscript}>
                        {v.transcript ? 'Hide transcript' : 'Show transcript'}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={closeCall}>
                      Close
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="sr-only">Voice call in progress</h2>
                  {compact ? (
                    <div className="flex w-full items-center justify-center gap-3">
                      <CallOrb size={orb} />
                      <p role="status" className="min-w-0 text-left font-heading text-lg font-bold uppercase leading-tight tracking-tight">
                        {status}
                      </p>
                    </div>
                  ) : (
                    <>
                      <CallOrb size={orb} />
                      <p role="status" className="font-heading text-xl font-extrabold uppercase leading-tight tracking-tight sm:text-2xl">
                        {status}
                      </p>
                    </>
                  )}
                  {lastMinute ? (
                    <p className="text-[0.8125rem] font-semibold text-primary">{Math.max(0, Math.ceil(left / 1000))} seconds left on this call</p>
                  ) : null}
                  {/* With a card up on a small screen the card gets the room: its words are on the card and in the transcript. */}
                  {dense ? null : <LiveCaptions lines={v.lines} max={compact ? 1 : 3} clamp={compact} />}
                  {v.danger ? (
                    <div role="alert" className="w-full space-y-3 rounded-xl border border-destructive/60 bg-destructive/10 p-4 text-left">
                      <p className="text-sm leading-relaxed">{EMERGENCY.text}</p>
                      <Actions actions={EMERGENCY.actions} />
                    </div>
                  ) : v.buttons.length > 0 ? (
                    <div className="flex justify-center">
                      <Actions actions={v.buttons} />
                    </div>
                  ) : null}
                  <CallCardBlock view={v} />
                  {live && !hasSpoken(v.lines) && !compact && !v.transcript ? (
                    <div className="space-y-1">
                      <p className="font-heading text-[0.65rem] font-bold uppercase tracking-brand text-muted-foreground">Try saying</p>
                      {TRY_SAYING.map((line) => (
                        <p key={line} className="text-[0.8125rem] italic text-muted-foreground">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          {v.transcript ? <TranscriptSheet lines={v.lines} /> : null}
        </div>

        {going ? (
          <footer className="shrink-0 space-y-3 border-t border-border bg-card/60 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
            {v.practice && live ? (
              <form onSubmit={send} className="flex items-center gap-2">
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={v.muted ? 'You are muted' : 'Type what you would say...'}
                  aria-label="What you would say (practice call)"
                  disabled={v.muted}
                  autoComplete="off"
                  enterKeyHint="send"
                  // 16px on phones: iOS zooms the page in on any smaller text box.
                  className="h-12 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:text-sm"
                />
                <Button type="submit" size="icon" aria-label="Say it" disabled={!typed.trim() || v.muted} className="h-12 w-12 shrink-0 rounded-full">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
            ) : null}
            <div className="flex items-end justify-evenly">
              <RoundButton icon={v.muted ? MicOff : Mic} label="Mute" on={v.muted} disabled={!live} onClick={toggleMute} dense={dense} />
              <RoundButton icon={PhoneOff} label="End" end onClick={endCall} dense={dense} />
              <RoundButton icon={v.loud ? Volume2 : Volume1} label="Speaker" on={v.loud} onClick={toggleLoud} dense={dense} />
              <RoundButton icon={Captions} label="Transcript" on={v.transcript} onClick={toggleTranscript} dense={dense} />
            </div>
            <p className="text-balance text-center text-[0.6875rem] leading-snug text-muted-foreground [@media(max-height:700px)]:hidden" hidden={compact}>
              AI assistant · only answers about {site.name} · calls up to {minutes} min
            </p>
          </footer>
        ) : null}
      </motion.section>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ the minimised bar */

/**
 * The call shrunk to a bar while the customer looks at the website: the orb, the time, what is
 * happening, expand, Mute and End. It sits at the bottom, lifted clear of the compare tray, and
 * under the cart drawer and the site's other sheets, so it never covers their buttons.
 */
function CallBar({ view: v }: { view: CallView }) {
  const reduced = useReducedMotion()
  const { pathname } = useLocation()
  const compareActive = useCompare((s) => s.ids.length > 0)
  const trayVisible =
    compareActive && !pathname.startsWith('/compare') && !pathname.startsWith('/checkout') && !pathname.startsWith('/admin')
  const live = v.phase === 'live'
  const now = useNow(live)
  const hearing = useHearing(live && !v.practice && !v.muted)
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24, transition: { duration: reduced ? 0 : 0.15 } }}
      className={cn(
        'fixed z-[55] flex items-center gap-1 rounded-2xl border border-primary/40 bg-charcoal pr-2 text-charcoal-foreground shadow-lift',
        'left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
        'md:left-auto md:right-6 md:bottom-6 md:w-[24rem]',
        trayVisible && 'bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] md:bottom-[calc(1.5rem+4.75rem)]',
      )}
    >
      <button
        id="call-bar"
        type="button"
        onClick={expandCall}
        aria-label="Open the call with the assistant"
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl py-1.5 pl-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CallOrb size={46} mini />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm font-semibold tabular-nums">
            {live ? callTime(v, now) : v.practice ? 'Practice call' : 'Voice call'}
          </span>
          <span className="block truncate text-xs text-charcoal-foreground/65">{v.muted ? 'You are muted' : v.note || statusText(v, hearing)}</span>
        </span>
        <Maximize2 className="mr-1 h-4 w-4 shrink-0 text-charcoal-foreground/60" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={toggleMute}
        disabled={!live}
        aria-label={v.muted ? 'Unmute the microphone' : 'Mute the microphone'}
        className={cn(
          'grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          v.muted ? 'bg-white text-charcoal' : 'bg-white/10 text-charcoal-foreground hover:bg-white/20',
        )}
      >
        {v.muted ? <MicOff className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" /> : <Mic className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={endCall}
        aria-label="End the call"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PhoneOff className="h-[1.05rem] w-[1.05rem]" aria-hidden="true" />
      </button>
    </motion.div>
  )
}

/**
 * Where the call shows: the full screen, or its bar once it is minimised. Mounted with the
 * assistant, and always (also on the admin pages), so the call goes on wherever the customer goes.
 */
export function CallLayer() {
  const view = useCall((s) => s.view)
  return (
    <AnimatePresence>
      {view && !view.minimized ? <CallScreen key="screen" view={view} /> : null}
      {view && view.minimized && isGoing(view) ? <CallBar key="bar" view={view} /> : null}
    </AnimatePresence>
  )
}
