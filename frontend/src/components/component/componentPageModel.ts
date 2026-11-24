import { RIDE_CONTEXT_LABELS, SERVICE_STATUS_SEVERITY } from '../../constants'
import { componentState } from '../../utils/componentState'
import { formatShortDate } from '../../utils/datetime'
import type { ComponentDetail, ComponentServiceRequirementWithStatus, ServiceStatus } from '../../types/models'

// The component page's pure helpers (docs/frontend-ui.md, "Component page").

// The header chip: the worst enabled requirement's status (severity, then
// how far along), or null with no enabled interval.
export function worstRequirementStatus(requirements: readonly ComponentServiceRequirementWithStatus[]): ServiceStatus | null {
  let worst: ComponentServiceRequirementWithStatus | null = null
  for (const requirement of requirements) {
    if (!requirement.enabled) continue
    if (
      !worst ||
      SERVICE_STATUS_SEVERITY[requirement.status] > SERVICE_STATUS_SEVERITY[worst.status] ||
      (requirement.status === worst.status && requirementFraction(requirement) > requirementFraction(worst))
    ) {
      worst = requirement
    }
  }
  return worst?.status ?? null
}

// How far along the driving dimension is: used / (used + remaining), 0..1
// (over 1 when overdue).
export function requirementFraction(requirement: ComponentServiceRequirementWithStatus): number {
  const { used, remaining } = drivingAmounts(requirement)
  if (used == null || remaining == null) return 0
  const total = used + remaining
  return total > 0 ? used / total : 0
}

export function drivingAmounts(requirement: ComponentServiceRequirementWithStatus): {
  used: number | null
  remaining: number | null
} {
  switch (requirement.driving_dimension) {
    case 'distance':
      return { used: requirement.distance_used_meters, remaining: requirement.distance_remaining_meters }
    case 'moving_time':
      return { used: requirement.moving_time_used_seconds, remaining: requirement.moving_time_remaining_seconds }
    case 'days':
      return { used: requirement.days_used, remaining: requirement.days_remaining }
    default:
      return { used: null, remaining: null }
  }
}

// Where the component is, for the header's dimmed line. Installed: its
// bike(s) A-Z (a shared cassette has two), since the earliest open
// assignment, and that assignment's ride context. Otherwise the last bike
// (spare or retired) or none.
export type ComponentPlacement =
  | { kind: 'installed'; bikes: { id: number; name: string }[]; since: string | null; rideContext: string }
  | { kind: 'spare' | 'retired'; lastBike: { id: number; name: string } | null }

export function componentPlacement(component: ComponentDetail): ComponentPlacement {
  const state = componentState(component)
  if (state !== 'installed') return { kind: state, lastBike: component.last_bike }

  const open = component.assignments.filter((assignment) => assignment.ended_at == null)
  const since = open.map((assignment) => assignment.started_at).sort()[0] ?? null
  const bikes = [...component.current_bikes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((bike) => ({ id: bike.id, name: bike.name }))
  return {
    kind: 'installed',
    bikes,
    since,
    rideContext: RIDE_CONTEXT_LABELS[component.current_bikes[0].ride_context],
  }
}

// The placement as plain text: "On Soloist since Oct 15 · All rides",
// "On Juan Solo, Soloist since Jun 2 · Trainer only", "Spare · last on
// Soloist", "Never installed", "Last on Soloist" (retired). The header
// renders the same words with the bikes linked.
export function placementText(placement: ComponentPlacement, now: Date = new Date()): string {
  if (placement.kind === 'installed') {
    const since = placement.since ? ` since ${formatShortDate(placement.since, now)}` : ''
    return `On ${placement.bikes.map((bike) => bike.name).join(', ')}${since} · ${placement.rideContext}`
  }
  if (!placement.lastBike) return 'Never installed'
  return placement.kind === 'spare' ? `Spare · last on ${placement.lastBike.name}` : `Last on ${placement.lastBike.name}`
}

// The header line's leading parts: brand/model, then "Acquired <date>".
export function identityParts(component: ComponentDetail, now: Date = new Date()): string[] {
  const brandModel = [component.brand, component.model].filter(Boolean).join(' ')
  return [brandModel, `Acquired ${formatShortDate(component.acquired_on, now)}`].filter(Boolean)
}
