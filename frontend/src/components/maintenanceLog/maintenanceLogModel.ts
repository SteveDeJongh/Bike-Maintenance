import { isDatePreset, type DatePreset } from '../activity/dateRanges'
import { formatShortDate } from '../../utils/datetime'
import {
  DEFAULT_MAINTENANCE_FIELDS,
  isMaintenanceField,
  MAX_MAINTENANCE_FIELDS,
  type MaintenanceField,
  type MaintenanceSort,
} from './maintenanceLogFields'
import type { ComponentTileCounts } from '../componentList/componentListModel'
import type { Bike, MaintenanceLogMeta, TableViewPreferenceData } from '../../types/models'

export type MaintenanceKind = 'session' | 'single'
export type MaintenanceGroupBy = 'month' | 'component' | 'none'

export const MAINTENANCE_KINDS: readonly MaintenanceKind[] = ['session', 'single']
export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = { session: 'Sessions', single: 'Single events' }
export const GROUP_BY_OPTIONS: { value: MaintenanceGroupBy; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'component', label: 'Component' },
  { value: 'none', label: 'None' },
]

export const DEFAULT_DATE_PRESET: DatePreset = 'this_year'

export interface MaintenanceView {
  fields: MaintenanceField[]
  kinds: MaintenanceKind[]
  groupBy: MaintenanceGroupBy
  bikeId: number | undefined
  category: string | undefined
  serviceTypeId: number | undefined
  // null is All time.
  datePreset: DatePreset | null
  customRange: [string | null, string | null]
}

const isKind = (value: string): value is MaintenanceKind => (MAINTENANCE_KINDS as readonly string[]).includes(value)
const isGroupBy = (value: unknown): value is MaintenanceGroupBy => GROUP_BY_OPTIONS.some((option) => option.value === value)
const positiveId = (value: unknown) => (typeof value === 'number' && value > 0 ? value : undefined)
const isoDay = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) ? value : null)

// The saved maintenance_events preference, validated: unknown or old
// values (the old table's columns) drop back to the defaults -- Fields
// fall back to the defaults when none of the saved ones survive.
export function readMaintenanceView(data: TableViewPreferenceData): MaintenanceView {
  const fields = (data.columns ?? []).filter(isMaintenanceField).slice(0, MAX_MAINTENANCE_FIELDS)
  const kinds = (data.kinds ?? []).filter(isKind)
  const range = Array.isArray(data.date_range) ? data.date_range : []
  return {
    fields: fields.length > 0 ? fields : DEFAULT_MAINTENANCE_FIELDS,
    kinds: kinds.length > 0 ? MAINTENANCE_KINDS.filter((kind) => kinds.includes(kind)) : [...MAINTENANCE_KINDS],
    groupBy: isGroupBy(data.group_by) ? data.group_by : 'month',
    bikeId: positiveId(data.bike_id),
    category: typeof data.category === 'string' && data.category ? data.category : undefined,
    serviceTypeId: positiveId(data.service_type_id),
    datePreset: data.date_preset === 'all' ? null : isDatePreset(data.date_preset) ? data.date_preset : DEFAULT_DATE_PRESET,
    customRange: [isoDay(range[0]), isoDay(range[1])],
  }
}

// Sorting by a field lists services by that number, so bands and session
// headers no longer mean anything -- the list is flat while a field sort
// is active, and the saved grouping comes back with Date.
export function effectiveGroupBy(sort: MaintenanceSort, saved: MaintenanceGroupBy): MaintenanceGroupBy | 'flat' {
  return sort === 'performed_at' ? saved : 'flat'
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, i) => value === b[i])

// The phone View button's badge: how many of its choices (kinds, Group by,
// Fields, Sort) differ from the defaults.
export function viewBadgeCount(view: {
  kinds: MaintenanceKind[]
  groupBy: MaintenanceGroupBy
  fields: MaintenanceField[]
  sort: MaintenanceSort
  order: 'asc' | 'desc'
}): number {
  return [
    view.kinds.length !== MAINTENANCE_KINDS.length,
    view.groupBy !== 'month',
    !sameList(view.fields, DEFAULT_MAINTENANCE_FIELDS),
    view.sort !== 'performed_at' || view.order !== 'desc',
  ].filter(Boolean).length
}

// Log service session's bike: the active bike ridden most recently, else
// the first active one by name; undefined with no active bike.
export function defaultSessionBike<B extends Pick<Bike, 'id' | 'name' | 'retired_on'> & { last_ride_on: string | null }>(
  bikes: readonly B[] | undefined,
): B | undefined {
  const active = (bikes ?? []).filter((bike) => !bike.retired_on)
  const ridden = (bike: B) => (bike.last_ride_on ? Date.parse(bike.last_ride_on) : -Infinity)
  return [...active].sort((a, b) => ridden(b) - ridden(a) || a.name.localeCompare(b.name))[0]
}

export interface MaintenanceTile {
  label: string
  value: string
  color?: string
}

// The five tiles. The meta ones ignore the filters; Due · soon is the
// Components page tile's own count (componentTileCounts), so the two pages
// always agree.
export function maintenanceTiles(
  tiles: MaintenanceLogMeta['tiles'] | undefined,
  componentCounts: Pick<ComponentTileCounts, 'due' | 'soon'> | undefined,
  now: Date = new Date(),
): MaintenanceTile[] {
  const dash = '—'
  const attention = componentCounts ? componentCounts.due + componentCounts.soon > 0 : false
  return [
    { label: 'Services this year', value: tiles ? tiles.services_this_year.toLocaleString() : dash },
    { label: 'Sessions', value: tiles ? tiles.sessions_this_year.toLocaleString() : dash },
    { label: 'Last service', value: tiles?.last_service_at ? formatShortDate(tiles.last_service_at, now) : dash },
    {
      label: 'Due · soon',
      value: componentCounts ? `${componentCounts.due} · ${componentCounts.soon}` : dash,
      color: attention ? 'orange' : undefined,
    },
    {
      label: 'Most serviced',
      value: tiles?.most_serviced ? `${tiles.most_serviced.label} · ${tiles.most_serviced.count}` : dash,
    },
  ]
}

// The phone header's dimmed line: "86 services this year".
export function servicesThisYearLine(count: number | undefined): string {
  if (count == null) return ''
  return `${count.toLocaleString()} ${count === 1 ? 'service' : 'services'} this year`
}
