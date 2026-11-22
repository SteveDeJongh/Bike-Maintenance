import { categoryLabel } from '../constants'
import { formatDistance } from './distance'
import { formatDuration } from './duration'
import { formatDrivingRemaining } from './serviceInterval'
import type { DashboardDisplayMetric, DashboardMountedComponent, DashboardOffBikeComponent } from '../types/models'

// since_service_type_name is specifically the setting event's own service
// type (the thing that reset this clock) -- not always the same string as
// the requirement's own name, now that a requirement can have more than
// one satisfier (e.g. "Chain lube" cleared by a drip wax).
export function formatDisplayMetric(metric: DashboardDisplayMetric): string {
  const since = metric.since_service_type_name
  if (metric.distance_meters != null) {
    return since ? `${formatDistance(metric.distance_meters)} since ${since}` : formatDistance(metric.distance_meters)
  }
  if (metric.moving_time_seconds != null) {
    return since ? `${formatDuration(metric.moving_time_seconds)} since ${since}` : formatDuration(metric.moving_time_seconds)
  }
  if (metric.days != null) {
    return since ? `${metric.days}d since ${since}` : `${metric.days}d`
  }
  return '—'
}

// Counted from the mounted components' worst statuses, for the card's chip.
export function bikeStatusCounts(mounted: Pick<DashboardMountedComponent, 'service_status'>[]): { due: number; warning: number } {
  return {
    due: mounted.filter((component) => component.service_status === 'due').length,
    warning: mounted.filter((component) => component.service_status === 'warning').length,
  }
}

// Most worn first; components with no enabled requirement last, in their
// original order.
export function sortByWear<T extends { fraction_used: number | null }>(components: T[]): T[] {
  return [...components].sort((a, b) => (b.fraction_used ?? -1) - (a.fraction_used ?? -1))
}

// The wear row's right-hand metric. The requirement's name is appended
// ("8 km left · wax") unless it already names the category ("Tire
// replacement" on a tire), where it would add nothing. With no requirement
// it's the lifetime total.
export function wearMetricLabel(
  component: Pick<
    DashboardMountedComponent,
    'category' | 'display_metric' | 'driving_dimension' | 'distance_remaining_meters' | 'moving_time_remaining_seconds' | 'days_remaining'
  >,
): string {
  const { driving_dimension, display_metric } = component
  if (!driving_dimension) {
    return display_metric.distance_meters != null ? `${formatDistance(display_metric.distance_meters)} total` : '—'
  }

  const remaining = formatDrivingRemaining({ ...component, driving_dimension })
  const name = display_metric.requirement_name
  if (!name || name.toLowerCase().includes(categoryLabel(component.category).toLowerCase())) return remaining
  return `${remaining} · ${name.toLowerCase()}`
}

export interface RotationGroup {
  category: string
  mounted: DashboardMountedComponent[]
  offBike: DashboardOffBikeComponent[]
}

// One group per rotating category (rotates: true, from the category's
// setting -- chain by default) where the bike has both an off-bike
// component and a mounted one. Off-bike components in a non-rotating
// category, or with no mounted partner, are returned separately, for the
// plain dimmed line.
export function rotationGroups(
  mounted: DashboardMountedComponent[],
  offBike: DashboardOffBikeComponent[],
): { groups: RotationGroup[]; unpaired: DashboardOffBikeComponent[] } {
  const groups: RotationGroup[] = []
  const unpaired: DashboardOffBikeComponent[] = []

  for (const component of offBike) {
    const partners = component.rotates ? mounted.filter((candidate) => candidate.category === component.category) : []
    if (partners.length === 0) {
      unpaired.push(component)
      continue
    }
    const existing = groups.find((group) => group.category === component.category)
    if (existing) existing.offBike.push(component)
    else groups.push({ category: component.category, mounted: partners, offBike: [component] })
  }

  return { groups, unpaired }
}

// Most urgent first: most due components, then most warning components,
// then the most recent ride (bikes never ridden last), then name.
export function sortBikesByUrgency<T extends { name: string; last_ride_on: string | null; mounted: Pick<DashboardMountedComponent, 'service_status'>[] }>(
  bikes: T[],
): T[] {
  const keyed = bikes.map((bike) => ({ bike, counts: bikeStatusCounts(bike.mounted), ridden: bike.last_ride_on ? Date.parse(bike.last_ride_on) : -Infinity }))
  keyed.sort(
    (a, b) =>
      b.counts.due - a.counts.due ||
      b.counts.warning - a.counts.warning ||
      (b.ridden === a.ridden ? 0 : b.ridden > a.ridden ? 1 : -1) ||
      a.bike.name.localeCompare(b.bike.name),
  )
  return keyed.map(({ bike }) => bike)
}
