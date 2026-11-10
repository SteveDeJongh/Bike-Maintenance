import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Anchor, Button, Group, Loader, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link } from 'react-router-dom'
import { useBikeRides, useTableViewPreference } from '../../api/queries'
import ColumnPicker from '../datatable/ColumnPicker'
import DraggableHeaderCell from '../datatable/DraggableHeaderCell'
import { useColumnDragSensors } from '../datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import { SHARED_RIDE_COLUMN_RENDERERS } from '../ride/rideColumnRenderers'
import ViewOnStravaLink from '../ride/ViewOnStravaLink'
import ResyncRideButton from '../ride/ResyncRideButton'
import { BIKE_RIDE_COLUMNS, BIKE_RIDE_COLUMN_LABELS, DEFAULT_BIKE_RIDE_COLUMNS, type BikeRideColumn } from '../../constants'
import { formatDateTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
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

const COLUMN_RENDERER: Record<BikeRideColumn, (ride: BikeRide) => ReactNode> = {
  ...SHARED_RIDE_COLUMN_RENDERERS,
  cumulative_distance_meters: (ride) => formatDistance(ride.cumulative_distance_meters),
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
                      <Table.Th />
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
                      <ViewOnStravaLink stravaId={ride.strava_id} name={ride.name} />
                    </Table.Td>
                    {orderedColumns.map((column) => (
                      <Table.Td key={column}>{COLUMN_RENDERER[column](ride)}</Table.Td>
                    ))}
                    <Table.Td>
                      <ResyncRideButton rideId={ride.id} />
                    </Table.Td>
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
