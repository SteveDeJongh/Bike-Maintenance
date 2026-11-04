import { Badge, Group, Stack, Text, Title } from '@mantine/core'
import AttentionRow from './AttentionRow'
import { SERVICE_STATUS_COLORS } from '../../constants'
import type { DashboardAttentionItem } from '../../types/models'

interface AttentionGroup {
  key: string
  label: string
  items: DashboardAttentionItem[]
}

// attention[] already arrives ordered due-before-warning, then by
// fraction-used descending (Dashboard::Summary#attention_section) --
// grouping by bike here preserves that relative order within each group,
// it doesn't re-sort. "Not mounted" (bike: null) always sorts last.
function groupByBike(attention: DashboardAttentionItem[]): AttentionGroup[] {
  const byBikeId = new Map<number, AttentionGroup>()
  const unmounted: DashboardAttentionItem[] = []

  for (const item of attention) {
    if (!item.bike) {
      unmounted.push(item)
      continue
    }

    const existing = byBikeId.get(item.bike.id)
    if (existing) {
      existing.items.push(item)
    } else {
      byBikeId.set(item.bike.id, { key: `bike-${item.bike.id}`, label: item.bike.name, items: [item] })
    }
  }

  const groups = Array.from(byBikeId.values())
  if (unmounted.length > 0) {
    groups.push({ key: 'unmounted', label: 'Not mounted', items: unmounted })
  }
  return groups
}

export default function NeedsAttention({ attention }: { attention: DashboardAttentionItem[] }) {
  const dueCount = attention.filter((item) => item.status === 'due').length
  const warningCount = attention.filter((item) => item.status === 'warning').length

  return (
    <Stack gap="md" style={{ flex: '1 1 340px' }}>
      <Group justify="space-between">
        <Title order={3}>Needs attention</Title>
        <Group gap="xs">
          {dueCount > 0 && <Badge color={SERVICE_STATUS_COLORS.due}>{dueCount} due</Badge>}
          {warningCount > 0 && <Badge color={SERVICE_STATUS_COLORS.warning}>{warningCount} warning</Badge>}
        </Group>
      </Group>

      {attention.length === 0 ? (
        <Text c="dimmed">All caught up — nothing needs service right now.</Text>
      ) : (
        groupByBike(attention).map((group) => (
          <Stack key={group.key} gap="xs">
            <Text size="sm" fw={500} c="dimmed">
              {group.label}
            </Text>
            {group.items.map((item) => (
              <AttentionRow key={`${item.component_id}-${item.service_type_id}`} item={item} />
            ))}
          </Stack>
        ))
      )}
    </Stack>
  )
}
