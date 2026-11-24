import { Badge, Group, Paper, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { formatDistance } from '../../utils/distance'
import { retiredLabel, retiredYearRange } from './bikesList'
import type { BikeWithStats } from '../../types/models'

// Retired bikes under the card grid (when "Show retired bikes" is on): slim,
// muted rows, each a link to the bike.
export default function RetiredBikeRows({ bikes }: { bikes: BikeWithStats[] }) {
  if (bikes.length === 0) return null

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.04em' }}>
        Retired
      </Text>
      {bikes.map((bike) => {
        const years = retiredYearRange(bike)
        return (
          <Paper
            key={bike.id}
            component={Link}
            to={`/bikes/${bike.id}`}
            withBorder
            radius="md"
            px="md"
            py="xs"
            className="bike-list-card"
            style={{ background: 'var(--mantine-color-gray-light)' }}
          >
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Text fw={500} c="dimmed" truncate>
                  {bike.name}
                </Text>
                {bike.retired_on && (
                  <Badge size="sm" color="gray" variant="light" tt="none" fw={500}>
                    {retiredLabel(bike.retired_on)}
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                {[
                  formatDistance(bike.total_distance),
                  `${bike.ride_count} ${bike.ride_count === 1 ? 'ride' : 'rides'}`,
                  years,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )
}
