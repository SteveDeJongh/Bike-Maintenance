import { formatSportType } from './strava'

// "Nov 16" -- the compact date the Home panels use.
export function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The sport-type half of a recent ride's sub-line ("Gravel Ride"); plain
// "Ride" when Strava gave no type.
export function rideSportLabel(activityType: string | null): string {
  return activityType ? formatSportType(activityType) : 'Ride'
}
