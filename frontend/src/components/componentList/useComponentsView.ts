import { useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useUpdateTableViewPreference } from '../../api/mutations'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import {
  COMPONENT_LIST_FIELDS,
  COMPONENT_LIST_SORTS,
  DEFAULT_COMPONENT_LIST_FIELDS,
  type ComponentListField,
  type ComponentListSort,
} from '../../constants'
import {
  componentListPreferenceData,
  DEFAULT_COMPONENT_STATES,
  hasActiveFilters,
  isComponentGroupBy,
  isComponentState,
  isServiceFilter,
  type ComponentGroupBy,
  type ServiceFilter,
} from './componentListModel'
import type { ComponentState } from '../../utils/componentState'
import type { TableViewPreferenceData } from '../../types/models'

const TABLE_KEY = 'components'

interface ViewExtras {
  states: ComponentState[]
  group_by: ComponentGroupBy
  category: string | null
  bike_id: number | null
  service: ServiceFilter | null
}

// The Components list's saved view, all in its one TableViewPreference row
// ("components"): Fields and header sort (useTableViewPreferences), plus
// the state pills, Group by and the Category / Bike / Service status
// filters (extraData, the way useBikesView keeps its extras). A PATCH
// replaces the whole data value, so each save sends everything. The
// search box isn't saved (as on Activity): a stale search restored on
// every visit would hide components for no visible reason.
export function useComponentsView(storedData: TableViewPreferenceData) {
  const initialData = componentListPreferenceData(storedData)
  const [extras, setExtras] = useState<ViewExtras>(() => ({
    states: Array.isArray(initialData.states) ? initialData.states.filter(isComponentState) : DEFAULT_COMPONENT_STATES,
    group_by: isComponentGroupBy(initialData.group_by) ? initialData.group_by : 'category',
    category: typeof initialData.category === 'string' ? initialData.category : null,
    bike_id: typeof initialData.bike_id === 'number' ? initialData.bike_id : null,
    service: isServiceFilter(initialData.service) ? initialData.service : null,
  }))
  const [qInput, setQInput] = useState('')
  const [q] = useDebouncedValue(qInput, 200)
  const updatePreference = useUpdateTableViewPreference(TABLE_KEY)

  const table = useTableViewPreferences<ComponentListField, ComponentListSort>({
    tableKey: TABLE_KEY,
    initialData,
    allColumns: COMPONENT_LIST_FIELDS,
    defaultColumns: DEFAULT_COMPONENT_LIST_FIELDS,
    sortColumns: COMPONENT_LIST_SORTS,
    defaultSort: { column: 'component', direction: 'asc' },
    extraData: () => ({ ...extras }),
  })

  function update(next: Partial<ViewExtras>) {
    const merged = { ...extras, ...next }
    setExtras(merged)
    updatePreference.mutate({
      columns: table.orderedColumns,
      sort_column: table.sortColumn,
      sort_direction: table.sortDirection,
      ...merged,
    })
  }

  return {
    table,
    states: extras.states,
    toggleState(state: ComponentState) {
      update({ states: extras.states.includes(state) ? extras.states.filter((s) => s !== state) : [...extras.states, state] })
    },
    groupBy: extras.group_by,
    setGroupBy: (group_by: ComponentGroupBy) => update({ group_by }),
    category: extras.category,
    setCategory: (category: string | null) => update({ category }),
    bikeId: extras.bike_id,
    setBikeId: (bike_id: number | null) => update({ bike_id }),
    service: extras.service,
    setService: (service: ServiceFilter | null) => update({ service }),
    qInput,
    setQInput,
    q,
    hasActiveFilters: hasActiveFilters({ q: qInput, category: extras.category, bikeId: extras.bike_id, service: extras.service }),
    clearFilters() {
      setQInput('')
      update({ category: null, bike_id: null, service: null })
    },
  }
}

export type ComponentsView = ReturnType<typeof useComponentsView>
