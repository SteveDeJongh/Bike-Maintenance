// Date-range helpers backing Activity's date-preset filter (This week/
// month/year, Last 30 days) -- all read the viewer's own local clock
// (`new Date()`), matching the rest of this page's "whatever timezone the
// browser is in" assumption (see Activity's own `tz` query param).
export function toIsoDate(date: Date): string {
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

export function startOfWeekIso(): string {
  const now = new Date()
  const day = now.getDay() // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? 6 : day - 1
  const start = new Date(now)
  start.setDate(now.getDate() - mondayOffset)
  return toIsoDate(start)
}

export function startOfMonthIso(): string {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

export function startOfYearIso(): string {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), 0, 1))
}

export function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toIsoDate(d)
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

// The date-range pill's presets (Activity, Maintenance); null is All time.
export type DatePreset = 'this_week' | 'this_month' | 'this_year' | 'last_30_days' | 'custom'

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range…' },
]

export function isDatePreset(value: unknown): value is DatePreset {
  return DATE_PRESETS.some((preset) => preset.value === value)
}

// A preset's from/to (YYYY-MM-DD, local), each undefined when open-ended.
export function presetRange(
  preset: DatePreset | null,
  customRange: [string | null, string | null],
): { from: string | undefined; to: string | undefined } {
  switch (preset) {
    case 'this_week':
      return { from: startOfWeekIso(), to: todayIso() }
    case 'this_month':
      return { from: startOfMonthIso(), to: todayIso() }
    case 'this_year':
      return { from: startOfYearIso(), to: todayIso() }
    case 'last_30_days':
      return { from: daysAgoIso(30), to: todayIso() }
    case 'custom':
      return { from: customRange[0] ?? undefined, to: customRange[1] ?? undefined }
    default:
      return { from: undefined, to: undefined }
  }
}
