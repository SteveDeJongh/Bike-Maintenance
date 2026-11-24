import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Anchor, Badge, Button, Group, Loader, Menu, Stack, Table, Text, Title } from '@mantine/core'
import BikesSummaryTiles from '../components/bikes/BikesSummaryTiles'
import BikesToolbar from '../components/bikes/BikesToolbar'
import AddBikeCard from '../components/bikes/AddBikeCard'
import BikeListCard from '../components/bikes/BikeListCard'
import RetiredBikeRows from '../components/bikes/RetiredBikeRows'
import { bikeTileTotals, bikesHeaderLine, sortBikeCards } from '../components/bikes/bikesList'
import { useBikesView, type BikesViewState } from '../components/bikes/useBikesView'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link, useNavigate } from 'react-router-dom'
import { useBikes, useBikeTypes, useTableViewPreference } from '../api/queries'
import { useDeleteBike } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import BikeFormModal from '../components/forms/BikeFormModal'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DataCardList from '../components/datatable/DataCardList'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import MobileSortControl from '../components/datatable/MobileSortControl'
import SortableHeaderCell from '../components/datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  BIKE_LIST_COLUMNS,
  BIKE_LIST_COLUMN_LABELS,
  BIKE_LIST_SORT_COLUMNS,
  type BikeListColumn,
  type BikeListSortColumn,
} from '../constants'
import { formatDate } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import { formatPower } from '../utils/power'
import type { Bike, BikeWithStats, TableViewPreferenceData } from '../types/models'

// bike_type needs the fetched BikeType list to resolve a name, so these are
// factories (built inside BikesTable, where useBikeTypes() lives) rather
// than plain module-level maps like every other adopter of this pattern.
// null means "unknown"/"not applicable" (e.g. a bike with no power-meter
// data, or no bike type) — these always sort last, regardless of direction
// (see sortedBikes below).
function buildColumnValue(
  bikeTypeNameById: Map<number, string>,
): Record<BikeListSortColumn, (bike: BikeWithStats) => string | number | null> {
  return {
    name: (bike) => bike.name,
    make_model: (bike) => [bike.make, bike.model].filter(Boolean).join(' '),
    bike_type: (bike) => (bike.bike_type_id === null ? null : bikeTypeNameById.get(bike.bike_type_id) ?? null),
    acquired_on: (bike) => bike.acquired_on,
    total_distance: (bike) => bike.total_distance,
    total_moving_time: (bike) => bike.total_moving_time,
    first_ride_on: (bike) => bike.first_ride_on,
    last_ride_on: (bike) => bike.last_ride_on,
    average_power: (bike) => bike.average_power,
    total_elevation_gain: (bike) => bike.total_elevation_gain,
    installed_components_count: (bike) => bike.installed_components_count,
  }
}

function buildColumnRenderer(
  bikeTypeNameById: Map<number, string>,
): Record<BikeListColumn, (bike: BikeWithStats) => ReactNode> {
  return {
    make_model: (bike) =>
      bike.make || bike.model ? [bike.make, bike.model].filter(Boolean).join(' ') : 'Unknown make/model',
    bike_type: (bike) => (bike.bike_type_id === null ? '—' : bikeTypeNameById.get(bike.bike_type_id) ?? '—'),
    acquired_on: (bike) => (bike.acquired_on ? formatDate(bike.acquired_on) : '—'),
    total_distance: (bike) => formatDistance(bike.total_distance),
    total_moving_time: (bike) => formatDuration(bike.total_moving_time),
    first_ride_on: (bike) => (bike.first_ride_on ? formatDate(bike.first_ride_on) : 'No rides yet'),
    last_ride_on: (bike) => (bike.last_ride_on ? formatDate(bike.last_ride_on) : 'No rides yet'),
    average_power: (bike) => formatPower(bike.average_power),
    total_elevation_gain: (bike) => formatElevation(bike.total_elevation_gain),
    installed_components_count: (bike) => String(bike.installed_components_count),
  }
}

const BIKE_LIST_COLUMN_OPTIONS = BIKE_LIST_COLUMNS.map((column) => ({
  key: column,
  label: BIKE_LIST_COLUMN_LABELS[column],
}))

// MobileSortControl needs a label for every sortable column, including the
// pinned "name" column -- which BIKE_LIST_COLUMN_LABELS doesn't carry,
// since it's not one of the toggleable columns.
const BIKE_LIST_SORT_COLUMN_LABELS: Record<BikeListSortColumn, string> = {
  name: 'Name',
  ...BIKE_LIST_COLUMN_LABELS,
}

export default function Bikes() {
  const navigate = useNavigate()
  const { data, isPending, isError, error } = useBikes()
  const { data: preferenceData, isPending: preferencePending } = useTableViewPreference('bikes')
  const deleteBike = useDeleteBike()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<Bike | null>(null)

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(bike: Bike) {
    setEditing(bike)
    setModalOpened(true)
  }

  function handleDelete(bike: Bike) {
    confirmDelete({
      title: 'Delete bike',
      message: `Delete "${bike.name}"? This also deletes all of its component assignment history.`,
      onConfirm: () => deleteBike.mutate(bike.id),
    })
  }

  const totals = bikeTileTotals(data ?? [])

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Title order={2}>Bikes</Title>
          {data && (
            <Text size="sm" c="dimmed">
              {bikesHeaderLine(totals)}
            </Text>
          )}
        </div>
        <Button onClick={openCreate}>+ Add bike</Button>
      </Group>

      {(isPending || preferencePending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load bikes">
          {error.message}
        </Alert>
      )}

      {/* useBikesView seeds from the preference once, on mount. */}
      {data && preferenceData && (
        <BikesContent
          bikes={data}
          initialData={preferenceData.data}
          onAdd={openCreate}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <BikeFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        bike={editing ?? undefined}
        onCreateSuccess={(bike) => navigate(`/bikes/${bike.id}/setup`)}
      />
    </Stack>
  )
}

function BikesContent({
  bikes,
  initialData,
  onAdd,
  onEdit,
  onDelete,
}: {
  bikes: BikeWithStats[]
  initialData: TableViewPreferenceData
  onAdd: () => void
  onEdit: (bike: Bike) => void
  onDelete: (bike: Bike) => void
}) {
  const state = useBikesView(initialData)
  const isMobile = useIsMobile()
  const { data: bikeTypes } = useBikeTypes()
  const typeNameById = useMemo(() => new Map((bikeTypes ?? []).map((type) => [type.id, type.name])), [bikeTypes])
  const visibleBikes = state.showRetired ? bikes : bikes.filter((bike) => !bike.retired_on)
  // A phone always gets cards: the table needs width it doesn't have.
  const showCards = state.view === 'cards' || isMobile

  return (
    <>
      <BikesSummaryTiles totals={bikeTileTotals(bikes)} />
      <BikesToolbar state={state} fieldOptions={BIKE_LIST_COLUMN_OPTIONS} />
      {state.table.saveError && (
        <Alert color="red" withCloseButton onClose={state.table.clearSaveError}>
          {state.table.saveError}
        </Alert>
      )}
      {showCards ? (
        <BikeCardGrid
          bikes={bikes}
          sort={state.cardSort}
          showRetired={state.showRetired}
          typeNameById={typeNameById}
          onAdd={onAdd}
        />
      ) : bikes.length === 0 ? (
        <Text c="dimmed">No bikes yet.</Text>
      ) : (
        <BikesTable bikes={visibleBikes} table={state.table} onEdit={onEdit} onDelete={onDelete} />
      )}
    </>
  )
}

// Active bikes as cards in the chosen order, closed by the "Add a bike"
// card (also the empty state), then retired bikes as slim rows when shown.
function BikeCardGrid({
  bikes,
  sort,
  showRetired,
  typeNameById,
  onAdd,
}: {
  bikes: BikeWithStats[]
  sort: BikesViewState['cardSort']
  showRetired: boolean
  typeNameById: Map<number, string>
  onAdd: () => void
}) {
  const active = sortBikeCards(
    bikes.filter((bike) => !bike.retired_on),
    sort,
  )
  const retired = bikes.filter((bike) => bike.retired_on).sort((a, b) => (b.retired_on ?? '').localeCompare(a.retired_on ?? ''))

  return (
    <Stack gap="lg">
      <div
        style={{
          display: 'grid',
          // min(): a 380px minimum alone would overflow a phone.
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))',
          gap: 'var(--mantine-spacing-md)',
        }}
      >
        {active.map((bike) => (
          <BikeListCard
            key={bike.id}
            bike={bike}
            typeName={bike.bike_type_id === null ? null : (typeNameById.get(bike.bike_type_id) ?? null)}
          />
        ))}
        <AddBikeCard onAdd={onAdd} />
      </div>
      {showRetired && <RetiredBikeRows bikes={retired} />}
    </Stack>
  )
}

function BikesTable({
  bikes,
  table,
  onEdit,
  onDelete,
}: {
  bikes: BikeWithStats[]
  table: BikesViewState['table']
  onEdit: (bike: Bike) => void
  onDelete: (bike: Bike) => void
}) {
  const { orderedColumns, toggleColumn, reorderColumn, onHeaderDragEnd, sortColumn, sortDirection, setSort } = table
  const headerDragSensors = useColumnDragSensors()
  const isMobile = useIsMobile()

  const { data: bikeTypes } = useBikeTypes()
  const bikeTypeNameById = useMemo(
    () => new Map((bikeTypes ?? []).map((bikeType) => [bikeType.id, bikeType.name])),
    [bikeTypes],
  )
  const columnValue = useMemo(() => buildColumnValue(bikeTypeNameById), [bikeTypeNameById])
  const columnRenderer = useMemo(() => buildColumnRenderer(bikeTypeNameById), [bikeTypeNameById])

  const sortedBikes = useMemo(() => {
    const accessor = columnValue[sortColumn]
    return bikes
      .map((bike, index) => ({ bike, index }))
      .sort((a, b) => {
        // Active bikes before retired ones, regardless of the chosen sort
        // column -- takes priority over everything below, same as the
        // null-always-sorts-last rule that follows it.
        const aRetired = a.bike.retired_on ? 1 : 0
        const bRetired = b.bike.retired_on ? 1 : 0
        if (aRetired !== bRetired) return aRetired - bRetired

        const av = accessor(a.bike)
        const bv = accessor(b.bike)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ bike }) => bike)
  }, [bikes, sortColumn, sortDirection, columnValue])

  return (
    <>
      {isMobile ? (
        <Stack gap="sm">
          <MobileSortControl
            sortColumns={BIKE_LIST_SORT_COLUMNS}
            columnLabels={BIKE_LIST_SORT_COLUMN_LABELS}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onChange={setSort}
          />
          <DataCardList
            rows={sortedBikes}
            getKey={(bike) => bike.id}
            renderTitle={(bike) => (
              <Anchor component={Link} to={`/bikes/${bike.id}`} fw={500}>
                {bike.name}
              </Anchor>
            )}
            orderedColumns={orderedColumns}
            columnLabels={BIKE_LIST_COLUMN_LABELS}
            columnRenderer={columnRenderer}
            renderBadges={(bike) => bike.retired_on && <Badge color="gray">Retired</Badge>}
            renderActions={(bike) => (
              <>
                <Menu.Item onClick={() => onEdit(bike)}>Edit</Menu.Item>
                <Menu.Item color="red" onClick={() => onDelete(bike)}>
                  Delete
                </Menu.Item>
              </>
            )}
          />
        </Stack>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
              <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
                <Table.Tr>
                  <SortableHeaderCell
                    label="Name"
                    active={sortColumn === 'name'}
                    direction={sortDirection}
                    onClick={() => setSort('name')}
                  />
                  {orderedColumns.map((column) => (
                    <DraggableHeaderCell
                      key={column}
                      columnKey={column}
                      label={BIKE_LIST_COLUMN_LABELS[column]}
                      active={sortColumn === column}
                      direction={sortDirection}
                      onSort={() => setSort(column)}
                    />
                  ))}
                  <Table.Th />
                  <Table.Th />
                  <Table.Th>
                    <ColumnPicker
                      allColumns={BIKE_LIST_COLUMN_OPTIONS}
                      orderedVisible={orderedColumns}
                      onToggle={(key) => toggleColumn(key as BikeListColumn)}
                      onReorder={(activeKey, overKey) =>
                        reorderColumn(activeKey as BikeListColumn, overKey as BikeListColumn)
                      }
                    />
                  </Table.Th>
                </Table.Tr>
              </SortableContext>
            </DndContext>
          </Table.Thead>
          <Table.Tbody>
            {sortedBikes.map((bike) => (
              <Table.Tr key={bike.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/bikes/${bike.id}`}>
                    {bike.name}
                  </Anchor>
                </Table.Td>
                {orderedColumns.map((column) => (
                  <Table.Td key={column}>{columnRenderer[column](bike)}</Table.Td>
                ))}
                <Table.Td>{bike.retired_on && <Badge color="gray">Retired</Badge>}</Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="subtle" onClick={() => onEdit(bike)}>
                      Edit
                    </Button>
                    <Button size="xs" variant="subtle" color="red" onClick={() => onDelete(bike)}>
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
                <Table.Td />
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  )
}
