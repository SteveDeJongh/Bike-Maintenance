import { Paper, Text } from '@mantine/core'
import TileRow from '../TileRow'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { BikeDetail } from '../../types/models'

// The bike page's stats as one TileRow: lifetime totals plus this year (in
// the viewer's zone) and the ride count. Avg power is "N/A" without a
// power meter.
export default function BikeStatTiles({ bike }: { bike: BikeDetail }) {
  const tiles = [
    { label: 'Total distance', value: formatDistance(bike.total_distance) },
    { label: 'This year', value: formatDistance(bike.distance_this_year) },
    { label: 'Moving time', value: formatDuration(bike.total_moving_time) },
    { label: 'Elevation', value: formatElevation(bike.total_elevation_gain) },
    { label: 'Avg power', value: formatPower(bike.average_power) },
    { label: 'Rides', value: bike.ride_count.toLocaleString() },
  ]

  return (
    <TileRow minTileWidth={140}>
      {tiles.map((tile) => (
        <Paper key={tile.label} withBorder radius="md" px="md" py="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
            {tile.label}
          </Text>
          <Text fz="xl" fw={600}>
            {tile.value}
          </Text>
        </Paper>
      ))}
    </TileRow>
  )
}
