import { type ReactNode } from 'react'
import { Badge, Group, Text, Tooltip } from '@mantine/core'
import { Link } from 'react-router-dom'
import { RIDE_KIND_BADGE, type BikeRideColumn } from '../../constants'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import { formatSpeed } from '../../utils/speed'
import type { BikeRide } from '../../types/models'

// Everything a ride-ish row has in common between Ride history (BikeRide,
// one bike, with an odometer) and the Rides tab (StravaRide, across every
// bike, no odometer) -- both types satisfy this shape structurally, so one
// renderer map works for either without a cast.
type SharedRideFields = Omit<BikeRide, 'cumulative_distance_meters'>

// The subset of ride columns common to both tables -- each caller's own
// COLUMN_RENDERER spreads this in and adds its own unique columns
// (cumulative_distance_meters for Ride history; status/gear/bike/ignored_at
// for the Rides tab).
export const SHARED_RIDE_COLUMN_RENDERERS: Record<
  Exclude<BikeRideColumn, 'cumulative_distance_meters'>,
  (ride: SharedRideFields) => ReactNode
> = {
  ride_kind: (ride) => {
    const badge = RIDE_KIND_BADGE[ride.ride_kind]
    return (
      <Badge variant="light" color={badge.color}>
        {badge.label}
      </Badge>
    )
  },
  distance_meters: (ride) => formatDistance(ride.distance_meters),
  moving_time: (ride) => (ride.moving_time == null ? '—' : formatDuration(ride.moving_time)),
  total_elevation_gain: (ride) => (ride.total_elevation_gain == null ? '—' : formatElevation(ride.total_elevation_gain)),
  average_speed: (ride) => (ride.average_speed == null ? '—' : formatSpeed(ride.average_speed)),
  average_watts: (ride) => {
    if (ride.average_watts == null) return '—'

    const text = formatPower(ride.average_watts)
    if (ride.device_watts === false) {
      return (
        <Tooltip label="Estimated">
          <Text span c="dimmed">
            {text}
          </Text>
        </Tooltip>
      )
    }
    return text
  },
  activity_type: (ride) => ride.activity_type,
  elapsed_time: (ride) => (ride.elapsed_time == null ? '—' : formatDuration(ride.elapsed_time)),
  max_speed: (ride) => (ride.max_speed == null ? '—' : formatSpeed(ride.max_speed)),
  weighted_average_watts: (ride) => (ride.weighted_average_watts == null ? '—' : formatPower(ride.weighted_average_watts)),
  kilojoules: (ride) => (ride.kilojoules == null ? '—' : `${Math.round(ride.kilojoules)} kJ`),
  average_heartrate: (ride) => (ride.average_heartrate == null ? '—' : `${Math.round(ride.average_heartrate)} bpm`),
  max_heartrate: (ride) => (ride.max_heartrate == null ? '—' : `${Math.round(ride.max_heartrate)} bpm`),
  average_cadence: (ride) => (ride.average_cadence == null ? '—' : `${Math.round(ride.average_cadence)} rpm`),
  commute: (ride) => (ride.commute ? 'Yes' : 'No'),
  counted_toward: (ride) =>
    ride.counted_toward.length > 0 ? (
      <Group gap={4} wrap="wrap">
        {ride.counted_toward.map((component) => (
          <Badge
            key={component.component_id}
            component={Link}
            to={`/components/${component.component_id}`}
            variant="light"
            style={{ cursor: 'pointer' }}
          >
            {component.label}
          </Badge>
        ))}
      </Group>
    ) : (
      <Text size="sm" c="dimmed">
        Not counted
      </Text>
    ),
}
