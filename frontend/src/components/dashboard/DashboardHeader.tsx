import type { ReactNode } from 'react'
import { Box, Button, Group, Loader, Paper, Stack, Text, Title, Tooltip } from '@mantine/core'
import { IconCircleCheck } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../../api/client'
import { formatDateTime, formatHeaderDate, formatRelativeTime } from '../../utils/datetime'
import { syncFailureMessage } from '../../utils/strava'
import { resolveFailure } from '../../utils/syncFailure'
import type { SyncFailure } from '../../hooks/useStravaSyncRunner'
import type { DashboardSyncSection } from '../../types/models'

function rideWord(count: number): string {
  return count === 1 ? 'ride' : 'rides'
}

interface DashboardHeaderProps {
  sync: DashboardSyncSection
  onSync: () => void
  syncing: boolean
  failure: SyncFailure | null
  stillRunning: boolean
}

// The Home page's header: title and date on the left; on the right a
// status pill, one chip per Strava issue (each linking to where it's fixed
// on the Strava page), and "Sync now". It carries everything the old
// full-width sync strip did, just compacted -- the Strava page's Gear/Rides
// tabs are still where gear and ride issues are actually resolved.
export default function DashboardHeader({ sync, onSync, syncing, failure, stillRunning }: DashboardHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
      <Stack gap={0}>
        <Title order={2}>Home</Title>
        <Text size="sm" c="dimmed">
          {formatHeaderDate(new Date())}
        </Text>
      </Stack>

      <Group gap="xs" wrap="wrap">
        {sync.connected ? (
          <ConnectedControls sync={sync} onSync={onSync} syncing={syncing} failure={failure} stillRunning={stillRunning} />
        ) : (
          <Button component="a" href={`${API_BASE_URL}/auth/strava`}>
            Connect Strava
          </Button>
        )}
      </Group>
    </Group>
  )
}

function ConnectedControls({ sync, onSync, syncing, failure, stillRunning }: DashboardHeaderProps) {
  const { unattributed } = sync
  const resolvedFailure = resolveFailure(sync, failure)
  // stillRunning needs no chip of its own: the pill already says "Syncing…".
  const running = syncing || stillRunning
  const gearIssue = unattributed.unmapped_gear_count > 0 || unattributed.with_gear.count > 0

  return (
    <>
      <Tooltip
        multiline
        label={
          sync.last_synced_at
            ? `Last synced ${formatDateTime(sync.last_synced_at)} · ${sync.rides_total} ${rideWord(sync.rides_total)} synced`
            : `Not synced yet · ${sync.rides_total} ${rideWord(sync.rides_total)} synced`
        }
      >
        <Paper withBorder radius="xl" px="sm" py={6}>
          <Group gap={6} wrap="nowrap">
            {running ? (
              <>
                <Loader size={12} color="gray" />
                <Text size="sm" c="dimmed">
                  Syncing…
                </Text>
              </>
            ) : resolvedFailure ? (
              <>
                <Dot color="red" />
                <Text size="sm" c="red">
                  Sync failed
                </Text>
              </>
            ) : (
              <>
                <IconCircleCheck size={16} color="var(--mantine-primary-color-filled)" />
                <Text size="sm">Strava synced {formatRelativeTime(sync.last_synced_at)}</Text>
              </>
            )}
          </Group>
        </Paper>
      </Tooltip>

      {resolvedFailure && (
        <IssueChip
          color="red"
          action={
            resolvedFailure.code === 'auth_failed'
              ? { label: 'Reconnect Strava', href: `${API_BASE_URL}/auth/strava` }
              : undefined
          }
        >
          {syncFailureMessage(resolvedFailure.code, resolvedFailure.retryAt)}
        </IssueChip>
      )}
      {gearIssue && (
        <IssueChip color="orange" action={{ label: 'Link gear', to: '/strava?tab=gear' }}>
          {/* The gear count can lag the rides (a gear-cache gap); fall back
              to counting the rides that need it rather than saying "0". */}
          {unattributed.unmapped_gear_count > 0
            ? `${unattributed.unmapped_gear_count} unmapped gear`
            : `${unattributed.with_gear.count} ${rideWord(unattributed.with_gear.count)} with unlinked gear`}
        </IssueChip>
      )}
      {unattributed.without_gear.count > 0 && (
        <IssueChip color="orange" action={{ label: 'Review', to: '/strava?tab=rides' }}>
          {unattributed.without_gear.count} {rideWord(unattributed.without_gear.count)} with no bike
        </IssueChip>
      )}

      <Button onClick={onSync} loading={syncing}>
        Sync now
      </Button>
    </>
  )
}

function Dot({ color }: { color: 'red' | 'orange' }) {
  return <Box w={8} h={8} style={{ borderRadius: '50%', backgroundColor: `var(--mantine-color-${color}-6)`, flexShrink: 0 }} />
}

interface IssueAction {
  label: string
  to?: string
  href?: string
}

// A pill-shaped chip; the whole chip is the link when there's an action.
function IssueChip({ color, action, children }: { color: 'red' | 'orange'; action?: IssueAction; children: ReactNode }) {
  const content = (
    <Group gap={6} wrap="nowrap">
      <Dot color={color} />
      <Text size="sm">
        {children}
        {action && (
          <Text span size="sm" c={color} fw={500}>
            {' · '}
            {action.label}
          </Text>
        )}
      </Text>
    </Group>
  )
  const chipProps = { withBorder: true, radius: 'xl', px: 'sm', py: 6, style: { borderColor: `var(--mantine-color-${color}-light-color)` } } as const

  if (action?.to) {
    return (
      <Paper {...chipProps} component={Link} to={action.to}>
        {content}
      </Paper>
    )
  }
  if (action?.href) {
    return (
      <Paper {...chipProps} component="a" href={action.href}>
        {content}
      </Paper>
    )
  }
  return <Paper {...chipProps}>{content}</Paper>
}
