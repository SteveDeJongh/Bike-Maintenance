import { Anchor, Card, Group, Text, Tooltip } from '@mantine/core'
import { Link } from 'react-router-dom'
import ViewOnStravaLink from '../ride/ViewOnStravaLink'
import { RideRowActions } from './ActivityTable'
import { activityItemIconMeta, nonRideNote } from './activityItemMeta'
import { formatDateTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import type { ActivityItem } from '../../types/models'

// Narrow-screen alternative to the table: ride rows become a compact card
// (date/name/bike/distance/moving time); non-ride rows stay single lines,
// since they're already compact -- same split the plan calls for.
export default function NarrowActivityCard({
  item,
  onViewSession,
}: {
  item: ActivityItem
  onViewSession: (sessionId: number) => void
}) {
  const { Icon, label } = activityItemIconMeta(item)

  if (item.kind === 'ride') {
    return (
      <Card withBorder padding="sm">
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Group gap={6} wrap="nowrap">
            <Tooltip label={label}>
              <Icon size={14} />
            </Tooltip>
            <Text size="xs" c="dimmed">
              {formatDateTime(item.occurred_at)}
            </Text>
          </Group>
          <RideRowActions ride={item} />
        </Group>
        <ViewOnStravaLink stravaId={item.strava_id} name={item.name} />
        <Group gap="xs" mt={4}>
          <Text size="sm">{item.bike ? item.bike.name : 'No bike'}</Text>
          <Text size="sm" c="dimmed">
            {formatDistance(item.distance_meters)}
          </Text>
          {item.moving_time != null && (
            <Text size="sm" c="dimmed">
              {formatDuration(item.moving_time)}
            </Text>
          )}
        </Group>
      </Card>
    )
  }

  const note = nonRideNote(item)

  return (
    <Card withBorder padding="sm" bg="var(--mantine-color-gray-light)">
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={label}>
          <Icon size={14} />
        </Tooltip>
        <Text size="xs" c="dimmed">
          {formatDateTime(item.occurred_at)}
        </Text>
        {item.kind === 'service_session' ? (
          <Anchor component="button" type="button" onClick={() => onViewSession(item.id)} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        ) : item.kind === 'maintenance_event' ? (
          <Anchor component={Link} to={`/components/${item.component_id}?event=${item.id}`} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        ) : (
          <Anchor component={Link} to={`/components/${item.component.id}`} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        )}
      </Group>
      {note && (
        <Text size="xs" c="dimmed" mt={2}>
          {note}
        </Text>
      )}
    </Card>
  )
}
