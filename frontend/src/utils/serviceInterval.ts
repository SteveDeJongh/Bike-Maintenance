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

// The merged "Interval" column on ServiceIntervalsSection's table -- only the
// dimension(s) actually set, never a "—" placeholder for the other one (a
// blank dimension just isn't mentioned at all). movingTimeSeconds is
// optional for the same reason as formatRemaining's own third param.
export function formatInterval(distanceMeters: number | null, days: number | null, movingTimeSeconds?: number | null): string {
  const parts: string[] = []
  if (distanceMeters != null) parts.push(formatDistance(distanceMeters))
  if (movingTimeSeconds != null) parts.push(formatDuration(movingTimeSeconds))
  if (days != null) parts.push(`${days} days`)
  return parts.join(' / ')
}
