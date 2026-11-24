import { Divider, SimpleGrid, Stack, Text } from '@mantine/core'
import SmallLabel from './SmallLabel'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import { lifetimeLine } from './installationModel'
import type { ComponentAssignmentWithStats } from '../../types/models'

// "This installation", condensed like the ride modal: four large values
// between thin dividers (Avg power left out without a power meter), then
// the component's lifetime totals as one dimmed line.
export default function InstallationStats({ assignment }: { assignment: ComponentAssignmentWithStats }) {
  const stats = [
    { label: 'Distance', value: formatDistance(assignment.distance_meters) },
    { label: 'Time', value: formatDuration(assignment.moving_time) },
    { label: 'Elevation', value: formatElevation(assignment.elevation_gain) },
    assignment.average_power != null ? { label: 'Avg power', value: formatPower(assignment.average_power) } : null,
  ].filter((stat) => stat !== null)

  return (
    <Stack gap="sm">
      <Divider />
      <SmallLabel>This installation</SmallLabel>
      <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="sm" verticalSpacing="xs">
        {stats.map((stat) => (
          <Stack key={stat.label} gap={0}>
            <SmallLabel>{stat.label}</SmallLabel>
            <Text fz="xl" fw={600}>
              {stat.value}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {lifetimeLine(assignment.component)}
      </Text>
      <Divider />
    </Stack>
  )
}
