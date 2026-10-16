import { useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { parseApiError } from '../api/errors'
import { useUpdateTableViewPreference } from '../api/mutations'
import type { TableViewPreferenceData } from '../types/models'

interface UseTableViewPreferencesOptions<Column extends string, SortColumn extends string> {
  tableKey: string
  // Must already be resolved by the caller (e.g. via useTableViewPreference)
  // before this hook is first called — its useState initializers only seed
  // from this once, on mount. If a page ever keeps the same mounted
  // component while switching tableKey (e.g. tabs that don't unmount),
  // the caller must put key={tableKey} on it to force a clean remount.
  initialData: TableViewPreferenceData
  allColumns: readonly Column[]
  defaultColumns: Column[]
  sortColumns: readonly SortColumn[]
  defaultSort: { column: SortColumn; direction: 'asc' | 'desc' }
}

export function useTableViewPreferences<Column extends string, SortColumn extends string>({
  tableKey,
  initialData,
  allColumns,
  defaultColumns,
  sortColumns,
  defaultSort,
}: UseTableViewPreferencesOptions<Column, SortColumn>) {
  function isColumn(value: string): value is Column {
    return (allColumns as readonly string[]).includes(value)
  }

  function isSortColumn(value: string | null | undefined): value is SortColumn {
    return typeof value === 'string' && (sortColumns as readonly string[]).includes(value)
  }

  const [orderedColumns, setOrderedColumns] = useState<Column[]>(
    () => initialData.columns?.filter(isColumn) ?? defaultColumns,
  )
  const [sortColumn, setSortColumn] = useState<SortColumn>(() =>
    isSortColumn(initialData.sort_column) ? initialData.sort_column : defaultSort.column,
  )
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    initialData.sort_direction === 'desc' || initialData.sort_direction === 'asc'
      ? initialData.sort_direction
      : defaultSort.direction,
  )
  const [saveError, setSaveError] = useState<string | null>(null)
  const updatePreference = useUpdateTableViewPreference(tableKey)

  function save(next: { columns: Column[]; sortColumn: SortColumn; sortDirection: 'asc' | 'desc' }) {
    setSaveError(null)
    updatePreference.mutate(
      { columns: next.columns, sort_column: next.sortColumn, sort_direction: next.sortDirection },
      {
        onError: (error) =>
          setSaveError(parseApiError(error).baseErrors.join(', ') || 'Could not save your preferences.'),
      },
    )
  }

  function toggleColumn(column: Column) {
    const next = orderedColumns.includes(column)
      ? orderedColumns.filter((c) => c !== column)
      : [...orderedColumns, column]
    setOrderedColumns(next)
    save({ columns: next, sortColumn, sortDirection })
  }

  function reorderColumn(activeKey: Column, overKey: Column) {
    if (activeKey === overKey) return
    const oldIndex = orderedColumns.indexOf(activeKey)
    const newIndex = orderedColumns.indexOf(overKey)
    if (oldIndex === -1 || newIndex === -1) return

    const next = arrayMove(orderedColumns, oldIndex, newIndex)
    setOrderedColumns(next)
    save({ columns: next, sortColumn, sortDirection })
  }

  function setSort(column: SortColumn) {
    const nextDirection: 'asc' | 'desc' = column === sortColumn && sortDirection === 'asc' ? 'desc' : 'asc'
    setSortColumn(column)
    setSortDirection(nextDirection)
    save({ columns: orderedColumns, sortColumn: column, sortDirection: nextDirection })
  }

  return {
    orderedColumns,
    toggleColumn,
    reorderColumn,
    sortColumn,
    sortDirection,
    setSort,
    saveError,
    clearSaveError: () => setSaveError(null),
  }
}
