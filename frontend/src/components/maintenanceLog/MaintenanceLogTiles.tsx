import { Paper, Text } from '@mantine/core'
import TileRow from '../TileRow'
import type { MaintenanceTile } from './maintenanceLogModel'

// The Maintenance page's five tiles (maintenanceTiles), in one TileRow --
// scrolling sideways, tile to tile, when narrow.
export default function MaintenanceLogTiles({ tiles }: { tiles: MaintenanceTile[] }) {
  return (
    <TileRow minTileWidth={150}>
      {tiles.map((tile) => (
        <Paper key={tile.label} withBorder radius="md" px="md" py="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
            {tile.label}
          </Text>
          <Text fz="xl" fw={600} c={tile.color} truncate>
            {tile.value}
          </Text>
        </Paper>
      ))}
    </TileRow>
  )
}
