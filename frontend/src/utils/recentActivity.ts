import { formatSportType } from './strava'

// The sport-type half of a recent ride's sub-line ("Gravel Ride"); plain
// "Ride" when Strava gave no type.
export function rideSportLabel(activityType: string | null): string {
  return activityType ? formatSportType(activityType) : 'Ride'
}
