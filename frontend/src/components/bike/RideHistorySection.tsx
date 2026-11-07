import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link } from 'react-router-dom'
import { useBikeRides, useTableViewPreference } from '../../api/queries'
import ColumnPicker from '../datatable/ColumnPicker'
import DraggableHeaderCell from '../datatable/DraggableHeaderCell'
import { useColumnDragSensors } from '../datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import {
  BIKE_RIDE_COLUMNS,
  BIKE_RIDE_COLUMN_LABELS,
  DEFAULT_BIKE_RIDE_COLUMNS,
  RIDE_KIND_BADGE,
  type BikeRideColumn,
} from '../../constants'
import { formatDateTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import { formatSpeed } from '../../utils/speed'
import type { BikeDetail, BikeRide, TableViewPreferenceData } from '../../types/models'

type RideTypeFilter = 'all' | 'outdoor' | 'indoor'

// Gates the whole section (header included, same as every other adopter of
// this preference-backed table, e.g. Bikes.tsx) on bike_rides's
// TableViewPreference resolving first -- useTableViewPreferences' useState
// initializers only seed from it once, on mount.
export default function RideHistorySection({ bike }: { bike: BikeDetail }) {
  const { data: preferenceData, isPending } = useTableViewPreference('bike_rides')

  if (isPending || !preferenceData) return <Loader />

  return <RideHistorySectionInner bike={bike} initialData={preferenceData.data} />
}

function PowerCell({ watts, deviceWatts }: { watts: number | null; deviceWatts: boolean | null }) {
  if (watts == null) return <>—</>

  const text = formatPower(watts)
  if (deviceWatts === false) {
    return (
      <Tooltip label="Estimated">
        <Text span c="dimmed">
          {text}
        </Text>
      </Tooltip>
    )
  }
  return <>{text}</>
}

const COLUMN_RENDERER: Record<BikeRideColumn, (ride: BikeRide) => ReactNode> = {
  ride_kind: (ride) => {
    const badge = RIDE_KIND_BADGE[ride.ride_kind]
    return (
      <Badge variant="light" color={badge.color}>
        {badge.label}
      </Badge>
    )
  },
  distance_meters: (ride) => formatDistance(ride.distance_meters),
  cumulative_distance_meters: (ride) => formatDistance(ride.cumulative_distance_meters),
  moving_time: (ride) => (ride.moving_time == null ? '—' : formatDuration(ride.moving_time)),
  total_elevation_gain: (ride) => (ride.total_elevation_gain == null ? '—' : formatElevation(ride.total_elevation_gain)),
  average_speed: (ride) => (ride.average_speed == null ? '—' : formatSpeed(ride.average_speed)),
  average_watts: (ride) => <PowerCell watts={ride.average_watts} deviceWatts={ride.device_watts} />,
  activity_type: (ride) => ride.activity_type,
  elapsed_time: (ride) => (ride.elapsed_time == null ? '—' : formatDuration(ride.elapsed_time)),
  max_speed: (ride) => (ride.max_speed == null ? '—' : formatSpeed(ride.max_speed)),
  weighted_average_watts: (ride) => (ride.weighted_average_watts == null ? '—' : formatPower(ride.weighted_average_watts)),
  kilojoules: (ride) => (ride.kilojoules == null ? '—' : `${Math.round(ride.kilojoules)} kJ`),
  average_heartrate: (ride) => (ride.average_heartrate == null ? '—' : `${Math.round(ride.average_heartrate)} bpm`),
  max_heartrate: (ride) => (ride.max_heartrate == null ? '—' : `${Math.round(ride.max_heartrate)} bpm`),
  average_cadence: (ride) => (ride.average_cadence == null ? '—' : `${Math.round(ride.average_cadence)} rpm`),
  commute: (ride) => (ride.commute ? 'Yes' : 'No'),
  counted_toward: (ride) =>
    ride.counted_toward.length > 0 ? (
      <Group gap={4} wrap="wrap">
        {ride.counted_toward.map((component) => (
          <Badge
            key={component.component_id}
            component={Link}
            to={`/components/${component.component_id}`}
            variant="light"
            style={{ cursor: 'pointer' }}
          >
            {component.label}
          </Badge>
        ))}
      </Group>
    ) : (
      <Text size="sm" c="dimmed">
        Not counted
      </Text>
    ),
}

const BIKE_RIDE_COLUMN_OPTIONS = BIKE_RIDE_COLUMNS.map((column) => ({ key: column, label: BIKE_RIDE_COLUMN_LABELS[column] }))

function RideHistorySectionInner({ bike, initialData }: { bike: BikeDetail; initialData: TableViewPreferenceData }) {
  const [typeFilter, setTypeFilter] = useState<RideTypeFilter>('all')
  const {
    orderedColumns,
    toggleColumn,
    reorderColumn,
    onHeaderDragEnd,
    sortDirection,
    setSort,
    saveError,
    clearSaveError,
  } = useTableViewPreferences<BikeRideColumn, 'moved_at'>({
    tableKey: 'bike_rides',
    initialData,
    allColumns: BIKE_RIDE_COLUMNS,
    defaultColumns: DEFAULT_BIKE_RIDE_COLUMNS,
    sortColumns: ['moved_at'] as const,
    defaultSort: { column: 'moved_at', direction: 'desc' },
  })
  const headerDragSensors = useColumnDragSensors()
  const order = sortDirection

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useBikeRides(
    bike.id,
    typeFilter,
    order,
  )

  const rides = useMemo(() => data?.pages.flatMap((page) => page.rides) ?? [], [data])
  const meta = data?.pages[data.pages.length - 1]?.meta

  // The order toggle is the only way to change sort -- setSort('moved_at')
  // *toggles* direction rather than setting it explicitly, so this guards
  // the call to match a SegmentedControl's explicit two-value semantics
  // (clicking the already-selected option must not flip it).
  function handleOrderChange(value: string) {
    const desired = value === 'newest' ? 'desc' : 'asc'
    if (order !== desired) setSort('moved_at')
  }

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <div>
          <Title order={3}>Ride history</Title>
          {meta && (
            <Text c="dimmed" size="sm">
              {meta.total_count} {meta.total_count === 1 ? 'ride' : 'rides'} · {formatDistance(meta.total_distance_meters)}
            </Text>
          )}
        </div>
        <Group>
          <SegmentedControl
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as RideTypeFilter)}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Outdoor', value: 'outdoor' },
              { label: 'Indoor', value: 'indoor' },
            ]}
          />
          <SegmentedControl
            value={order === 'desc' ? 'newest' : 'oldest'}
            onChange={handleOrderChange}
            data={[
              { label: 'Newest first', value: 'newest' },
              { label: 'Oldest first', value: 'oldest' },
            ]}
          />
        </Group>
      </Group>

      {saveError && (
        <Alert color="red" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load rides">
          {error.message}
        </Alert>
      )}

      {!isPending && !isError && rides.length === 0 && <EmptyState bike={bike} typeFilter={typeFilter} />}

      {!isPending && rides.length > 0 && (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
                  <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
                    <Table.Tr>
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Name</Table.Th>
                      {orderedColumns.map((column) => (
                        <DraggableHeaderCell
                          key={column}
                          columnKey={column}
                          label={BIKE_RIDE_COLUMN_LABELS[column]}
                          active={false}
                          direction="asc"
                          onSort={() => {}}
                          sortable={false}
                        />
                      ))}
                      <Table.Th>
                        <ColumnPicker
                          allColumns={BIKE_RIDE_COLUMN_OPTIONS}
                          orderedVisible={orderedColumns}
                          onToggle={(key) => toggleColumn(key as BikeRideColumn)}
                          onReorder={(activeKey, overKey) =>
                            reorderColumn(activeKey as BikeRideColumn, overKey as BikeRideColumn)
                          }
                        />
                      </Table.Th>
                    </Table.Tr>
                  </SortableContext>
                </DndContext>
              </Table.Thead>
              <Table.Tbody>
                {rides.map((ride) => (
                  <Table.Tr key={ride.id}>
                    <Table.Td>{formatDateTime(ride.moved_at)}</Table.Td>
                    <Table.Td>
                      <Tooltip label="View on Strava">
                        <Anchor
                          href={`https://www.strava.com/activities/${ride.strava_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          c="orange"
                          aria-label="View on Strava"
                        >
                          {ride.name}
                        </Anchor>
                      </Tooltip>
                    </Table.Td>
                    {orderedColumns.map((column) => (
                      <Table.Td key={column}>{COLUMN_RENDERER[column](ride)}</Table.Td>
                    ))}
                    <Table.Td />
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          <Group justify="center">
            {hasNextPage && (
              <Button variant="default" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                Load more
              </Button>
            )}
          </Group>
          {meta && (
            <Text size="sm" c="dimmed" ta="center">
              Showing {rides.length} of {meta.total_count}
            </Text>
          )}
        </>
      )}
    </Stack>
  )
}

function EmptyState({ bike, typeFilter }: { bike: BikeDetail; typeFilter: RideTypeFilter }) {
  if (!bike.strava_gear_id) {
    return (
      <Text c="dimmed">
        No rides yet.{' '}
        <Anchor component={Link} to="/strava">
          Link this bike to Strava gear
        </Anchor>
      </Text>
    )
  }

  if (!bike.first_ride_on) {
    return <Text c="dimmed">No rides synced for this bike yet.</Text>
  }

  if (typeFilter === 'indoor') return <Text c="dimmed">No indoor rides</Text>
  if (typeFilter === 'outdoor') return <Text c="dimmed">No outdoor rides</Text>

  return <Text c="dimmed">No rides synced for this bike yet.</Text>
}
