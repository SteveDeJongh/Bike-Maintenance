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
