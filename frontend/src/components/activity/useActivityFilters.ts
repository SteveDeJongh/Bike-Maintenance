import { useMemo, useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useUpdateTableViewPreference } from '../../api/mutations'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import { daysAgoIso, startOfMonthIso, startOfWeekIso, startOfYearIso, todayIso } from './dateRanges'
import { ACTIVITY_LOG_COLUMNS, ACTIVITY_UI_KINDS, DEFAULT_ACTIVITY_KINDS, DEFAULT_ACTIVITY_LOG_COLUMNS, type ActivityLogColumn } from '../../constants'
import type { ActivityUiKind, TableViewPreferenceData } from '../../types/models'

export type Order = 'asc' | 'desc'
export type SortMetric = 'date' | 'distance'
export type DatePreset = 'this_week' | 'this_month' | 'this_year' | 'last_30_days' | 'custom'

function isActivityUiKind(value: string): value is ActivityUiKind {
  return (ACTIVITY_UI_KINDS as readonly string[]).includes(value)
}

// All of Activity's filter state and derived query params, including the
// extraData kinds persistence and the prevRideOnly sync -- moved as-is out
// of ActivityInner. Returns what both the page (the feed query, the table/
// card columns) and the filter bar need.
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
  const [sortMetric, setSortMetric] = useState<SortMetric>('date')

  const rideOnly = kinds.length === 1 && kinds[0] === 'ride'

  // Sort-by-distance only makes sense with Rides as the sole selected kind
  // (GET /activity's own 422 rule) -- adjusted during render (React's
  // documented "resetting state when a prop changes" pattern) rather than
  // an effect, same convention as the Rides tab's own filter-reset logic.
  const [prevRideOnly, setPrevRideOnly] = useState(rideOnly)
  if (prevRideOnly !== rideOnly) {
    setPrevRideOnly(rideOnly)
    if (!rideOnly && sortMetric === 'distance') setSortMetric('date')
  }

  const updatePreference = useUpdateTableViewPreference('activity_log')

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
  } = useTableViewPreferences<ActivityLogColumn, 'occurred_at'>({
    tableKey: 'activity_log',
    initialData,
    allColumns: ACTIVITY_LOG_COLUMNS,
    defaultColumns: DEFAULT_ACTIVITY_LOG_COLUMNS,
    sortColumns: ['occurred_at'] as const,
    defaultSort: { column: 'occurred_at', direction: 'desc' },
    extraData: () => ({ kinds }),
  })
  const order: Order = sortDirection

  function handleOrderChange(value: string) {
    const desired: Order = value === 'newest' ? 'desc' : 'asc'
    if (order !== desired) setSort('occurred_at')
  }

  // The kind chips aren't owned by useTableViewPreferences (that hook only
  // manages columns/sort), but they're persisted in the same
  // TableViewPreference row -- so every save here still has to include the
  // current columns/sort, the same way useTableViewPreferences' own saves
  // now include kinds via its extraData option.
  function toggleKind(kind: ActivityUiKind) {
    const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind]
    if (next.length === 0) return // at least one kind must stay selected
    setKinds(next)
    updatePreference.mutate({ columns: orderedColumns, sort_column: sortColumn, sort_direction: sortDirection, kinds: next })
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
    sortMetric,
    setSortMetric,
    rideOnly,
    order,
    handleOrderChange,
    orderedColumns,
    toggleColumn,
    reorderColumn,
    onHeaderDragEnd,
    saveError,
    clearSaveError,
    tz,
    from,
    to,
    clearFilters,
    hasActiveFilters,
  }
}
