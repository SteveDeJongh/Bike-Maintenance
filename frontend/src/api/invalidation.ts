import type { QueryClient, QueryKey } from '@tanstack/react-query'

// The single map of "what cached data can a write change". Every mutation's
// onSuccess goes through invalidate() with the groups it touches, instead of
// hand-listing query keys -- hand-listed sets drifted apart over time (e.g.
// deleting a maintenance event used to skip the components/alerts/dashboard
// refresh its create/update did).
//
// Groups are deliberately coarse. invalidateQueries only refetches queries
// that are currently mounted (everything else is just marked stale), so
// over-invalidating costs at most a refetch or two at this data scale, while
// under-invalidating shows stale data until a reload. When in doubt, add the
// group.
//
// Keys are prefixes: ['bikes'] covers ['bikes', id], ['strava'] covers
// ['strava', 'status'] / ['strava', 'unmapped_gear'] / etc.
export const INVALIDATION_GROUPS = {
  // Anything that shows a component's computed interval status, distance, or
  // mounted state -- i.e. everything Maintenance::IntervalStatus feeds.
  // Changes whenever rides, events, assignments, or intervals change.
  serviceStatus: [['components'], ['bikes'], ['serviceable_components'], ['maintenance_alerts'], ['dashboard']],
  // Logged history: the activity feed, the maintenance event list, and
  // service session detail views.
  history: [['activity'], ['maintenance_events'], ['service_sessions']],
  // Which component is on which bike, and when.
  setup: [['component_assignments']],
  // Strava gear lists and status (unmapped/mapped/ignored gear, sync status).
  gear: [['strava']],
  // Ride lists -- the Strava Rides tab and each bike's Ride history.
  rides: [['strava_rides'], ['bike_rides']],
  // Category templates and per-component service interval config.
  intervals: [['category_service_intervals'], ['component_service_intervals']],
  // Per-category settings, including brands remembered from component saves
  // (Component#remember_brand).
  categorySettings: [['component_category_settings']],
  serviceTypes: [['service_types']],
  bikeTypes: [['bike_types']],
  // Alert banners/dashboard flags also depend on these two (see
  // Dashboard::Summary -- dismissed / notifications-off are shown as flags).
  alertVisibility: [['maintenance_alerts'], ['dashboard']],
  notificationSettings: [['notification_settings']],
} as const satisfies Record<string, readonly QueryKey[]>

export type InvalidationGroup = keyof typeof INVALIDATION_GROUPS

export function invalidate(queryClient: QueryClient, ...groups: InvalidationGroup[]) {
  const seen = new Set<string>()
  for (const group of groups) {
    for (const key of INVALIDATION_GROUPS[group]) {
      const id = JSON.stringify(key)
      if (seen.has(id)) continue
      seen.add(id)
      queryClient.invalidateQueries({ queryKey: key })
    }
  }
}

// Shared by anything that can move rides between bikes or change ride
// mileage: a completed Strava sync (useStravaSyncRunner) and single/bulk
// ride resync. Moving mileage changes service status everywhere.
export const RIDE_DATA_GROUPS: InvalidationGroup[] = ['gear', 'rides', 'serviceStatus', 'history']

// Bikes own rides (attribution via strava_gear_id), assignments, and service
// sessions (dependent: :destroy) -- creating, editing, or deleting one can
// change nearly everything user-facing.
export const BIKE_CHANGE_GROUPS: InvalidationGroup[] = [...RIDE_DATA_GROUPS, 'setup']
