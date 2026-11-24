import { useMemo, useState } from 'react'
import { Alert, Anchor, Group, Loader, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconTool } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router-dom'
import { useActivityFeed } from '../../api/queries'
import ServiceChips from '../activity/ServiceChips'
import { serviceChipLabels } from '../activity/activityListModel'
import { activityUrl } from '../activity/activityUrl'
import DataListRow from '../datalist/DataListRow'
import ServiceSessionViewModal from '../forms/ServiceSessionViewModal'
import type { ActivityItem } from '../../types/models'

const SHOWN = 5

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The bike's latest service, from the activity feed (this bike, the
// Service kind): date | wrench | the component chips, in the Activity rows'
// chip style. A session opens its modal; a service logged outside a
// session opens its component, as on Activity. "All N →" opens Activity
// filtered the same way.
export default function BikeServiceCard({ bikeId }: { bikeId: number }) {
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState<number | null>(null)
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const feed = useActivityFeed({ kinds: ['service'], bikeId, tz, order: 'desc', sort: 'date' })
  const firstPage = feed.data?.pages[0]
  const items = firstPage?.items.slice(0, SHOWN) ?? []
  const total = firstPage?.meta.kind_counts.service ?? 0

  function open(item: ActivityItem) {
    if (item.kind === 'service_session') setSessionId(item.id)
    else if (item.kind === 'maintenance_event') navigate(`/components/${item.component_id}?event=${item.id}`)
  }

  return (
    <Paper withBorder radius="md" p="md" style={{ flex: '1 1 460px', minWidth: 0 }}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>Service</Title>
          {total > 0 && (
            <Anchor component={Link} to={activityUrl({ bikeId, kinds: ['service'] })} size="sm">
              All {total} →
            </Anchor>
          )}
        </Group>

        {feed.isPending && <Loader size="sm" />}
        {feed.isError && <Alert color="red">{feed.error.message}</Alert>}
        {!feed.isPending && !feed.isError && items.length === 0 && (
          <Text size="sm" c="dimmed">
            No service logged on this bike yet.
          </Text>
        )}

        {items.length > 0 && (
          <div>
            {items.map((item) => (
              <DataListRow key={`${item.kind}-${item.id}`} stacked ariaLabel={`Service on ${shortDate(item.occurred_at)}, open`} onOpen={() => open(item)}>
                <Group gap="sm" wrap="nowrap">
                  <Text size="sm" c="dimmed" w={52} style={{ flexShrink: 0 }}>
                    {shortDate(item.occurred_at)}
                  </Text>
                  <ThemeIcon radius="xl" size={24} variant="light" color="teal" style={{ flexShrink: 0 }}>
                    <IconTool size={14} />
                  </ThemeIcon>
                  <ServiceChips chips={serviceChipLabels(item)} inline />
                </Group>
              </DataListRow>
            ))}
          </div>
        )}
      </Stack>

      {sessionId !== null && <ServiceSessionViewModal opened onClose={() => setSessionId(null)} sessionId={sessionId} />}
    </Paper>
  )
}
