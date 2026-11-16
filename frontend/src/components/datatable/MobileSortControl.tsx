import { ActionIcon, Group, Select } from '@mantine/core'

interface MobileSortControlProps<SortColumn extends string> {
  sortColumns: readonly SortColumn[]
  // Must cover every key in sortColumns, including a pinned sortable
  // column the table's own toggleable-column label map doesn't carry (e.g.
  // Bikes' "name") -- the caller builds this union once, the same way it
  // already builds sortColumns itself (see BIKE_LIST_SORT_COLUMNS).
  columnLabels: Record<SortColumn, string>
  sortColumn: SortColumn
  sortDirection: 'asc' | 'desc'
  // Always called with both column and direction explicit -- picking a
  // new column keeps the current direction rather than resetting it, and
  // the toggle button keeps the current column. Wire straight to
  // useTableViewPreferences' setSort(column, direction), which saves
  // through the same path as the desktop header click does.
  onChange: (column: SortColumn, direction: 'asc' | 'desc') => void
}

// Card view has no column headers to click for sorting, so this is its own
// compact replacement: a Select of the sortable columns plus an asc/desc
// toggle, same ▲/▼ glyphs the desktop header cells already use. Omitted
// entirely by a page whose table has no click-to-sort at all (bike_rides,
// activity_log) -- those pass no sortColumns here in the first place.
export default function MobileSortControl<SortColumn extends string>({
  sortColumns,
  columnLabels,
  sortColumn,
  sortDirection,
  onChange,
}: MobileSortControlProps<SortColumn>) {
  const options = sortColumns.map((column) => ({ value: column, label: columnLabels[column] }))

  return (
    <Group gap="xs" wrap="nowrap">
      <Select
        data={options}
        value={sortColumn}
        onChange={(value) => value && onChange(value as SortColumn, sortDirection)}
        allowDeselect={false}
        aria-label="Sort by"
        style={{ flex: 1 }}
      />
      <ActionIcon
        variant="default"
        size={44}
        onClick={() => onChange(sortColumn, sortDirection === 'asc' ? 'desc' : 'asc')}
        aria-label={sortDirection === 'asc' ? 'Sorted ascending, tap for descending' : 'Sorted descending, tap for ascending'}
      >
        {sortDirection === 'asc' ? '▲' : '▼'}
      </ActionIcon>
    </Group>
  )
}
