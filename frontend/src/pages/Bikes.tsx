import { useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  MultiSelect,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router-dom'
import { parseApiError } from '../api/errors'
import { useBikeListPreferences, useBikes } from '../api/queries'
import { useDeleteBike, useUpdateBikeListPreferences } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import BikeFormModal from '../components/forms/BikeFormModal'
import {
  BIKE_LIST_COLUMNS,
  BIKE_LIST_COLUMN_LABELS,
  BIKE_LIST_SORT_COLUMNS,
  DEFAULT_BIKE_LIST_COLUMNS,
  type BikeListColumn,
  type BikeListSortColumn,
} from '../constants'
import { formatDate } from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import { formatElevation } from '../utils/elevation'
import { formatPower } from '../utils/power'
import type { Bike, BikeListPreferences, BikeWithStats } from '../types/models'

function isBikeListColumn(value: string): value is BikeListColumn {
  return (BIKE_LIST_COLUMNS as readonly string[]).includes(value)
}

function isBikeListSortColumn(value: string | null | undefined): value is BikeListSortColumn {
  return typeof value === 'string' && (BIKE_LIST_SORT_COLUMNS as readonly string[]).includes(value)
}

// Extracts each sortable column's comparable value from a bike. null means
// "unknown"/"not applicable" (e.g. a bike with no power-meter data) — these
// always sort last, regardless of direction (see sortedBikes below).
const columnValue: Record<BikeListSortColumn, (bike: BikeWithStats) => string | number | null> = {
  name: (bike) => bike.name,
  make_model: (bike) => [bike.make, bike.model].filter(Boolean).join(' '),
  total_distance: (bike) => bike.total_distance,
  total_moving_time: (bike) => bike.total_moving_time,
  first_ride_on: (bike) => bike.first_ride_on,
  last_ride_on: (bike) => bike.last_ride_on,
  average_power: (bike) => bike.average_power,
  total_elevation_gain: (bike) => bike.total_elevation_gain,
  installed_components_count: (bike) => bike.installed_components_count,
}

const columnRenderer: Record<BikeListColumn, (bike: BikeWithStats) => ReactNode> = {
  make_model: (bike) =>
    bike.make || bike.model ? [bike.make, bike.model].filter(Boolean).join(' ') : 'Unknown make/model',
  total_distance: (bike) => formatDistance(bike.total_distance),
  total_moving_time: (bike) => formatDuration(bike.total_moving_time),
  first_ride_on: (bike) => (bike.first_ride_on ? formatDate(bike.first_ride_on) : 'No rides yet'),
  last_ride_on: (bike) => (bike.last_ride_on ? formatDate(bike.last_ride_on) : 'No rides yet'),
  average_power: (bike) => formatPower(bike.average_power),
  total_elevation_gain: (bike) => formatElevation(bike.total_elevation_gain),
  installed_components_count: (bike) => String(bike.installed_components_count),
}

export default function Bikes() {
  const { data, isPending, isError, error } = useBikes()
  const { data: preferencesData, isPending: preferencesPending } = useBikeListPreferences()
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

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Bikes</Title>
        <Button onClick={openCreate}>+ New Bike</Button>
      </Group>

      {(isPending || preferencesPending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load bikes">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No bikes yet.</Text>}

      {data && data.length > 0 && preferencesData && (
        <BikesTable
          bikes={data}
          initialPreferences={preferencesData.bike_list_preferences}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <BikeFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        bike={editing ?? undefined}
      />
    </>
  )
}

function BikesTable({
  bikes,
  initialPreferences,
  onEdit,
  onDelete,
}: {
  bikes: BikeWithStats[]
  initialPreferences: BikeListPreferences
  onEdit: (bike: Bike) => void
  onDelete: (bike: Bike) => void
}) {
  const [visibleColumns, setVisibleColumns] = useState<BikeListColumn[]>(
    () => initialPreferences.visible_columns?.filter(isBikeListColumn) ?? DEFAULT_BIKE_LIST_COLUMNS,
  )
  const [sortColumn, setSortColumn] = useState<BikeListSortColumn>(() =>
    isBikeListSortColumn(initialPreferences.sort_column) ? initialPreferences.sort_column : 'name',
  )
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    initialPreferences.sort_direction === 'desc' ? 'desc' : 'asc',
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const updatePreferences = useUpdateBikeListPreferences()

  function save(next: {
    visibleColumns: BikeListColumn[]
    sortColumn: BikeListSortColumn
    sortDirection: 'asc' | 'desc'
  }) {
    setSaveError(null)
    updatePreferences.mutate(
      {
        visible_columns: next.visibleColumns,
        sort_column: next.sortColumn,
        sort_direction: next.sortDirection,
      },
      { onError: (error) => setSaveError(parseApiError(error).baseErrors.join(', ') || 'Could not save your preferences.') },
    )
  }

  function handleColumnsChange(values: string[]) {
    const next = values.filter(isBikeListColumn)
    setVisibleColumns(next)
    save({ visibleColumns: next, sortColumn, sortDirection })
  }

  function handleSort(column: BikeListSortColumn) {
    const nextDirection: 'asc' | 'desc' =
      column === sortColumn && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortColumn(column)
    setSortDirection(nextDirection)
    save({ visibleColumns, sortColumn: column, sortDirection: nextDirection })
  }

  const orderedColumns = BIKE_LIST_COLUMNS.filter((column) => visibleColumns.includes(column))

  const sortedBikes = useMemo(() => {
    const accessor = columnValue[sortColumn]
    return bikes
      .map((bike, index) => ({ bike, index }))
      .sort((a, b) => {
        const av = accessor(a.bike)
        const bv = accessor(b.bike)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ bike }) => bike)
  }, [bikes, sortColumn, sortDirection])

  function sortIndicator(column: BikeListSortColumn) {
    if (column !== sortColumn) return null
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <MultiSelect
          label="Columns"
          placeholder="Add a column"
          data={BIKE_LIST_COLUMNS.map((column) => ({
            value: column,
            label: BIKE_LIST_COLUMN_LABELS[column],
          }))}
          value={visibleColumns}
          onChange={handleColumnsChange}
          clearable
          w={320}
        />
      </Group>

      {saveError && (
        <Alert color="red" mb="sm" onClose={() => setSaveError(null)} withCloseButton>
          {saveError}
        </Alert>
      )}

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
              Name{sortIndicator('name')}
            </Table.Th>
            {orderedColumns.map((column) => (
              <Table.Th
                key={column}
                onClick={() => handleSort(column)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                {BIKE_LIST_COLUMN_LABELS[column]}
                {sortIndicator(column)}
              </Table.Th>
            ))}
            <Table.Th />
            <Table.Th />
          </Table.Tr>
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
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}
