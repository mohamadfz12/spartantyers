/* ------------------------------------------------------------------ *
 * Orders and statement helpers for the customer portal (React-free).
 * ------------------------------------------------------------------ */

const round2 = (n: number) => Math.round(n * 100) / 100

/** GST included in a GST-inclusive total. */
export function gstIncluded(total: number): number {
  return round2(total / 11)
}

/** "30 October 2026" from a Sydney day (YYYY-MM-DD) or a full timestamp; empty when unreadable. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return ''
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(day ? `${value}T12:00:00+10:00` : value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })
}

export interface PayState {
  label: string
  tone: 'success' | 'warning' | 'destructive' | 'default'
}

/** The one-line payment state shown on an order: Paid, Due <date>, Overdue, Cancelled. */
export function payState(order: {
  status: string
  payment: 'card' | 'account'
  dueDate?: string | null
  paid?: boolean
  overdue?: boolean
}): PayState {
  if (order.status === 'cancelled') return { label: 'Cancelled', tone: 'default' }
  if (order.payment === 'card') return { label: 'Paid by card', tone: 'success' }
  if (order.paid) return { label: 'Paid', tone: 'success' }
  const due = order.dueDate ? formatDay(order.dueDate) : ''
  if (order.overdue) return { label: due ? `Overdue, was due ${due}` : 'Overdue', tone: 'destructive' }
  return { label: due ? `Due ${due}` : 'On account', tone: 'warning' }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Received',
  paid: 'Paid',
  account: 'On account',
  packing: 'Being packed',
  dispatched: 'Dispatched',
  collected: 'Collected',
  cancelled: 'Cancelled',
}

export function orderStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? 'Received'
}

export interface ReorderResult {
  add: Array<{ id: string; quantity: number }>
  notes: string[]
}

/**
 * What a "Reorder" can do today. `find` looks a past line up in the current catalogue and says how
 * many can be bought now (0 when it has no price or no stock). Anything short is reported by name.
 */
export function planReorder(
  lines: Array<{ name: string; size: string; quantity: number }>,
  find: (name: string, size: string) => { id: string; available: number } | null,
): ReorderResult {
  const add: ReorderResult['add'] = []
  const notes: string[] = []
  for (const line of lines) {
    const label = `${line.name} ${line.size}`
    const found = find(line.name, line.size)
    if (!found) {
      notes.push(`${label} is no longer in our range.`)
    } else if (found.available <= 0) {
      notes.push(`${label} is not available to order online right now.`)
    } else if (found.available < line.quantity) {
      add.push({ id: found.id, quantity: found.available })
      notes.push(`Only ${found.available} of ${line.quantity} ${label} could be added.`)
    } else {
      add.push({ id: found.id, quantity: line.quantity })
    }
  }
  return { add, notes }
}
