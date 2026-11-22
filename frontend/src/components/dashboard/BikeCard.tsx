import { useState, type CSSProperties } from 'react'
import { Badge, Box, Button, Card, Divider, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import BatchServiceModal from '../forms/BatchServiceModal'
import SwapComponentModal from '../forms/SwapComponentModal'
import { useIsMobile } from '../../hooks/useIsMobile'
import { categoryLabel, SERVICE_STATUS_COLORS } from '../../constants'
import {
  bikeStatusCounts,
  formatDisplayMetric,
  rotationGroups,
  sortByWear,
  wearMetricLabel,
  type RotationGroup,
} from '../../utils/bikeCard'
import { formatDistance } from '../../utils/distance'
import { formatSportType } from '../../utils/strava'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import type { DashboardBike, DashboardMountedComponent } from '../../types/models'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value}
      </Text>
    </Stack>
  )
}

function StatusChip({ bike }: { bike: DashboardBike }) {
  const { due, warning } = bikeStatusCounts(bike.mounted)
  if (due === 0 && warning === 0) {
    return (
      <Badge color={SERVICE_STATUS_COLORS.ok} variant="light">
        All OK
      </Badge>
    )
  }
  return (
    <Group gap={4} wrap="nowrap">
      {due > 0 && (
        <Badge color={SERVICE_STATUS_COLORS.due} variant="light">
          {due} due
        </Badge>
      )}
      {warning > 0 && (
        <Badge color={SERVICE_STATUS_COLORS.warning} variant="light">
          {warning} soon
        </Badge>
      )}
    </Group>
  )
}

const clickable: CSSProperties = { cursor: 'pointer' }

// One wear row, laid out as three cells of the parent grid (display:
// contents) so every row's bar lines up. Tapping it is the phone shortcut
// for a swap -- it opens SwapComponentModal directly (preselecting the
// other component when there's exactly one eligible), so the whole flow is
// a tap to open plus the modal's own "Swap" to confirm.
function WearRow({ component, bikeId }: { component: DashboardMountedComponent; bikeId: number }) {
  const [swapOpened, setSwapOpened] = useState(false)
  const hasRequirement = component.fraction_used != null && component.service_status != null
  const color = component.service_status ? SERVICE_STATUS_COLORS[component.service_status] : 'gray'
  const over = component.service_status === 'due'

  return (
    <>
      <Box style={{ display: 'contents' }} onClick={() => setSwapOpened(true)}>
        <Text size="sm" truncate style={clickable}>
          {component.label}
        </Text>
        <Box h={6} style={{ ...clickable, borderRadius: 3, background: 'var(--mantine-color-default-border)', overflow: 'hidden' }}>
          {hasRequirement && (
            <Box
              h="100%"
              w={`${Math.min(Math.max(component.fraction_used ?? 0, 0), 1) * 100}%`}
              style={{ background: `var(--mantine-color-${color}-6)` }}
            />
          )}
        </Box>
        <Text size="sm" ta="right" c={over ? 'red' : 'dimmed'} style={{ ...clickable, whiteSpace: 'nowrap' }}>
          {wearMetricLabel(component)}
        </Text>
      </Box>
      <SwapComponentModal
        opened={swapOpened}
        onClose={() => setSwapOpened(false)}
        assignmentId={component.assignment_id}
        category={component.category}
        currentComponentId={component.component_id}
        bikeId={bikeId}
        rideContext={component.ride_context}
      />
    </>
  )
}

// Lifetime distance of each component in a same-category rotation, side
// by side: mounted in the primary colour, off-bike in a darker shade.
function RotationStrip({ group }: { group: RotationGroup }) {
  const segments = [
    ...group.mounted.map((component) => ({ ...component, onBike: true })),
    ...group.offBike.map((component) => ({ ...component, onBike: false })),
  ]
  const total = segments.reduce((sum, segment) => sum + (segment.total_distance_meters ?? 0), 0)

  return (
    <Stack gap={4}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="xs" c="dimmed">
          {categoryLabel(group.category)} rotation
        </Text>
        <Text size="xs" c="dimmed" ta="right">
          Off: {group.offBike.map((component) => `${component.label} · ${formatDisplayMetric(component.display_metric)}`).join(', ')}
        </Text>
      </Group>
      <Group gap={2} wrap="nowrap" h={6}>
        {segments.map((segment) => (
          <Box
            key={segment.component_id}
            h="100%"
            style={{
              // An all-zero rotation still draws, as equal parts.
              flex: total > 0 ? `${segment.total_distance_meters ?? 0} 1 0` : '1 1 0',
              minWidth: 2,
              borderRadius: 3,
              background: segment.onBike ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-primary-color-9)',
            }}
          />
        ))}
      </Group>
      <Group justify="space-between" wrap="wrap" gap="xs">
        {segments.map((segment) => (
          <Text key={segment.component_id} size="xs" c="dimmed">
            {segment.label} · {formatDistance(segment.total_distance_meters ?? 0)}
          </Text>
        ))}
      </Group>
    </Stack>
  )
}

function lastRideLine(bike: DashboardBike): string {
  if (!bike.last_ride_on) return 'No rides yet'
  const date = new Date(bike.last_ride_on).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return bike.last_ride_activity_type ? `Last ride ${date} · ${formatSportType(bike.last_ride_activity_type)}` : `Last ride ${date}`
}

export default function BikeCard({ bike, style }: { bike: DashboardBike; style?: CSSProperties }) {
  const [batchServiceOpened, setBatchServiceOpened] = useState(false)
  const isMobile = useIsMobile()
  const { groups, unpaired } = rotationGroups(bike.mounted, bike.off_bike)
  const wearRows = sortByWear(bike.mounted)

  return (
    <Card withBorder padding="lg" radius="md" style={style}>
      <Stack gap="sm" style={{ flex: 1 }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text
              component={Link}
              to={`/bikes/${bike.id}`}
              fw={600}
              size="lg"
              truncate
              style={isMobile ? MOBILE_TAP_TARGET_STYLE : undefined}
            >
              {bike.name}
            </Text>
            <Text size="sm" c="dimmed">
              {lastRideLine(bike)}
            </Text>
          </Stack>
          <StatusChip bike={bike} />
        </Group>

        <Stack gap="xs">
          <Divider />
          <Group gap="lg">
            <Stat label="Total" value={formatDistance(bike.total_distance)} />
            <Stat label="This month" value={formatDistance(bike.distance_this_month)} />
            <Stat label="Rides" value={String(bike.ride_count)} />
          </Group>
          <Divider />
        </Stack>

        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Component wear
          </Text>
          {wearRows.length === 0 ? (
            <Text size="sm" c="dimmed">
              Nothing tracked as mounted.
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
              {wearRows.map((component) => (
                <WearRow key={component.component_id} component={component} bikeId={bike.id} />
              ))}
            </Box>
          )}
        </Stack>

        {groups.map((group) => (
          <RotationStrip key={group.category} group={group} />
        ))}

        {unpaired.length > 0 && (
          <Text size="xs" c="dimmed">
            Off the bike: {unpaired.map((c) => `${c.label} (${formatDisplayMetric(c.display_metric)})`).join(', ')}
          </Text>
        )}

        {/* Pinned to the bottom so cards sharing a row's height line up. */}
        <Box mt="auto" pt="xs">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setBatchServiceOpened(true)}
            style={isMobile ? MOBILE_TAP_TARGET_STYLE : undefined}
          >
            Log service
          </Button>
        </Box>
      </Stack>

      <BatchServiceModal opened={batchServiceOpened} onClose={() => setBatchServiceOpened(false)} bikeId={bike.id} />
    </Card>
  )
}
