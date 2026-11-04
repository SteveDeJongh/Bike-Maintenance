import { useState } from 'react'
import { Badge, Button, Group, Progress, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import ServiceStatusBadge from '../ServiceStatusBadge'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { formatRemaining } from '../../utils/serviceInterval'
import type { DashboardAttentionItem } from '../../types/models'

export default function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const [logOpened, setLogOpened] = useState(false)

  return (
    <Stack gap={4} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text component={Link} to={`/components/${item.component_id}`} size="sm" fw={500}>
          {item.component_label} — {item.service_type_name}
        </Text>
        <Group gap={4} wrap="nowrap">
          <ServiceStatusBadge status={item.status} />
          {item.dismissed && (
            <Badge color="gray" variant="light">
              Dismissed
            </Badge>
          )}
          {item.notifications_off && (
            <Badge color="gray" variant="light">
              Notifications off
            </Badge>
          )}
        </Group>
      </Group>

      <Text size="xs" c="dimmed">
        {formatRemaining(item.distance_remaining_meters, item.days_remaining)}
      </Text>

      <Progress value={Math.min(Math.max(item.fraction_used, 0), 1) * 100} color={SERVICE_STATUS_COLORS[item.status]} />

      <Group justify="flex-end">
        <Button size="xs" onClick={() => setLogOpened(true)}>
          Log service
        </Button>
      </Group>

      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={item.component_id}
        defaultServiceTypeId={item.service_type_id}
      />
    </Stack>
  )
}
