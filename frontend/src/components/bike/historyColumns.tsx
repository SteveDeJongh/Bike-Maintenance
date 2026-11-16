import type { ReactNode } from 'react'
import { HISTORY_COLUMN_LABELS, HISTORY_COLUMNS, type HistoryColumn, type HistorySortColumn } from '../../constants'
import { formatDateTime } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { ComponentAssignmentWithStats } from '../../types/models'

export const HISTORY_COLUMN_OPTIONS = HISTORY_COLUMNS.map((column) => ({
  key: column,
  label: HISTORY_COLUMN_LABELS[column],
}))

// MobileSortControl needs a label for every sortable column, including the
// pinned columns that HISTORY_COLUMN_LABELS doesn't carry, since neither is
// one of the toggleable columns.
export const HISTORY_SORT_COLUMN_LABELS: Record<HistorySortColumn, string> = {
  category: 'Category',
  component_label: 'Component',
  ...HISTORY_COLUMN_LABELS,
}

export const historyRenderer: Record<HistoryColumn, (a: ComponentAssignmentWithStats) => ReactNode> = {
  period_distance: (a) => formatDistance(a.distance_meters),
  period_time: (a) => formatDuration(a.moving_time),
  period_elevation: (a) => formatElevation(a.elevation_gain),
  period_avg_power: (a) => formatPower(a.average_power),
  component_total_distance: (a) => formatDistance(a.component.total_distance),
  component_total_time: (a) => formatDuration(a.component.total_moving_time),
  component_total_elevation: (a) => formatElevation(a.component.total_elevation_gain),
  component_avg_power: (a) => formatPower(a.component.average_power),
  started_on: (a) => formatDateTime(a.started_at),
  ended_on: (a) => formatDateTime(a.ended_at),
}

export const historyValue: Record<HistorySortColumn, (a: ComponentAssignmentWithStats) => string | number | null> = {
  category: (a) => a.component.category,
  component_label: (a) => a.component.label,
  period_distance: (a) => a.distance_meters,
  period_time: (a) => a.moving_time,
  period_elevation: (a) => a.elevation_gain,
  period_avg_power: (a) => a.average_power,
  component_total_distance: (a) => a.component.total_distance,
  component_total_time: (a) => a.component.total_moving_time,
  component_total_elevation: (a) => a.component.total_elevation_gain,
  component_avg_power: (a) => a.component.average_power,
  started_on: (a) => a.started_at,
  ended_on: (a) => a.ended_at,
}
