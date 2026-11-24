import type { ActivityFeedFilters } from '../../api/queries'
import { relativeDay } from '../../utils/datetime'

// The bike page sections' pure helpers: their storage keys, folded summary
// lines, and the service feed's params (shared by BikeServiceCard and the
// section's folded count, so the two are one cached request).

export const BIKE_SECTION_STORAGE_KEYS = {
  installed: 'bikePage.collapsed.installed',
  serviceHistory: 'bikePage.collapsed.serviceHistory',
  rides: 'bikePage.collapsed.rides',
} as const

export function bikeServiceFeedParams(bikeId: number, tz: string): ActivityFeedFilters {
  return { kinds: ['service'], bikeId, tz, order: 'desc', sort: 'date' }
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`

// Folded Service & component history: "18 services · 22 component
// changes", zero parts left out. `services` is null until the service
// feed answers, which leaves that part out too.
export function serviceHistoryFoldedSummary({ services, changes }: { services: number | null; changes: number }): string {
  const parts = [
    services ? plural(services, 'service', 'services') : null,
    changes ? plural(changes, 'component change', 'component changes') : null,
  ].filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  return services === null ? '' : 'No service or component changes'
}

// "214 on this bike", and folded, " · last ride today" (yesterday, or the
// short date).
export function ridesSummary(rideCount: number, lastRideOn: string | null, folded: boolean, now: Date = new Date()): string {
  const head = `${rideCount.toLocaleString()} on this bike`
  if (!folded || !lastRideOn) return head
  return `${head} · last ride ${relativeDay(lastRideOn, now)}`
}
