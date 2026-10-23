import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2, MailCheck } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { CHANNEL_LABELS, LEVEL_LABELS } from '@/lib/admin-accounts-ui'
import type { AccountLevel, AccountStatus, InviteResult, SaleChannelKey } from '@/lib/admin-accounts-api'
import { cn } from '@/lib/utils'
import { toast } from '@/store/ui'

/* ------------------------------------------------------------------ *
 * Small pieces shared by the accounts list and the account page
 * ------------------------------------------------------------------ */

const LEVEL_CLASSES: Record<AccountLevel, string> = {
  customer: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  bulk: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  wholesaler: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
}

/** Customer blue, Bulk orange, Wholesaler purple. */
export function LevelBadge({ level, className }: { level: AccountLevel; className?: string }) {
  return (
    <Badge size="sm" variant="outline" className={cn(LEVEL_CLASSES[level], className)}>
      {LEVEL_LABELS[level]}
    </Badge>
  )
}

const CHANNEL_CLASSES: Record<SaleChannelKey, string> = {
  retail: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  bulk: 'border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  wholesale: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
}

/** Retail blue, Bulk orange, Wholesale purple: how a sale is labelled. */
export function ChannelBadge({ channel, className }: { channel: SaleChannelKey; className?: string }) {
  return (
    <Badge size="sm" variant="outline" className={cn(CHANNEL_CLASSES[channel], className)}>
      {CHANNEL_LABELS[channel]}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: AccountStatus }) {
  return status === 'suspended' ? (
    <Badge size="sm" variant="destructive">
      Suspended
    </Badge>
  ) : (
    <Badge size="sm" variant="success">
      Active
    </Badge>
  )
}

/** Copies text; falls back to selecting the field when the browser blocks the clipboard. */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async (text: string, field?: HTMLInputElement | null) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2500)
      toast({ title: 'Link copied', variant: 'success' })
    } catch {
      field?.focus()
      field?.select()
      toast({
        title: 'Could not copy automatically',
        description: 'The link is selected: copy it with Ctrl+C.',
        variant: 'error',
      })
    }
  }
  return { copied, copy }
}

/**
 * What staff see after a set-password or reset link was made. When email is set up the link went to the
 * customer; when it is not, the link is shown once so staff can pass it on. The link is the only secret
 * ever shown, and only here.
 */
export function InviteOutcome({
  result,
  email,
  onDismiss,
}: {
  result: Pick<InviteResult, 'emailSent' | 'inviteLink'>
  email: string
  onDismiss?: () => void
}) {
  const { copied, copy } = useCopy()
  const field = useRef<HTMLInputElement>(null)

  if (result.emailSent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm">
        <MailCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p className="min-w-0 flex-1 break-words">Invite emailed to {email}</p>
        {onDismiss ? (
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Done
          </Button>
        ) : null}
      </div>
    )
  }

  const link = result.inviteLink ?? ''
  return (
    <div role="status" className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm">
      <p className="flex items-start gap-2 leading-relaxed">
        <Link2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>
          Email is not set up yet, so send this link to the customer yourself. It works once and expires in 7 days.
        </span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="invite-link">
          Set-password link
        </label>
        <input
          id="invite-link"
          ref={field}
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="button" variant="outline" onClick={() => copy(link, field.current)}>
          {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {onDismiss ? (
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Done
          </Button>
        ) : null}
      </div>
    </div>
  )
}
