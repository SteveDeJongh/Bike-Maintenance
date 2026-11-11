import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useDebouncedValue } from '@mantine/hooks'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link } from 'react-router-dom'
import { IconArrowBarUp, IconArrowsExchange, IconBike, IconTool, type Icon } from '@tabler/icons-react'
import { useActivityFeed, useBikes, useComponents, useTableViewPreference } from '../api/queries'
import { useUpdateTableViewPreference } from '../api/mutations'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../hooks/useTableViewPreferences'
import { SHARED_RIDE_COLUMN_RENDERERS } from '../components/ride/rideColumnRenderers'
import ViewOnStravaLink from '../components/ride/ViewOnStravaLink'
import {
  ACTIVITY_UI_KINDS,
  ACTIVITY_KIND_LABELS,
  DEFAULT_ACTIVITY_KINDS,
  ACTIVITY_LOG_COLUMNS,
  ACTIVITY_LOG_COLUMN_LABELS,
  DEFAULT_ACTIVITY_LOG_COLUMNS,
  type ActivityLogColumn,
} from '../constants'
import { formatDateTime } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import type {
  ActivityItem,
  ActivityRideItem,
  ActivityUiKind,
  TableViewPreferenceData,
} from '../types/models'

type Order = 'asc' | 'desc'
type SortMetric = 'date' | 'distance'
type DatePreset = 'this_week' | 'this_month' | 'this_year' | 'last_30_days' | 'custom'

function isActivityUiKind(value: string): value is ActivityUiKind {
  return (ACTIVITY_UI_KINDS as readonly string[]).includes(value)
}

function toIsoDate(date: Date): string {
  return date.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

function startOfWeekIso(): string {
  const now = new Date()
  const day = now.getDay() // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? 6 : day - 1
  const start = new Date(now)
  start.setDate(now.getDate() - mondayOffset)
  return toIsoDate(start)
}

function startOfMonthIso(): string {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1))
}

function startOfYearIso(): string {
  const now = new Date()
  return toIsoDate(new Date(now.getFullYear(), 0, 1))
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toIsoDate(d)
}

function todayIso(): string {
  return toIsoDate(new Date())
}

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

function activityItemIconMeta(item: ActivityItem): { Icon: Icon; label: string } {
  switch (item.kind) {
    case 'ride':
      return { Icon: IconBike, label: 'Ride' }
    case 'service_session':
    case 'maintenance_event':
      return { Icon: IconTool, label: 'Service' }
    case 'setup_change':
      return { Icon: item.action === 'removed' ? IconArrowBarUp : IconArrowsExchange, label: 'Setup change' }
  }
}

const ACTIVITY_UI_KIND_ICON: Record<ActivityUiKind, Icon> = {
  ride: IconBike,
  service: IconTool,
  setup: IconArrowsExchange,
}

function nonRideNote(item: ActivityItem): string | null {
  if (item.kind === 'maintenance_event') return item.note
  if (item.kind === 'service_session') return item.notes
  return null
}

function ActivityInner({ initialData }: { initialData: TableViewPreferenceData }) {
  const [kinds, setKinds] = useState<ActivityUiKind[]>(() => {
    const stored = initialData.kinds?.filter(isActivityUiKind)
    return stored && stored.length > 0 ? stored : DEFAULT_ACTIVITY_KINDS
  })
  const [bikeId, setBikeId] = useState<number | undefined>(undefined)
  const [componentId, setComponentId] = useState<number | undefined>(undefined)
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null)
  const [customRange, setCustomRange] = useState<[string | null, string | null]>([null, null])
  const [qInput, setQInput] = useState('')
  const [q] = useDebouncedValue(qInput, 300)
  const [sortMetric, setSortMetric] = useState<SortMetric>('date')

  const rideOnly = kinds.length === 1 && kinds[0] === 'ride'

  // Sort-by-distance only makes sense with Rides as the sole selected kind
  // (GET /activity's own 422 rule) -- adjusted during render (React's
  // documented "resetting state when a prop changes" pattern) rather than
  // an effect, same convention as the Rides tab's own filter-reset logic.
  const [prevRideOnly, setPrevRideOnly] = useState(rideOnly)
  if (prevRideOnly !== rideOnly) {
    setPrevRideOnly(rideOnly)
    if (!rideOnly && sortMetric === 'distance') setSortMetric('date')
  }

  const updatePreference = useUpdateTableViewPreference('activity_log')

  const {
    orderedColumns,
    toggleColumn,
    reorderColumn,
    onHeaderDragEnd,
    sortColumn,
    sortDirection,
    setSort,
    saveError,
    clearSaveError,
  } = useTableViewPreferences<ActivityLogColumn, 'occurred_at'>({
    tableKey: 'activity_log',
    initialData,
    allColumns: ACTIVITY_LOG_COLUMNS,
    defaultColumns: DEFAULT_ACTIVITY_LOG_COLUMNS,
    sortColumns: [ 'occurred_at' ] as const,
    defaultSort: { column: 'occurred_at', direction: 'desc' },
    extraData: () => ({ kinds }),
  })
  const headerDragSensors = useColumnDragSensors()
  const order: Order = sortDirection

  function handleOrderChange(value: string) {
    const desired: Order = value === 'newest' ? 'desc' : 'asc'
    if (order !== desired) setSort('occurred_at')
  }

  // The kind chips aren't owned by useTableViewPreferences (that hook only
  // manages columns/sort), but they're persisted in the same
  // TableViewPreference row -- so every save here still has to include the
  // current columns/sort, the same way useTableViewPreferences' own saves
  // now include kinds via its extraData option.
  function toggleKind(kind: ActivityUiKind) {
    const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [ ...kinds, kind ]
    if (next.length === 0) return // at least one kind must stay selected
    setKinds(next)
    updatePreference.mutate({ columns: orderedColumns, sort_column: sortColumn, sort_direction: sortDirection, kinds: next })
  }

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const { from, to } = useMemo(() => {
    switch (datePreset) {
      case 'this_week':
        return { from: startOfWeekIso(), to: todayIso() }
      case 'this_month':
        return { from: startOfMonthIso(), to: todayIso() }
      case 'this_year':
        return { from: startOfYearIso(), to: todayIso() }
      case 'last_30_days':
        return { from: daysAgoIso(30), to: todayIso() }
      case 'custom':
        return { from: customRange[0] ?? undefined, to: customRange[1] ?? undefined }
      default:
        return { from: undefined, to: undefined }
    }
  }, [ datePreset, customRange ])

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

  function clearFilters() {
    setBikeId(undefined)
    setComponentId(undefined)
    setDatePreset(null)
    setCustomRange([ null, null ])
    setQInput('')
  }

  const hasActiveFilters = Boolean(bikeId || componentId || datePreset || q)

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

      <Group gap="xs">
        {ACTIVITY_UI_KINDS.map((kind) => {
          const Icon = ACTIVITY_UI_KIND_ICON[kind]
          return (
            <Button
              key={kind}
              size="xs"
              variant={kinds.includes(kind) ? 'filled' : 'default'}
              leftSection={<Icon size={14} />}
              onClick={() => toggleKind(kind)}
            >
              {ACTIVITY_KIND_LABELS[kind]} · {meta?.kind_counts[kind] ?? 0}
            </Button>
          )
        })}
      </Group>

      <Group justify="space-between" wrap="wrap">
        <Group wrap="wrap">
          <Select
            placeholder="All bikes"
            clearable
            data={(bikesList ?? []).map((bike) => ({ value: String(bike.id), label: bike.name }))}
            value={bikeId ? String(bikeId) : null}
            onChange={(value) => setBikeId(value ? Number(value) : undefined)}
            w={160}
          />
          <Select
            placeholder="Any component"
            clearable
            data={(componentsList ?? []).map((component) => ({ value: String(component.id), label: component.label }))}
            value={componentId ? String(componentId) : null}
            onChange={(value) => setComponentId(value ? Number(value) : undefined)}
            w={180}
          />
          <Select
            placeholder="All time"
            clearable
            data={[
              { value: 'this_week', label: 'This week' },
              { value: 'this_month', label: 'This month' },
              { value: 'this_year', label: 'This year' },
              { value: 'last_30_days', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom' },
            ]}
            value={datePreset}
            onChange={(value) => setDatePreset(value as DatePreset | null)}
            w={150}
          />
          {datePreset === 'custom' && (
            <DatePickerInput
              type="range"
              placeholder="Pick a date range"
              value={customRange}
              onChange={setCustomRange}
              clearable
              w={240}
            />
          )}
          <TextInput
            placeholder="Search ride name"
            value={qInput}
            onChange={(event) => setQInput(event.currentTarget.value)}
            w={200}
          />
          {hasActiveFilters && (
            <Button variant="subtle" size="xs" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </Group>

        <Group>
          <SegmentedControl
            value={order === 'desc' ? 'newest' : 'oldest'}
            onChange={handleOrderChange}
            data={[
              { label: 'Newest first', value: 'newest' },
              { label: 'Oldest first', value: 'oldest' },
            ]}
          />
          {rideOnly ? (
            <SegmentedControl
              value={sortMetric}
              onChange={(value) => setSortMetric(value as SortMetric)}
              data={[
                { label: 'Date', value: 'date' },
                { label: 'Distance', value: 'distance' },
              ]}
            />
          ) : (
            <Text size="xs" c="dimmed">
              Sort by distance is available with only Rides shown.
            </Text>
          )}
        </Group>
      </Group>

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

      {!isPending && items.length > 0 && (
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
                      <Table.Th />
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
                  />
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
              Showing {items.length} of {totalForLoadedKinds}
            </Text>
          )}
        </>
      )}
    </Stack>
  )
}

function ActivityRow({
  item,
  orderedColumns,
  mergedColSpan,
}: {
  item: ActivityItem
  orderedColumns: ActivityLogColumn[]
  mergedColSpan: number
}) {
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
        <Table.Td />
        <Table.Td />
      </Table.Tr>
    )
  }

  const note = nonRideNote(item)

  return (
    <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-light)' }}>
      <Table.Td>
        <Tooltip label={label}>
          <Icon size={16} />
        </Tooltip>
      </Table.Td>
      <Table.Td>{formatDateTime(item.occurred_at)}</Table.Td>
      <Table.Td colSpan={mergedColSpan}>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" c="dimmed">
            {item.summary}
          </Text>
          {note && (
            <Tooltip label={note}>
              <Text size="xs" c="dimmed" truncate maw={240}>
                {note}
              </Text>
            </Tooltip>
          )}
        </Group>
      </Table.Td>
      <Table.Td />
      <Table.Td />
    </Table.Tr>
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
