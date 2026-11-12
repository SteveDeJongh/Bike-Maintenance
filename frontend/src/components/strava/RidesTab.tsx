import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link } from 'react-router-dom'
import { useBikes, useStravaRides, useTableViewPreference } from '../../api/queries'
import { useIgnoreRides, useUnignoreRides, useResyncRides } from '../../api/mutations'
import type { useStravaSyncRunner } from '../../hooks/useStravaSyncRunner'
import ColumnPicker from '../datatable/ColumnPicker'
import DraggableHeaderCell from '../datatable/DraggableHeaderCell'
import { useColumnDragSensors } from '../datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import { SHARED_RIDE_COLUMN_RENDERERS } from '../ride/rideColumnRenderers'
import ViewOnStravaLink from '../ride/ViewOnStravaLink'
import ResyncRideButton from '../ride/ResyncRideButton'
import {
  STRAVA_RIDE_COLUMNS,
  STRAVA_RIDE_COLUMN_LABELS,
  DEFAULT_STRAVA_RIDE_COLUMNS,
  RIDE_STATUS_BADGE,
  type StravaRideColumn,
} from '../../constants'
import { formatDateTime } from '../../utils/datetime'
import type { StravaRide, TableViewPreferenceData } from '../../types/models'

type Status = 'attention' | 'ignored' | 'all'
type Sort = 'date' | 'distance'
type Order = 'asc' | 'desc'

type FullSyncControls = ReturnType<typeof useStravaSyncRunner>

// Gates the whole tab on strava_rides's TableViewPreference resolving
// first, same two-component wrapper/Inner split as every other adopter of
// this system (e.g. RideHistorySection) -- useTableViewPreferences' useState
// initializers only seed from it once, on mount. fullSync is the Strava
// page header's own useStravaSyncRunner({ full: true }) instance, lifted
// down as a prop (same pattern Dashboard.tsx uses for SyncStrip) rather
// than this tab owning a second independent poller for the same action.
export default function RidesTab({ fullSync }: { fullSync: FullSyncControls }) {
  const { data: preferenceData, isPending } = useTableViewPreference('strava_rides')

  if (isPending || !preferenceData) return <Loader />

  return <RidesTabInner initialData={preferenceData.data} fullSync={fullSync} />
}

function buildColumnRenderer(): Record<StravaRideColumn, (ride: StravaRide) => ReactNode> {
  return {
    status: (ride) => {
      const badge = RIDE_STATUS_BADGE[ride.reason ?? 'attributed']
      return (
        <Badge variant="light" color={badge.color}>
          {badge.label}
        </Badge>
      )
    },
    gear: (ride) =>
      ride.gear ? (
        ride.gear.name ?? ride.gear.strava_gear_id
      ) : (
        <Text size="sm" c="dimmed">
          —
        </Text>
      ),
    bike: (ride) =>
      ride.bike ? (
        <Anchor component={Link} to={`/bikes/${ride.bike.id}`} size="sm">
          {ride.bike.name}
        </Anchor>
      ) : (
        <Text size="sm" c="dimmed">
          —
        </Text>
      ),
    ignored_at: (ride) => (ride.ignored_at ? formatDateTime(ride.ignored_at) : '—'),
    ...SHARED_RIDE_COLUMN_RENDERERS,
  }
}

const STRAVA_RIDE_COLUMN_OPTIONS = STRAVA_RIDE_COLUMNS.map((column) => ({ key: column, label: STRAVA_RIDE_COLUMN_LABELS[column] }))

function RidesTabInner({ initialData, fullSync }: { initialData: TableViewPreferenceData; fullSync: FullSyncControls }) {
  const { sync: triggerFullRefresh, syncing: fullRefreshSyncing, status: stravaStatus } = fullSync
  const [status, setStatus] = useState<Status>('attention')
  const [bikeId, setBikeId] = useState<number | undefined>(undefined)
  const [sort, setSort] = useState<Sort>('date')
  const [order, setOrder] = useState<Order>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectAllMatching, setSelectAllMatching] = useState(false)

  // Filters/sort are view parameters, not column layout -- kept as plain
  // local state (not persisted via TableViewPreference), same reasoning as
  // Ride history's own typeFilter. Changing any of them invalidates
  // whatever's currently selected -- adjusted during render (React's
  // documented "resetting state when a prop changes" pattern), since
  // calling setState synchronously inside an effect is a lint error.
  const [prevFilters, setPrevFilters] = useState({ status, bikeId, sort, order })
  if (
    prevFilters.status !== status ||
    prevFilters.bikeId !== bikeId ||
    prevFilters.sort !== sort ||
    prevFilters.order !== order
  ) {
    setPrevFilters({ status, bikeId, sort, order })
    setSelectedIds(new Set())
    setSelectAllMatching(false)
  }

  const { orderedColumns, toggleColumn, reorderColumn, onHeaderDragEnd, saveError, clearSaveError } =
    useTableViewPreferences<StravaRideColumn, 'date'>({
      tableKey: 'strava_rides',
      initialData,
      allColumns: STRAVA_RIDE_COLUMNS,
      defaultColumns: DEFAULT_STRAVA_RIDE_COLUMNS,
      sortColumns: ['date'] as const,
      defaultSort: { column: 'date', direction: 'desc' },
    })
  const headerDragSensors = useColumnDragSensors()
  const columnRenderer = useMemo(() => buildColumnRenderer(), [])

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useStravaRides({
    status,
    bikeId,
    sort,
    order,
  })
  const { data: bikesList } = useBikes()

  const rides = useMemo(() => data?.pages.flatMap((page) => page.rides) ?? [], [data])
  const meta = data?.pages[data.pages.length - 1]?.meta
  const statusCounts = meta?.status_counts

  const ignoreRides = useIgnoreRides()
  const unignoreRides = useUnignoreRides()
  const resyncRides = useResyncRides()

  function rowSelectable(ride: StravaRide) {
    if (status === 'attention') return true
    if (status === 'ignored') return ride.reason === 'ride'
    return false
  }
  const selectableRides = rides.filter(rowSelectable)
  const allLoadedSelected = selectableRides.length > 0 && selectableRides.every((r) => selectedIds.has(r.id))

  function toggleAll() {
    if (allLoadedSelected || selectAllMatching) {
      setSelectedIds(new Set())
      setSelectAllMatching(false)
    } else {
      setSelectedIds(new Set(selectableRides.map((r) => r.id)))
    }
  }

  function toggleOne(id: number) {
    setSelectAllMatching(false)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setSelectAllMatching(false)
  }

  function handleBulkIgnore() {
    const payload = selectAllMatching
      ? ({ all_matching: true, status: 'attention' } as const)
      : { activity_ids: Array.from(selectedIds) }
    ignoreRides.mutate(payload, { onSuccess: clearSelection })
  }

  function handleBulkUnignore() {
    unignoreRides.mutate({ activity_ids: Array.from(selectedIds) }, { onSuccess: clearSelection })
  }

  function handleBulkResync() {
    resyncRides.mutate({ activity_ids: Array.from(selectedIds) }, { onSuccess: clearSelection })
  }

  function handleFullRefreshInstead() {
    clearSelection()
    triggerFullRefresh()
  }

  const showCheckboxes = status !== 'all'
  const showSelectionToolbar = selectedIds.size > 0 || selectAllMatching

  // Resyncing k rides one by one costs k Strava calls; a full refresh costs
  // roughly full_sync_request_estimate regardless of k -- past whichever is
  // smaller (also capped at MAX_BULK_RESYNC server-side), a full refresh is
  // the cheaper way to pull in the same fix, so the toolbar routes there
  // instead of offering "Resync selected". "Select all N matching" has no
  // bounded id list to resync individually at all, so it always routes here.
  const resyncThreshold = stravaStatus
    ? Math.min(stravaStatus.max_bulk_resync, stravaStatus.full_sync_request_estimate ?? Infinity)
    : Infinity
  const canResyncSelected = !selectAllMatching && selectedIds.size > 0 && selectedIds.size <= resyncThreshold
  const selectionSize = selectAllMatching ? meta?.total_count ?? 0 : selectedIds.size

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Title order={3}>Rides</Title>
      </Group>

      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          value={status}
          onChange={(value) => setStatus(value as Status)}
          data={[
            { label: `Needs attention · ${statusCounts?.attention ?? 0}`, value: 'attention' },
            { label: `Ignored · ${statusCounts?.ignored ?? 0}`, value: 'ignored' },
            { label: `All · ${statusCounts?.all ?? 0}`, value: 'all' },
          ]}
        />
        <Group>
          <SegmentedControl
            value={sort}
            onChange={(value) => setSort(value as Sort)}
            data={[
              { label: 'Date', value: 'date' },
              { label: 'Distance', value: 'distance' },
            ]}
          />
          <SegmentedControl
            value={order}
            onChange={(value) => setOrder(value as Order)}
            data={
              sort === 'date'
                ? [
                    { label: 'Newest first', value: 'desc' },
                    { label: 'Oldest first', value: 'asc' },
                  ]
                : [
                    { label: 'Largest first', value: 'desc' },
                    { label: 'Smallest first', value: 'asc' },
                  ]
            }
          />
          {status === 'all' && (
            <Select
              placeholder="All bikes"
              clearable
              data={(bikesList ?? []).map((bike) => ({ value: String(bike.id), label: bike.name }))}
              value={bikeId ? String(bikeId) : null}
              onChange={(value) => setBikeId(value ? Number(value) : undefined)}
              w={180}
            />
          )}
        </Group>
      </Group>

      <Text size="xs" c="dimmed">
        Fixed a ride on Strava? Use "Refresh all rides" above to pull the change in.
        {status === 'attention' && " You can also ignore any ride you don't want to track."}
      </Text>

      {saveError && (
        <Alert color="red" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      {Boolean(resyncRides.data?.not_attempted_count) && (
        <Alert color="orange" title="Rate limited">
          <Text size="sm">
            {resyncRides.data!.not_attempted_count} ride(s) weren't attempted
            {resyncRides.data!.retry_at && ` -- try again after ${formatDateTime(resyncRides.data!.retry_at)}`}.
          </Text>
        </Alert>
      )}

      {showSelectionToolbar && (
        <Stack
          gap="xs"
          p="xs"
          style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}
        >
          <Group justify="space-between">
            <Group gap="xs">
              <Text size="sm">
                {selectAllMatching ? `All ${meta?.total_count ?? 0} matching rides selected` : `${selectedIds.size} selected`}
              </Text>
              {!selectAllMatching && allLoadedSelected && meta && meta.total_count > rides.length && (
                <Anchor component="button" type="button" size="sm" onClick={() => setSelectAllMatching(true)}>
                  Select all {meta.total_count} matching
                </Anchor>
              )}
            </Group>
            <Group gap="xs">
              {status === 'attention' && canResyncSelected && (
                <Button size="xs" variant="default" onClick={handleBulkResync} loading={resyncRides.isPending}>
                  Resync selected
                </Button>
              )}
              {status === 'attention' && !canResyncSelected && (
                <Tooltip
                  label={
                    stravaStatus?.full_sync_available_at
                      ? `Available again at ${formatDateTime(stravaStatus.full_sync_available_at)}, or narrow your selection to ${resyncThreshold} rides or fewer and resync them individually.`
                      : undefined
                  }
                  disabled={!stravaStatus?.full_sync_available_at}
                >
                  <Button
                    size="xs"
                    variant="default"
                    onClick={handleFullRefreshInstead}
                    loading={fullRefreshSyncing}
                    disabled={Boolean(stravaStatus?.full_sync_available_at)}
                  >
                    Refresh all rides
                  </Button>
                </Tooltip>
              )}
              {status === 'attention' && (
                <Button size="xs" onClick={handleBulkIgnore} loading={ignoreRides.isPending}>
                  Ignore selected
                </Button>
              )}
              {status === 'ignored' && (
                <Button size="xs" onClick={handleBulkUnignore} loading={unignoreRides.isPending}>
                  Un-ignore selected
                </Button>
              )}
              <Button size="xs" variant="subtle" onClick={clearSelection}>
                Clear
              </Button>
            </Group>
          </Group>
          {status === 'attention' && !canResyncSelected && (
            <Text size="xs" c="dimmed">
              Re-syncing {selectionSize} rides one by one would use {selectionSize} Strava requests; a full refresh
              uses about {stravaStatus?.full_sync_request_estimate ?? '?'} and also picks up any other changes.
            </Text>
          )}
        </Stack>
      )}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load rides">
          {error.message}
        </Alert>
      )}

      {!isPending && !isError && rides.length === 0 && <EmptyState status={status} />}

      {!isPending && rides.length > 0 && (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
                  <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
                    <Table.Tr>
                      {showCheckboxes && (
                        <Table.Th>
                          <Checkbox
                            checked={allLoadedSelected || selectAllMatching}
                            indeterminate={!allLoadedSelected && !selectAllMatching && selectedIds.size > 0}
                            onChange={toggleAll}
                            disabled={selectableRides.length === 0}
                            aria-label="Select all loaded rides"
                          />
                        </Table.Th>
                      )}
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Name</Table.Th>
                      {orderedColumns.map((column) => (
                        <DraggableHeaderCell
                          key={column}
                          columnKey={column}
                          label={STRAVA_RIDE_COLUMN_LABELS[column]}
                          active={false}
                          direction="asc"
                          onSort={() => {}}
                          sortable={false}
                        />
                      ))}
                      <Table.Th />
                      <Table.Th>
                        <ColumnPicker
                          allColumns={STRAVA_RIDE_COLUMN_OPTIONS}
                          orderedVisible={orderedColumns}
                          onToggle={(key) => toggleColumn(key as StravaRideColumn)}
                          onReorder={(activeKey, overKey) =>
                            reorderColumn(activeKey as StravaRideColumn, overKey as StravaRideColumn)
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
                    {showCheckboxes && (
                      <Table.Td>
                        <Checkbox
                          checked={selectedIds.has(ride.id)}
                          onChange={() => toggleOne(ride.id)}
                          disabled={!rowSelectable(ride)}
                          aria-label={`Select ${ride.name}`}
                        />
                      </Table.Td>
                    )}
                    <Table.Td>{formatDateTime(ride.moved_at)}</Table.Td>
                    <Table.Td>
                      <ViewOnStravaLink stravaId={ride.strava_id} name={ride.name} />
                    </Table.Td>
                    {orderedColumns.map((column) => (
                      <Table.Td key={column}>{columnRenderer[column](ride)}</Table.Td>
                    ))}
                    <Table.Td>
                      <RowActions ride={ride} />
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

function RowActions({ ride }: { ride: StravaRide }) {
  const ignoreRides = useIgnoreRides()
  const unignoreRides = useUnignoreRides()

  if (ride.attribution === 'needs_attention') {
    return (
      <Group gap="xs" wrap="nowrap">
        <ResyncRideButton rideId={ride.id} />
        <Button
          size="xs"
          variant="subtle"
          onClick={() => ignoreRides.mutate({ activity_ids: [ride.id] })}
          loading={ignoreRides.isPending}
        >
          Ignore
        </Button>
        {ride.reason === 'unmapped_gear' && ride.gear ? (
          <Button size="xs" variant="default" component={Link} to={`/strava?tab=gear&gear=${ride.gear.strava_gear_id}`}>
            Resolve gear
          </Button>
        ) : (
          <Button
            size="xs"
            variant="default"
            component="a"
            href={`https://www.strava.com/activities/${ride.strava_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Strava
          </Button>
        )}
      </Group>
    )
  }

  if (ride.attribution === 'ignored') {
    if (ride.reason === 'ride') {
      return (
        <Group gap="xs" wrap="nowrap">
          <ResyncRideButton rideId={ride.id} />
          <Button
            size="xs"
            variant="default"
            onClick={() => unignoreRides.mutate({ activity_ids: [ride.id] })}
            loading={unignoreRides.isPending}
          >
            Un-ignore
          </Button>
        </Group>
      )
    }

    return (
      <Group gap={4} wrap="nowrap">
        <ResyncRideButton rideId={ride.id} />
        <Text size="sm" c="dimmed">
          Gear ignored
        </Text>
        <Anchor component={Link} to={`/strava?tab=gear&gear=${ride.gear?.strava_gear_id ?? ''}`} size="sm">
          View
        </Anchor>
      </Group>
    )
  }

  return <ResyncRideButton rideId={ride.id} />
}

function EmptyState({ status }: { status: Status }) {
  if (status === 'attention') return <Text c="dimmed">✓ Every ride is attributed to a bike</Text>
  if (status === 'ignored') return <Text c="dimmed">No ignored rides.</Text>

  return <Text c="dimmed">No rides yet. Use "Sync now" or "Refresh all rides" above.</Text>
}
