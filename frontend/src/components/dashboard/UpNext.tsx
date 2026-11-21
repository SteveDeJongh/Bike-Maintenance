import { Anchor, Badge, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import UpNextRow from './UpNextRow'
import { SERVICE_STATUS_COLORS } from '../../constants'
import { upNextItems } from '../../utils/upNext'
import type { DashboardAttentionItem, DashboardRequirementItem } from '../../types/models'

interface UpNextProps {
  attention: DashboardAttentionItem[]
  upcoming: DashboardRequirementItem[]
}

// A self-contained panel: every due/warning item, then the nearest ok
// requirements on mounted parts, five rows by default. No width
// assumptions -- it reads the same full width or as a ~340px column.
export default function UpNext({ attention, upcoming }: UpNextProps) {
  const items = upNextItems(attention, upcoming)
  const dueCount = attention.filter((item) => item.status === 'due').length
  const soonCount = attention.filter((item) => item.status === 'warning').length

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={3}>Up next</Title>
          <Group gap="xs" wrap="nowrap">
            {dueCount > 0 && <Badge color={SERVICE_STATUS_COLORS.due}>{dueCount} due</Badge>}
            {soonCount > 0 && <Badge color={SERVICE_STATUS_COLORS.warning}>{soonCount} soon</Badge>}
          </Group>
        </Group>

        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            No service intervals set up yet.{' '}
            <Anchor component={Link} to="/settings/component-categories" size="sm">
              Set them up
            </Anchor>
          </Text>
        ) : (
          <Stack gap={0}>
            {items.map((item) => (
              <UpNextRow key={`${item.component_id}-${item.requirement_id}`} item={item} />
            ))}
          </Stack>
        )}

        <Anchor component={Link} to="/components" size="sm">
          All service intervals →
        </Anchor>
      </Stack>
    </Paper>
  )
}
