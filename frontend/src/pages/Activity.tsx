import { useMemo, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link } from 'react-router-dom'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useActivityFeed, useBikes, useComponents, useTableViewPreference } from '../api/queries'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useIsMobile } from '../hooks/useIsMobile'
import { SHARED_RIDE_COLUMN_RENDERERS } from '../components/ride/rideColumnRenderers'
import ViewOnStravaLink from '../components/ride/ViewOnStravaLink'
import ResyncRideButton from '../components/ride/ResyncRideButton'
import BatchServiceModal from '../components/forms/BatchServiceModal'
import ServiceSessionViewModal from '../components/forms/ServiceSessionViewModal'
import { useActivityFilters } from '../components/activity/useActivityFilters'
import ActivityFilters from '../components/activity/ActivityFilters'
import { activityItemIconMeta, initialPerformedAtForRide, nonRideNote } from '../components/activity/activityItemMeta'
import { ACTIVITY_LOG_COLUMNS, ACTIVITY_LOG_COLUMN_LABELS, type ActivityLogColumn } from '../constants'
import { formatDateTime } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import type {
  ActivityItem,
  ActivityMaintenanceEventItem,
  ActivityRideItem,
  ActivityServiceSessionItem,
  ActivitySetupChangeItem,
  TableViewPreferenceData,
} from '../types/models'

// Gates the whole page on activity_log's TableViewPreference resolving
// first, same two-component wrapper/Inner split as every other adopter of
// this system -- useTableViewPreferences' useState initializers only seed
// from it once, on mount.
export default function Activity() {
  const { data: preferenceData, isPending } = useTableViewPreference('activity_log')

  if (isPending || !preferenceData) return <Loader />

  return <ActivityInner initialData={preferenceData.data} />
}

const ACTIVITY_LOG_COLUMN_OPTIONS = ACTIVITY_LOG_COLUMNS.map((column) => ({
  key: column,
  label: ACTIVITY_LOG_COLUMN_LABELS[column],
}))

// Spreads in every shared ride column renderer wholesale, plus this page's
// own Bike column -- the one column no other ride table needs, since every
// other adopter is already scoped to one bike or shows bike as a pinned
// column of its own (the Rides tab).
const ACTIVITY_COLUMN_RENDERER: Record<ActivityLogColumn, (ride: ActivityRideItem) => ReactNode> = {
  bike: (ride) => {
    if (ride.bike) {
      return (
        <Anchor component={Link} to={`/bikes/${ride.bike.id}`} size="sm">
          {ride.bike.name}
        </Anchor>
      )
    }
    // An ignored ride has nothing to click toward -- that's the Rides tab's
    // job, not this one -- so it gets a plain badge instead of the "No
    // bike" link an ordinary unattributed ride shows.
    if (ride.attribution === 'ignored') {
      return (
        <Badge variant="light" color="gray">
          Ignored
        </Badge>
      )
    }
    return (
      <Anchor component={Link} to="/strava?tab=rides" size="sm" c="dimmed">
        No bike
      </Anchor>
    )
  },
  ...SHARED_RIDE_COLUMN_RENDERERS,
}

function ActivityInner({ initialData }: { initialData: TableViewPreferenceData }) {
  const {
    kinds,
    toggleKind,
    bikeId,
    setBikeId,
    componentId,
    setComponentId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
    qInput,
    setQInput,
    q,
    sortMetric,
    setSortMetric,
    rideOnly,
    order,
    handleOrderChange,
    orderedColumns,
    toggleColumn,
    reorderColumn,
    onHeaderDragEnd,
    saveError,
    clearSaveError,
    tz,
    from,
    to,
    clearFilters,
    hasActiveFilters,
  } = useActivityFilters(initialData)

  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<number>>(new Set())
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null)
  const [batchServiceRide, setBatchServiceRide] = useState<ActivityRideItem | null>(null)
  const isNarrow = useIsMobile()

  function toggleSessionExpanded(sessionId: number) {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  const headerDragSensors = useColumnDragSensors()

  const { data: bikesList } = useBikes()
  const { data: componentsList } = useComponents()

  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityFeed({
    kinds,
    bikeId,
    from,
    to,
    tz,
    q: q || undefined,
    componentId,
    order,
    sort: sortMetric,
  })

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [ data ])
  const meta = data?.pages[data.pages.length - 1]?.meta
  const totalForLoadedKinds = meta ? kinds.reduce((sum, kind) => sum + meta.kind_counts[kind], 0) : 0

  const mergedColSpan = 1 + orderedColumns.length

  return (
    <Stack>
      <div>
        <Title order={2}>Activity</Title>
        {meta && (
          <Text c="dimmed" size="sm">
            {meta.ride_totals.count} {meta.ride_totals.count === 1 ? 'ride' : 'rides'} ·{' '}
            {formatDistance(meta.ride_totals.distance_meters)} · {formatDuration(meta.ride_totals.moving_time)} ·{' '}
            {formatElevation(meta.ride_totals.total_elevation_gain)}
          </Text>
        )}
      </div>

      <ActivityFilters
        kinds={kinds}
        toggleKind={toggleKind}
        kindCounts={meta?.kind_counts}
        bikesList={bikesList}
        componentsList={componentsList}
        bikeId={bikeId}
        setBikeId={setBikeId}
        componentId={componentId}
        setComponentId={setComponentId}
        datePreset={datePreset}
        setDatePreset={setDatePreset}
        customRange={customRange}
        setCustomRange={setCustomRange}
        qInput={qInput}
        setQInput={setQInput}
        hasActiveFilters={hasActiveFilters}
        clearFilters={clearFilters}
        order={order}
        handleOrderChange={handleOrderChange}
        rideOnly={rideOnly}
        sortMetric={sortMetric}
        setSortMetric={setSortMetric}
      />

      {saveError && (
        <Alert color="red" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load activity">
          {error.message}
        </Alert>
      )}

      {!isPending && !isError && items.length === 0 && (
        <EmptyState hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters} />
      )}

      {!isPending && items.length > 0 && isNarrow && (
        <Stack gap="xs">
          {items.map((item, index) => (
            <NarrowActivityCard
              key={`${item.kind}-${item.id}-${index}`}
              item={item}
              onViewSession={setViewingSessionId}
              onLogService={setBatchServiceRide}
            />
          ))}
        </Stack>
      )}

      {!isPending && items.length > 0 && !isNarrow && (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
                  <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
                    <Table.Tr>
                      <Table.Th style={{ width: 28 }} />
                      <Table.Th>Date</Table.Th>
                      <Table.Th>Name</Table.Th>
                      {orderedColumns.map((column) => (
                        <DraggableHeaderCell
                          key={column}
                          columnKey={column}
                          label={ACTIVITY_LOG_COLUMN_LABELS[column]}
                          active={false}
                          direction="asc"
                          onSort={() => {}}
                          sortable={false}
                        />
                      ))}
                      <Table.Th>
                        <Tooltip label="Change the bike on Strava, then Re-sync.">
                          <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>
                            Actions
                          </Text>
                        </Tooltip>
                      </Table.Th>
                      <Table.Th>
                        <ColumnPicker
                          allColumns={ACTIVITY_LOG_COLUMN_OPTIONS}
                          orderedVisible={orderedColumns}
                          onToggle={(key) => toggleColumn(key as ActivityLogColumn)}
                          onReorder={(activeKey, overKey) =>
                            reorderColumn(activeKey as ActivityLogColumn, overKey as ActivityLogColumn)
                          }
                        />
                      </Table.Th>
                    </Table.Tr>
                  </SortableContext>
                </DndContext>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item, index) => (
                  <ActivityRow
                    key={`${item.kind}-${item.id}-${index}`}
                    item={item}
                    orderedColumns={orderedColumns}
                    mergedColSpan={mergedColSpan}
                    expanded={item.kind === 'service_session' && expandedSessionIds.has(item.id)}
                    onToggleExpand={() => item.kind === 'service_session' && toggleSessionExpanded(item.id)}
                    onViewSession={setViewingSessionId}
                    onLogService={setBatchServiceRide}
                  />
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}

      {!isPending && items.length > 0 && (
        <>
          <Group justify="center">
            {hasNextPage && (
              <Button variant="default" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
                Load more
              </Button>
            )}
          </Group>
          {meta && (
            <Text size="sm" c="dimmed" ta="center">
              Showing {items.length} of {totalForLoadedKinds}
            </Text>
          )}
        </>
      )}

      {batchServiceRide?.bike && (
        <BatchServiceModal
          opened
          onClose={() => setBatchServiceRide(null)}
          bikeId={batchServiceRide.bike.id}
          initialPerformedAt={initialPerformedAtForRide(batchServiceRide)}
        />
      )}

      {viewingSessionId !== null && (
        <ServiceSessionViewModal opened onClose={() => setViewingSessionId(null)} sessionId={viewingSessionId} />
      )}
    </Stack>
  )
}

interface ActivityRowProps {
  item: ActivityItem
  orderedColumns: ActivityLogColumn[]
  mergedColSpan: number
  expanded: boolean
  onToggleExpand: () => void
  onViewSession: (sessionId: number) => void
  onLogService: (ride: ActivityRideItem) => void
}

function ActivityRow({ item, orderedColumns, mergedColSpan, expanded, onToggleExpand, onViewSession, onLogService }: ActivityRowProps) {
  const { Icon, label } = activityItemIconMeta(item)

  if (item.kind === 'ride') {
    return (
      <Table.Tr>
        <Table.Td>
          <Tooltip label={label}>
            <Icon size={16} />
          </Tooltip>
        </Table.Td>
        <Table.Td>{formatDateTime(item.occurred_at)}</Table.Td>
        <Table.Td>
          <ViewOnStravaLink stravaId={item.strava_id} name={item.name} />
        </Table.Td>
        {orderedColumns.map((column) => (
          <Table.Td key={column}>{ACTIVITY_COLUMN_RENDERER[column](item)}</Table.Td>
        ))}
        <Table.Td>
          <RideRowActions ride={item} onLogService={onLogService} />
        </Table.Td>
        <Table.Td />
      </Table.Tr>
    )
  }

  return (
    <>
      <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-light)' }}>
        <Table.Td>
          <Tooltip label={label}>
            <Icon size={16} />
          </Tooltip>
        </Table.Td>
        <Table.Td>{formatDateTime(item.occurred_at)}</Table.Td>
        <Table.Td colSpan={mergedColSpan}>
          <NonRideCellContent item={item} expanded={expanded} onToggleExpand={onToggleExpand} onViewSession={onViewSession} />
        </Table.Td>
        <Table.Td />
        <Table.Td />
      </Table.Tr>
      {item.kind === 'service_session' &&
        expanded &&
        item.items.map((sessionItem, itemIndex) => (
          <Table.Tr key={itemIndex} style={{ backgroundColor: 'var(--mantine-color-gray-light)' }}>
            <Table.Td />
            <Table.Td />
            <Table.Td colSpan={mergedColSpan}>
              <Group gap="xs" wrap="nowrap" pl="lg">
                <Anchor component={Link} to={`/components/${sessionItem.component_id}`} size="sm" c="dimmed">
                  {sessionItem.label}
                </Anchor>
                <Text size="sm" c="dimmed">
                  · {sessionItem.service_type_name}
                </Text>
                {sessionItem.note && (
                  <Tooltip label={sessionItem.note}>
                    <Text size="xs" c="dimmed" truncate maw={200}>
                      {sessionItem.note}
                    </Text>
                  </Tooltip>
                )}
              </Group>
            </Table.Td>
            <Table.Td />
            <Table.Td />
          </Table.Tr>
        ))}
    </>
  )
}

// Each kind's click target: maintenance_event navigates to its component
// with ?event=<id> (ComponentServiceAndHistory scrolls to and highlights
// that row); service_session opens ServiceSessionViewModal directly rather
// than navigating anywhere; setup_change navigates to the installed
// component, with a secondary link to the replaced one when the row is a
// merged "replaced" entry -- two separate link affordances, since the
// summary string itself is server-built and never parsed/recomposed here.
function NonRideCellContent({
  item,
  expanded,
  onToggleExpand,
  onViewSession,
}: {
  item: ActivityServiceSessionItem | ActivityMaintenanceEventItem | ActivitySetupChangeItem
  expanded: boolean
  onToggleExpand: () => void
  onViewSession: (sessionId: number) => void
}) {
  const note = nonRideNote(item)

  const summaryNode = (() => {
    if (item.kind === 'maintenance_event') {
      return (
        <Anchor component={Link} to={`/components/${item.component_id}?event=${item.id}`} size="sm" c="dimmed">
          {item.summary}
        </Anchor>
      )
    }
    if (item.kind === 'service_session') {
      return (
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" color="gray" onClick={onToggleExpand} aria-label={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </ActionIcon>
          <Anchor component="button" type="button" onClick={() => onViewSession(item.id)} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        </Group>
      )
    }
    return (
      <Group gap={6} wrap="nowrap">
        <Anchor component={Link} to={`/components/${item.component.id}`} size="sm" c="dimmed">
          {item.summary}
        </Anchor>
        {item.replaced_component && (
          <Anchor component={Link} to={`/components/${item.replaced_component.id}`} size="xs" c="dimmed">
            (view {item.replaced_component.label})
          </Anchor>
        )}
      </Group>
    )
  })()

  return (
    <Group gap="xs" wrap="nowrap">
      {summaryNode}
      {note && (
        <Tooltip label={note}>
          <Text size="xs" c="dimmed" truncate maw={240}>
            {note}
          </Text>
        </Tooltip>
      )}
    </Group>
  )
}

// "Log service after this ride" only when the ride has a bike -- no bike,
// no session to log against. "Re-sync" reuses ResyncRideButton as-is,
// including its own 429/retry-at handling. Deliberately no "change bike"
// action -- attribution comes from Strava's own gear mapping, not anything
// editable here.
function RideRowActions({ ride, onLogService }: { ride: ActivityRideItem; onLogService: (ride: ActivityRideItem) => void }) {
  return (
    <Group gap={4} wrap="nowrap">
      {ride.bike && (
        <Button size="xs" variant="subtle" onClick={() => onLogService(ride)}>
          Log service
        </Button>
      )}
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
      <ResyncRideButton rideId={ride.id} />
    </Group>
  )
}

// Narrow-screen alternative to the table: ride rows become a compact card
// (date/name/bike/distance/moving time); non-ride rows stay single lines,
// since they're already compact -- same split the plan calls for.
function NarrowActivityCard({
  item,
  onViewSession,
  onLogService,
}: {
  item: ActivityItem
  onViewSession: (sessionId: number) => void
  onLogService: (ride: ActivityRideItem) => void
}) {
  const { Icon, label } = activityItemIconMeta(item)

  if (item.kind === 'ride') {
    return (
      <Card withBorder padding="sm">
        <Group justify="space-between" wrap="nowrap" mb={4}>
          <Group gap={6} wrap="nowrap">
            <Tooltip label={label}>
              <Icon size={14} />
            </Tooltip>
            <Text size="xs" c="dimmed">
              {formatDateTime(item.occurred_at)}
            </Text>
          </Group>
          <RideRowActions ride={item} onLogService={onLogService} />
        </Group>
        <ViewOnStravaLink stravaId={item.strava_id} name={item.name} />
        <Group gap="xs" mt={4}>
          <Text size="sm">{item.bike ? item.bike.name : 'No bike'}</Text>
          <Text size="sm" c="dimmed">
            {formatDistance(item.distance_meters)}
          </Text>
          {item.moving_time != null && (
            <Text size="sm" c="dimmed">
              {formatDuration(item.moving_time)}
            </Text>
          )}
        </Group>
      </Card>
    )
  }

  const note = nonRideNote(item)

  return (
    <Card withBorder padding="sm" bg="var(--mantine-color-gray-light)">
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={label}>
          <Icon size={14} />
        </Tooltip>
        <Text size="xs" c="dimmed">
          {formatDateTime(item.occurred_at)}
        </Text>
        {item.kind === 'service_session' ? (
          <Anchor component="button" type="button" onClick={() => onViewSession(item.id)} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        ) : item.kind === 'maintenance_event' ? (
          <Anchor component={Link} to={`/components/${item.component_id}?event=${item.id}`} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        ) : (
          <Anchor component={Link} to={`/components/${item.component.id}`} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        )}
      </Group>
      {note && (
        <Text size="xs" c="dimmed" mt={2}>
          {note}
        </Text>
      )}
    </Card>
  )
}

function EmptyState({ hasActiveFilters, onClearFilters }: { hasActiveFilters: boolean; onClearFilters: () => void }) {
  if (hasActiveFilters) {
    return (
      <Group gap="xs">
        <Text c="dimmed">Nothing matches these filters.</Text>
        <Anchor component="button" type="button" size="sm" onClick={onClearFilters}>
          Clear filters
        </Anchor>
      </Group>
    )
  }

  return (
    <Text c="dimmed">
      No activity yet.{' '}
      <Anchor component={Link} to="/strava">
        Connect or sync Strava
      </Anchor>{' '}
      to pull in your rides.
    </Text>
  )
}
