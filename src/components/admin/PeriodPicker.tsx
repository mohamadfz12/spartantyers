import { Input, Label } from '@/components/ui'
import { selectClass } from '@/components/admin/AdminKit'
import { PERIOD_LABELS, type DateRange, type PeriodKey } from '@/lib/admin-periods'

/** Period select, with from/to dates when "Custom dates" is chosen. */
export function PeriodPicker({
  id,
  period,
  custom,
  onPeriod,
  onCustom,
}: {
  id: string
  period: PeriodKey
  custom: DateRange
  onPeriod: (period: PeriodKey) => void
  onCustom: (range: DateRange) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor={id} className="sr-only">
          Period
        </Label>
        <select id={id} className={selectClass} value={period} onChange={(e) => onPeriod(e.target.value as PeriodKey)}>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
            <option key={key} value={key}>
              {PERIOD_LABELS[key]}
            </option>
          ))}
        </select>
      </div>
      {period === 'custom' ? (
        <>
          <div>
            <Label htmlFor={`${id}-from`} className="sr-only">
              From
            </Label>
            <Input id={`${id}-from`} type="date" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} className="w-auto" />
          </div>
          <span className="pb-2.5 text-sm text-muted-foreground">to</span>
          <div>
            <Label htmlFor={`${id}-to`} className="sr-only">
              To
            </Label>
            <Input id={`${id}-to`} type="date" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} className="w-auto" />
          </div>
        </>
      ) : null}
    </div>
  )
}
