import { Box, Group, Stack, Text } from '@mantine/core'
import { formatDistance } from '../../utils/distance'
import type { RotationGroup } from '../../utils/bikeCard'

// A rotation's lifetime distances side by side: mounted in the primary
// colour, off-bike in a darker shade, with "Chain S1 · 2,410 km" labels
// under it. Shared by Home's bike card and the bike page's rotation card.
export default function RotationSplitBar({ group, height = 6 }: { group: RotationGroup; height?: number }) {
  const segments = [
    ...group.mounted.map((component) => ({ ...component, onBike: true })),
    ...group.offBike.map((component) => ({ ...component, onBike: false })),
  ]
  const total = segments.reduce((sum, segment) => sum + (segment.total_distance_meters ?? 0), 0)

  return (
    <Stack gap={4}>
      <Group gap={2} wrap="nowrap" h={height}>
        {segments.map((segment) => (
          <Box
            key={segment.component_id}
            h="100%"
            style={{
              // An all-zero rotation still draws, as equal parts.
              flex: total > 0 ? `${segment.total_distance_meters ?? 0} 1 0` : '1 1 0',
              minWidth: 2,
              borderRadius: height / 2,
              background: segment.onBike ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-primary-color-9)',
            }}
          />
        ))}
      </Group>
      <Group justify="space-between" wrap="wrap" gap="xs">
        {segments.map((segment) => (
          <Text key={segment.component_id} size="xs" c="dimmed">
            {segment.label} · {formatDistance(segment.total_distance_meters ?? 0)}
          </Text>
        ))}
      </Group>
    </Stack>
  )
}
