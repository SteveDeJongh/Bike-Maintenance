import { formatDistance } from './distance'
import { formatDuration } from './duration'
import type { RequirementDimension } from '../types/models'

// Shared by ServiceIntervalsSection (the component page's own table) and
// the dashboard's Needs attention list -- same "N km left" / "N km overdue"
// sign convention either place a service interval's remaining amount shows.
// movingTimeRemainingSeconds is optional (added for the three-dimension
// requirement rewrite) so every existing two-arg call site keeps compiling
// unchanged.
export function formatRemaining(
  distanceRemainingMeters: number | null,
  daysRemaining: number | null,
  movingTimeRemainingSeconds?: number | null,
): string {
  const parts: string[] = []
  if (distanceRemainingMeters != null) {
    parts.push(
      distanceRemainingMeters >= 0
        ? `${formatDistance(distanceRemainingMeters)} left`
        : `${formatDistance(-distanceRemainingMeters)} overdue`,
    )
  }
  if (movingTimeRemainingSeconds != null) {
    parts.push(
      movingTimeRemainingSeconds >= 0
        ? `${formatDuration(movingTimeRemainingSeconds)} left`
        : `${formatDuration(-movingTimeRemainingSeconds)} overdue`,
    )
  }
  if (daysRemaining != null) {
    parts.push(daysRemaining >= 0 ? `${daysRemaining}d left` : `${-daysRemaining}d overdue`)
  }
  return parts.join(' · ') || '—'
}

// The Home page's Next service tile: only the requirement's driving
// dimension, as "8 km left" / "120 km over" / "1.5 hrs left" / "3 days
// left". Never a pace-based time estimate.
export function formatDrivingRemaining(item: {
  driving_dimension: RequirementDimension
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
}): string {
  const describe = (amount: number | null, format: (value: number) => string) => {
    if (amount == null) return '—'
    return amount >= 0 ? `${format(amount)} left` : `${format(-amount)} over`
  }

  switch (item.driving_dimension) {
    case 'distance':
      return describe(item.distance_remaining_meters, formatDistance)
    case 'moving_time':
      return describe(item.moving_time_remaining_seconds, formatDuration)
    default:
      return describe(item.days_remaining, (days) => `${days} ${days === 1 ? 'day' : 'days'}`)
  }
}

// "Log service"'s default service type: the position-1 satisfier, same
// convention as ComponentDetail's own split button.
export function primarySatisfier<T extends { position: number }>(satisfiers: T[]): T | undefined {
  return [...satisfiers].sort((a, b) => a.position - b.position)[0]
}
