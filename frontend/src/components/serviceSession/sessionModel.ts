import { formatApiError } from '../../api/errors'
import { formatDistance } from '../../utils/distance'
import { formatShortDate } from '../../utils/datetime'
import type { ServiceSession, ServiceSessionEvent } from '../../types/models'

// ServiceSessionViewModal's pure pieces.

// The header's large line: "Sat, Nov 14, 2026 · 4:10 pm".
export function sessionDateTitle(value: string): string {
  const date = new Date(value)
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${day} · ${time}`
}

export interface SessionStat {
  label: string
  value: string
}

// The small stats row: Bike km (the bike's odometer at the session), Last
// ride before ("Hill repeats · 62 km") and Logged -- any that's missing
// is left out.
export function sessionStats(
  session: Pick<ServiceSession, 'bike_distance_at_meters' | 'last_ride_before' | 'created_at'>,
  now: Date = new Date(),
): SessionStat[] {
  const stats: (SessionStat | null)[] = [
    session.bike_distance_at_meters == null ? null : { label: 'Bike km', value: formatDistance(session.bike_distance_at_meters) },
    session.last_ride_before
      ? { label: 'Last ride before', value: `${session.last_ride_before.name} · ${formatDistance(session.last_ride_before.distance_meters)}` }
      : null,
    session.created_at ? { label: 'Logged', value: formatShortDate(session.created_at, now) } : null,
  ]
  return stats.filter((stat): stat is SessionStat => stat != null)
}

const plural = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`

// "3 components" beside the Services heading (distinct components).
export function componentCountLabel(events: readonly Pick<ServiceSessionEvent, 'component_id'>[]): string {
  return plural(new Set(events.map((event) => event.component_id)).size, 'component')
}

// A service row's right side: "at 1,160 km" over "200 km since last"
// (nothing for the first of its type).
export function eventDistanceLines(event: Pick<ServiceSessionEvent, 'component_distance_at_event_meters' | 'since_last_same_type_meters'>): {
  at: string
  since: string | null
} {
  return {
    at: `at ${formatDistance(event.component_distance_at_event_meters)}`,
    since: event.since_last_same_type_meters == null ? null : `${formatDistance(event.since_last_same_type_meters)} since last`,
  }
}

// The editing hint under Done on.
export function moveHint(count: number, bikeName: string): string {
  return `Moves all ${plural(count, 'service')}. Each component must have been on ${bikeName} (or off the bike) at the new time.`
}

// A failed save, shown under the date field: the server's own message
// (a 422 names the components that would no longer qualify).
export function sessionEditError(error: unknown): string {
  return formatApiError(error) || 'Could not save this service session.'
}

export function deleteSessionMessage(count: number): string {
  return `Delete this service session and its ${plural(count, 'service')}? This cannot be undone.`
}
