import { RIDE_CONTEXT_LABELS, SERVICE_STATUS_SEVERITY } from '../../constants'
import { installationStatus } from '../../utils/installationStatus'
import { componentState } from '../../utils/componentState'
import { formatShortDate } from '../../utils/datetime'
import type {
  ComponentDetail,
  ComponentInstallation,
  ComponentMaintenanceEvent,
  ComponentServiceRequirementWithStatus,
  ServiceStatus,
} from '../../types/models'

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
// bikes that aren't retired, A-Z (a shared cassette has two), since their
// earliest open assignment, and that assignment's ride context, plus any
// retired bikes it was left on (retiredBikes: "· also on retired <bike>",
// or, when that's all, "On retired <bike>"). Otherwise the last bike
// (spare or retired) or none.
export type ComponentPlacement =
  | {
      kind: 'installed'
      bikes: { id: number; name: string }[]
      retiredBikes: { id: number; name: string }[]
      since: string | null
      rideContext: string
    }
  | { kind: 'spare' | 'retired'; lastBike: { id: number; name: string } | null }

export function componentPlacement(component: ComponentDetail): ComponentPlacement {
  const state = componentState(component)
  if (state !== 'installed') return { kind: state, lastBike: component.last_bike }

  const open = component.assignments.filter((assignment) => assignment.ended_at == null)
  const onActive = open.filter((assignment) => installationStatus(assignment, assignment.bike) === 'current')
  const shown = onActive.length > 0 ? onActive : open
  const since = shown.map((assignment) => assignment.started_at).sort()[0] ?? null
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  const pick = (bike: { id: number; name: string }) => ({ id: bike.id, name: bike.name })
  const current = [...component.current_bikes].sort(byName)
  const bikes = current.filter((bike) => !bike.retired_on).map(pick)
  const retiredBikes = current.filter((bike) => bike.retired_on).map(pick)
  const contextBike = current.find((bike) => !bike.retired_on) ?? current[0]
  return {
    kind: 'installed',
    bikes,
    retiredBikes,
    since,
    rideContext: RIDE_CONTEXT_LABELS[contextBike.ride_context],
  }
}

// The placement as plain text: "On Soloist since Oct 15 · All rides",
// "On Juan Solo, Soloist since Jun 2 · Trainer only", "On Juan Solo since
// Jun 2 · All rides · also on retired White lightning", "On retired White
// lightning since Mar 2 · All rides", "Spare · last on Soloist", "Never
// installed", "Last on Soloist" (retired). The header renders the same
// words with the bikes linked.
export function placementText(placement: ComponentPlacement, now: Date = new Date()): string {
  if (placement.kind === 'installed') {
    const since = placement.since ? ` since ${formatShortDate(placement.since, now)}` : ''
    const names = (bikes: { name: string }[]) => bikes.map((bike) => bike.name).join(', ')
    if (placement.bikes.length === 0) return `On retired ${names(placement.retiredBikes)}${since} · ${placement.rideContext}`
    const also = placement.retiredBikes.length ? ` · also on retired ${names(placement.retiredBikes)}` : ''
    return `On ${names(placement.bikes)}${since} · ${placement.rideContext}${also}`
  }
  if (!placement.lastBike) return 'Never installed'
  return placement.kind === 'spare' ? `Spare · last on ${placement.lastBike.name}` : `Last on ${placement.lastBike.name}`
}

// The header line's leading parts: brand/model, then "Acquired <date>".
export function identityParts(component: ComponentDetail, now: Date = new Date()): string[] {
  const brandModel = [component.brand, component.model].filter(Boolean).join(' ')
  return [brandModel, `Acquired ${formatShortDate(component.acquired_on, now)}`].filter(Boolean)
}

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const plural = (count: number, one: string, many: string) => `${number(count)} ${count === 1 ? one : many}`

// An interval's rule, dimmed under its name: "Every 200 km or 10 hrs or 90
// days · Drip wax or Immersion wax · outdoor rides only". Thresholds come
// from the requirement's effective values; the service types are its
// satisfiers, in position order.
export function requirementRuleText(requirement: ComponentServiceRequirementWithStatus): string {
  const thresholds: string[] = []
  if (requirement.distance_meters != null) thresholds.push(`${number(requirement.distance_meters / 1000)} km`)
  if (requirement.moving_time_seconds != null) thresholds.push(`${number(requirement.moving_time_seconds / 3600)} hrs`)
  if (requirement.calendar_amount != null && requirement.calendar_unit) {
    thresholds.push(plural(requirement.calendar_amount, requirement.calendar_unit, `${requirement.calendar_unit}s`))
  }
  const services = [...requirement.satisfiers]
    .sort((a, b) => a.position - b.position)
    .map((satisfier) => satisfier.service_type_name)
    .join(' or ')
  const filter =
    requirement.ride_filter === 'outdoor' ? 'outdoor rides only' : requirement.ride_filter === 'indoor' ? 'indoor rides only' : null
  return [thresholds.length ? `Every ${thresholds.join(' or ')}` : null, services || null, filter].filter(Boolean).join(' · ')
}

// Under the wear bar: "196 / 200 km since Drip wax" on the driving
// dimension, or "since install" before any satisfying service.
export function requirementProgressText(requirement: ComponentServiceRequirementWithStatus): string {
  const { used, remaining } = drivingAmounts(requirement)
  const since = requirement.setting_event ? `since ${requirement.setting_event.service_type_name}` : 'since install'
  if (used == null || remaining == null) return since
  const total = used + remaining
  switch (requirement.driving_dimension) {
    case 'distance':
      return `${number(used / 1000)} / ${number(total / 1000)} km ${since}`
    case 'moving_time':
      return `${number(used / 3600)} / ${number(total / 3600)} hrs ${since}`
    default:
      return `${number(used)} / ${plural(total, 'day', 'days')} ${since}`
  }
}

// "Last done Nov 14" from the setting event, else "Since install".
export function lastDoneText(requirement: ComponentServiceRequirementWithStatus, now: Date = new Date()): string {
  return requirement.setting_event ? `Last done ${formatShortDate(requirement.setting_event.performed_at, now)}` : 'Since install'
}

// The Service intervals section's summary: "2 intervals · 1 due · 1 soon"
// (due/soon over enabled ones, zero parts left out), or "No intervals".
export function intervalsSummary(requirements: readonly ComponentServiceRequirementWithStatus[]): string {
  if (requirements.length === 0) return 'No intervals'
  const enabled = requirements.filter((requirement) => requirement.enabled)
  const due = enabled.filter((requirement) => requirement.status === 'due').length
  const soon = enabled.filter((requirement) => requirement.status === 'warning').length
  return [plural(requirements.length, 'interval', 'intervals'), due ? `${due} due` : null, soon ? `${soon} soon` : null]
    .filter(Boolean)
    .join(' · ')
}

// Enabled first, then disabled; each group keeps the server's order.
export function orderRequirements(
  requirements: readonly ComponentServiceRequirementWithStatus[],
): ComponentServiceRequirementWithStatus[] {
  return [...requirements.filter((r) => r.enabled), ...requirements.filter((r) => !r.enabled)]
}

// A maintenance row's dimmed note line: the event's notes, then "Session
// with Chain B, Cassette" for a batch service, and "Off the bike" when the
// component wasn't installed at the time -- joined with " · ".
export function eventNoteLine(event: ComponentMaintenanceEvent): string {
  return [
    event.notes?.trim() || null,
    event.session_components.length ? `Session with ${event.session_components.map((c) => c.label).join(', ')}` : null,
    event.mounted_at_event ? null : 'Off the bike',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function maintenanceSummary(count: number): string {
  return count === 0 ? 'No events' : plural(count, 'event', 'events')
}

// "3 installations · 2 bikes", or "Never installed".
export function installationsSummary(installations: readonly ComponentInstallation[]): string {
  if (installations.length === 0) return 'Never installed'
  const bikes = new Set(installations.map((installation) => installation.bike.id)).size
  return `${plural(installations.length, 'installation', 'installations')} · ${plural(bikes, 'bike', 'bikes')}`
}

const dayWithYear = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const dayOnly = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Under the bike name: "Oct 15, 2026 → now · All rides" for the current
// stint, "Jun 2 → Sep 30, 2026 · Trainer only" for a past one (the start's
// year only when it differs from the end's). Days in the browser's zone.
export function installationRangeText(installation: ComponentInstallation): string {
  return `${installationRange(installation)} · ${RIDE_CONTEXT_LABELS[installation.ride_context]}`
}

// Just the range: "Oct 15, 2026 → now", "Jun 2 → Sep 30, 2026". Shared with
// the installation modal's "Was on <bike> · <range>".
export function installationRange(installation: Pick<ComponentInstallation, 'started_at' | 'ended_at'>): string {
  if (!installation.ended_at) return `${dayWithYear(installation.started_at)} → now`
  const sameYear = new Date(installation.started_at).getFullYear() === new Date(installation.ended_at).getFullYear()
  const start = sameYear ? dayOnly(installation.started_at) : dayWithYear(installation.started_at)
  return `${start} → ${dayWithYear(installation.ended_at)}`
}

// An Installation history row's DOM id, for scrolling to a new one.
export const installationRowId = (assignmentId: number) => `installation-${assignmentId}`
