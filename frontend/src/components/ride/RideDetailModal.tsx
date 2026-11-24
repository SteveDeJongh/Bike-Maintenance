import { Alert, Anchor, Box, Button, Divider, Group, SimpleGrid, Skeleton, Stack, Text, ThemeIcon } from '@mantine/core'
import { IconBike } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useRideDetail } from '../../api/queries'
import { useAllCategories } from '../../hooks/useAllCategories'
import { categoryLabel } from '../../constants'
import AppModal from '../AppModal'
import WearBar from '../dashboard/WearBar'
import LogServiceAfterRideButton from './LogServiceAfterRideButton'
import ResyncRideButton from './ResyncRideButton'
import { formatDistance } from '../../utils/distance'
import { componentWearValue } from '../../utils/wear'
import { rideHeaderParts, rideStatLines, sortRideComponents, type RideStat } from '../../utils/rideDetail'
import type { RideDetail } from '../../types/models'

// Everything about one ride (GET /strava/rides/:id): the icon and name in
// the modal's own header (beside the close button, so pinned on mobile),
// then the date/sport/bike/context line, ride-level actions, condensed
// stats, and the components it counts toward with their wear. Opened by
// clicking a ride in any ride list -- each list holds one rideId and
// renders one of these, outside its table, rather than one per row.
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

      {/* One size (sm) for every action. Log service keeps the after-ride
          date prefill; only its label is shorter here. */}
      <Group gap="xs" wrap="wrap" align="flex-start">
        <LogServiceAfterRideButton
          bikeId={ride.bike?.id ?? null}
          movedAt={ride.moved_at}
          elapsedTime={ride.elapsed_time}
          label="Log service"
          variant="filled"
          size="sm"
        />
        {/* Strava's brand guidelines: the exact "View on Strava" wording,
            in their orange. */}
        <Button
          component="a"
          href={`https://www.strava.com/activities/${ride.strava_id}`}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          variant="outline"
          color="var(--strava-orange)"
        >
          View on Strava ↗
        </Button>
        <ResyncRideButton rideId={ride.id} variant="default" size="sm" />
        {gearUnmapped && (
          <Button component={Link} to="/strava?tab=gear" size="sm" variant="subtle" color="orange">
            Link gear
          </Button>
        )}
      </Group>

      <RideStats ride={ride} />
      <RideComponents ride={ride} gearUnmapped={gearUnmapped} />
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
        // Each pair stays on one line. Three columns on desktop, not four:
        // at size="lg" a quarter is ~134px, and "Max speed 52.3 km/h"
        // needs ~131px, too close to rely on.
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" verticalSpacing={6}>
          {secondary.map((stat) => (
            <Group key={stat.key} gap={6} wrap="nowrap" style={{ minWidth: 0, whiteSpace: 'nowrap' }}>
              <Text size="xs" c="dimmed">
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

// Category | name | wear bar | metric, in the bike page's category order.
// A component with no enabled requirement still gets the bar's empty track
// (faint), so every row's bar and metric line up.
function RideComponents({ ride, gearUnmapped }: { ride: RideDetail; gearUnmapped: boolean }) {
  const categoryOrder = useAllCategories()
  const components = sortRideComponents(ride.components, categoryOrder)

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="baseline" wrap="nowrap" gap="sm">
        <Text fw={600}>Components</Text>
        {ride.bike && ride.components.length > 0 && (
          <Text size="xs" c="dimmed" ta="right">
            This ride added {formatDistance(ride.distance_meters)} to each
          </Text>
        )}
      </Group>

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
            gridTemplateColumns: '90px minmax(0, 1.2fr) minmax(48px, 1fr) auto',
            alignItems: 'center',
            columnGap: 'var(--mantine-spacing-sm)',
            rowGap: 6,
          }}
        >
          {components.map((component) => (
            <Box key={component.component_id} style={{ display: 'contents' }}>
              <Text size="xs" c="dimmed" truncate>
                {categoryLabel(component.category)}
              </Text>
              <Anchor
                component={Link}
                to={`/components/${component.component_id}`}
                size="sm"
                c="var(--mantine-color-text)"
                underline="hover"
                truncate
              >
                {component.label}
              </Anchor>
              {component.driving_dimension ? (
                <WearBar fraction={component.fraction_used} status={component.service_status} />
              ) : (
                <WearBar fraction={null} status={null} style={{ opacity: 0.5 }} />
              )}
              <Text
                size="sm"
                ta="right"
                c={component.service_status === 'due' ? 'red' : 'dimmed'}
                style={{ whiteSpace: 'nowrap' }}
              >
                {componentWearValue(component)}
              </Text>
            </Box>
          ))}
        </Box>
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
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} height={14} />
        ))}
      </SimpleGrid>
      <Skeleton height={14} width="30%" />
      <Skeleton height={60} />
    </Stack>
  )
}
