import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ExternalLink,
  MessageSquare,
  Mic,
  Phone,
  PhoneOff,
  Receipt,
  Search,
  ShoppingCart,
  UserRound,
  X,
} from 'lucide-react'
import {
  AdminEmpty,
  AdminError,
  AdminPanel,
} from '@/components/admin/AdminStates'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import {
  Badge,
  Button,
  Input,
  Label,
  Skeleton,
  type BadgeVariant,
} from '@/components/ui'
import {
  api,
  type AiCardOutcome,
  type AiCardView,
  type AiConversationDetail,
  type AiConversationFilter,
  type AiConversationRow,
  type AiTranscriptEntry,
} from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'
import { adminToken, handleAdminError } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * Conversations
 *
 * Two panes on a wide screen (the list, then the chat); on a phone the
 * list is the page and opening a chat replaces it, with a Back button.
 * Read only: this is where staff look, not where they talk.
 * ------------------------------------------------------------------ */

const FILTERS: Array<{ value: AiConversationFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'chat', label: 'Chat' },
  { value: 'call', label: 'Calls' },
  { value: 'person', label: 'Asked for a person' },
]

export default function AiConversations() {
  const [filter, setFilter] = useState<AiConversationFilter>('all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Search as you type, but not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const list = useConversationList(filter, q)
  const filtering = filter !== 'all' || q.length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* ---- List: the whole page on a phone until one is opened ---- */}
      <div className={cn('min-w-0', selectedId && 'hidden lg:block')}>
        <AdminPanel
          title="Conversations"
          description={
            list.total !== null
              ? `${formatNumber(list.total)} ${list.total === 1 ? 'conversation' : 'conversations'}${filtering ? ' match' : ''}, newest first.`
              : undefined
          }
          bodyClassName="p-0 md:p-0"
        >
          <div className="flex flex-col gap-3 border-b border-border p-4 md:px-5">
            <div className="relative">
              <Label htmlFor="ai-search" className="sr-only">
                Search what was said
              </Label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="ai-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search what was said"
                className="pl-9"
                maxLength={100}
              />
            </div>

            <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 font-heading text-xs font-bold uppercase tracking-tight transition-colors duration-200 ease-brand',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    filter === item.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {list.loading && list.items.length === 0 ? (
            <ListSkeleton />
          ) : list.error && list.items.length === 0 ? (
            <div className="p-4 md:p-5">
              <AdminError message={list.error} onRetry={list.reload} />
            </div>
          ) : list.items.length === 0 ? (
            <AdminEmpty
              title={filtering ? 'No conversations match' : 'No conversations yet'}
              icon={filtering ? Search : MessageSquare}
              description={
                filtering
                  ? 'Try a different filter, or clear the search.'
                  : 'Chats and calls with the assistant appear here as customers use it. Nothing is being filtered out.'
              }
              className="rounded-none border-0 bg-transparent"
              action={
                filtering ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('')
                      setFilter('all')
                    }}
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {list.items.map((item) => (
                  <li key={item.id}>
                    <ConversationButton
                      item={item}
                      selected={item.id === selectedId}
                      onOpen={() => setSelectedId(item.id)}
                    />
                  </li>
                ))}
              </ul>
              {list.error ? (
                <div className="border-t border-border p-4">
                  <AdminError message={list.error} onRetry={list.more} />
                </div>
              ) : null}
              {list.next ? (
                <div className="border-t border-border p-4 text-center">
                  <Button variant="outline" size="sm" onClick={list.more} disabled={list.loading}>
                    {list.loading ? 'Loading…' : 'Show more'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </AdminPanel>
      </div>

      {/* ---- Detail ---- */}
      <div className={cn('min-w-0', !selectedId && 'hidden lg:block')}>
        {selectedId ? (
          <ConversationView key={selectedId} id={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <AdminEmpty
            title="Pick a conversation"
            icon={MessageSquare}
            description="Choose one on the left to read what was said and what the assistant did."
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * The list's data
 * ------------------------------------------------------------------ */

function useConversationList(filter: AiConversationFilter, q: string) {
  const [items, setItems] = useState<AiConversationRow[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Only the newest request may write; an older one finishing late is ignored.
  const latest = useRef(0)

  const load = useCallback(
    (cursor: string | undefined) => {
      const token = adminToken()
      if (!token) {
        setLoading(false)
        return
      }
      const run = ++latest.current
      setLoading(true)
      setError(null)
      api.admin
        .aiConversations(token, { filter, q, cursor })
        .then((page) => {
          if (run !== latest.current) return
          setItems((current) => (cursor ? [...current, ...page.conversations] : page.conversations))
          setNext(page.next)
          setTotal(page.total)
          setLoading(false)
        })
        .catch((failure: unknown) => {
          const handled = handleAdminError(failure)
          if (run !== latest.current) return
          setError(handled.message)
          setLoading(false)
        })
    },
    [filter, q],
  )

  // A new filter or search starts the list again from the top.
  useEffect(() => {
    setItems([])
    setNext(null)
    setTotal(null)
    load(undefined)
  }, [load, attempt])

  return {
    items,
    next,
    total,
    loading,
    error,
    reload: () => setAttempt((n) => n + 1),
    more: () => load(next ?? undefined),
  }
}

/* ------------------------------------------------------------------ *
 * List row
 * ------------------------------------------------------------------ */

function ConversationButton({
  item,
  selected,
  onOpen,
}: {
  item: AiConversationRow
  selected: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'block w-full p-4 text-left transition-colors duration-200 ease-brand md:px-5',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-primary/[0.06]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs tabular-nums text-muted-foreground">{dateTime(item.lastAt)}</p>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatNumber(item.messages)} {item.messages === 1 ? 'message' : 'messages'}
        </p>
      </div>

      <p className="mt-1.5 line-clamp-2 break-words text-sm font-medium">
        {item.preview || 'No messages yet'}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {item.hasChat || !item.hasCall ? (
          <Badge variant="outline" size="sm">
            <MessageSquare aria-hidden="true" className="h-3 w-3" />
            Chat
          </Badge>
        ) : null}
        {item.hasCall ? (
          <Badge variant="default" size="sm">
            <Phone aria-hidden="true" className="h-3 w-3" />
            Call
          </Badge>
        ) : null}
        {item.askedForPerson ? (
          <Badge variant="warning" size="sm">
            <UserRound aria-hidden="true" className="h-3 w-3" />
            Asked for a person
          </Badge>
        ) : null}
        {item.cardsShown > 0 ? (
          <Badge variant={item.cardsAdded + item.cardsSent > 0 ? 'success' : 'outline'} size="sm">
            <ShoppingCart aria-hidden="true" className="h-3 w-3" />
            {item.cardsAdded + item.cardsSent} of {item.cardsShown} {item.cardsShown === 1 ? 'card' : 'cards'} used
          </Badge>
        ) : null}
        {item.orderRef ? (
          <Badge variant="primary" size="sm">
            <Receipt aria-hidden="true" className="h-3 w-3" />
            Order
          </Badge>
        ) : null}
      </div>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Detail
 * ------------------------------------------------------------------ */

function ConversationView({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useAdminQuery(`admin-ai-conversation-${id}`, (token) =>
    api.admin.aiConversation(token, id),
  )
  const conversation = query.data?.conversation

  return (
    <AdminPanel
      title="Conversation"
      description={
        conversation
          ? `Started ${dateTime(conversation.startedAt)}, last active ${dateTime(conversation.lastAt)}.`
          : undefined
      }
      action={
        <Button variant="outline" size="sm" onClick={onBack} className="lg:hidden">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Back to the list
        </Button>
      }
    >
      {query.loading ? (
        <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
          <span className="sr-only">Loading the conversation…</span>
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className={cn('h-16 w-4/5', index % 2 === 1 && 'self-end')} />
          ))}
        </div>
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : conversation ? (
        <Transcript conversation={conversation} />
      ) : null}
    </AdminPanel>
  )
}

function Transcript({ conversation }: { conversation: AiConversationDetail }) {
  return (
    <div className="flex flex-col gap-4">
      {conversation.orderRef ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <Receipt aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          <span>This chat led to order</span>
          <Link
            to={`/admin/orders?search=${encodeURIComponent(conversation.orderRef)}`}
            className="inline-flex items-center gap-1 rounded-sm font-mono font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {conversation.orderRef}
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
            <span className="sr-only"> (open in Orders)</span>
          </Link>
        </p>
      ) : null}

      {conversation.entries.length === 0 ? (
        <AdminEmpty
          title="Nothing was said"
          icon={MessageSquare}
          description="This conversation was opened but no messages were kept."
          className="py-8"
        />
      ) : null}

      <ol className="flex flex-col gap-3">
        {conversation.entries.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`}>
            <Entry entry={entry} />
          </li>
        ))}
      </ol>

      {conversation.truncated ? (
        <p className="text-xs text-muted-foreground">
          This conversation is very long. Only the first 1,000 messages are shown.
        </p>
      ) : null}
    </div>
  )
}

function Entry({ entry }: { entry: AiTranscriptEntry }) {
  if (entry.kind === 'call') return <CallBanner entry={entry} />

  if (entry.kind === 'event') {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-heading font-bold uppercase tracking-brand">Note: </span>
        {entry.text}
        <span className="ml-2 tabular-nums">{timeOnly(entry.at)}</span>
      </p>
    )
  }

  const customer = entry.role === 'customer'
  const didAnything =
    entry.did.length > 0 || entry.pages.length > 0 || entry.cards.length > 0 || entry.buttons

  return (
    <div className={cn('flex flex-col gap-2', customer ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[85%]',
          customer ? 'border-primary/30 bg-primary/10' : 'border-border bg-muted/40',
        )}
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground">
          {customer ? 'Customer' : 'Assistant'}
          {entry.onCall ? (
            <Badge variant="default" size="sm">
              <Mic aria-hidden="true" className="h-3 w-3" />
              On the call
            </Badge>
          ) : null}
          {entry.emergency ? (
            <Badge variant="destructive" size="sm">
              Emergency
            </Badge>
          ) : null}
          <span className="font-sans font-normal normal-case tracking-normal tabular-nums">
            {timeOnly(entry.at)}
          </span>
        </p>
        {entry.text ? (
          <p className="mt-1.5 whitespace-pre-wrap break-words">{entry.text}</p>
        ) : (
          <p className="mt-1.5 italic text-muted-foreground">
            {entry.fallback ? `Could not answer (${FALLBACK_LABEL[entry.fallback] ?? entry.fallback}).` : 'No words, only actions.'}
          </p>
        )}
      </div>

      {!customer && (didAnything || entry.fallback) ? (
        <div className="w-full max-w-[92%] rounded-md border border-border bg-background p-3 sm:max-w-[85%]">
          <p className="font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground">
            What it did
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed">
            {entry.did.map((note, index) => (
              <li key={`did-${index}`} className="flex items-start gap-2">
                <Check aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span className="min-w-0 break-words">{note}</span>
              </li>
            ))}
            {entry.pages.map((page, index) => (
              <li key={`page-${index}`} className="flex items-start gap-2">
                <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span className="min-w-0 break-words">
                  Opened a page: {page.note || page.to}
                  {page.to ? <span className="ml-1 font-mono text-muted-foreground">{page.to}</span> : null}
                </span>
              </li>
            ))}
            {entry.buttons && !entry.did.some((note) => /call and email buttons/i.test(note)) ? (
              <li className="flex items-start gap-2">
                <Phone aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                Showed the call and email buttons
              </li>
            ) : null}
            {entry.fallback ? (
              <li className="flex items-start gap-2">
                <PhoneOff aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                Could not answer this time: {FALLBACK_LABEL[entry.fallback] ?? entry.fallback}
              </li>
            ) : null}
          </ul>

          {entry.cards.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {entry.cards.map((card) => (
                <CardLine key={card.id} card={card} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const FALLBACK_LABEL: Record<string, string> = {
  busy: 'it was busy',
  off: 'it was switched off',
  daily: 'the daily limit was reached',
  monthly: 'the monthly limit was reached',
  not_configured: 'it was not set up',
  slow: 'the model was too slow',
  error: 'there was an error',
}

const OUTCOME: Record<AiCardOutcome, { label: string; variant: BadgeVariant }> = {
  added: { label: 'Customer added it to the cart', variant: 'success' },
  sent: { label: 'Customer sent it to the sales team', variant: 'success' },
  dismissed: { label: 'Customer dismissed it', variant: 'outline' },
  failed: { label: 'It failed to go through', variant: 'destructive' },
  none: { label: 'Never answered', variant: 'warning' },
}

function CardLine({ card }: { card: AiCardView }) {
  const outcome = OUTCOME[card.outcome]
  return (
    <li className="rounded-md border border-border bg-muted/30 p-2.5">
      <p className="flex items-start gap-2 text-xs font-medium leading-relaxed">
        <ShoppingCart aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
        <span className="min-w-0 break-words">Showed a card. {card.summary}</span>
      </p>
      <p className="mt-1.5">
        <Badge variant={outcome.variant} size="sm" className="h-auto whitespace-normal py-0.5 text-left">
          {outcome.label}
        </Badge>
      </p>
    </li>
  )
}

const END_REASON: Record<string, string> = {
  user: 'The customer ended the call',
  time: 'The call reached its time limit',
  lost: 'The connection was lost',
  error: 'The call ended because of an error',
  page: 'The customer left the page',
  mic: 'The microphone could not be used',
  replaced: 'A new call was started',
  failed: 'The call could not be opened',
}

function CallBanner({ entry }: { entry: Extract<AiTranscriptEntry, { kind: 'call' }> }) {
  const seconds =
    entry.seconds > 0
      ? entry.seconds
      : entry.endedAt
        ? Math.max(0, Math.round((Date.parse(entry.endedAt) - Date.parse(entry.at)) / 1000))
        : 0
  const live = entry.status === 'live' || entry.status === 'opening'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-primary/30 bg-primary/[0.06] px-3.5 py-2.5 text-sm">
      <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-semibold">Voice call{entry.practice ? ' (practice)' : ''}</span>
      <span className="text-xs tabular-nums text-muted-foreground">
        Started {timeOnly(entry.at)}
        {entry.endedAt ? `, ended ${timeOnly(entry.endedAt)}` : ''}
        {' · '}
        {clock(seconds)}
        {' · '}
        {formatNumber(entry.lines)} {entry.lines === 1 ? 'line' : 'lines'}
      </span>
      <span className="text-xs text-muted-foreground">
        {live ? 'Still in progress' : (END_REASON[entry.endReason] ?? 'The call ended')}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function dateTime(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return iso
  return new Date(parsed).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function timeOnly(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

/** 75 seconds as "1:15". */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-3 p-4">
      <span className="sr-only">Loading conversations…</span>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-20 w-full" />
      ))}
    </div>
  )
}
