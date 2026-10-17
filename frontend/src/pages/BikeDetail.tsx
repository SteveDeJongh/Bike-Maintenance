import { useMemo, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { ApiError } from '../api/client'
import { parseApiError } from '../api/errors'
import {
  useBike,
  useComponentAssignments,
  useComponentCategorySettings,
  useComponents,
  useTableViewPreference,
} from '../api/queries'
import {
  useCreateBikeComponentSlot,
  useCreateComponentAssignment,
  useDeleteBikeComponentSlot,
} from '../api/mutations'
import AssignmentDetailModal from '../components/forms/AssignmentDetailModal'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import EndAssignmentModal from '../components/forms/EndAssignmentModal'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import SortableHeaderCell from '../components/datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../hooks/useTableViewPreferences'
import {
  COMPONENT_CATEGORIES,
  categoryLabel,
  DEFAULT_HISTORY_COLUMNS,
  DEFAULT_INSTALLED_COMPONENT_COLUMNS,
  HISTORY_COLUMN_LABELS,
  HISTORY_COLUMNS,
  HISTORY_SORT_COLUMNS,
  INSTALLED_COMPONENT_COLUMN_LABELS,
  INSTALLED_COMPONENT_COLUMNS,
  INSTALLED_COMPONENT_SORT_COLUMNS,
  RIDE_CONTEXTS,
  RIDE_CONTEXT_LABELS,
  type HistoryColumn,
  type HistorySortColumn,
  type InstalledComponentColumn,
  type InstalledComponentSortColumn,
} from '../constants'
import {
  formatDate,
  formatDateTime,
  isoUtcToDate,
  mantineLocalStringToIsoUtc,
  nowIsoUtc,
} from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import { formatPower } from '../utils/power'
import type {
  BikeComponentSlot,
  BikeDetail as BikeDetailData,
  Component,
  ComponentAssignmentWithStats,
  TableViewPreferenceData,
} from '../types/models'

const CREATE_NEW_COMPONENT = '__create_new__'

const INSTALLED_COMPONENT_COLUMN_OPTIONS = INSTALLED_COMPONENT_COLUMNS.map((column) => ({
  key: column,
  label: INSTALLED_COMPONENT_COLUMN_LABELS[column],
}))

const HISTORY_COLUMN_OPTIONS = HISTORY_COLUMNS.map((column) => ({
  key: column,
  label: HISTORY_COLUMN_LABELS[column],
}))

// Rendering only ever happens for occupied Installed-components rows (empty
// slots render the install-flow controls instead), so this operates
// directly on a real assignment, same as History's renderer below.
const installedComponentRenderer: Record<InstalledComponentColumn, (a: ComponentAssignmentWithStats) => ReactNode> = {
  period_distance: (a) => formatDistance(a.distance_meters),
  period_time: (a) => formatDuration(a.moving_time),
  period_elevation: (a) => formatElevation(a.elevation_gain),
  period_avg_power: (a) => formatPower(a.average_power),
  component_total_distance: (a) => formatDistance(a.component.total_distance),
  component_total_time: (a) => formatDuration(a.component.total_moving_time),
  component_total_elevation: (a) => formatElevation(a.component.total_elevation_gain),
  component_avg_power: (a) => formatPower(a.component.average_power),
  distance_since_wax: (a) =>
    a.component.category === 'chain' ? formatDistance(a.component.distance_since_wax) : '—',
  installed_on: (a) => formatDate(a.started_at),
}

// Installed-components sorting has to account for empty (unoccupied) slots,
// which have no assignment yet — null sorts last, same convention used
// everywhere else in this app.
const installedComponentValue: Record<
  InstalledComponentSortColumn,
  (data: { slot: BikeComponentSlot; assignment?: ComponentAssignmentWithStats }) => string | number | null
> = {
  category: ({ slot }) => slot.category,
  component_label: ({ assignment }) => assignment?.component.label ?? null,
  period_distance: ({ assignment }) => assignment?.distance_meters ?? null,
  period_time: ({ assignment }) => assignment?.moving_time ?? null,
  period_elevation: ({ assignment }) => assignment?.elevation_gain ?? null,
  period_avg_power: ({ assignment }) => assignment?.average_power ?? null,
  component_total_distance: ({ assignment }) => assignment?.component.total_distance ?? null,
  component_total_time: ({ assignment }) => assignment?.component.total_moving_time ?? null,
  component_total_elevation: ({ assignment }) => assignment?.component.total_elevation_gain ?? null,
  component_avg_power: ({ assignment }) => assignment?.component.average_power ?? null,
  distance_since_wax: ({ assignment }) =>
    assignment && assignment.component.category === 'chain' ? assignment.component.distance_since_wax : null,
  installed_on: ({ assignment }) => assignment?.started_at ?? null,
}

const historyRenderer: Record<HistoryColumn, (a: ComponentAssignmentWithStats) => ReactNode> = {
  period_distance: (a) => formatDistance(a.distance_meters),
  period_time: (a) => formatDuration(a.moving_time),
  period_elevation: (a) => formatElevation(a.elevation_gain),
  period_avg_power: (a) => formatPower(a.average_power),
  component_total_distance: (a) => formatDistance(a.component.total_distance),
  component_total_time: (a) => formatDuration(a.component.total_moving_time),
  component_total_elevation: (a) => formatElevation(a.component.total_elevation_gain),
  component_avg_power: (a) => formatPower(a.component.average_power),
  distance_since_wax: (a) =>
    a.component.category === 'chain' ? formatDistance(a.component.distance_since_wax) : '—',
  started_on: (a) => formatDateTime(a.started_at),
  ended_on: (a) => formatDateTime(a.ended_at),
}

const historyValue: Record<HistorySortColumn, (a: ComponentAssignmentWithStats) => string | number | null> = {
  category: (a) => a.component.category,
  component_label: (a) => a.component.label,
  period_distance: (a) => a.distance_meters,
  period_time: (a) => a.moving_time,
  period_elevation: (a) => a.elevation_gain,
  period_avg_power: (a) => a.average_power,
  component_total_distance: (a) => a.component.total_distance,
  component_total_time: (a) => a.component.total_moving_time,
  component_total_elevation: (a) => a.component.total_elevation_gain,
  component_avg_power: (a) => a.component.average_power,
  distance_since_wax: (a) => (a.component.category === 'chain' ? a.component.distance_since_wax : null),
  started_on: (a) => a.started_at,
  ended_on: (a) => a.ended_at,
}

export default function BikeDetail() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending: bikePending, error: bikeError } = useBike(bikeId)
  const { data: assignments, isPending: assignmentsPending } = useComponentAssignments()
  const { data: components } = useComponents()

  const [endingAssignment, setEndingAssignment] = useState<ComponentAssignmentWithStats | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<ComponentAssignmentWithStats | null>(null)
  const [addCategory, setAddCategory] = useState<string | null>(null)
  const createSlot = useCreateBikeComponentSlot()

  if (!Number.isFinite(bikeId) || (bikeError instanceof ApiError && bikeError.status === 404)) {
    return (
      <Stack>
        <Text>Bike not found.</Text>
        <Anchor component={Link} to="/bikes">
          Back to bikes
        </Anchor>
      </Stack>
    )
  }

  if (bikePending || assignmentsPending) return <Loader />

  if (bikeError) {
    return (
      <Alert color="red" title="Failed to load bike">
        {bikeError.message}
      </Alert>
    )
  }

  if (!bike) return null

  // Cross-bike check: a component already actively mounted on a *different*
  // bike shouldn't be offered in this bike's assign dropdown. Inherently
  // cross-bike, so this still needs the global assignments list rather than
  // the new bike-scoped, enriched bike.component_assignments.
  const activeComponentIdsEverywhere = (assignments ?? [])
    .filter((a) => a.ended_at === null)
    .map((a) => a.component_id)

  const orderedSlots = COMPONENT_CATEGORIES.map((category) =>
    bike.bike_component_slots.find((slot) => slot.category === category),
  ).filter((slot): slot is BikeComponentSlot => slot !== undefined)

  const untrackedCategories = COMPONENT_CATEGORIES.filter(
    (category) => !bike.bike_component_slots.some((slot) => slot.category === category),
  )

  const historyAssignments = bike.component_assignments.filter((a) => a.ended_at !== null)

  const confirmedBikeId = bike.id

  function handleAddCategory(value: string | null) {
    setAddCategory(value)
    if (value) {
      createSlot.mutate(
        { bike_id: confirmedBikeId, category: value },
        { onSuccess: () => setAddCategory(null) },
      )
    }
  }

  return (
    <Stack>
      <div>
        <Group gap="sm">
          <Title order={2}>{bike.name}</Title>
          {bike.retired_on && <Badge color="gray">Retired</Badge>}
        </Group>
        <Text c="dimmed">
          {[bike.make, bike.model].filter(Boolean).join(' ') || 'Unknown make/model'}
        </Text>
      </div>

      <Group gap="xl">
        <div>
          <Text size="sm" c="dimmed">
            Total distance
          </Text>
          <Text fw={500}>{formatDistance(bike.total_distance)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Total time
          </Text>
          <Text fw={500}>{formatDuration(bike.total_moving_time)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            First ride
          </Text>
          <Text fw={500}>{bike.first_ride_on ? formatDate(bike.first_ride_on) : 'No rides yet'}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Total elevation
          </Text>
          <Text fw={500}>{formatElevation(bike.total_elevation_gain)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Avg power
          </Text>
          <Text fw={500}>{formatPower(bike.average_power)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Installed components
          </Text>
          <Text fw={500}>{bike.installed_components_count}</Text>
        </div>
      </Group>

      <Title order={3}>Installed components</Title>

      {orderedSlots.length === 0 && <Text c="dimmed">No component types tracked yet.</Text>}

      {orderedSlots.length > 0 && (
        <InstalledComponentsTable
          bike={bike}
          orderedSlots={orderedSlots}
          components={components ?? []}
          activeComponentIdsEverywhere={activeComponentIdsEverywhere}
          onEndAssignment={setEndingAssignment}
          onRowClick={setSelectedAssignment}
        />
      )}

      {untrackedCategories.length > 0 && (
        <Select
          placeholder="+ Track a new component type"
          data={untrackedCategories.map((category) => ({
            value: category,
            label: categoryLabel(category),
          }))}
          value={addCategory}
          onChange={handleAddCategory}
          disabled={createSlot.isPending}
        />
      )}

      <Title order={3}>Component History</Title>

      {historyAssignments.length === 0 && <Text c="dimmed">No past assignments.</Text>}

      {historyAssignments.length > 0 && (
        <HistoryTable historyAssignments={historyAssignments} onRowClick={setSelectedAssignment} />
      )}

      <EndAssignmentModal
        opened={endingAssignment !== null}
        onClose={() => setEndingAssignment(null)}
        assignment={endingAssignment}
        componentLabel={endingAssignment?.component.label ?? ''}
      />

      <AssignmentDetailModal
        opened={selectedAssignment !== null}
        onClose={() => setSelectedAssignment(null)}
        assignment={selectedAssignment}
      />
    </Stack>
  )
}

function InstalledComponentsTable({
  bike,
  orderedSlots,
  components,
  activeComponentIdsEverywhere,
  onEndAssignment,
  onRowClick,
}: {
  bike: BikeDetailData
  orderedSlots: BikeComponentSlot[]
  components: Component[]
  activeComponentIdsEverywhere: number[]
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
}) {
  const { data: preferenceData, isPending } = useTableViewPreference('bike_installed_components')

  if (isPending || !preferenceData) return <Loader />

  return (
    <InstalledComponentsTableInner
      bike={bike}
      orderedSlots={orderedSlots}
      components={components}
      activeComponentIdsEverywhere={activeComponentIdsEverywhere}
      onEndAssignment={onEndAssignment}
      onRowClick={onRowClick}
      initialData={preferenceData.data}
    />
  )
}

function InstalledComponentsTableInner({
  bike,
  orderedSlots,
  components,
  activeComponentIdsEverywhere,
  onEndAssignment,
  onRowClick,
  initialData,
}: {
  bike: BikeDetailData
  orderedSlots: BikeComponentSlot[]
  components: Component[]
  activeComponentIdsEverywhere: number[]
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  initialData: TableViewPreferenceData
}) {
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
  } = useTableViewPreferences<InstalledComponentColumn, InstalledComponentSortColumn>({
    tableKey: 'bike_installed_components',
    initialData,
    allColumns: INSTALLED_COMPONENT_COLUMNS,
    defaultColumns: DEFAULT_INSTALLED_COMPONENT_COLUMNS,
    sortColumns: INSTALLED_COMPONENT_SORT_COLUMNS,
    defaultSort: { column: 'category', direction: 'asc' },
  })
  const headerDragSensors = useColumnDragSensors()

  const sortedSlots = useMemo(() => {
    const slotsWithAssignments = orderedSlots.map((slot) => ({
      slot,
      assignment: bike.component_assignments.find(
        (a) => a.ended_at === null && a.component.category === slot.category,
      ),
    }))
    const accessor = installedComponentValue[sortColumn]
    return slotsWithAssignments
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const av = accessor(a.entry)
        const bv = accessor(b.entry)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ entry }) => entry)
  }, [bike, orderedSlots, sortColumn, sortDirection])

  return (
    <>
      {saveError && (
        <Alert color="red" mb="sm" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      <Table striped highlightOnHover>
        <Table.Thead>
          <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
            <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
              <Table.Tr>
                <SortableHeaderCell
                  label="Category"
                  active={sortColumn === 'category'}
                  direction={sortDirection}
                  onClick={() => setSort('category')}
                />
                <SortableHeaderCell
                  label="Component"
                  active={sortColumn === 'component_label'}
                  direction={sortDirection}
                  onClick={() => setSort('component_label')}
                />
                {orderedColumns.map((column) => (
                  <DraggableHeaderCell
                    key={column}
                    columnKey={column}
                    label={INSTALLED_COMPONENT_COLUMN_LABELS[column]}
                    active={sortColumn === column}
                    direction={sortDirection}
                    onSort={() => setSort(column)}
                  />
                ))}
                <Table.Th />
                <Table.Th>
                  <ColumnPicker
                    allColumns={INSTALLED_COMPONENT_COLUMN_OPTIONS}
                    orderedVisible={orderedColumns}
                    onToggle={(key) => toggleColumn(key as InstalledComponentColumn)}
                    onReorder={(activeKey, overKey) =>
                      reorderColumn(activeKey as InstalledComponentColumn, overKey as InstalledComponentColumn)
                    }
                  />
                </Table.Th>
              </Table.Tr>
            </SortableContext>
          </DndContext>
        </Table.Thead>
        <Table.Tbody>
          {sortedSlots.map(({ slot, assignment }) => {
            const categoryAssignments = bike.component_assignments.filter(
              (a) => a.component.category === slot.category,
            )
            const endedCount = categoryAssignments.filter((a) => a.ended_at !== null).length

            return (
              <SlotRow
                key={slot.id}
                bike={bike}
                slot={slot}
                assignment={assignment}
                hasHistory={categoryAssignments.length > 0}
                endedCount={endedCount}
                components={components}
                activeComponentIdsEverywhere={activeComponentIdsEverywhere}
                onEndAssignment={onEndAssignment}
                onRowClick={onRowClick}
                orderedColumns={orderedColumns}
              />
            )
          })}
        </Table.Tbody>
      </Table>
    </>
  )
}

function SlotRow({
  bike,
  slot,
  assignment,
  hasHistory,
  endedCount,
  components,
  activeComponentIdsEverywhere,
  onEndAssignment,
  onRowClick,
  orderedColumns,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  assignment: ComponentAssignmentWithStats | undefined
  hasHistory: boolean
  endedCount: number
  components: Component[]
  activeComponentIdsEverywhere: number[]
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  orderedColumns: InstalledComponentColumn[]
}) {
  if (assignment) {
    return (
      <Table.Tr onClick={() => onRowClick(assignment)} style={{ cursor: 'pointer' }}>
        <Table.Td>{categoryLabel(slot.category)}</Table.Td>
        <Table.Td>
          <Anchor
            component={Link}
            to={`/components/${assignment.component_id}`}
            onClick={(event) => event.stopPropagation()}
          >
            {assignment.component.label}
          </Anchor>
        </Table.Td>
        {orderedColumns.map((column) => (
          <Table.Td key={column}>{installedComponentRenderer[column](assignment)}</Table.Td>
        ))}
        <Table.Td>
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={(event) => {
                event.stopPropagation()
                onEndAssignment(assignment)
              }}
            >
              Remove
            </Button>
          </Group>
        </Table.Td>
        <Table.Td />
      </Table.Tr>
    )
  }

  // Keyed on endedCount so this remounts (and recomputes its default start
  // date) the moment a prior assignment in this slot ends — otherwise the
  // row would keep whatever "now" it first mounted with, which can end up
  // earlier than the just-ended assignment's end date and get rejected by
  // the backend's overlap validation with no visible error.
  return (
    <EmptySlotRow
      key={endedCount}
      bike={bike}
      slot={slot}
      hasHistory={hasHistory}
      components={components}
      activeComponentIdsEverywhere={activeComponentIdsEverywhere}
      columnSpan={1 + orderedColumns.length}
    />
  )
}

function EmptySlotRow({
  bike,
  slot,
  hasHistory,
  components,
  activeComponentIdsEverywhere,
  columnSpan,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  hasHistory: boolean
  components: Component[]
  activeComponentIdsEverywhere: number[]
  columnSpan: number
}) {
  const [componentId, setComponentId] = useState<string | null>(null)
  // A slot being assigned for the first time defaults to the bike's own
  // created_at (it was presumably already mounted when the bike was added
  // to the tracker); a slot with prior history defaults to now.
  const [startedAt, setStartedAt] = useState<string | null>(
    hasHistory ? nowIsoUtc() : bike.created_at,
  )
  const { data: categorySettings } = useComponentCategorySettings()
  const defaultAccruesIndoor =
    categorySettings?.find((setting) => setting.category === slot.category)?.accrues_indoor_mileage ?? true
  const [rideContext, setRideContext] = useState<string | null>(
    defaultAccruesIndoor ? 'both' : 'outdoor_only',
  )
  const [createOpened, setCreateOpened] = useState(false)
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const createAssignment = useCreateComponentAssignment()
  const deleteSlot = useDeleteBikeComponentSlot()

  const availableComponents = components.filter(
    (component) =>
      component.category === slot.category && !activeComponentIdsEverywhere.includes(component.id),
  )

  function assign(targetComponentId: number) {
    setBaseErrors([])
    createAssignment.mutate(
      {
        component_id: targetComponentId,
        bike_id: bike.id,
        started_at: startedAt ?? nowIsoUtc(),
        ended_at: null,
        ride_context: (rideContext ?? 'both') as 'both' | 'outdoor_only' | 'indoor_only',
      },
      {
        onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
      },
    )
  }

  function handleChange(value: string | null) {
    if (value === CREATE_NEW_COMPONENT) {
      setCreateOpened(true)
      return
    }
    setComponentId(value)
  }

  const options = [
    ...availableComponents.map((component) => ({
      value: String(component.id),
      label: component.label,
    })),
    { value: CREATE_NEW_COMPONENT, label: `+ Create new ${categoryLabel(slot.category)}` },
  ]

  return (
    <Table.Tr>
      <Table.Td>{categoryLabel(slot.category)}</Table.Td>
      <Table.Td colSpan={columnSpan}>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Select
            data={options}
            value={componentId}
            onChange={handleChange}
            placeholder="Pick a component"
            disabled={createAssignment.isPending}
          />
          <DateTimePicker
            label="Started"
            size="sm"
            value={isoUtcToDate(startedAt)}
            onChange={(value) => setStartedAt(mantineLocalStringToIsoUtc(value))}
          />
          <Select
            label="Ride context"
            size="sm"
            data={RIDE_CONTEXTS.map((context) => ({ value: context, label: RIDE_CONTEXT_LABELS[context] }))}
            value={rideContext}
            onChange={setRideContext}
            allowDeselect={false}
          />
          <Button
            size="sm"
            disabled={!componentId}
            loading={createAssignment.isPending}
            onClick={() => componentId && assign(Number(componentId))}
          >
            Install
          </Button>
        </Group>

        {baseErrors.length > 0 && (
          <Alert color="red" mt="xs">
            {baseErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}

        <ComponentFormModal
          opened={createOpened}
          onClose={() => setCreateOpened(false)}
          createDefaults={{ category: slot.category }}
          onCreateSuccess={(component) => setComponentId(String(component.id))}
        />
      </Table.Td>
      <Table.Td>
        <Group justify="flex-end">
          <Button size="xs" variant="subtle" onClick={() => deleteSlot.mutate(slot.id)}>
            Stop tracking
          </Button>
        </Group>
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  )
}

function HistoryTable({
  historyAssignments,
  onRowClick,
}: {
  historyAssignments: ComponentAssignmentWithStats[]
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
}) {
  const { data: preferenceData, isPending } = useTableViewPreference('bike_history')

  if (isPending || !preferenceData) return <Loader />

  return (
    <HistoryTableInner
      historyAssignments={historyAssignments}
      onRowClick={onRowClick}
      initialData={preferenceData.data}
    />
  )
}

function HistoryTableInner({
  historyAssignments,
  onRowClick,
  initialData,
}: {
  historyAssignments: ComponentAssignmentWithStats[]
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  initialData: TableViewPreferenceData
}) {
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
  } = useTableViewPreferences<HistoryColumn, HistorySortColumn>({
    tableKey: 'bike_history',
    initialData,
    allColumns: HISTORY_COLUMNS,
    defaultColumns: DEFAULT_HISTORY_COLUMNS,
    sortColumns: HISTORY_SORT_COLUMNS,
    defaultSort: { column: 'started_on', direction: 'desc' },
  })
  const headerDragSensors = useColumnDragSensors()

  const sortedAssignments = useMemo(() => {
    const accessor = historyValue[sortColumn]
    return historyAssignments
      .map((assignment, index) => ({ assignment, index }))
      .sort((a, b) => {
        const av = accessor(a.assignment)
        const bv = accessor(b.assignment)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ assignment }) => assignment)
  }, [historyAssignments, sortColumn, sortDirection])

  return (
    <>
      {saveError && (
        <Alert color="red" mb="sm" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      <Table striped>
        <Table.Thead>
          <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
            <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
              <Table.Tr>
                <SortableHeaderCell
                  label="Category"
                  active={sortColumn === 'category'}
                  direction={sortDirection}
                  onClick={() => setSort('category')}
                />
                <SortableHeaderCell
                  label="Component"
                  active={sortColumn === 'component_label'}
                  direction={sortDirection}
                  onClick={() => setSort('component_label')}
                />
                {orderedColumns.map((column) => (
                  <DraggableHeaderCell
                    key={column}
                    columnKey={column}
                    label={HISTORY_COLUMN_LABELS[column]}
                    active={sortColumn === column}
                    direction={sortDirection}
                    onSort={() => setSort(column)}
                  />
                ))}
                <Table.Th>
                  <ColumnPicker
                    allColumns={HISTORY_COLUMN_OPTIONS}
                    orderedVisible={orderedColumns}
                    onToggle={(key) => toggleColumn(key as HistoryColumn)}
                    onReorder={(activeKey, overKey) =>
                      reorderColumn(activeKey as HistoryColumn, overKey as HistoryColumn)
                    }
                  />
                </Table.Th>
              </Table.Tr>
            </SortableContext>
          </DndContext>
        </Table.Thead>
        <Table.Tbody>
          {sortedAssignments.map((assignment) => (
            <Table.Tr key={assignment.id} onClick={() => onRowClick(assignment)} style={{ cursor: 'pointer' }}>
              <Table.Td>{categoryLabel(assignment.component.category)}</Table.Td>
              <Table.Td>
                <Anchor
                  component={Link}
                  to={`/components/${assignment.component_id}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {assignment.component.label}
                </Anchor>
              </Table.Td>
              {orderedColumns.map((column) => (
                <Table.Td key={column}>{historyRenderer[column](assignment)}</Table.Td>
              ))}
              <Table.Td />
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}
