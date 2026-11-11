import { useState } from 'react'
import { Button, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import BatchServiceModal from '../forms/BatchServiceModal'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { formatDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import type { DashboardBike, DashboardDisplayMetric, DashboardMountedComponent } from '../../types/models'

function formatDisplayMetric(metric: DashboardDisplayMetric): string {
  if (metric.distance_meters != null) {
    return metric.service_type_name
      ? `${formatDistance(metric.distance_meters)} since ${metric.service_type_name}`
      : formatDistance(metric.distance_meters)
  }
  if (metric.days != null) {
    return `${metric.days}d since ${metric.service_type_name}`
  }
  return '—'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value}
      </Text>
    </Stack>
  )
}

function MountedRow({ component }: { component: DashboardMountedComponent }) {
  const dotColor = component.service_status ? SERVICE_STATUS_COLORS[component.service_status] : 'gray'

  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap={6} wrap="nowrap">
        <span
          style={{
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '50%',
            backgroundColor: `var(--mantine-color-${dotColor}-6)`,
          }}
        />
        <Text size="sm">{component.label}</Text>
      </Group>
      <Text size="sm" c={component.service_status === 'due' ? 'red' : 'dimmed'}>
        {formatDisplayMetric(component.display_metric)}
      </Text>
    </Group>
  )
}

export default function BikeCard({ bike }: { bike: DashboardBike }) {
  const [batchServiceOpened, setBatchServiceOpened] = useState(false)

  return (
    <Card withBorder padding="lg" radius="md" style={{ flex: '1 1 320px' }}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text component={Link} to={`/bikes/${bike.id}`} fw={600} size="lg">
            {bike.name}
          </Text>
          <Stack gap={2} align="flex-end">
            <Text size="sm" c="dimmed">
              {bike.last_ride_on ? `Last ride ${formatDate(bike.last_ride_on)}` : 'No rides yet'}
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={() => setBatchServiceOpened(true)}>
              Log service
            </Button>
          </Stack>
        </Group>

        <Group gap="lg">
          <Stat label="Total" value={formatDistance(bike.total_distance)} />
          <Stat label="This month" value={formatDistance(bike.distance_this_month)} />
          <Stat label="Rides" value={String(bike.ride_count)} />
        </Group>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Mounted now
          </Text>
          {bike.mounted.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nothing tracked as mounted.
            </Text>
          ) : (
            bike.mounted.map((component) => <MountedRow key={component.component_id} component={component} />)
          )}
        </Stack>

        {bike.off_bike.length > 0 && (
          <Text size="xs" c="dimmed">
            Off the bike: {bike.off_bike.map((c) => `${c.label} (${formatDisplayMetric(c.display_metric)})`).join(', ')}
          </Text>
        )}
      </Stack>

      <BatchServiceModal opened={batchServiceOpened} onClose={() => setBatchServiceOpened(false)} bikeId={bike.id} />
    </Card>
  )
}
