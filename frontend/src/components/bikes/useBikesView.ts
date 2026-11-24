import { useState } from 'react'
import { useUpdateTableViewPreference } from '../../api/mutations'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import {
  BIKE_LIST_COLUMNS,
  BIKE_LIST_SORT_COLUMNS,
  DEFAULT_BIKE_LIST_COLUMNS,
  type BikeListColumn,
  type BikeListSortColumn,
} from '../../constants'
import { isBikeCardSort, isBikesView, type BikeCardSort, type BikesView } from './bikesList'
import type { TableViewPreferenceData } from '../../types/models'

// The Bikes page's saved view, all in its one TableViewPreference row
// ("bikes"): the table's Fields and header sort (useTableViewPreferences),
// plus Cards | Table, the card sort and Show retired (extraData, the way
// Activity keeps kinds and group_by). A PATCH replaces the whole data
// value, so each save sends everything.
export function useBikesView(initialData: TableViewPreferenceData) {
  const [view, setViewState] = useState<BikesView>(isBikesView(initialData.view) ? initialData.view : 'cards')
  const [cardSort, setCardSortState] = useState<BikeCardSort>(
    isBikeCardSort(initialData.card_sort) ? initialData.card_sort : 'urgent',
  )
  const [showRetired, setShowRetiredState] = useState(initialData.show_retired === true)
  const updatePreference = useUpdateTableViewPreference('bikes')

  const table = useTableViewPreferences<BikeListColumn, BikeListSortColumn>({
    tableKey: 'bikes',
    initialData,
    allColumns: BIKE_LIST_COLUMNS,
    defaultColumns: DEFAULT_BIKE_LIST_COLUMNS,
    sortColumns: BIKE_LIST_SORT_COLUMNS,
    defaultSort: { column: 'name', direction: 'asc' },
    extraData: () => ({ view, card_sort: cardSort, show_retired: showRetired }),
  })

  function saveAll(next: { view?: BikesView; card_sort?: BikeCardSort; show_retired?: boolean }) {
    updatePreference.mutate({
      columns: table.orderedColumns,
      sort_column: table.sortColumn,
      sort_direction: table.sortDirection,
      view: next.view ?? view,
      card_sort: next.card_sort ?? cardSort,
      show_retired: next.show_retired ?? showRetired,
    })
  }

  return {
    table,
    view,
    setView(value: BikesView) {
      setViewState(value)
      saveAll({ view: value })
    },
    cardSort,
    setCardSort(value: BikeCardSort) {
      setCardSortState(value)
      saveAll({ card_sort: value })
    },
    showRetired,
    setShowRetired(value: boolean) {
      setShowRetiredState(value)
      saveAll({ show_retired: value })
    },
  }
}

export type BikesViewState = ReturnType<typeof useBikesView>
