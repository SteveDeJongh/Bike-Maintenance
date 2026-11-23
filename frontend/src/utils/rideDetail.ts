import { formatDistance } from './distance'
import { formatDuration } from './duration'
import { formatElevation } from './elevation'
import { formatPower } from './power'
import { formatSpeed } from './speed'
import { formatSportType } from './strava'
import type { RideDetail, RideServiceNearby } from '../types/models'

export interface RideStat {
  key: string
  label: string
  value: string
}

type MetricFields = Pick<
  RideDetail,
  | 'distance_meters'
  | 'moving_time'
  | 'total_elevation_gain'
  | 'average_watts'
  | 'elapsed_time'
  | 'average_speed'
  | 'max_speed'
  | 'weighted_average_watts'
  | 'kilojoules'
  | 'average_heartrate'
  | 'max_heartrate'
  | 'average_cadence'
>

// Line 1's preferred four, then line 2's order -- which is also the order
// a null line-1 slot is back-filled from.
const PRIMARY: [keyof MetricFields, string, (v: number) => string][] = [
  ['distance_meters', 'Distance', formatDistance],
  ['moving_time', 'Moving time', formatDuration],
  ['total_elevation_gain', 'Elevation', formatElevation],
  ['average_watts', 'Avg power', (v) => formatPower(Math.round(v))],
]
const SECONDARY: [keyof MetricFields, string, (v: number) => string][] = [
  ['elapsed_time', 'Elapsed', formatDuration],
  ['average_speed', 'Avg speed', formatSpeed],
  ['max_speed', 'Max speed', formatSpeed],
  ['weighted_average_watts', 'Weighted power', (v) => formatPower(Math.round(v))],
  ['kilojoules', 'Energy', (v) => `${Math.round(v)} kJ`],
  ['average_heartrate', 'Avg HR', (v) => `${Math.round(v)} bpm`],
  ['max_heartrate', 'Max HR', (v) => `${Math.round(v)} bpm`],
  ['average_cadence', 'Cadence', (v) => `${Math.round(v)} rpm`],
]

// The modal's two stat lines. Null metrics are dropped, never shown as a
// dash; when one of line 1's four is null, the next recorded line-2 metric
// is promoted so line 1 stays full.
export function rideStatLines(ride: MetricFields): { primary: RideStat[]; secondary: RideStat[] } {
  const present = (defs: typeof PRIMARY) =>
    defs.flatMap(([key, label, format]) => {
      const value = ride[key]
      return value == null ? [] : [{ key, label, value: format(value) }]
    })

  const primary = present(PRIMARY)
  const secondary = present(SECONDARY)
  while (primary.length < 4 && secondary.length > 0) primary.push(secondary.shift()!)
  return { primary, secondary }
}

// "Sun, Nov 22 · 8:12 am · Gravel Ride" -- the header line before the bike
// (a link, rendered separately) and the indoor/outdoor context.
export function rideHeaderParts(ride: Pick<RideDetail, 'moved_at' | 'activity_type' | 'indoor'>): {
  when: string
  sport: string | null
  context: string
} {
  const date = new Date(ride.moved_at)
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return {
    when: `${day} · ${time}`,
    sport: ride.activity_type ? formatSportType(ride.activity_type) : null,
    context: ride.indoor ? 'Indoor' : 'Outdoor',
  }
}

// "Fri, Nov 20 · before this ride"
export function serviceNearbyLabel(item: Pick<RideServiceNearby, 'occurred_at' | 'position'>): string {
  const day = new Date(item.occurred_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${day} · ${item.position} this ride`
}

// What a ride's Components cell shows: "No bike" when it has none, "None"
// when it has a bike but no component it adds distance to, otherwise the
// list.
export function componentsCellState(ride: { bike?: unknown | null; counted_toward: unknown[] }): 'no_bike' | 'none' | 'list' {
  if (ride.counted_toward.length > 0) return 'list'
  return ride.bike === null ? 'no_bike' : 'none'
}
