import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import { formatSpeed } from '../../utils/speed'
import type { ActivityRideItem, ActivityUiKind } from '../../types/models'

// The Activity list's Fields: the numeric ride metrics, which are exactly
// the feed's metric sort keys (Activity::Feed::SORT_COLUMNS), so every
// field column can sort. Name, date and type are always shown and aren't
// fields; bike and sport type live in a ride's sub-line, Components and
// Commute in RideDetailModal.
export const ACTIVITY_FIELDS = [
  'distance_meters',
  'moving_time',
  'total_elevation_gain',
  'average_speed',
  'average_watts',
  'elapsed_time',
  'max_speed',
  'weighted_average_watts',
  'kilojoules',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
] as const

export type ActivityField = (typeof ACTIVITY_FIELDS)[number]

export const DEFAULT_ACTIVITY_FIELDS: ActivityField[] = ['distance_meters', 'moving_time', 'total_elevation_gain', 'average_watts']

export const MAX_ACTIVITY_FIELDS = 6

export const ACTIVITY_FIELD_LABELS: Record<ActivityField, string> = {
  distance_meters: 'Distance',
  moving_time: 'Moving time',
  total_elevation_gain: 'Elevation',
  average_speed: 'Avg speed',
  average_watts: 'Avg power',
  elapsed_time: 'Elapsed',
  max_speed: 'Max speed',
  weighted_average_watts: 'Weighted power',
  kilojoules: 'Energy',
  average_heartrate: 'Avg HR',
  max_heartrate: 'Max HR',
  average_cadence: 'Cadence',
}

const round = (suffix: string) => (value: number) => `${Math.round(value)} ${suffix}`

const FORMATTERS: Record<ActivityField, (value: number) => string> = {
  distance_meters: formatDistance,
  moving_time: formatDuration,
  total_elevation_gain: formatElevation,
  average_speed: formatSpeed,
  average_watts: (value) => formatPower(Math.round(value)),
  elapsed_time: formatDuration,
  max_speed: formatSpeed,
  weighted_average_watts: (value) => formatPower(Math.round(value)),
  kilojoules: round('kJ'),
  average_heartrate: round('bpm'),
  max_heartrate: round('bpm'),
  average_cadence: round('rpm'),
}

// A ride's value for a field, formatted -- null when Strava didn't record it.
export function formatActivityField(ride: Pick<ActivityRideItem, ActivityField>, field: ActivityField): string | null {
  const value = ride[field]
  return value == null ? null : FORMATTERS[field](value)
}

export function isActivityField(value: string): value is ActivityField {
  return (ACTIVITY_FIELDS as readonly string[]).includes(value)
}

// The Fields picker's options.
export const FIELD_OPTIONS = ACTIVITY_FIELDS.map((field) => ({ key: field, label: ACTIVITY_FIELD_LABELS[field] }))

// Each kind's colour -- the toolbar's kind dots and the list's row icons:
// primary for rides, teal for service, blue for setup.
export const ACTIVITY_KIND_COLOR: Record<ActivityUiKind, string> = {
  ride: 'var(--mantine-primary-color-filled)',
  service: 'var(--mantine-color-teal-6)',
  setup: 'var(--mantine-color-blue-6)',
}
