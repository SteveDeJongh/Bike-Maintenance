import { formatDistance } from './distance'
import { formatDrivingRemaining } from './serviceInterval'
import type { RideDetailComponent } from '../types/models'

// total_distance_meters is optional: the Bikes list's rows always have a
// requirement, so they never carry it.
type WearValueFields = Pick<
  RideDetailComponent,
  'driving_dimension' | 'distance_remaining_meters' | 'moving_time_remaining_seconds' | 'days_remaining'
> &
  Partial<Pick<RideDetailComponent, 'total_distance_meters'>>

// A wear row's right-hand value: what's left (or over) on the driving
// requirement -- "4 km left", "16 days left", "120 km over" -- or, with no
// requirement, the lifetime total ("2,140 km total"). Shared by the ride
// modal's Components rows and the Bikes list's cards.
export function componentWearValue(component: WearValueFields): string {
  if (component.driving_dimension) {
    return formatDrivingRemaining({ ...component, driving_dimension: component.driving_dimension })
  }
  return component.total_distance_meters != null ? `${formatDistance(component.total_distance_meters)} total` : '—'
}
