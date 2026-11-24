import { useState, type CSSProperties } from 'react'
import { Box, Button, Card, Divider, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import BatchServiceModal from '../forms/BatchServiceModal'
import AssignmentDetailModal from '../forms/AssignmentDetailModal'
import WearBar from './WearBar'
import RotationSplitBar from './RotationSplitBar'
import BikeStatusChip from '../bike/BikeStatusChip'
import { useIsMobile } from '../../hooks/useIsMobile'
import { categoryLabel } from '../../constants'
import {
  bikeStatusCounts,
  formatDisplayMetric,
  lastRideLine,
  rotationGroups,
  sortByWear,
  wearMetricLabel,
  type RotationGroup,
} from '../../utils/bikeCard'
import { formatDistance } from '../../utils/distance'
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

const clickable: CSSProperties = { cursor: 'pointer' }

// One wear row, laid out as three cells of the parent grid (display:
// contents) so every row's bar lines up. Tapping it opens the same
// installation modal the bike page's rows do (AssignmentDetailModal),
// where the component's pill handles swapping.
function WearRow({ component, bikeId }: { component: DashboardMountedComponent; bikeId: number }) {
  const [detailOpened, setDetailOpened] = useState(false)
  const over = component.service_status === 'due'

  return (
    <>
      <Box style={{ display: 'contents' }} onClick={() => setDetailOpened(true)}>
        <Text size="sm" truncate style={clickable}>
          {component.label}
        </Text>
        <WearBar fraction={component.fraction_used} status={component.service_status} style={clickable} />
        <Text size="sm" ta="right" c={over ? 'red' : 'dimmed'} style={{ ...clickable, whiteSpace: 'nowrap' }}>
          {wearMetricLabel(component)}
        </Text>
      </Box>
      <AssignmentDetailModal
        opened={detailOpened}
        onClose={() => setDetailOpened(false)}
        bikeId={bikeId}
        assignmentId={component.assignment_id}
      />
    </>
  )
}

// A same-category rotation: what's off the bike, over the shared split bar
// of lifetime distances.
function RotationStrip({ group }: { group: RotationGroup }) {
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
      <RotationSplitBar group={group} />
    </Stack>
  )
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
          <BikeStatusChip {...bikeStatusCounts(bike.mounted)} />
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
