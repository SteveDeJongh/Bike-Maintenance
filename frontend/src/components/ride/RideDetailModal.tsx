import { useState } from 'react'
import { Alert, Anchor, Box, Divider, Group, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core'
import { IconBike } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useRideDetail } from '../../api/queries'
import AppModal from '../AppModal'
import WearBar from '../dashboard/WearBar'
import ServiceSessionViewModal from '../forms/ServiceSessionViewModal'
import LogServiceAfterRideButton from './LogServiceAfterRideButton'
import ResyncRideButton from './ResyncRideButton'
import { formatDistance } from '../../utils/distance'
import { formatDrivingRemaining } from '../../utils/serviceInterval'
import { rideHeaderParts, rideStatLines, serviceNearbyLabel, type RideStat } from '../../utils/rideDetail'
import type { RideDetail, RideDetailComponent } from '../../types/models'

// Everything about one ride (GET /strava/rides/:id): the icon and name in
// the modal's own header (beside the close button, so pinned on mobile),
// then the date/sport/bike/context line, ride-level
// actions, condensed stats, the components it counts toward with their
// wear, and the service sessions around it. Opened by clicking a ride in
// any ride list -- each list holds one rideId and renders one of these,
// outside its table, rather than one per row.
export default function RideDetailModal({
  opened,
  onClose,
  rideId,
}: {
  opened: boolean
  onClose: () => void
  rideId: number | null
}) {
  return (
    <AppModal
      opened={opened}
      onClose={onClose}
      size="lg"
      padding="lg"
      title={opened && rideId != null ? <RideTitle rideId={rideId} /> : null}
      styles={{ title: { flex: 1, minWidth: 0 } }}
    >
      {opened && rideId != null && <RideDetailContent rideId={rideId} />}
    </AppModal>
  )
}

function RideDetailContent({ rideId }: { rideId: number }) {
  const { data: ride, isPending, error } = useRideDetail(rideId)
  const [sessionId, setSessionId] = useState<number | null>(null)

  if (isPending) return <RideDetailSkeleton />
  if (error) {
    return (
      <Alert color="red" title="Couldn't load this ride">
        {error.message}
      </Alert>
    )
  }

  const gearUnmapped = Boolean(ride.gear_id) && !ride.gear_mapped

  return (
    <Stack gap="md">
      <RideHeader ride={ride} />

      <Group gap="xs" wrap="wrap">
        <LogServiceAfterRideButton
          bikeId={ride.bike?.id ?? null}
          movedAt={ride.moved_at}
          elapsedTime={ride.elapsed_time}
          label="Log service after this ride"
          variant="filled"
          size="sm"
        />
        <Anchor
          href={`https://www.strava.com/activities/${ride.strava_id}`}
          target="_blank"
          rel="noopener noreferrer"
          fw={700}
          size="sm"
          style={{ color: 'var(--strava-orange)' }}
        >
          View on Strava ↗
        </Anchor>
        <ResyncRideButton rideId={ride.id} />
        {gearUnmapped && (
          <Anchor component={Link} to="/strava?tab=gear" size="sm" c="orange">
            Link gear
          </Anchor>
        )}
      </Group>

      <RideStats ride={ride} />
      <RideComponents ride={ride} gearUnmapped={gearUnmapped} />
      <RideServiceNearby ride={ride} onOpenSession={setSessionId} />

      <ServiceSessionViewModal
        opened={sessionId !== null}
        onClose={() => setSessionId(null)}
        sessionId={sessionId ?? 0}
      />
    </Stack>
  )
}

// The modal header's title: the ride icon and name, two lines at most.
// Reads the same (deduped) query as the body.
function RideTitle({ rideId }: { rideId: number }) {
  const { data: ride, isPending } = useRideDetail(rideId)

  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon radius="xl" size={36} variant="filled" style={{ flexShrink: 0 }}>
        <IconBike size={20} />
      </ThemeIcon>
      {ride ? (
        <Text fz="lg" fw={700} lh={1.25} lineClamp={2} style={{ overflowWrap: 'anywhere' }}>
          {ride.name}
        </Text>
      ) : (
        isPending && <Skeleton height={20} width={200} />
      )}
    </Group>
  )
}

// The body's first line: date · sport type · bike · indoor/outdoor.
function RideHeader({ ride }: { ride: RideDetail }) {
  const { when, sport, context } = rideHeaderParts(ride)

  return (
    <Text size="sm" c="dimmed">
      {when}
      {sport && ` · ${sport}`}
      {' · '}
      {ride.bike ? (
        <Anchor component={Link} to={`/bikes/${ride.bike.id}`} size="sm">
          {ride.bike.name}
        </Anchor>
      ) : (
        <Text span size="sm" c="orange">
          No bike on Strava
        </Text>
      )}
      {` · ${context}`}
    </Text>
  )
}

function SmallLabel({ children }: { children: string }) {
  return (
    <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
      {children}
    </Text>
  )
}

function RideStats({ ride }: { ride: RideDetail }) {
  const { primary, secondary } = rideStatLines(ride)

  return (
    <Stack gap="sm">
      <Divider />
      <SimpleGrid cols={4} spacing="sm">
        {primary.map((stat: RideStat) => (
          <Stack key={stat.key} gap={0}>
            <SmallLabel>{stat.label}</SmallLabel>
            <Text fz="xl" fw={600}>
              {stat.value}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
      {secondary.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" verticalSpacing={6}>
          {secondary.map((stat) => (
            <Group key={stat.key} gap={6} wrap="nowrap">
              <Text size="sm" c="dimmed">
                {stat.label}
              </Text>
              <Text size="sm" fw={500}>
                {stat.value}
              </Text>
            </Group>
          ))}
        </SimpleGrid>
      )}
      <Divider />
    </Stack>
  )
}

function componentValue(component: RideDetailComponent): string {
  if (component.driving_dimension) {
    return formatDrivingRemaining({ ...component, driving_dimension: component.driving_dimension })
  }
  return component.total_distance_meters != null ? `${formatDistance(component.total_distance_meters)} total` : '—'
}

function RideComponents({ ride, gearUnmapped }: { ride: RideDetail; gearUnmapped: boolean }) {
  return (
    <Stack gap={6}>
      <div>
        <Text fw={600}>Components</Text>
        {ride.bike && ride.components.length > 0 && (
          <Text size="sm" c="dimmed">
            This ride added {formatDistance(ride.distance_meters)} to each
          </Text>
        )}
      </div>

      {!ride.bike ? (
    <Text size="sm" c="dimmed">
          No bike on Strava, so this ride isn't added to any components.
          {gearUnmapped && (
            <>
              {' '}
              <Anchor component={Link} to="/strava?tab=gear" size="sm" c="orange">
                Link gear
              </Anchor>
            </>
          )}
        </Text>
      ) : ride.components.length === 0 ? (
    <Text size="sm" c="dimmed">
          None
        </Text>
      ) : (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(48px, 1fr) auto',
            alignItems: 'center',
            columnGap: 'var(--mantine-spacing-sm)',
            rowGap: 6,
          }}
        >
          {ride.components.map((component) => (
            <Box key={component.component_id} style={{ display: 'contents' }}>
              <Anchor component={Link} to={`/components/${component.component_id}`} size="sm" truncate>
                {component.label}
              </Anchor>
              {component.driving_dimension ? (
                <WearBar fraction={component.fraction_used} status={component.service_status} />
              ) : (
                <span />
              )}
              <Text
                size="sm"
                ta="right"
                c={component.service_status === 'due' ? 'red' : 'dimmed'}
                style={{ whiteSpace: 'nowrap' }}
              >
                {componentValue(component)}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  )
}

function RideServiceNearby({ ride, onOpenSession }: { ride: RideDetail; onOpenSession: (id: number) => void }) {
  return (
    <Stack gap={6}>
      <Text fw={600}>Service around this ride</Text>
      {ride.service_nearby.length === 0 ? (
    <Text size="sm" c="dimmed">
          Nothing logged after this ride yet.
        </Text>
      ) : (
        ride.service_nearby.map((session) => (
          <UnstyledButton key={session.id} onClick={() => onOpenSession(session.id)}>
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <Box
                mt={7}
                w={8}
                h={8}
                style={{ borderRadius: '50%', background: 'var(--mantine-primary-color-filled)', flexShrink: 0 }}
              />
              <div>
                <Text size="sm">{session.summary}</Text>
                <Text size="xs" c="dimmed">
                  {serviceNearbyLabel(session)}
                </Text>
              </div>
            </Group>
          </UnstyledButton>
        ))
      )}
    </Stack>
  )
}

function RideDetailSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={12} width="80%" />
      <Skeleton height={30} width="70%" />
      <SimpleGrid cols={4} spacing="sm">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={44} />
        ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} height={14} />
        ))}
      </SimpleGrid>
      <Skeleton height={14} width="30%" />
      <Skeleton height={60} />
      <Skeleton height={14} width="40%" />
      <Skeleton height={36} />
    </Stack>
  )
}
