import { useState } from 'react'
import { Anchor, Group, Text } from '@mantine/core'
import { IconCircleCheck } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import StatTile from './StatTile'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { formatDrivingRemaining, primarySatisfier } from '../../utils/serviceInterval'
import type { DashboardAttentionItem } from '../../types/models'

// The first attention item (attention[] already arrives due-before-warning,
// then by fraction used). "Log service" opens the same modal with the same
// prefill as Up next's rows, so the save and its invalidation are
// identical.
export default function NextServiceTile({ attention }: { attention: DashboardAttentionItem[] }) {
  const [logOpened, setLogOpened] = useState(false)
  const item = attention[0]

  if (!item) {
    return (
      <StatTile
        label="Next service"
        value={
          <Group gap={6} wrap="nowrap" component="span">
            <IconCircleCheck size={24} color="var(--mantine-primary-color-filled)" />
            All caught up
          </Group>
        }
        secondary="Nothing needs service right now."
      />
    )
  }

  const color = SERVICE_STATUS_COLORS[item.status]

  return (
    <>
      <StatTile
        label="Next service"
        style={{ borderColor: `var(--mantine-color-${color}-6)` }}
        value={
          <Text span inherit c={color}>
            {formatDrivingRemaining(item)}
          </Text>
        }
        secondary={
          <Anchor component={Link} to={`/components/${item.component_id}`} c="dimmed" size="sm">
            {item.component_label} · {item.requirement_name}
          </Anchor>
        }
      >
        <Anchor component="button" type="button" size="sm" mt="xs" onClick={() => setLogOpened(true)}>
          Log service
        </Anchor>
      </StatTile>
      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={item.component_id}
        defaultServiceTypeId={primarySatisfier(item.satisfiers)?.service_type_id}
      />
    </>
  )
}
