import { RIDE_CONTEXT_LABELS } from '../../constants'
import { installationRange, lastDoneText, requirementFraction } from '../component/componentPageModel'
import { formatShortDate } from '../../utils/datetime'
import type { InstallationStatus } from '../../utils/installationStatus'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatDrivingRemaining } from '../../utils/serviceInterval'
import type {
  ComponentAssignment,
  ComponentCurrentBike,
  ComponentServiceRequirementWithStatus,
  ServiceStatus,
} from '../../types/models'

// The installation modal's pure helpers (docs/frontend-ui.md, "Installation
// modal"). Current = the assignment is still open; past = it has ended.

type Bike = { id: number; name: string }

export type WhereItIs =
  | {
      kind: 'current'
      bike: Bike
      since: string
      rideContext: ComponentAssignment['ride_context']
      alsoOn: Bike[]
      // Still open, but on a retired bike: "On <bike> (retired) since …".
      retiredBike: boolean
    }
  | { kind: 'past'; bike: Bike; range: string; rideContext: ComponentAssignment['ride_context'] }

// Where this installation is (or was). A shared cassette's other current
// bikes come from the component's current_bikes, A-Z, this one left out.
export function whereItIs(
  assignment: Pick<ComponentAssignment, 'bike_id' | 'started_at' | 'ended_at' | 'ride_context'>,
  bikeName: string,
  componentCurrentBikes: readonly ComponentCurrentBike[] = [],
  bikeRetired = false,
): WhereItIs {
  const bike = { id: assignment.bike_id, name: bikeName }
  if (assignment.ended_at) {
    return { kind: 'past', bike, range: installationRange(assignment), rideContext: assignment.ride_context }
  }
  const alsoOn = componentCurrentBikes
    .filter((other) => other.id !== assignment.bike_id)
    .map((other) => ({ id: other.id, name: other.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { kind: 'current', bike, since: assignment.started_at, rideContext: assignment.ride_context, alsoOn, retiredBike: bikeRetired }
}

// The same as plain text: "On Soloist since Oct 15 · All rides · also on
// Juan Solo", "Was on Soloist · Jun 2 → Sep 30, 2026 · Trainer only". The
// modal renders these words with the bikes linked and the context as a chip.
export function whereItIsText(where: WhereItIs, now: Date = new Date()): string {
  const context = RIDE_CONTEXT_LABELS[where.rideContext]
  if (where.kind === 'past') return `Was on ${where.bike.name} · ${where.range} · ${context}`
  const also = where.alsoOn.length ? ` · also on ${where.alsoOn.map((bike) => bike.name).join(', ')}` : ''
  return `On ${where.bike.name}${where.retiredBike ? ' (retired)' : ''} since ${formatShortDate(where.since, now)} · ${context}${also}`
}

export type InstallationAction = 'log_service' | 'edit' | 'remove'

// By installationStatus: current -- Log service, Edit installation, Remove
// from bike; left on a retired bike -- Edit and Remove only (no service to
// log, no swap); past -- only Edit installation (its dates and context can
// still be corrected).
export function installationActions(status: InstallationStatus): InstallationAction[] {
  if (status === 'past') return ['edit']
  return status === 'retired_bike' ? ['edit', 'remove'] : ['log_service', 'edit', 'remove']
}

// Under "This installation": the component's totals over every stint.
export function lifetimeLine(component: { total_distance: number; total_moving_time: number }): string {
  return `Lifetime across all installations: ${formatDistance(component.total_distance)} · ${formatDuration(component.total_moving_time)}`
}

export function intervalCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'interval' : 'intervals'}`
}

export interface ServiceStatusRow {
  id: number
  name: string
  // "Last done Nov 14" / "Since install".
  lastDone: string
  fraction: number
  status: ServiceStatus
  // "4 km left" / "120 km over", in the status colour.
  remaining: string
}

// The modal's read-only Service status: one compact row per enabled
// interval, in the server's order. Editing is on the component page.
export function serviceStatusRows(
  requirements: readonly ComponentServiceRequirementWithStatus[],
  now: Date = new Date(),
): ServiceStatusRow[] {
  return requirements
    .filter((requirement) => requirement.enabled)
    .map((requirement) => ({
      id: requirement.id,
      name: requirement.requirement_name,
      lastDone: lastDoneText(requirement, now),
      fraction: requirementFraction(requirement),
      status: requirement.status,
      remaining: formatDrivingRemaining(requirement),
    }))
}
