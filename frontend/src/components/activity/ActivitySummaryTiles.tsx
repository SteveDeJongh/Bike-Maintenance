import { Paper, Text } from '@mantine/core'
import TileRow from '../TileRow'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import type { ActivityFeedResponse } from '../../types/models'

// Five compact tiles in one TileRow (never wraps; scrolls sideways, tile
// to tile, only when narrow). The values follow every filter except the kind toggles
// (meta.ride_totals and kind_counts deliberately ignore kinds).
export default function ActivitySummaryTiles({ meta }: { meta: ActivityFeedResponse['meta'] | undefined }) {
  const totals = meta?.ride_totals
  const counts = meta?.kind_counts
  const tiles = [
    { label: 'Rides', value: totals ? totals.count.toLocaleString() : '—' },
    { label: 'Distance', value: totals ? formatDistance(totals.distance_meters) : '—' },
    { label: 'Moving time', value: totals ? formatDuration(totals.moving_time) : '—' },
    { label: 'Elevation', value: totals ? formatElevation(totals.total_elevation_gain) : '—' },
    { label: 'Service · setup', value: counts ? `${counts.service} · ${counts.setup}` : '—' },
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
