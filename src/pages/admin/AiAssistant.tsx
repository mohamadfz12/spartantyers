import { useState } from 'react'
import { Bot, CircleAlert, Database, MessageSquare, Mic } from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Progress,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type BadgeVariant,
} from '@/components/ui'
import { api, type AiMode, type AiSettingsView, type AiStatus } from '@/lib/api'
import { cn } from '@/lib/utils'
import { SESSION_EXPIRED_MESSAGE, adminToken, handleAdminError, useAdmin } from '@/store/admin'
import { toast } from '@/store/ui'
import AiConversations from './AiConversations'

/* ------------------------------------------------------------------ *
 * AI assistant (admin)
 *
 * Staff SEE and CONTROL the customer assistant here; there is no
 * assistant for staff and no chat input anywhere in the admin. Two tabs:
 *
 *   Controls       the switches, the two US$ limits, what has been spent
 *                  and how the chat and voice are set up.
 *   Conversations  every chat and call, with what the assistant did.
 *
 * `GET /api/admin/ai-status` is the whole picture; the switches and
 * limits save through `PATCH /api/admin/ai-settings`.
 * ------------------------------------------------------------------ */

export default function AiAssistant() {
  const status = useAdminQuery('admin-ai-status', (token) => api.admin.aiStatus(token))

  return (
    <>
      <Seo
        title="AI assistant, Spartan Tyres admin"
        description="What the customer assistant has been asked and done, and its switches and limits."
        noIndex
      />

      {status.notConfigured ? (
        <AdminNotConfigured message={status.error ?? undefined} />
      ) : (
        <Tabs defaultValue="controls">
          <TabsList label="AI assistant sections">
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
          </TabsList>

          <TabsContent value="controls">
            {status.loading && !status.data ? (
              <ControlsSkeleton />
            ) : status.error ? (
              <AdminError message={status.error} onRetry={status.reload} />
            ) : !status.data ? (
              <AdminError message="No data was returned." onRetry={status.reload} />
            ) : (
              <Controls status={status.data} onSaved={status.reload} />
            )}
          </TabsContent>

          <TabsContent value="conversations">
            <AiConversations />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

const MODE_LABEL: Record<AiMode, string> = {
  real: 'On',
  practice: 'Practice (free, test answers)',
  off: 'Off',
  not_configured: 'Not set up',
}

const MODE_VARIANT: Record<AiMode, BadgeVariant> = {
  real: 'success',
  practice: 'warning',
  off: 'destructive',
  not_configured: 'warning',
}

const usd = (n: number) => `US$${n.toFixed(2)}`

function Controls({ status, onSaved }: { status: AiStatus; onSaved: () => void }) {
  const [saving, setSaving] = useState<string | null>(null)

  /** Saves a change and then reloads the status, so every line on the screen agrees with the server. */
  const save = async (label: string, patch: Partial<AiSettingsView>): Promise<boolean> => {
    const token = adminToken()
    if (!token) {
      useAdmin.getState().logout(SESSION_EXPIRED_MESSAGE)
      return false
    }
    setSaving(label)
    try {
      await api.admin.saveAiSettings(token, patch)
      onSaved()
      toast({ title: `${label} saved`, variant: 'success' })
      return true
    } catch (error) {
      const failure = handleAdminError(error)
      toast({ title: `Could not save ${label.toLowerCase()}`, description: failure.message, variant: 'error' })
      return false
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {status.warnings.length > 0 ? (
        <div role="alert" className="flex flex-col gap-3">
          {status.warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-2.5 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-4 text-sm leading-relaxed text-foreground/85"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>{warning}</span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Switches"
          description="Turn the customer assistant on or off. The change applies straight away on the website."
        >
          <div className="flex flex-col gap-4">
            <SwitchRow
              id="ai-chat-switch"
              icon={MessageSquare}
              title="Chat"
              detail="The text chat customers open from the website."
              checked={status.settings.enabled}
              busy={saving !== null}
              onChange={(next) => save('Chat setting', { enabled: next })}
            />
            <SwitchRow
              id="ai-voice-switch"
              icon={Mic}
              title="Voice calls"
              detail="The Call button, for talking to the assistant. Needs the chat switched on too."
              checked={status.settings.voiceEnabled}
              busy={saving !== null}
              onChange={(next) => save('Voice setting', { voiceEnabled: next })}
            />
          </div>
        </AdminPanel>

        <AdminPanel
          title="How it is set up"
          description="Read only. These come from the server's settings."
        >
          <dl className="flex flex-col gap-4 text-sm">
            <ModeLine
              icon={MessageSquare}
              label="Chat"
              mode={status.chat.mode}
              detail={
                status.chat.model
                  ? `Answers come from the model ${status.chat.model}.`
                  : status.chat.mode === 'practice'
                    ? 'Answers come from the free practice assistant on this computer, not a real model.'
                    : status.chat.reason
              }
            />
            <ModeLine
              icon={Mic}
              label="Voice calls"
              mode={status.voice.mode}
              detail={
                status.voice.mode === 'off' || status.voice.mode === 'not_configured'
                  ? status.voice.reason
                  : `${status.voice.mode === 'practice' ? 'Practice calls, free and typed. ' : status.voice.model ? `Model ${status.voice.model}. ` : ''}Each call can last up to ${formatLength(status.voice.callSeconds)}.`
              }
            />
            <div className="flex items-start gap-3">
              <Database aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <dt className="flex flex-wrap items-center gap-2 font-semibold">
                  Database
                  <Badge variant={status.database.connected ? 'success' : 'destructive'} size="sm">
                    {status.database.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                </dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {status.database.connected
                    ? 'Chats, calls, spending and these settings are being saved.'
                    : 'Nothing can be saved or read until it is connected.'}
                </dd>
              </div>
            </div>
          </dl>
        </AdminPanel>
      </div>

      <AdminPanel
        title="Spending"
        description={`What the assistant has cost, in US dollars. A day runs on Sydney time (today is ${status.spend.day}). When a limit is reached the assistant stops answering and points customers to the sales team.`}
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Meter
            label="Spent today"
            spent={status.spend.todayUsd}
            limit={status.limits.dailyUsd}
          />
          <Meter
            label="Spent this month"
            spent={status.spend.monthUsd}
            limit={status.limits.monthlyUsd}
          />
        </div>

        <LimitsForm key={`${status.settings.dailyLimitUsd}-${status.settings.monthlyLimitUsd}`} status={status} saving={saving === 'Limits'} onSave={(patch) => save('Limits', patch)} />
      </AdminPanel>
    </div>
  )
}

function formatLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${seconds} seconds`
  return rest === 0 ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : `${minutes} min ${rest} s`
}

/* ------------------------------------------------------------------ */

function SwitchRow({
  id,
  icon: Icon,
  title,
  detail,
  checked,
  busy,
  onChange,
}: {
  id: string
  icon: typeof Bot
  title: string
  detail: string
  checked: boolean
  busy: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/30 p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p id={`${id}-label`} className="font-semibold">
            {title}
          </p>
          <p id={`${id}-detail`} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {detail}
          </p>
        </div>
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-detail`}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent',
          'transition-colors duration-200 ease-brand',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-brand',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-1',
          )}
        />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}

function ModeLine({
  icon: Icon,
  label,
  mode,
  detail,
}: {
  icon: typeof Bot
  label: string
  mode: AiMode
  detail: string
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <dt className="flex flex-wrap items-center gap-2 font-semibold">
          {label}
          <Badge variant={MODE_VARIANT[mode]} size="sm">
            {MODE_LABEL[mode]}
          </Badge>
        </dt>
        <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</dd>
      </div>
    </div>
  )
}

function Meter({ label, spent, limit }: { label: string; spent: number; limit: number }) {
  const ratio = limit > 0 ? spent / limit : spent > 0 ? 1 : 0
  const tone = ratio >= 1 ? 'bg-destructive' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-primary'

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-[0.6875rem] font-bold uppercase tracking-brand text-muted-foreground">
          {label}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {Math.round(ratio * 100)}% of the limit
        </p>
      </div>
      <p className="mt-2 font-heading text-2xl font-black tabular-nums leading-none">
        {usd(spent)}
        <span className="ml-2 text-sm font-semibold text-muted-foreground">of {usd(limit)}</span>
      </p>
      <Progress
        className="mt-3"
        value={ratio * 100}
        label={`${label}: ${usd(spent)} of ${usd(limit)}`}
        barClassName={tone}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function LimitsForm({
  status,
  saving,
  onSave,
}: {
  status: AiStatus
  saving: boolean
  onSave: (patch: Partial<AiSettingsView>) => Promise<boolean>
}) {
  const [daily, setDaily] = useState(String(status.settings.dailyLimitUsd))
  const [monthly, setMonthly] = useState(String(status.settings.monthlyLimitUsd))

  const dailyValue = parseLimit(daily)
  const monthlyValue = parseLimit(monthly)
  const dailyError = dailyValue === null ? 'Enter an amount from 0 to 1000.' : undefined
  const monthlyError = monthlyValue === null ? 'Enter an amount from 0 to 1000.' : undefined
  const changed =
    dailyValue !== status.settings.dailyLimitUsd || monthlyValue !== status.settings.monthlyLimitUsd

  const { limits } = status
  const dailyCapped = limits.dailyCapUsd !== null && limits.dailyCapUsd < status.settings.dailyLimitUsd
  const monthlyCapped = limits.monthlyCapUsd !== null && limits.monthlyCapUsd < status.settings.monthlyLimitUsd

  return (
    <form
      className="mt-6 border-t border-border pt-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (dailyValue === null || monthlyValue === null) return
        void onSave({ dailyLimitUsd: dailyValue, monthlyLimitUsd: monthlyValue })
      }}
      noValidate
    >
      <h3 className="font-heading text-xs font-bold uppercase tracking-brand text-muted-foreground">
        Spending limits (US dollars)
      </h3>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <Field
          label="Daily limit"
          htmlFor="ai-daily-limit"
          error={dailyError}
          hint={dailyCapped ? `The server caps this at ${usd(limits.dailyCapUsd ?? 0)}, which is the limit in force.` : 'Most the assistant may spend in one Sydney day.'}
        >
          <Input
            id="ai-daily-limit"
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step="0.01"
            value={daily}
            onChange={(event) => setDaily(event.target.value)}
          />
        </Field>
        <Field
          label="Monthly limit"
          htmlFor="ai-monthly-limit"
          error={monthlyError}
          hint={monthlyCapped ? `The server caps this at ${usd(limits.monthlyCapUsd ?? 0)}, which is the limit in force.` : 'Most the assistant may spend in one calendar month.'}
        >
          <Input
            id="ai-monthly-limit"
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step="0.01"
            value={monthly}
            onChange={(event) => setMonthly(event.target.value)}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!changed || saving || dailyValue === null || monthlyValue === null}>
          {saving ? 'Saving…' : 'Save limits'}
        </Button>
        {changed ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDaily(String(status.settings.dailyLimitUsd))
              setMonthly(String(status.settings.monthlyLimitUsd))
            }}
          >
            Undo
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/** A limit typed in the form: a number from 0 to 1000, or null when it is not. */
function parseLimit(text: string): number | null {
  if (text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value <= 1000 ? Math.round(value * 100) / 100 : null
}

/* ------------------------------------------------------------------ */

function ControlsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading the AI assistant…</span>
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="p-4 md:p-5">
            <Skeleton className="h-3 w-28" />
            <div className="mt-4 flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-4 md:p-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-20 w-full" />
      </Card>
    </div>
  )
}
