import { Anchor, Box, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import LogServiceAfterRideButton from '../ride/LogServiceAfterRideButton'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatShortDate, rideSportLabel } from '../../utils/recentActivity'
import type { DashboardRecentRide } from '../../types/models'

// The five newest rides as compact grid rows: date | name over "{sport} ·
// {bike}" | moving time | distance | "Log service after this ride".
export default function RecentRides({ rides }: { rides: DashboardRecentRide[] }) {
  return (
    <Paper withBorder p="md" radius="md" style={{ flex: '3 1 520px', minWidth: 0 }}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={3}>Recent rides</Title>
          <Anchor component={Link} to="/activity" size="sm">
            Ride history →
          </Anchor>
        </Group>

        {rides.length === 0 ? (
          <Text size="sm" c="dimmed">
            No rides yet.
          </Text>
        ) : (
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto auto auto',
              columnGap: 'var(--mantine-spacing-sm)',
              alignItems: 'center',
            }}
          >
            {rides.map((ride) => (
              <RecentRideRow key={ride.id} ride={ride} />
            ))}
          </Box>
        )}
      </Stack>
    </Paper>
  )
}

// display: contents keeps each row's cells on the parent grid so the
// columns line up; the no-bike tint goes on every cell instead.
function RecentRideRow({ ride }: { ride: DashboardRecentRide }) {
  const cell = {
    padding: '6px 4px',
    borderTop: '1px solid var(--mantine-color-default-border)',
    background: ride.bike ? undefined : 'var(--mantine-color-orange-light)',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
  } as const

  return (
    <Box style={{ display: 'contents' }}>
      <Text size="sm" c="dimmed" style={{ ...cell, whiteSpace: 'nowrap' }}>
        {formatShortDate(ride.moved_at)}
      </Text>
      <Stack gap={0} style={{ ...cell, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
        <Text size="sm" truncate maw="100%">
          {ride.name}
        </Text>
        <Text size="xs" c="dimmed" truncate maw="100%">
          {rideSportLabel(ride.activity_type)} ·{' '}
          {ride.bike ? (
            <Anchor component={Link} to={`/bikes/${ride.bike.id}`} size="xs" c="dimmed" inherit>
              {ride.bike.name}
            </Anchor>
          ) : (
            <>
              <Anchor component={Link} to="/strava?tab=rides" size="xs" c="orange" inherit>
                No bike
              </Anchor>
              {ride.gear_id && (
                <>
                  {' · '}
                  <Anchor component={Link} to="/strava?tab=gear" size="xs" inherit>
                    Link gear
                  </Anchor>
                </>
              )}
            </>
          )}
        </Text>
      </Stack>
      <Text size="sm" c="dimmed" ta="right" style={{ ...cell, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
        {ride.moving_time != null ? formatDuration(ride.moving_time) : '—'}
      </Text>
      <Text size="sm" fw={500} ta="right" style={{ ...cell, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
        {formatDistance(ride.distance_meters)}
      </Text>
      <Box style={{ ...cell, justifyContent: 'flex-end' }}>
        <LogServiceAfterRideButton bikeId={ride.bike?.id ?? null} movedAt={ride.moved_at} elapsedTime={ride.elapsed_time} />
      </Box>
    </Box>
  )
}
