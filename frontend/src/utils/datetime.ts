// Mantine's DateTimePicker emits/accepts a naive local-time string with no
// timezone marker (e.g. "2026-01-01 14:30:00"). The API stores/returns real
// UTC instants. These helpers convert at that one boundary so every other
// part of the app just deals in ISO-UTC strings.

export function mantineLocalStringToIsoUtc(value: string | null): string | null {
  if (!value) return null
  return new Date(value.replace(' ', 'T')).toISOString()
}

export function isoUtcToDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

export function nowIsoUtc(): string {
  return new Date().toISOString()
}

// 'YYYY-MM-DD' for today, in the browser's local date -- for a date-only
// (_on) field's default, like "Track as retired bike"'s retired_on when
// the gear has no last_activity_on to fall back to instead.
export function todayIsoDate(): string {
  return new Date().toLocaleDateString('en-CA') // en-CA formats as YYYY-MM-DD
}

export function formatDateTime(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// A date-only value ("2026-03-01", the API's _on columns) is that day in
// the browser's zone -- new Date() alone reads it as UTC midnight, which is
// the day before anywhere west of UTC. Timestamps parse as usual.
function parseDay(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
}

// "Nov 16" this year, "Mar 2, 2025" otherwise -- the compact date of the
// Home panels, bike cards and the Components list. Takes a timestamp or a
// date-only value; the year compares in the browser's zone.
export function formatShortDate(value: string, now: Date = new Date()): string {
  const date = parseDay(value)
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

// "today", "yesterday", or formatShortDate's "Nov 16" / "Mar 2, 2025" --
// calendar days in the browser's zone.
export function relativeDay(value: string, now: Date = new Date()): string {
  const date = new Date(value)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (startOf(date) === startOf(now)) return 'today'
  if (startOf(date) === startOf(yesterday)) return 'yesterday'
  return formatShortDate(value, now)
}

export function formatDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

// Coarse, manual-sync-cadence relative time for the Home header's sync pill
// (e.g. "5 minutes ago") -- not meant for anything finer-grained than that.
export function formatRelativeTime(value: string | null): string {
  if (!value) return 'never'

  const diffSeconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (diffSeconds < 60) return 'just now'

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

// ISO-8601 week number (weeks start Monday; week 1 holds the year's first
// Thursday), from the date's local calendar day.
export function isoWeekNumber(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = day.getUTCDay() || 7 // Mon=1..Sun=7
  day.setUTCDate(day.getUTCDate() + 4 - weekday) // this week's Thursday
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

// The Home header's date line, e.g. "Friday, Nov 20 · week 47".
export function formatHeaderDate(date: Date, locale?: string): string {
  const day = date.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })
  return `${day} · week ${isoWeekNumber(date)}`
}
