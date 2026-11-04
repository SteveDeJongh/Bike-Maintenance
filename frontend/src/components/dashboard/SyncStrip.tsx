import { Alert, Anchor, Badge, Button, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { formatDateTime, formatRelativeTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import type { DashboardSyncSection } from '../../types/models'

function rideWord(count: number): string {
  return count === 1 ? 'ride' : 'rides'
}

interface SyncStripProps {
  sync: DashboardSyncSection
  onSync: () => void
  syncing: boolean
}

export default function SyncStrip({ sync, onSync, syncing }: SyncStripProps) {
  if (!sync.connected) {
    return (
      <Alert color="gray" title="Strava not connected">
        <Group justify="space-between">
          <Text c="dimmed">Connect to Strava to start attributing rides to your bikes.</Text>
          <Button component={Link} to="/strava">
            Go to Strava settings
          </Button>
        </Group>
      </Alert>
    )
  }

  const { unattributed } = sync

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="wrap">
        <Group gap="md" wrap="wrap">
          <Badge color="teal">Connected</Badge>
          <Text size="sm" c="dimmed">
            Last synced {formatRelativeTime(sync.last_synced_at)}
            {sync.last_synced_at ? ` (${formatDateTime(sync.last_synced_at)})` : ''}
          </Text>
          <Text size="sm" c="dimmed">
            {sync.rides_total} {rideWord(sync.rides_total)} synced
          </Text>
        </Group>
        <Button onClick={onSync} loading={syncing}>
          Sync now
        </Button>
      </Group>

      {unattributed.count > 0 && (
        <Alert color="orange" title="Some rides aren't attributed to a bike yet">
          <Stack gap={4}>
            {unattributed.with_gear.count > 0 && (
              <Text size="sm">
                {unattributed.with_gear.count} {rideWord(unattributed.with_gear.count)} (
                {formatDistance(unattributed.with_gear.distance_meters)}) have Strava gear that isn't mapped to a
                bike yet —{' '}
                <Anchor component={Link} to="/strava">
                  link gear
                </Anchor>
                .
              </Text>
            )}
            {unattributed.without_gear.count > 0 && (
              <Text size="sm">
                {unattributed.without_gear.count} {rideWord(unattributed.without_gear.count)} (
                {formatDistance(unattributed.without_gear.distance_meters)}) had no bike set on Strava.
              </Text>
            )}
          </Stack>
        </Alert>
      )}
    </Stack>
  )
}
