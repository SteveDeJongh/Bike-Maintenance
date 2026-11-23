import { useMemo, useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useUpdateTableViewPreference } from '../../api/mutations'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import { daysAgoIso, startOfMonthIso, startOfWeekIso, startOfYearIso, todayIso } from './dateRanges'
import { ACTIVITY_UI_KINDS, DEFAULT_ACTIVITY_KINDS } from '../../constants'
import { ACTIVITY_FIELDS, DEFAULT_ACTIVITY_FIELDS, MAX_ACTIVITY_FIELDS, type ActivityField } from './activityFields'
import { canAddField, effectiveGroupBy, type GroupBy } from './activityListModel'
import type { ActivityUiKind, TableViewPreferenceData } from '../../types/models'

export type Order = 'asc' | 'desc'
export type ActivitySort = 'occurred_at' | ActivityField
export type DatePreset = 'this_week' | 'this_month' | 'this_year' | 'last_30_days' | 'custom'

function isActivityUiKind(value: string): value is ActivityUiKind {
  return (ACTIVITY_UI_KINDS as readonly string[]).includes(value)
}

// All of Activity's filter, sort, grouping and field state and the derived
// query params -- what the page (the feed query, the list) and the toolbar
// need.
export function useActivityFilters(initialData: TableViewPreferenceData) {
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
  const [groupBy, setGroupByState] = useState<GroupBy>(initialData.group_by === 'none' ? 'none' : 'week')

  const updatePreference = useUpdateTableViewPreference('activity_log')

  // Fields (the shown metric columns, capped at MAX_ACTIVITY_FIELDS) and the
  // header sort, persisted in the activity_log preference alongside kinds
  // and group_by (extraData, so a column/sort save never drops them).
  const {
    orderedColumns: fields,
    toggleColumn,
    reorderColumn,
    sortColumn,
    sortDirection,
    setSort,
    saveError,
    clearSaveError,
  } = useTableViewPreferences<ActivityField, ActivitySort>({
    tableKey: 'activity_log',
    initialData,
    allColumns: ACTIVITY_FIELDS,
    defaultColumns: DEFAULT_ACTIVITY_FIELDS,
    sortColumns: ['occurred_at', ...ACTIVITY_FIELDS] as const,
    defaultSort: { column: 'occurred_at', direction: 'desc' },
    extraData: () => ({ kinds, group_by: groupBy }),
  })
  const order: Order = sortDirection

  // Adding past the cap is a no-op (the picker also disables it).
  function toggleField(field: ActivityField) {
    if (!fields.includes(field) && !canAddField(fields, MAX_ACTIVITY_FIELDS)) return
    toggleColumn(field)
  }

  // Header sort: the active column flips; a new field starts biggest-first,
  // and Date goes back to newest-first.
  function onHeaderSort(column: ActivitySort) {
    if (column === sortColumn) setSort(column, sortDirection === 'asc' ? 'desc' : 'asc')
    else setSort(column, 'desc')
  }

  // The feed's sort param: 'date', or the field's own key.
  const apiSort = sortColumn === 'occurred_at' ? 'date' : sortColumn
  const listGroupBy = effectiveGroupBy(sortColumn, groupBy)

  // kinds and group_by aren't owned by useTableViewPreferences, but share
  // its TableViewPreference row -- a PATCH replaces the whole data value,
  // so each save sends everything.
  function saveAll(next: { kinds?: ActivityUiKind[]; group_by?: GroupBy }) {
    updatePreference.mutate({
      columns: fields,
      sort_column: sortColumn,
      sort_direction: sortDirection,
      kinds: next.kinds ?? kinds,
      group_by: next.group_by ?? groupBy,
    })
  }

  function toggleKind(kind: ActivityUiKind) {
    const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind]
    if (next.length === 0) return // at least one kind must stay selected
    setKinds(next)
    saveAll({ kinds: next })
  }

  function setGroupBy(value: GroupBy) {
    setGroupByState(value)
    saveAll({ group_by: value })
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
  }, [datePreset, customRange])

  function clearFilters() {
    setBikeId(undefined)
    setComponentId(undefined)
    setDatePreset(null)
    setCustomRange([null, null])
    setQInput('')
  }

  const hasActiveFilters = Boolean(bikeId || componentId || datePreset || q)

  return {
    kinds,
    toggleKind,
    bikeId,
    setBikeId,
    componentId,
    setComponentId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
    qInput,
    setQInput,
    q,
    order,
    sortColumn,
    onHeaderSort,
    setSort,
    apiSort,
    groupBy,
    setGroupBy,
    listGroupBy,
    fields,
    toggleField,
    reorderColumn,
    saveError,
    clearSaveError,
    tz,
    from,
    to,
    clearFilters,
    hasActiveFilters,
  }
}
