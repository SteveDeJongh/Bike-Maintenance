import type { ReactNode } from 'react'
import ServiceStatusBadge from '../ServiceStatusBadge'
import type { InstalledComponentColumn } from '../../constants'
import { formatDate } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { ComponentAssignmentWithStats } from '../../types/models'

// An installed component's Field cells (InstalledComponentsCard). Only
// filled slots render fields, so this takes a real assignment.
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
