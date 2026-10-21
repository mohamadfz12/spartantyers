import { memo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Mail, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseMarkup } from '@/lib/ai/markup'
import type { ContactAction } from '@/lib/ai/protocol'
import { FALLBACK_NOTE, OFFLINE_NOTE, type Msg } from '@/store/assistant'
import { CartCardView } from './CartCardView'
import { EnquiryCardView } from './EnquiryCardView'

/**
 * An answer's words: `**bold**` and links to pages on this site. Links navigate inside the app;
 * anything else is shown as plain words (see src/lib/ai/markup.ts).
 */
function Markup({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <>
      {parseMarkup(text).map((piece, index) => {
        if (piece.kind === 'bold') return <strong key={index}>{piece.text}</strong>
        if (piece.kind === 'link') {
          return (
            <Link
              key={index}
              to={piece.to}
              onClick={onNavigate}
              className="font-semibold text-primary underline underline-offset-2 hover:no-underline"
            >
              {piece.text}
            </Link>
          )
        }
        return <span key={index}>{piece.text}</span>
      })}
    </>
  )
}

/** The call and email buttons under an answer (and on a call screen). */
export function Actions({ actions }: { actions: ContactAction[] }) {
  return (
    <div className="flex max-w-full flex-wrap gap-2">
      {actions.map((action) => {
        const call = action.kind === 'call'
        const Icon = call ? Phone : Mail
        return (
          <a
            key={`${action.kind}-${action.href}`}
            href={action.href}
            className={cn(
              'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[0.8125rem] font-semibold leading-tight transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              call
                ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                : 'border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {action.label}
          </a>
        )
      })}
    </div>
  )
}

/**
 * One message. Memoised: while an answer streams in only that message changes (the others keep the
 * same object), so a long chat is not drawn again for every few characters on a phone.
 */
export const MessageView = memo(function MessageView({
  message,
  onNavigate,
}: {
  message: Msg
  /** A link in the words was followed: on a phone the panel steps aside so the page can be seen. */
  onNavigate: () => void
}) {
  const mine = message.from === 'me'
  return (
    <div data-from={message.from} className={cn('flex flex-col gap-2', mine ? 'items-end' : 'items-start')}>
      {message.quick ? (
        <p className="max-w-[92%] text-[0.7rem] leading-snug text-muted-foreground">
          {message.quick === 'offline' ? OFFLINE_NOTE : FALLBACK_NOTE}
        </p>
      ) : null}

      {message.text ? (
        <div
          className={cn(
            'max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere] sm:text-sm',
            mine
              ? 'rounded-br-sm bg-primary text-primary-foreground'
              : 'rounded-bl-sm bg-muted text-foreground',
          )}
        >
          {mine ? message.text : <Markup text={message.text} onNavigate={onNavigate} />}
        </div>
      ) : null}

      {message.notes?.map((note) => (
        <p
          key={note}
          className="flex max-w-[92%] items-start gap-1.5 text-xs leading-snug text-muted-foreground"
        >
          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {note}
        </p>
      ))}

      {message.card?.card.kind === 'cart' ? (
        <CartCardView messageId={message.id} view={message.card} card={message.card.card} />
      ) : message.card ? (
        <EnquiryCardView messageId={message.id} view={message.card} card={message.card.card} />
      ) : null}

      {message.actions && message.actions.length > 0 ? <Actions actions={message.actions} /> : null}
    </div>
  )
})
