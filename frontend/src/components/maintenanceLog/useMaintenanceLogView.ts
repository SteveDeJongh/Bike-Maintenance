import { useMemo, useState } from 'react'
import { useDebouncedValue } from '@mantine/hooks'
import { useUpdateTableViewPreference } from '../../api/mutations'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import { presetRange, type DatePreset } from '../activity/dateRanges'
import { canAddField } from '../datalist/dataListModel'
import {
  DEFAULT_MAINTENANCE_FIELDS,
  MAINTENANCE_FIELDS,
  MAINTENANCE_SORTS,
  MAX_MAINTENANCE_FIELDS,
  type MaintenanceField,
  type MaintenanceSort,
} from './maintenanceLogFields'
import {
  DEFAULT_DATE_PRESET,
  effectiveGroupBy,
  MAINTENANCE_KINDS,
  readMaintenanceView,
  viewBadgeCount,
  type MaintenanceGroupBy,
  type MaintenanceKind,
} from './maintenanceLogModel'
import type { MaintenanceLogParams } from '../../api/queries'
import type { TableViewPreferenceData } from '../../types/models'

const TABLE_KEY = 'maintenance_events'

type Range = [string | null, string | null]

// All of the Maintenance page's view state -- kinds, filters, grouping,
// Fields and sort -- plus the log query's params. Everything but the
// search text is saved in the maintenance_events preference (one row; a
// PATCH replaces the whole value, so each save sends everything).
export function useMaintenanceLogView(initialData: TableViewPreferenceData) {
  const saved = useMemo(() => readMaintenanceView(initialData), [initialData])
  const [kinds, setKinds] = useState<MaintenanceKind[]>(saved.kinds)
  const [groupBy, setGroupByState] = useState<MaintenanceGroupBy>(saved.groupBy)
  const [bikeId, setBikeIdState] = useState<number | undefined>(saved.bikeId)
  const [category, setCategoryState] = useState<string | undefined>(saved.category)
  const [serviceTypeId, setServiceTypeIdState] = useState<number | undefined>(saved.serviceTypeId)
  const [datePreset, setDatePresetState] = useState<DatePreset | null>(saved.datePreset)
  const [customRange, setCustomRangeState] = useState<Range>(saved.customRange)
  const [qInput, setQInput] = useState('')
  const [q] = useDebouncedValue(qInput.trim(), 300)

  const updatePreference = useUpdateTableViewPreference(TABLE_KEY)

  interface Extras {
    kinds: MaintenanceKind[]
    groupBy: MaintenanceGroupBy
    bikeId: number | undefined
    category: string | undefined
    serviceTypeId: number | undefined
    datePreset: DatePreset | null
    customRange: Range
  }

  // What this page keeps beside Fields and sort; `next` holds the values a
  // setter is about to change (an explicit undefined clears one).
  function extras(next: Partial<Extras> = {}) {
    const v: Extras = { kinds, groupBy, bikeId, category, serviceTypeId, datePreset, customRange, ...next }
    return {
      kinds: v.kinds,
      group_by: v.groupBy,
      bike_id: v.bikeId ?? null,
      category: v.category ?? null,
      service_type_id: v.serviceTypeId ?? null,
      date_preset: v.datePreset ?? 'all',
      date_range: v.customRange,
    }
  }

  const {
    orderedColumns: fields,
    toggleColumn,
    reorderColumn,
    sortColumn,
    sortDirection: order,
    setSort,
    saveError,
    clearSaveError,
  } = useTableViewPreferences<MaintenanceField, MaintenanceSort>({
    tableKey: TABLE_KEY,
    initialData: { ...initialData, columns: saved.fields },
    allColumns: MAINTENANCE_FIELDS,
    defaultColumns: DEFAULT_MAINTENANCE_FIELDS,
    sortColumns: MAINTENANCE_SORTS,
    defaultSort: { column: 'performed_at', direction: 'desc' },
    extraData: () => extras(),
  })

  function save(next: Partial<Extras>) {
    updatePreference.mutate({ columns: fields, sort_column: sortColumn, sort_direction: order, ...extras(next) })
  }

  // Adding past the cap is a no-op (the picker also disables it).
  function toggleField(field: MaintenanceField) {
    if (!fields.includes(field) && !canAddField(fields, MAX_MAINTENANCE_FIELDS)) return
    toggleColumn(field)
  }

  // Header sort: the active column flips; a field starts biggest-first and
  // Date goes back to newest-first.
  function onHeaderSort(column: MaintenanceSort) {
    if (column === sortColumn) setSort(column, order === 'asc' ? 'desc' : 'asc')
    else setSort(column, 'desc')
  }

  function toggleKind(kind: MaintenanceKind) {
    const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : MAINTENANCE_KINDS.filter((k) => k === kind || kinds.includes(k))
    if (next.length === 0) return // at least one kind stays on
    setKinds(next)
    save({ kinds: next })
  }

  function setGroupBy(value: MaintenanceGroupBy) {
    setGroupByState(value)
    save({ groupBy: value })
  }

  function setBikeId(value: number | undefined) {
    setBikeIdState(value)
    save({ bikeId: value })
  }

  function setCategory(value: string | undefined) {
    setCategoryState(value)
    save({ category: value })
  }

  function setServiceTypeId(value: number | undefined) {
    setServiceTypeIdState(value)
    save({ serviceTypeId: value })
  }

  function setDatePreset(value: DatePreset | null) {
    setDatePresetState(value)
    save({ datePreset: value })
  }

  function setCustomRange(value: Range) {
    setCustomRangeState(value)
    save({ customRange: value })
  }

  const hasActiveFilters = Boolean(
    kinds.length !== MAINTENANCE_KINDS.length || bikeId || category || serviceTypeId || datePreset !== DEFAULT_DATE_PRESET || q,
  )

  function clearFilters() {
    const reset = {
      kinds: [...MAINTENANCE_KINDS],
      bikeId: undefined,
      category: undefined,
      serviceTypeId: undefined,
      datePreset: DEFAULT_DATE_PRESET,
      customRange: [null, null] as Range,
    }
    setKinds(reset.kinds)
    setBikeIdState(undefined)
    setCategoryState(undefined)
    setServiceTypeIdState(undefined)
    setDatePresetState(reset.datePreset)
    setCustomRangeState(reset.customRange)
    setQInput('')
    save(reset)
  }

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const { from, to } = useMemo(() => presetRange(datePreset, customRange), [datePreset, customRange])
  const listGroupBy = effectiveGroupBy(sortColumn, groupBy)

  const params: MaintenanceLogParams = {
    kinds,
    bikeId,
    category,
    serviceTypeId,
    from,
    to,
    tz,
    q: q || undefined,
    group: listGroupBy === 'flat' ? 'none' : listGroupBy,
    sort: sortColumn === 'performed_at' ? 'date' : sortColumn,
    order,
  }

  return {
    params,
    kinds,
    toggleKind,
    groupBy,
    setGroupBy,
    listGroupBy,
    bikeId,
    setBikeId,
    category,
    setCategory,
    serviceTypeId,
    setServiceTypeId,
    datePreset,
    setDatePreset,
    customRange,
    setCustomRange,
    qInput,
    setQInput,
    fields,
    toggleField,
    reorderColumn,
    sortColumn,
    order,
    setSort,
    onHeaderSort,
    saveError,
    clearSaveError,
    hasActiveFilters,
    clearFilters,
    viewBadge: viewBadgeCount({ kinds, groupBy, fields, sort: sortColumn, order }),
  }
}

export type MaintenanceLogView = ReturnType<typeof useMaintenanceLogView>
