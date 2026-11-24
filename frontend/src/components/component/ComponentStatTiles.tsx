import { Paper, Text } from '@mantine/core'
import TileRow from '../TileRow'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { ComponentDetail } from '../../types/models'

// The component page's lifetime totals (Components::LifeHistory) plus how
// many times it's been installed and serviced.
export default function ComponentStatTiles({ component }: { component: ComponentDetail }) {
  const stats = component.lifetime_stats
  const tiles = [
    { label: 'Lifetime distance', value: formatDistance(stats.distance_meters) },
    { label: 'Lifetime time', value: formatDuration(stats.moving_time_seconds) },
    { label: 'Total climb', value: formatElevation(stats.elevation_gain_meters) },
    { label: 'Avg power', value: formatPower(stats.average_power) },
    { label: 'Installations', value: component.assignments.length.toLocaleString() },
    { label: 'Services', value: component.maintenance_events_count.toLocaleString() },
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
