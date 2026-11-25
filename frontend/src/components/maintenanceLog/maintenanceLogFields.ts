import { dataListMinWidth, dataListTemplate, fieldMinWidth } from '../datalist/dataListModel'
import { categoryLabel } from '../../constants'
import { formatDistance } from '../../utils/distance'
import { formatShortDate } from '../../utils/datetime'
import type { MaintenanceLogEvent } from '../../types/models'

// The Maintenance list's Fields (Date and Service are always shown). The
// cap and defaults follow the brief: Component, Bike, Component km and
// Since last on, up to five at once.
export const MAINTENANCE_FIELDS = [
  'component',
  'bike',
  'component_km',
  'since_last',
  'category',
  'bike_km',
  'logged_on',
] as const

export type MaintenanceField = (typeof MAINTENANCE_FIELDS)[number]

export const DEFAULT_MAINTENANCE_FIELDS: MaintenanceField[] = ['component', 'bike', 'component_km', 'since_last']

export const MAX_MAINTENANCE_FIELDS = 5

export const MAINTENANCE_FIELD_LABELS: Record<MaintenanceField, string> = {
  component: 'Component',
  bike: 'Bike',
  component_km: 'Component km',
  since_last: 'Since last',
  category: 'Category',
  bike_km: 'Bike km',
  logged_on: 'Logged on',
}

// Which fields the header can sort by (Maintenance::EventLog's sorts).
export const SORTABLE_MAINTENANCE_FIELDS = ['component_km', 'since_last'] as const
export type MaintenanceSortField = (typeof SORTABLE_MAINTENANCE_FIELDS)[number]
export type MaintenanceSort = 'performed_at' | MaintenanceSortField

export const MAINTENANCE_SORTS: readonly MaintenanceSort[] = ['performed_at', ...SORTABLE_MAINTENANCE_FIELDS]

export function isMaintenanceField(value: string): value is MaintenanceField {
  return (MAINTENANCE_FIELDS as readonly string[]).includes(value)
}

export function isSortableField(value: string): value is MaintenanceSortField {
  return (SORTABLE_MAINTENANCE_FIELDS as readonly string[]).includes(value)
}

export const FIELD_OPTIONS = MAINTENANCE_FIELDS.map((field) => ({ key: field, label: MAINTENANCE_FIELD_LABELS[field] }))

// A plain-text cell value (the Component and Bike cells render their own
// links/dimmed text; these are their text forms, for the phone line too).
export function fieldText(event: MaintenanceLogEvent, field: MaintenanceField): string {
  switch (field) {
    case 'component':
      return event.component.label
    case 'bike':
      return event.bike?.name ?? 'Off the bike'
    case 'component_km':
      return formatDistance(event.component_distance_at_event_meters)
    case 'since_last':
      return event.since_last_same_type_meters == null ? '—' : formatDistance(event.since_last_same_type_meters)
    case 'category':
      return categoryLabel(event.component.category)
    case 'bike_km':
      return event.bike_distance_at_event_meters == null ? '—' : formatDistance(event.bike_distance_at_event_meters)
    case 'logged_on':
      return formatShortDate(event.created_at)
  }
}

// Each field's narrowest value, beside its header label (fieldMinWidth).
const VALUE_MIN: Record<MaintenanceField, number> = {
  component: 130,
  bike: 110,
  component_km: 96,
  since_last: 90,
  category: 100,
  bike_km: 90,
  logged_on: 84,
}

// The Maintenance DataList's columns: Date | icon gutter | Service | one
// per shown field | a trailing column (the session header's "View
// session ›"). Scrolls sideways under minWidth.
export function maintenanceListLayout(fields: readonly MaintenanceField[]): { template: string; minWidth: number } {
  const mins = fields.map((field) => fieldMinWidth(MAINTENANCE_FIELD_LABELS[field], VALUE_MIN[field]))
  const trailing = 100
  return {
    template: dataListTemplate({
      leading: ['88px', '32px'],
      main: 'minmax(240px, 1fr)',
      fields: [...mins.map((min) => `minmax(${min}px, auto)`), `minmax(${trailing}px, auto)`],
    }),
    minWidth: dataListMinWidth({ leading: [88, 32], main: 240, fields: [...mins, trailing] }),
  }
}
