import type { ReactNode } from 'react'
import ServiceStatusBadge from '../ServiceStatusBadge'
import {
  INSTALLED_COMPONENT_COLUMN_LABELS,
  INSTALLED_COMPONENT_COLUMNS,
  SERVICE_STATUS_SEVERITY,
  type InstalledComponentColumn,
  type InstalledComponentSortColumn,
} from '../../constants'
import { formatDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { BikeComponentSlot, ComponentAssignmentWithStats } from '../../types/models'

// The sentinel EmptySlotRow's component picker uses for its own "+ Create
// new <category>" option -- only that form needs it.
export const CREATE_NEW_COMPONENT = '__create_new__'

export const INSTALLED_COMPONENT_COLUMN_OPTIONS = INSTALLED_COMPONENT_COLUMNS.map((column) => ({
  key: column,
  label: INSTALLED_COMPONENT_COLUMN_LABELS[column],
}))

// MobileSortControl needs a label for every sortable column, including the
// pinned columns that INSTALLED_COMPONENT_COLUMN_LABELS doesn't carry, since
// neither is one of the toggleable columns.
export const INSTALLED_COMPONENT_SORT_COLUMN_LABELS: Record<InstalledComponentSortColumn, string> = {
  category: 'Category',
  ride_context: 'Ride Context',
  component_label: 'Component',
  ...INSTALLED_COMPONENT_COLUMN_LABELS,
}

// One row in the Installed-components table, one per real BikeComponentSlot
// -- either occupied (assignment set) or empty (unset, offers the slot's
// own ride context -- fixed if the slot is split, a free choice if it's
// "both").
export interface InstalledComponentRowEntry {
  slot: BikeComponentSlot
  assignment?: ComponentAssignmentWithStats
}

// Rendering only ever happens for occupied Installed-components rows (empty
// slots render the install-flow controls instead), so this operates
// directly on a real assignment, same as History's renderer.
export const installedComponentRenderer: Record<InstalledComponentColumn, (a: ComponentAssignmentWithStats) => ReactNode> = {
  period_distance: (a) => formatDistance(a.distance_meters),
  period_time: (a) => formatDuration(a.moving_time),
  period_elevation: (a) => formatElevation(a.elevation_gain),
  period_avg_power: (a) => formatPower(a.average_power),
  component_total_distance: (a) => formatDistance(a.component.total_distance),
  component_total_time: (a) => formatDuration(a.component.total_moving_time),
  component_total_elevation: (a) => formatElevation(a.component.total_elevation_gain),
  component_avg_power: (a) => formatPower(a.component.average_power),
  service_status: (a) => <ServiceStatusBadge status={a.component.service_status} />,
  installed_on: (a) => formatDate(a.started_at),
}

// Installed-components sorting has to account for empty (unoccupied) slots,
// which have no assignment yet — null sorts last, same convention used
// everywhere else in this app.
export const installedComponentValue: Record<
  InstalledComponentSortColumn,
  (data: InstalledComponentRowEntry) => string | number | null
> = {
  category: ({ slot }) => slot.category,
  ride_context: ({ slot, assignment }) => assignment?.ride_context ?? (slot.ride_context !== 'both' ? slot.ride_context : null),
  component_label: ({ assignment }) => assignment?.component.label ?? null,
  period_distance: ({ assignment }) => assignment?.distance_meters ?? null,
  period_time: ({ assignment }) => assignment?.moving_time ?? null,
  period_elevation: ({ assignment }) => assignment?.elevation_gain ?? null,
  period_avg_power: ({ assignment }) => assignment?.average_power ?? null,
  component_total_distance: ({ assignment }) => assignment?.component.total_distance ?? null,
  component_total_time: ({ assignment }) => assignment?.component.total_moving_time ?? null,
  component_total_elevation: ({ assignment }) => assignment?.component.total_elevation_gain ?? null,
  component_avg_power: ({ assignment }) => assignment?.component.average_power ?? null,
  service_status: ({ assignment }) =>
    assignment?.component.service_status ? SERVICE_STATUS_SEVERITY[assignment.component.service_status] : null,
  installed_on: ({ assignment }) => assignment?.started_at ?? null,
}
