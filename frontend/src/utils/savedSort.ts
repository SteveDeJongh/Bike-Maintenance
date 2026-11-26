import type { TableViewPreferenceData } from '../types/models'

export interface Sort<SortColumn extends string> {
  column: SortColumn
  direction: 'asc' | 'desc'
}

// The sort a saved preference starts on. The saved direction only means
// something with its own column: when the saved column isn't a valid sort
// for this list any more (an old table's column on the same table_key),
// both fall back to the default -- never the default column with an old
// direction. A valid column with a missing or bad direction takes the
// default direction.
export function savedSort<SortColumn extends string>(
  data: Pick<TableViewPreferenceData, 'sort_column' | 'sort_direction'>,
  sortColumns: readonly SortColumn[],
  defaultSort: Sort<SortColumn>,
): Sort<SortColumn> {
  const column = data.sort_column
  if (typeof column !== 'string' || !(sortColumns as readonly string[]).includes(column)) return defaultSort
  const direction = data.sort_direction === 'asc' || data.sort_direction === 'desc' ? data.sort_direction : defaultSort.direction
  return { column: column as SortColumn, direction }
}
