import { Paper, Text } from '@mantine/core'
import TileRow from '../TileRow'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { formatDistance } from '../../utils/distance'
import type { BikeTileTotals } from './bikesList'

// The Bikes page's five tiles, all over active bikes (bikeTileTotals).
export default function BikesSummaryTiles({ totals }: { totals: BikeTileTotals }) {
  const attention = totals.due + totals.warning > 0
  const tiles = [
    { label: 'Active bikes', value: totals.active.toLocaleString() },
    { label: 'Total distance', value: formatDistance(totals.totalDistance) },
    { label: 'This year', value: formatDistance(totals.thisYear) },
    { label: 'Components tracked', value: totals.components.toLocaleString() },
    {
      label: 'Service due · soon',
      value: `${totals.due} · ${totals.warning}`,
      color: attention ? SERVICE_STATUS_COLORS.warning : undefined,
    },
  ]

  return (
    <TileRow minTileWidth={160}>
      {tiles.map((tile) => (
        <Paper key={tile.label} withBorder radius="md" px="md" py="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
            {tile.label}
          </Text>
          <Text fz="xl" fw={600} c={tile.color}>
            {tile.value}
          </Text>
        </Paper>
      ))}
    </TileRow>
  )
}
