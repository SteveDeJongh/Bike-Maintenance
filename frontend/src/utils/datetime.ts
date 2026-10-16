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

export function formatDateTime(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
}
