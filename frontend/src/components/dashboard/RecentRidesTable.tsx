import { Anchor, Badge, Group, ScrollArea, Stack, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import type { DashboardRecentRide } from '../../types/models'

interface RecentRidesTableProps {
  summary: { count: number; distance_meters: number }
  rides: DashboardRecentRide[]
}

// A plain Mantine Table, not the app's reusable sortable/configurable-table
// system -- that mechanism is built around a TableViewPreference row per
// page and persisted column choices, which this fixed, non-configurable
// 14-day feed has no use for.
export default function RecentRidesTable({ summary, rides }: RecentRidesTableProps) {
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={3}>Recent rides</Title>
        <Text size="sm" c="dimmed">
          {summary.count} {summary.count === 1 ? 'ride' : 'rides'} · {formatDistance(summary.distance_meters)} in the
          last 14 days
        </Text>
      </Group>

      {rides.length === 0 ? (
        <Text c="dimmed">No rides in the last 14 days.</Text>
      ) : (
        <ScrollArea>
          <Table miw={700}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Distance</Table.Th>
                <Table.Th>Bike</Table.Th>
                <Table.Th>Counted toward</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rides.map((ride) => (
                <RecentRideRow key={ride.id} ride={ride} />
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  )
}

function RecentRideRow({ ride }: { ride: DashboardRecentRide }) {
  return (
    <Table.Tr bg={ride.bike ? undefined : 'var(--mantine-color-orange-light)'}>
      <Table.Td>{formatDateTime(ride.moved_at)}</Table.Td>
      <Table.Td>
        {ride.name}
        {ride.indoor && (
          <Badge ml="xs" size="xs" variant="light" color="gray">
            Indoor
          </Badge>
        )}
      </Table.Td>
      <Table.Td>{formatDistance(ride.distance_meters)}</Table.Td>
      <Table.Td>
        {ride.bike ? (
          <Text component={Link} to={`/bikes/${ride.bike.id}`} size="sm">
            {ride.bike.name}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            No bike
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        {ride.counted_toward.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {ride.counted_toward.map((component) => (
              <Badge key={component.component_id} variant="light">
                {component.label}
              </Badge>
            ))}
          </Group>
        ) : (
          <Group gap={4} wrap="nowrap">
            <Text size="sm" c="dimmed">
              Not counted
            </Text>
            {ride.gear_id && (
              <Anchor component={Link} to="/strava" size="sm">
                Link Strava gear
              </Anchor>
            )}
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  )
}
