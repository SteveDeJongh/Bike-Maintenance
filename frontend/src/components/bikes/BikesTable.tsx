import { useMemo, type ReactNode } from 'react'
import { Badge, Stack, Text } from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import DataList from '../datalist/DataList'
import DataListHeader, { type DataListColumn } from '../datalist/DataListHeader'
import DataListRow from '../datalist/DataListRow'
import { dataListMinWidth, dataListTemplate } from '../datalist/dataListModel'
import BikeStatusChip from '../bike/BikeStatusChip'
import { BIKE_LIST_COLUMN_LABELS, type BikeListColumn, type BikeListSortColumn } from '../../constants'
import { formatDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import { firstDirection, sortBikesTable } from './bikesTableModel'
import type { BikesViewState } from './useBikesView'
import type { BikeWithStats } from '../../types/models'

// Field columns that hold text rather than a metric: left-aligned, and
// sized by their content rather than a metric's minimum.
const TEXT_COLUMNS: readonly BikeListColumn[] = ['bike_type', 'status']
const FIELD_MIN = 84
const STATUS_MIN = 110
const MAIN_MIN = 200

function fieldMin(column: BikeListColumn): number {
  return column === 'status' ? STATUS_MIN : FIELD_MIN
}

function renderCell(column: BikeListColumn, bike: BikeWithStats, typeName: string | null): ReactNode {
  switch (column) {
    case 'bike_type':
      return typeName ?? '—'
    case 'status':
      return bike.retired_on ? (
        <Badge size="sm" color="gray" variant="light">
          Retired
        </Badge>
      ) : (
        <BikeStatusChip {...bike.status_counts} />
      )
    case 'total_distance':
      return formatDistance(bike.total_distance)
    case 'distance_this_year':
      return formatDistance(bike.distance_this_year)
    case 'ride_count':
      return bike.ride_count.toLocaleString()
    case 'last_ride_on':
      return bike.last_ride_on ? formatDate(bike.last_ride_on) : '—'
    case 'first_ride_on':
      return bike.first_ride_on ? formatDate(bike.first_ride_on) : '—'
    case 'acquired_on':
      return bike.acquired_on ? formatDate(bike.acquired_on) : '—'
    case 'average_power':
      return formatPower(bike.average_power)
    case 'total_moving_time':
      return formatDuration(bike.total_moving_time)
    case 'total_elevation_gain':
      return formatElevation(bike.total_elevation_gain)
    case 'installed_components_count':
      return String(bike.installed_components_count)
  }
}

// The Bikes table, in the Activity list's style (DataList): the name with
// make/model under it, then the chosen Fields. Header click sorts (again to
// flip); retired bikes always sit last, muted. No row actions -- the whole
// row opens the bike (Edit/Delete are on the bike page).
export default function BikesTable({
  bikes,
  table,
  typeNameById,
}: {
  bikes: BikeWithStats[]
  table: BikesViewState['table']
  typeNameById: Map<number, string>
}) {
  const navigate = useNavigate()
  const { orderedColumns: fields, sortColumn, sortDirection, setSort } = table

  const sorted = useMemo(
    () => sortBikesTable(bikes, sortColumn, sortDirection, typeNameById),
    [bikes, sortColumn, sortDirection, typeNameById],
  )

  const template = dataListTemplate({
    leading: [],
    main: `minmax(${MAIN_MIN}px, 1.4fr)`,
    fields: fields.map((column) => `minmax(${fieldMin(column)}px, auto)`),
  })
  const minWidth = dataListMinWidth({ leading: [], main: MAIN_MIN, fields: fields.map(fieldMin) })

  const columns: DataListColumn<BikeListSortColumn>[] = [
    { key: 'name', label: 'Bike' },
    ...fields.map((column) => ({
      key: column,
      label: BIKE_LIST_COLUMN_LABELS[column],
      align: TEXT_COLUMNS.includes(column) ? ('left' as const) : ('right' as const),
    })),
  ]

  function onSort(column: BikeListSortColumn) {
    if (column === sortColumn) setSort(column, sortDirection === 'asc' ? 'desc' : 'asc')
    else setSort(column, firstDirection(column))
  }

  if (sorted.length === 0) {
    return <Text c="dimmed">No bikes yet.</Text>
  }

  return (
    <DataList template={template} minWidth={minWidth}>
      <DataListHeader columns={columns} sortColumn={sortColumn} order={sortDirection} onSort={onSort} />
      {sorted.map((bike) => {
        const makeModel = [bike.make, bike.model].filter(Boolean).join(' ')
        const typeName = bike.bike_type_id === null ? null : (typeNameById.get(bike.bike_type_id) ?? null)
        return (
          <DataListRow
            key={bike.id}
            ariaLabel={`${bike.name}${bike.retired_on ? ', retired' : ''}, open bike`}
            onOpen={() => navigate(`/bikes/${bike.id}`)}
            tone={bike.retired_on ? 'muted' : undefined}
          >
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={600} truncate c={bike.retired_on ? 'dimmed' : undefined}>
                {bike.name}
              </Text>
              {makeModel && (
                <Text size="xs" c="dimmed" truncate>
                  {makeModel}
                </Text>
              )}
            </Stack>
            {fields.map((column) => {
              const text = TEXT_COLUMNS.includes(column)
              const bold = column === 'total_distance' && !bike.retired_on
              return (
                <Text
                  key={column}
                  component="div"
                  size="sm"
                  ta={text ? 'left' : 'right'}
                  c={bold ? undefined : 'dimmed'}
                  fw={bold ? 600 : undefined}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {renderCell(column, bike, typeName)}
                </Text>
              )
            })}
          </DataListRow>
        )
      })}
    </DataList>
  )
}
