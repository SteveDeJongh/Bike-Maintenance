import { useState } from 'react'
import { Anchor, Box, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import ServiceSessionViewModal from '../forms/ServiceSessionViewModal'
import { formatShortDate } from '../../utils/recentActivity'
import type { DashboardSummary } from '../../types/models'

type RecentServiceItem = DashboardSummary['recent_service'][number]

// The five newest service entries from Activity::Feed. The primary line is
// the feed's own server-built summary -- the activity log's wording, never
// recomposed here -- with the same click targets as the log: an event opens
// its component at that event, a session its view modal, a swap the
// installed component.
export default function RecentService({ items }: { items: RecentServiceItem[] }) {
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null)

  return (
    <Paper withBorder p="md" radius="md" style={{ flex: '2 1 340px', minWidth: 0 }}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={3}>Recent service</Title>
          <Anchor component={Link} to="/activity" size="sm">
            Activity log →
          </Anchor>
        </Group>

        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            No service logged yet.
          </Text>
        ) : (
          <Stack gap={0}>
            {items.map((item) => (
              <Group
                key={`${item.kind}-${item.id}`}
                gap="sm"
                wrap="nowrap"
                align="flex-start"
                py={6}
                style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
              >
                <Box
                  mt={6}
                  w={8}
                  h={8}
                  style={{ borderRadius: '50%', flexShrink: 0, background: 'var(--mantine-primary-color-filled)' }}
                />
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Summary item={item} onViewSession={setViewingSessionId} />
                  <Text size="xs" c="dimmed">
                    {formatShortDate(item.occurred_at)} · {item.bike ? item.bike.name : '(off bike)'}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>

      {viewingSessionId != null && (
        <ServiceSessionViewModal opened onClose={() => setViewingSessionId(null)} sessionId={viewingSessionId} />
      )}
    </Paper>
  )
}

function Summary({ item, onViewSession }: { item: RecentServiceItem; onViewSession: (id: number) => void }) {
  if (item.kind === 'service_session') {
    return (
      <Anchor component="button" type="button" size="sm" ta="left" c="var(--mantine-color-text)" onClick={() => onViewSession(item.id)}>
        {item.summary}
      </Anchor>
    )
  }
  const to = item.kind === 'maintenance_event' ? `/components/${item.component_id}?event=${item.id}` : `/components/${item.component.id}`
  return (
    <Anchor component={Link} to={to} size="sm" c="var(--mantine-color-text)">
      {item.summary}
    </Anchor>
  )
}
