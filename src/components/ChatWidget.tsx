import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare, Phone, Send, Sparkles, X } from 'lucide-react'
import { site } from '@/config/site'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useCompare } from '@/store/ui'
import { useEscapeKey, useReducedMotion } from '@/hooks'
import { Button, Input } from '@/components/ui'
import { AnimatePresence, motion } from '@/components/motion'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const GREETING =
  "Hello! I'm the Spartan Tyres assistant. Ask me about tyre sizes, axle fitments, delivery, fleet pricing — or anything else about our range.";

const SUGGESTIONS = [
  'What size do I need for a steer axle?',
  'Do you deliver to Perth?',
  'What is the difference between Greforce and Lionshead?',
  'Can I pick up and have them fitted?',
]

/**
 * Floating assistant.
 *
 * Backed by `/api/chat`, which uses Claude when an API key is configured and a
 * keyword responder grounded in the real site data when it is not. Either way
 * it is instructed never to invent stock or pricing — anything commercial gets
 * routed to the phone number, which is also always one tap away in this panel.
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: 'greeting', role: 'assistant', content: GREETING },
  ])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduced = useReducedMotion()
  const { pathname } = useLocation()

  // The compare tray is a full-width bar pinned to the bottom; lift the button
  // clear of it rather than letting the two overlap.
  const compareActive = useCompare((s) => s.ids.length > 0)
  const trayVisible =
    compareActive &&
    !pathname.startsWith('/compare') &&
    !pathname.startsWith('/checkout') &&
    !pathname.startsWith('/admin')

  // The assistant has no place in the admin panel.
  const hidden = pathname.startsWith('/admin')

  useEscapeKey(() => setOpen(false), open)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({
      top: node.scrollHeight,
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [messages, reduced])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || sending) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    const history = [...messages, userMessage]

    setMessages(history)
    setDraft('')
    setSending(true)

    try {
      const { reply } = await api.chat({
        // Drop the local greeting — the server supplies its own system context.
        messages: history
          .filter((message) => message.id !== 'greeting')
          .map(({ role, content }) => ({ role, content })),
      })
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'assistant', content: reply },
      ])
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I'm having trouble connecting right now. Please try again, or call us on ${site.phone.display} and the team will help you straight away.`,
        },
      ])
    } finally {
      setSending(false)
    }
  }

  if (hidden) return null

  return (
    <>
      {/* Launcher */}
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        animate={{ y: trayVisible ? -76 : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className={cn(
          'fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow transition-transform hover:scale-105 active:scale-95',
        )}
        aria-label={open ? 'Close chat assistant' : 'Open chat assistant'}
        aria-expanded={open}
      >
        {/* Attention ring, only while closed */}
        {!open && !reduced ? (
          <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/40" />
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'open'}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative flex"
          >
            {open ? (
              <X className="h-6 w-6" />
            ) : (
              <MessageSquare className="h-6 w-6" />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-label="Spartan Tyres chat assistant"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={cn(
              'fixed z-40 flex flex-col overflow-hidden rounded-xl border-2 border-primary/30 bg-background shadow-lift',
              'inset-x-4 bottom-24 max-h-[70vh] sm:inset-x-auto sm:right-5 sm:w-[23rem]',
              trayVisible && 'bottom-[11rem] sm:bottom-[11rem]',
            )}
          >
            <header className="flex items-center gap-3 border-b border-border bg-charcoal p-4 text-charcoal-foreground">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-charcoal bg-green-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-sm font-bold uppercase tracking-wide">
                  Tyre assistant
                </p>
                <p className="text-[0.7rem] text-white/60">
                  {site.hours.short}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto p-4"
              aria-live="polite"
              aria-atomic="false"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex',
                    message.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <p
                    className={cn(
                      'max-w-[85%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm bg-muted text-foreground',
                    )}
                  >
                    {message.content}
                  </p>
                </div>
              ))}

              {sending ? (
                <div className="flex justify-start">
                  <span className="flex gap-1 rounded-lg rounded-bl-sm bg-muted px-4 py-3.5">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={index}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                        style={{ animationDelay: `${index * 0.12}s` }}
                      />
                    ))}
                    <span className="sr-only">Assistant is typing</span>
                  </span>
                </div>
              ) : null}

              {messages.length === 1 && !sending ? (
                <div className="pt-1">
                  <p className="mb-2 font-heading text-[0.6rem] font-bold uppercase tracking-brand text-muted-foreground">
                    Try asking
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => send(suggestion)}
                        className="rounded-md border border-border bg-card px-3 py-2 text-left text-xs transition-colors hover:border-primary hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border bg-card px-4 py-2.5">
              <p className="flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground">
                Prefer to talk?
                <a
                  href={site.phone.href}
                  className="flex items-center gap-1 font-semibold text-primary hover:underline"
                >
                  <Phone className="h-3 w-3" />
                  {site.phone.display}
                </a>
              </p>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                send(draft)
              }}
              className="flex gap-2 border-t border-border p-3"
            >
              <Input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about sizes, delivery, fitment…"
                aria-label="Your message"
                disabled={sending}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!draft.trim() || sending}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
