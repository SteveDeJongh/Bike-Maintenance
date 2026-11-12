import type { ReactNode } from 'react'
import { Anchor, Badge, Box, Button, Divider, Group, Paper, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../../api/client'
import { formatDateTime, formatRelativeTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { syncFailureMessage } from '../../utils/strava'
import type { SyncFailure } from '../../hooks/useStravaSyncRunner'
import type { DashboardSyncSection, SyncFailureCode } from '../../types/models'

function rideWord(count: number): string {
  return count === 1 ? 'ride' : 'rides'
}

interface ResolvedFailure {
  code: SyncFailureCode
  retryAt: string | null
}

// Prefers the live sync runner's failure (it's from the exact run this page
// just triggered) but falls back to the credential's own last_sync_* fields
// (GET /dashboard) so a failure survives a reload -- useStravaSyncRunner's
// `failure` is in-memory, set only from a live poll. Once a later sync
// succeeds, last_synced_at moves past last_sync_failed_at and this starts
// returning null again on its own -- no separate "clear" step needed.
function resolveFailure(sync: DashboardSyncSection, liveFailure: SyncFailure | null): ResolvedFailure | null {
  if (liveFailure) return liveFailure
  if (!sync.last_sync_failed_at) return null
  if (sync.last_synced_at && sync.last_synced_at >= sync.last_sync_failed_at) return null

  return { code: sync.last_sync_error ?? 'unknown', retryAt: sync.last_sync_retry_at }
}

interface SyncStripProps {
  sync: DashboardSyncSection
  onSync: () => void
  syncing: boolean
  failure: SyncFailure | null
  stillRunning: boolean
}

// One compact strip, not a stack of Alert boxes -- the status row always
// shows; an issue list (sync failure, still-running, unmapped-gear/no-bike
// rides) only renders below it when there's at least one item, each a
// single line with its own action. The Strava page's Gear/Rides tabs are
// where the user actually acts on gear/ride issues in detail -- this strip
// just surfaces that something needs attention and links there.
export default function SyncStrip({ sync, onSync, syncing, failure, stillRunning }: SyncStripProps) {
  if (!sync.connected) {
    return (
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" wrap="wrap">
          <Group gap="md" wrap="wrap">
            <Badge color="gray">Not connected</Badge>
            <Text size="sm" c="dimmed">
              Connect Strava to start attributing rides to your bikes
            </Text>
          </Group>
          <Button component="a" href={`${API_BASE_URL}/auth/strava`}>
            Connect Strava
          </Button>
        </Group>
      </Paper>
    )
  }

  const { unattributed } = sync
  const resolvedFailure = resolveFailure(sync, failure)
  const hasRideIssue = unattributed.with_gear.count > 0 || unattributed.without_gear.count > 0
  const running = syncing || stillRunning

  // Priority order: a sync in progress always wins (it's the most current
  // thing happening), then a failure, then a ride/gear issue, else all clear.
  const badge = running
    ? { color: 'gray', label: 'Syncing…' }
    : resolvedFailure
      ? { color: 'red', label: 'Sync failed' }
      : hasRideIssue
        ? { color: 'orange', label: 'Needs attention' }
        : { color: 'teal', label: 'Connected' }

  const showIssues = Boolean(resolvedFailure) || stillRunning || hasRideIssue

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Group gap="md" wrap="wrap">
            <Badge color={badge.color}>{badge.label}</Badge>
            <Text size="sm" c="dimmed">
              Last synced {formatRelativeTime(sync.last_synced_at)}
              {sync.last_synced_at ? ` (${formatDateTime(sync.last_synced_at)})` : ''} · {sync.rides_total}{' '}
              {rideWord(sync.rides_total)} synced
            </Text>
          </Group>
          <Button onClick={onSync} loading={syncing}>
            Sync now
          </Button>
        </Group>

        {showIssues && (
          <>
            <Divider />
            <Stack gap={4}>
              {resolvedFailure && (
                <IssueRow
                  dot="red"
                  action={
                    resolvedFailure.code === 'auth_failed'
                      ? { label: 'Reconnect Strava', href: `${API_BASE_URL}/auth/strava` }
                      : undefined
                  }
                >
                  {syncFailureMessage(resolvedFailure.code, resolvedFailure.retryAt)}
                </IssueRow>
              )}
              {stillRunning && <IssueRow dot="gray">Sync is still running in the background.</IssueRow>}
              {unattributed.with_gear.count > 0 && (
                <IssueRow dot="orange" action={{ label: 'Link gear', to: '/strava?tab=gear' }}>
                  {unattributed.with_gear.count} {rideWord(unattributed.with_gear.count)} (
                  {formatDistance(unattributed.with_gear.distance_meters)}) use Strava gear that isn't linked to a bike
                </IssueRow>
              )}
              {unattributed.without_gear.count > 0 && (
                <IssueRow dot="orange" action={{ label: 'Review rides', to: '/strava?tab=rides' }}>
                  {unattributed.without_gear.count} {rideWord(unattributed.without_gear.count)} (
                  {formatDistance(unattributed.without_gear.distance_meters)}) had no bike set on Strava
                </IssueRow>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  )
}

interface IssueAction {
  label: string
  to?: string
  href?: string
}

function IssueRow({ dot, action, children }: { dot: 'red' | 'orange' | 'gray'; action?: IssueAction; children: ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <Box w={8} h={8} style={{ borderRadius: '50%', backgroundColor: `var(--mantine-color-${dot}-6)`, flexShrink: 0 }} />
        <Text size="sm">{children}</Text>
      </Group>
      {action &&
        (action.to ? (
          <Anchor component={Link} to={action.to} size="sm" style={{ whiteSpace: 'nowrap' }}>
            {action.label}
          </Anchor>
        ) : (
          <Anchor component="a" href={action.href} size="sm" style={{ whiteSpace: 'nowrap' }}>
            {action.label}
          </Anchor>
        ))}
    </Group>
  )
}
