import { useMemo, useState } from 'react'
import {
  Clock,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserCog,
  UserX,
  Users,
  Wallet,
} from 'lucide-react'
import { Seo } from '@/components/Seo'
import {
  AdminEmpty,
  AdminError,
  AdminNotConfigured,
  AdminPanel,
} from '@/components/admin/AdminStates'
import {
  Tile,
  dayLabel,
  exportSheet,
  parseMoney,
  selectClass,
  td,
  th,
  todayLocal,
  useAdminAction,
} from '@/components/admin/AdminKit'
import { useAdminQuery } from '@/components/admin/useAdminQuery'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Label,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui'
import { PAYMENT_METHODS } from '@/lib/admin-ledger'
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  STAFF_ROLES,
  can,
  type StaffRole,
} from '@/lib/admin-roles'
import { api, type StaffInput, type StaffMember, type Timesheet } from '@/lib/api'
import { cn, formatNumber, moneyExact } from '@/lib/utils'
import { useAdminSession } from '@/store/admin'

/* ------------------------------------------------------------------ *
 * Staff
 *
 * Two jobs. The team: who works here, their role, and whether they can
 * sign in to this admin (only the owner changes those). And hours: log
 * what people worked, see what is owed, and pay it — which records one
 * wages expense on the Balance page so nobody types it twice.
 * ------------------------------------------------------------------ */

const PASSWORD_MIN = 10

type StaffData = { staff: StaffMember[]; timesheets: Timesheet[]; canManageAccounts: boolean }

export default function Staff() {
  const query = useAdminQuery('admin-staff', (token) => api.admin.staff(token))
  const { user } = useAdminSession()
  const { run, busy } = useAdminAction()

  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null)
  const [paying, setPaying] = useState<{ member: StaffMember; entries: Timesheet[] } | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [sheetStaff, setSheetStaff] = useState('all')
  const [sheetPaid, setSheetPaid] = useState<'all' | 'unpaid' | 'paid'>('unpaid')

  const data = query.data
  const staff = data?.staff ?? []
  const timesheets = data?.timesheets ?? []
  const manage = data?.canManageAccounts ?? false
  const canPay = can(user.role, 'payments')
  const byId = useMemo(() => new Map(staff.map((m) => [m.id, m])), [staff])

  const owed = useMemo(() => {
    const map = new Map<string, { hours: number; amount: number; entries: Timesheet[] }>()
    for (const entry of timesheets) {
      if (entry.paid) continue
      const row = map.get(entry.staffId) ?? { hours: 0, amount: 0, entries: [] }
      row.hours += entry.hours
      row.amount += entry.hours * entry.rate
      row.entries.push(entry)
      map.set(entry.staffId, row)
    }
    return map
  }, [timesheets])

  const totals = useMemo(() => {
    const month = todayLocal().slice(0, 7)
    let unpaidHours = 0
    let unpaidAmount = 0
    let paidThisMonth = 0
    for (const entry of timesheets) {
      if (!entry.paid) {
        unpaidHours += entry.hours
        unpaidAmount += entry.hours * entry.rate
      } else if (entry.paidAt && entry.paidAt.slice(0, 7) === month) {
        paidThisMonth += entry.hours * entry.rate
      }
    }
    return { unpaidHours, unpaidAmount, paidThisMonth }
  }, [timesheets])

  const visibleStaff = staff.filter((m) => showInactive || m.active)
  const visibleSheets = timesheets.filter(
    (entry) =>
      (sheetStaff === 'all' || entry.staffId === sheetStaff) &&
      (sheetPaid === 'all' || (sheetPaid === 'paid' ? entry.paid : !entry.paid)),
  )

  const patchData = (fn: (d: StaffData) => StaffData) => query.patch(fn)

  const toggleActive = async (member: StaffMember) => {
    const result = await run((token) => api.admin.updateStaff(token, member.id, { active: !member.active }), {
      success: member.active ? `${member.name} deactivated` : `${member.name} reactivated`,
      successDetail: member.active ? 'Any session they had open has ended.' : undefined,
      failure: `Could not update ${member.name}`,
    })
    if (result) patchData((d) => ({ ...d, staff: d.staff.map((m) => (m.id === member.id ? result.member : m)) }))
  }

  const remove = async (member: StaffMember) => {
    if (!window.confirm(`Delete ${member.name}? This can't be undone.`)) return
    const result = await run((token) => api.admin.deleteStaff(token, member.id), {
      success: `${member.name} deleted`,
      failure: `Could not delete ${member.name}`,
    })
    if (result) patchData((d) => ({ ...d, staff: d.staff.filter((m) => m.id !== member.id) }))
  }

  const removeHours = async (entry: Timesheet) => {
    const result = await run((token) => api.admin.deleteHours(token, entry.id), {
      success: 'Hours removed',
      failure: 'Could not remove those hours',
    })
    if (result) patchData((d) => ({ ...d, timesheets: d.timesheets.filter((t) => t.id !== entry.id) }))
  }

  if (query.notConfigured) return <AdminNotConfigured message={query.error ?? undefined} />

  return (
    <>
      <Seo title="Staff — Spartan Tyres admin" description="Team, sign-ins, hours and wages." noIndex />

      {query.loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : query.error ? (
        <AdminError message={query.error} onRetry={query.reload} />
      ) : data ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Active staff" value={formatNumber(staff.filter((m) => m.active).length)} icon={Users} hint={`${staff.filter((m) => m.active && m.hasLogin).length} can sign in to this admin`} />
            <Tile label="Unpaid hours" value={formatNumber(Math.round(totals.unpaidHours * 100) / 100)} icon={Clock} />
            <Tile label="Wages owed" value={moneyExact(totals.unpaidAmount)} icon={Wallet} tone={totals.unpaidAmount ? 'warn' : 'default'} />
            <Tile label="Wages paid this month" value={moneyExact(totals.paidThisMonth)} />
          </div>

          <Tabs defaultValue="team">
            <TabsList label="Staff views">
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="hours">Hours &amp; pay</TabsTrigger>
            </TabsList>

            {/* ---- Team ------------------------------------------- */}
            <TabsContent value="team" className="mt-4">
              <AdminPanel
                title="Team"
                description={
                  manage
                    ? 'Give someone a sign-in by setting a password; their role decides what they can open. Deactivating ends their session at once.'
                    : 'Only the owner can add people or change sign-ins and roles.'
                }
                bodyClassName="p-0 md:p-0"
                action={
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                      Show inactive
                    </label>
                    {manage ? (
                      <Button size="sm" onClick={() => setEditing('new')}>
                        <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        Add staff member
                      </Button>
                    ) : null}
                  </div>
                }
              >
                {visibleStaff.length === 0 ? (
                  <AdminEmpty
                    title="No staff yet"
                    icon={UserCog}
                    description="Add the people who work here to track their hours and give them their own sign-in. The owner password keeps working either way."
                    className="rounded-none border-0 bg-transparent"
                    action={
                      manage ? (
                        <Button size="sm" onClick={() => setEditing('new')}>
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                          Add staff member
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Staff members</caption>
                      <thead>
                        <tr>
                          <th className={th}>Name</th>
                          <th className={th}>Role</th>
                          <th className={th}>Contact</th>
                          <th className={cn(th, 'text-right')}>Pay rate</th>
                          <th className={th}>Sign-in</th>
                          <th className={cn(th, 'text-right')}>Owed</th>
                          {manage ? <th className={cn(th, 'text-right')}>Actions</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleStaff.map((member) => {
                          const due = owed.get(member.id)
                          return (
                            <tr key={member.id} className={cn('hover:bg-muted/30', !member.active && 'opacity-60')}>
                              <td className={td}>
                                <p className="font-semibold">{member.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {member.position || '—'}
                                  {member.startDate ? ` · since ${dayLabel(member.startDate)}` : ''}
                                </p>
                              </td>
                              <td className={td}>
                                <Badge size="sm" variant={member.role === 'owner' ? 'charcoal' : member.role === 'manager' ? 'primary' : 'outline'}>
                                  {ROLE_LABELS[member.role]}
                                </Badge>
                                {!member.active ? (
                                  <Badge size="sm" variant="outline" className="ml-1">
                                    Inactive
                                  </Badge>
                                ) : null}
                              </td>
                              <td className={cn(td, 'text-xs')}>
                                <a className="hover:underline" href={`mailto:${member.email}`}>
                                  {member.email}
                                </a>
                                {member.phone ? (
                                  <p>
                                    <a className="text-muted-foreground hover:underline" href={`tel:${member.phone.replace(/\s/g, '')}`}>
                                      {member.phone}
                                    </a>
                                  </p>
                                ) : null}
                              </td>
                              <td className={cn(td, 'text-right tabular-nums')}>{member.payRate != null ? `${moneyExact(member.payRate)}/h` : '—'}</td>
                              <td className={td}>
                                {member.hasLogin ? (
                                  <Badge size="sm" variant="success">
                                    <KeyRound aria-hidden="true" className="h-3 w-3" />
                                    Can sign in
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No sign-in</span>
                                )}
                              </td>
                              <td className={cn(td, 'text-right tabular-nums')}>
                                {due ? (
                                  <>
                                    <p className="font-semibold">{moneyExact(due.amount)}</p>
                                    <p className="text-xs text-muted-foreground">{Math.round(due.hours * 100) / 100}h</p>
                                  </>
                                ) : (
                                  '—'
                                )}
                              </td>
                              {manage ? (
                                <td className={cn(td, 'text-right')}>
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => setEditing(member)} aria-label={`Edit ${member.name}`} title="Edit">
                                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => toggleActive(member)}
                                      aria-label={member.active ? `Deactivate ${member.name}` : `Reactivate ${member.name}`}
                                      title={member.active ? 'Deactivate' : 'Reactivate'}
                                    >
                                      {member.active ? <UserX aria-hidden="true" className="h-3.5 w-3.5" /> : <UserCheck aria-hidden="true" className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(member)} aria-label={`Delete ${member.name}`} title="Delete">
                                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              ) : null}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminPanel>
            </TabsContent>

            {/* ---- Hours & pay ------------------------------------ */}
            <TabsContent value="hours" className="mt-4 flex flex-col gap-6">
              <LogHours
                staff={staff.filter((m) => m.active)}
                onLogged={(entry) => patchData((d) => ({ ...d, timesheets: [entry, ...d.timesheets] }))}
              />

              {owed.size ? (
                <AdminPanel title="Owed now" description={canPay ? 'Pay someone to record one wages expense and mark their hours paid.' : 'An owner or manager records wage payments.'}>
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[...owed.entries()].map(([staffId, due]) => {
                      const member = byId.get(staffId)
                      return (
                        <li key={staffId} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                          <div>
                            <p className="font-semibold">{member?.name ?? 'Former staff member'}</p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(due.hours * 100) / 100}h · {moneyExact(due.amount)}
                            </p>
                          </div>
                          {canPay && member ? (
                            <Button size="sm" onClick={() => setPaying({ member, entries: due.entries })}>
                              Pay
                            </Button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </AdminPanel>
              ) : null}

              <AdminPanel
                title="Timesheets"
                bodyClassName="p-0 md:p-0"
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!visibleSheets.length}
                    onClick={() =>
                      exportSheet(
                        visibleSheets,
                        [
                          { column: 'Date', width: 12, value: (t) => t.date },
                          { column: 'Staff', width: 22, value: (t) => byId.get(t.staffId)?.name ?? 'Former staff member' },
                          { column: 'Hours', width: 8, number: true, value: (t) => t.hours },
                          { column: 'Rate', width: 9, number: true, format: '#,##0.00', value: (t) => t.rate },
                          { column: 'Amount', width: 11, number: true, format: '#,##0.00', value: (t) => Math.round(t.hours * t.rate * 100) / 100 },
                          { column: 'Paid', width: 8, value: (t) => (t.paid ? 'Yes' : 'No') },
                          { column: 'Note', width: 30, value: (t) => t.note },
                          { column: 'Logged by', width: 18, value: (t) => t.createdBy },
                        ],
                        'Spartan-Timesheets',
                        'Timesheets',
                      )
                    }
                  >
                    Export
                  </Button>
                }
              >
                <div className="flex flex-wrap gap-3 border-b border-border p-4 md:px-5">
                  <Label htmlFor="sheet-staff" className="sr-only">
                    Staff member
                  </Label>
                  <select id="sheet-staff" className={selectClass} value={sheetStaff} onChange={(e) => setSheetStaff(e.target.value)}>
                    <option value="all">Everyone</option>
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <Label htmlFor="sheet-paid" className="sr-only">
                    Paid status
                  </Label>
                  <select id="sheet-paid" className={selectClass} value={sheetPaid} onChange={(e) => setSheetPaid(e.target.value as typeof sheetPaid)}>
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="all">All</option>
                  </select>
                </div>
                {visibleSheets.length === 0 ? (
                  <AdminEmpty title="No hours here" icon={Clock} description="Logged hours appear here." className="rounded-none border-0 bg-transparent" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">Timesheet entries</caption>
                      <thead>
                        <tr>
                          <th className={th}>Date</th>
                          <th className={th}>Staff</th>
                          <th className={cn(th, 'text-right')}>Hours</th>
                          <th className={cn(th, 'text-right')}>Amount</th>
                          <th className={th}>Status</th>
                          <th className={th}>Note</th>
                          <th className={cn(th, 'text-right')}>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSheets.map((entry) => (
                          <tr key={entry.id} className="hover:bg-muted/30">
                            <td className={cn(td, 'whitespace-nowrap')}>{dayLabel(entry.date)}</td>
                            <td className={td}>{byId.get(entry.staffId)?.name ?? 'Former staff member'}</td>
                            <td className={cn(td, 'text-right tabular-nums')}>{entry.hours}</td>
                            <td className={cn(td, 'text-right tabular-nums')}>
                              {moneyExact(entry.hours * entry.rate)}
                              <p className="text-xs text-muted-foreground">{moneyExact(entry.rate)}/h</p>
                            </td>
                            <td className={td}>
                              <Badge size="sm" variant={entry.paid ? 'success' : 'warning'}>
                                {entry.paid ? 'Paid' : 'Unpaid'}
                              </Badge>
                            </td>
                            <td className={cn(td, 'text-xs text-muted-foreground')}>{entry.note || '—'}</td>
                            <td className={cn(td, 'text-right')}>
                              {!entry.paid ? (
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => removeHours(entry)} aria-label={`Remove ${entry.hours} hours on ${entry.date}`} title="Remove">
                                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminPanel>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {editing ? (
        <StaffDialog
          member={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(member) => {
            patchData((d) => ({
              ...d,
              staff: d.staff.some((m) => m.id === member.id)
                ? d.staff.map((m) => (m.id === member.id ? member : m))
                : [...d.staff, member].sort((a, b) => a.name.localeCompare(b.name)),
            }))
            setEditing(null)
          }}
        />
      ) : null}

      {paying ? (
        <PayDialog
          member={paying.member}
          entries={paying.entries}
          onClose={() => setPaying(null)}
          onPaid={(entries) => {
            const paid = new Map(entries.map((e) => [e.id, e]))
            patchData((d) => ({ ...d, timesheets: d.timesheets.map((t) => paid.get(t.id) ?? t) }))
            setPaying(null)
          }}
        />
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */

function LogHours({ staff, onLogged }: { staff: StaffMember[]; onLogged: (entry: Timesheet) => void }) {
  const { run, busy } = useAdminAction()
  const [staffId, setStaffId] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const member = staff.find((m) => m.id === staffId)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const h = Number(hours)
    if (!member) return setError('Choose who worked.')
    if (!Number.isFinite(h) || h <= 0 || h > 24) return setError('Hours must be more than 0 and at most 24.')
    if (member.payRate == null) return setError(`${member.name} has no pay rate yet. Set one on their profile first.`)
    const result = await run((token) => api.admin.logHours(token, { staffId: member.id, date, hours: h, note }), {
      success: `${h}h logged for ${member.name}`,
      failure: 'Could not log those hours',
    })
    if (result) {
      onLogged(result.entry)
      setHours('')
      setNote('')
    }
  }

  if (!staff.length) {
    return (
      <AdminEmpty title="Add staff first" icon={Users} description="Hours are logged against a staff member with a pay rate." />
    )
  }

  return (
    <AdminPanel title="Log hours" description="Priced at the person’s pay rate on the day, so a pay rise never changes old weeks.">
      <form onSubmit={submit} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_0.7fr_2fr_auto]" noValidate>
        <Field label="Staff member" htmlFor="log-staff">
          <select id="log-staff" className={cn(selectClass, 'w-full')} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">Choose…</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.payRate != null ? ` (${moneyExact(m.payRate)}/h)` : ' (no rate)'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" htmlFor="log-date">
          <Input id="log-date" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hours" htmlFor="log-hours">
          <Input id="log-hours" type="number" inputMode="decimal" min={0.25} max={24} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="log-note">
          <Input id="log-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional" />
        </Field>
        <Button type="submit" loading={busy}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Log
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </AdminPanel>
  )
}

/* ------------------------------------------------------------------ */

function StaffDialog({
  member,
  onClose,
  onSaved,
}: {
  member: StaffMember | null
  onClose: () => void
  onSaved: (member: StaffMember) => void
}) {
  const { run, busy } = useAdminAction()
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    role: (member?.role ?? 'staff') as StaffRole,
    position: member?.position ?? '',
    payRate: member?.payRate != null ? String(member.payRate) : '',
    startDate: member?.startDate ?? '',
    notes: member?.notes ?? '',
  })
  const [password, setPassword] = useState('')
  const [removeLogin, setRemoveLogin] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Enter their name.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email; it is their sign-in name.')
    const rate = form.payRate.trim() ? parseMoney(form.payRate) : null
    if (form.payRate.trim() && (rate === null || rate <= 0)) return setError('Pay rate must be dollars per hour.')
    if (password && password.length < PASSWORD_MIN) return setError(`Passwords need at least ${PASSWORD_MIN} characters.`)

    const input: StaffInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role,
      position: form.position.trim(),
      payRate: rate,
      startDate: form.startDate,
      notes: form.notes.trim(),
      ...(password ? { password } : {}),
    }

    const result = await run(
      (token) =>
        member
          ? api.admin.updateStaff(token, member.id, { ...input, ...(removeLogin && !password ? { removeLogin: true } : {}) })
          : api.admin.createStaff(token, input),
      {
        success: member ? `${input.name} updated` : `${input.name} added`,
        successDetail: password ? `They can now sign in with ${input.email} and the password you set.` : undefined,
        failure: member ? `Could not update ${member.name}` : 'Could not add that person',
      },
    )
    if (result) onSaved(result.member)
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{member ? `Edit ${member.name}` : 'Add staff member'}</DialogTitle>
            <DialogDescription>
              A password gives them their own sign-in to this admin. Leave it empty for someone who only needs their hours tracked.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 py-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="staff-name" required>
              <Input id="staff-name" value={form.name} onChange={set('name')} maxLength={120} autoFocus />
            </Field>
            <Field label="Email" htmlFor="staff-email" required>
              <Input id="staff-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" />
            </Field>
            <Field label="Phone" htmlFor="staff-phone">
              <Input id="staff-phone" type="tel" value={form.phone} onChange={set('phone')} maxLength={40} />
            </Field>
            <Field label="Job title" htmlFor="staff-position">
              <Input id="staff-position" value={form.position} onChange={set('position')} maxLength={80} placeholder="e.g. Tyre fitter" />
            </Field>
            <Field label="Pay rate ($ per hour)" htmlFor="staff-rate">
              <Input id="staff-rate" inputMode="decimal" value={form.payRate} onChange={set('payRate')} placeholder="e.g. 32.50" />
            </Field>
            <Field label="Start date" htmlFor="staff-start">
              <Input id="staff-start" type="date" value={form.startDate} onChange={set('startDate')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Role" htmlFor="staff-role" hint={ROLE_DESCRIPTIONS[form.role]}>
                <select id="staff-role" className={cn(selectClass, 'w-full')} value={form.role} onChange={set('role')}>
                  {STAFF_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label={member?.hasLogin ? 'New password' : 'Password'}
                htmlFor="staff-password"
                hint={
                  member?.hasLogin
                    ? `Leave empty to keep their current password. A new one signs them out everywhere. At least ${PASSWORD_MIN} characters.`
                    : `At least ${PASSWORD_MIN} characters. Share it with them privately.`
                }
              >
                <Input id="staff-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {member?.hasLogin && !password ? (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={removeLogin} onChange={(e) => setRemoveLogin(e.target.checked)} />
                  Remove their sign-in (keeps them on the team for hours)
                </label>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="staff-notes">
                <Textarea id="staff-notes" rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} />
              </Field>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {member ? 'Save changes' : 'Add staff member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */

function PayDialog({
  member,
  entries,
  onClose,
  onPaid,
}: {
  member: StaffMember
  entries: Timesheet[]
  onClose: () => void
  onPaid: (entries: Timesheet[]) => void
}) {
  const { run, busy } = useAdminAction()
  const [date, setDate] = useState(todayLocal())
  const [method, setMethod] = useState<string>('Bank transfer')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(entries.map((e) => e.id)))

  const chosen = entries.filter((e) => selected.has(e.id))
  const amount = chosen.reduce((sum, e) => sum + e.hours * e.rate, 0)
  const hours = chosen.reduce((sum, e) => sum + e.hours, 0)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!chosen.length) return
    const result = await run((token) => api.admin.payHours(token, chosen.map((e) => e.id), date, method), {
      success: `${member.name} paid ${moneyExact(amount)}`,
      successDetail: 'Recorded as a wages expense on the Balance page.',
      failure: `Could not record the payment to ${member.name}`,
    })
    if (result) onPaid(result.entries)
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent size="md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Pay {member.name}</DialogTitle>
            <DialogDescription>
              Records what you paid. It does not move any money; pay them as you normally do.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-4">
            <fieldset className="max-h-56 overflow-y-auto rounded-md border border-border">
              <legend className="sr-only">Hours to include</legend>
              {entries.map((entry) => (
                <label key={entry.id} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s)
                          if (e.target.checked) next.add(entry.id)
                          else next.delete(entry.id)
                          return next
                        })
                      }
                    />
                    {dayLabel(entry.date)} · {entry.hours}h
                  </span>
                  <span className="tabular-nums">{moneyExact(entry.hours * entry.rate)}</span>
                </label>
              ))}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paid on" htmlFor="pay-date">
                <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Paid by" htmlFor="pay-method">
                <select id="pay-method" className={cn(selectClass, 'w-full')} value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-sm">
              <span className="font-semibold">{moneyExact(amount)}</span> for {Math.round(hours * 100) / 100}h
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!chosen.length}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
