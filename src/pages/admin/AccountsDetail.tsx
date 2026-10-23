import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Link2, UserCheck } from 'lucide-react'
import { Seo } from '@/components/Seo'
import { AdminError } from '@/components/admin/AdminStates'
import { useAdminAction } from '@/components/admin/AdminKit'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import { ActivitySection } from '@/components/admin/accounts/ActivitySection'
import { CreditSection } from '@/components/admin/accounts/CreditSection'
import { LevelBadge, StatusBadge } from '@/components/admin/accounts/parts'
import { DetailsSection, LevelSection, SignInSection } from '@/components/admin/accounts/ProfileSections'
import { SpecialPrices } from '@/components/admin/accounts/SpecialPrices'
import { Badge, Button, Skeleton } from '@/components/ui'
import { accountsApi, type AccountDetail, type StaffAccount } from '@/lib/admin-accounts-api'
import { LEVEL_LABELS, businessName } from '@/lib/admin-accounts-ui'

/* ------------------------------------------------------------------ *
 * One customer account: details, level and discount, special prices,
 * pay later, sign-in and activity.
 * ------------------------------------------------------------------ */

export default function AccountsDetail() {
  const { id = '' } = useParams()
  const query = useAdminQuery(`admin-account-${id}`, (token) => accountsApi.get(token, id))
  const { run, busy } = useAdminAction()

  const data = query.data
  const patch = (update: (d: AccountDetail) => AccountDetail) => query.patch(update)
  const setAccount = (account: StaffAccount) => patch((d) => ({ ...d, account }))

  const decide = async (decision: 'approve' | 'reject') => {
    if (!data) return
    const asked = data.account.requestedLevel
    if (!asked) return
    const name = businessName(data.account)
    if (
      decision === 'reject' &&
      !window.confirm(`Decline ${LEVEL_LABELS[asked]} for ${name}?\n\nThey stay a ${LEVEL_LABELS[data.account.level]} account and are told by email.`)
    ) {
      return
    }
    const result = await run((token) => accountsApi.decide(token, id, decision), {
      success: decision === 'approve' ? `${LEVEL_LABELS[asked]} approved` : `${LEVEL_LABELS[asked]} declined`,
      successDetail:
        decision === 'approve' ? 'The customer is told by email. Check their agreed discount below.' : 'The customer is told by email.',
      failure: decision === 'approve' ? 'Could not approve the request' : 'Could not decline the request',
    })
    if (result) setAccount(result.account)
  }

  const link = async () => {
    if (!data?.posMatch) return
    const m = data.posMatch
    const who = m.company || m.name
    if (
      !window.confirm(
        `Link ${businessName(data.account)} to the till customer "${who}"?\n\nOnly do this if it is the same business. The account then shares that customer's balance and history.`,
      )
    ) {
      return
    }
    const result = await run((token) => accountsApi.linkPos(token, id), {
      success: 'Linked to the till customer',
      successDetail: 'Owing now starts at that customer\'s real balance.',
      failure: 'Could not link the account',
    })
    if (result) query.reload()
  }

  return (
    <>
      <Seo title="Customer account | Spartan Tyres admin" description="One customer account." noIndex />

      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/accounts">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            All accounts
          </Link>
        </Button>
      </div>

      {query.loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : query.error || !data ? (
        <AdminError message={query.error ?? 'This account could not be loaded.'} onRetry={query.reload} />
      ) : (
        <div className="flex flex-col gap-6">
          <Header account={data.account} />

          {data.account.requestedLevel && data.account.requestedLevel !== data.account.level ? (
            <div role="region" aria-label="Level request" className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <UserCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-heading text-sm font-bold uppercase tracking-brand">Waiting for approval</p>
                  <p className="mt-1 text-sm leading-relaxed">
                    {businessName(data.account)} asked for a {LEVEL_LABELS[data.account.requestedLevel]} account. They are a {LEVEL_LABELS[data.account.level]} account for now.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" onClick={() => decide('approve')} loading={busy}>
                  Approve {LEVEL_LABELS[data.account.requestedLevel]}
                </Button>
                <Button type="button" variant="outline" onClick={() => decide('reject')} disabled={busy}>
                  Decline
                </Button>
              </div>
            </div>
          ) : null}

          {data.posMatch ? (
            <div role="region" aria-label="Till customer with the same email" className="flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Link2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                <p className="text-sm leading-relaxed">
                  A till customer already uses this email: <span className="font-semibold">{data.posMatch.company || data.posMatch.name}</span>
                  {data.posMatch.company && data.posMatch.name ? ` (${data.posMatch.name})` : ''}. Link them only if this is the same business.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={link} loading={busy} className="shrink-0">
                Link to this till customer
              </Button>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <DetailsSection
              key={[data.account.email, data.account.name, data.account.company, data.account.phone, data.account.abn, data.account.address, data.account.notes].join('\u0001')}
              account={data.account}
              onSaved={setAccount}
            />
            <div className="flex flex-col gap-6">
              <LevelSection key={`${data.account.level}|${data.account.discountPct}`} account={data.account} onSaved={setAccount} />
              <SignInSection account={data.account} onSaved={setAccount} />
            </div>
          </div>

          <SpecialPrices
            key={data.prices.map((p) => `${p.productId}:${p.price}`).join(',')}
            accountId={data.account.id}
            discountPct={data.account.discountPct}
            saved={data.prices}
            onSaved={(prices) => patch((d) => ({ ...d, prices }))}
          />

          <CreditSection
            key={`${data.account.payLater}|${data.account.termsDays}|${data.account.creditLimit}`}
            account={data.account}
            posCustomer={data.posCustomer}
            needsLink={!data.account.posCustomerId}
            canEdit={data.canEditCredit}
            onSaved={setAccount}
          />

          <ActivitySection accountId={data.account.id} posCustomer={data.posCustomer} />
        </div>
      )}
    </>
  )
}

function Header({ account }: { account: StaffAccount }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="break-words font-heading text-2xl font-extrabold uppercase leading-tight tracking-tight">{businessName(account)}</h2>
        {account.company && account.name ? <p className="text-sm text-muted-foreground">{account.name}</p> : null}
        <p className="break-all text-sm text-muted-foreground">{account.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LevelBadge level={account.level} />
        <StatusBadge status={account.status} />
        {account.requestedLevel && account.requestedLevel !== account.level ? (
          <Badge size="sm" variant="warning">
            Wants {LEVEL_LABELS[account.requestedLevel]}
          </Badge>
        ) : null}
        {!account.posCustomerId ? (
          <Badge size="sm" variant="outline">
            Not linked to the till
          </Badge>
        ) : null}
      </div>
    </div>
  )
}
