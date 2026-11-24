import { Paper, Text } from '@mantine/core'
import TileRow from '../TileRow'
import type { ComponentTileCounts } from './componentListModel'

// The Components page's five tiles (componentTileCounts), over the whole
// list whatever the filters. Due · soon and With intervals count
// non-retired components, spares included.
export default function ComponentsSummaryTiles({ counts }: { counts: ComponentTileCounts }) {
  const attention = counts.due + counts.soon > 0
  const tiles = [
    { label: 'Installed', value: counts.installed.toLocaleString() },
    { label: 'Spares', value: counts.spare.toLocaleString() },
    {
      label: 'Service due · soon',
      value: `${counts.due} · ${counts.soon}`,
      color: attention ? 'orange' : undefined,
    },
    { label: 'With intervals', value: `${counts.withIntervals} of ${counts.active}` },
    { label: 'Retired', value: counts.retired.toLocaleString() },
  ]

  return (
    <TileRow minTileWidth={150}>
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
