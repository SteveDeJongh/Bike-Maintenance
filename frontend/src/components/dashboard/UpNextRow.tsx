import { useState } from 'react'
import { Badge, Button, Group, Progress, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import { useIsMobile } from '../../hooks/useIsMobile'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { formatDrivingRemaining, primarySatisfier } from '../../utils/serviceInterval'
import { formatUsedOfTotal } from '../../utils/upNext'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import type { DashboardRequirementItem } from '../../types/models'

// One requirement: what's left on its driving dimension (never a projected
// date), a thin bar on the same dimension, and where the part is. "Log
// service" is the same modal and prefill AttentionRow used.
export default function UpNextRow({ item }: { item: DashboardRequirementItem }) {
  const [logOpened, setLogOpened] = useState(false)
  const isMobile = useIsMobile()
  const color = SERVICE_STATUS_COLORS[item.status]
  const alerting = item.status !== 'ok'

  return (
    <Stack gap={4} py="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Text size="sm" style={{ minWidth: 0 }}>
          <Text component={Link} to={`/components/${item.component_id}`} size="sm" fw={500} inherit>
            {item.component_label}
          </Text>{' '}
          <Text span c="dimmed" inherit>
            · {item.requirement_name}
          </Text>
        </Text>
        <Text size="sm" fw={600} c={color} style={{ whiteSpace: 'nowrap' }}>
          {formatDrivingRemaining(item)}
        </Text>
      </Group>

      <Progress size="sm" value={Math.min(Math.max(item.fraction_used, 0), 1) * 100} color={color} />

      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed">
            {item.bike ? item.bike.name : 'Not mounted'}
          </Text>
          {/* Only meaningful for an alerting item: an ok row can't be
              dismissed, and "notifications off" there is noise. */}
          {alerting && item.dismissed && (
            <Badge size="xs" color="gray" variant="light">
              Dismissed until next sync
            </Badge>
          )}
          {alerting && item.notifications_off && (
            <Badge size="xs" color="gray" variant="light">
              Notifications off
            </Badge>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {formatUsedOfTotal(item)}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => setLogOpened(true)}
            style={isMobile ? MOBILE_TAP_TARGET_STYLE : undefined}
          >
            Log service
          </Button>
        </Group>
      </Group>

      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={item.component_id}
        defaultServiceTypeId={primarySatisfier(item.satisfiers)?.service_type_id}
      />
    </Stack>
  )
}
