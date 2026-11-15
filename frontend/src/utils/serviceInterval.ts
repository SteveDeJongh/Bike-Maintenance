import { formatDistance } from './distance'
import { formatDuration } from './duration'

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
