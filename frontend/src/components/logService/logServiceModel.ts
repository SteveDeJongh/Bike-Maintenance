import { drivingAmounts, requirementFraction, requirementRuleText } from '../component/componentPageModel'
import { formatDistance } from '../../utils/distance'
import { compareCategory, matchesSearch } from '../componentList/componentListModel'
import { componentState, spareReadyLabel } from '../../utils/componentState'
import { categoryLabel } from '../../constants'
import { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypePicker'
import type {
  Bike,
  ComponentDetail,
  ComponentListItem,
  ComponentServiceRequirementWithStatus,
  ServiceStatus,
  ServiceType,
} from '../../types/models'

// The Log service modal's pure pieces (MaintenanceEventFormModal): the
// service pills, the default type, the primary button and the last-ride
// shortcut. The picker's groups and the resets panel rows live here too.

const SEVERITY: Record<ServiceStatus, number> = { ok: 0, warning: 1, due: 2 }

type PillSource = Pick<ComponentDetail, 'service_requirements' | 'maintenance_events'>

export interface ServicePill {
  serviceTypeId: number
  name: string
  // The requirements this type satisfies, in requirement order ("Wax");
  // empty for a recent non-satisfier.
  requirementNames: string[]
}

export const MAX_RECENT_PILLS = 3

function enabledRequirements(component: Pick<ComponentDetail, 'service_requirements'>): ComponentServiceRequirementWithStatus[] {
  return component.service_requirements.filter((requirement) => requirement.enabled)
}

// The Service pills, in order: each enabled requirement's satisfiers
// (requirement order, then position; a type satisfying two requirements is
// one pill naming both), then up to MAX_RECENT_PILLS other types recently
// logged on this component, newest first. "Other type" follows, outside
// this list.
export function servicePills(component: PillSource): ServicePill[] {
  const pills: ServicePill[] = []
  const byType = new Map<number, ServicePill>()

  for (const requirement of enabledRequirements(component)) {
    for (const satisfier of [...requirement.satisfiers].sort((a, b) => a.position - b.position)) {
      const existing = byType.get(satisfier.service_type_id)
      if (existing) {
        if (!existing.requirementNames.includes(requirement.requirement_name)) existing.requirementNames.push(requirement.requirement_name)
        continue
      }
      const pill = { serviceTypeId: satisfier.service_type_id, name: satisfier.service_type_name, requirementNames: [requirement.requirement_name] }
      byType.set(pill.serviceTypeId, pill)
      pills.push(pill)
    }
  }

  const recent = [...component.maintenance_events].sort((a, b) => b.performed_at.localeCompare(a.performed_at))
  let added = 0
  for (const event of recent) {
    if (added >= MAX_RECENT_PILLS) break
    if (byType.has(event.service_type_id)) continue
    const pill = { serviceTypeId: event.service_type_id, name: event.service_type_name, requirementNames: [] }
    byType.set(pill.serviceTypeId, pill)
    pills.push(pill)
    added += 1
  }

  return pills
}

// "Drip wax · Wax" -- the requirement part is dimmed in the pill.
export function pillRequirementText(pill: ServicePill): string | null {
  return pill.requirementNames.length ? pill.requirementNames.join(', ') : null
}

// The most urgent enabled requirement: worst status, then the most used.
export function mostUrgentRequirement(
  component: Pick<ComponentDetail, 'service_requirements'>,
): ComponentServiceRequirementWithStatus | undefined {
  return [...enabledRequirements(component)].sort(
    (a, b) => SEVERITY[b.status] - SEVERITY[a.status] || requirementFraction(b) - requirementFraction(a),
  )[0]
}

// The type to start on: what the opener preselected, else the first
// satisfier of the most urgent requirement, else none.
export function defaultServiceTypeId(
  component: Pick<ComponentDetail, 'service_requirements'> | undefined,
  preselected?: number,
): number | undefined {
  if (preselected) return preselected
  if (!component) return undefined
  const urgent = mostUrgentRequirement(component)
  return urgent ? [...urgent.satisfiers].sort((a, b) => a.position - b.position)[0]?.service_type_id : undefined
}

// The footer's primary: "Log Drip wax", or "Save changes" when editing;
// disabled (with the reason as its tooltip) until a component and a type
// are chosen.
export function primaryAction({
  isEdit,
  hasComponent,
  serviceTypeName,
}: {
  isEdit: boolean
  hasComponent: boolean
  serviceTypeName: string | null
}): { label: string; disabledReason: string | null } {
  const disabledReason = !hasComponent ? 'Pick a component first' : !serviceTypeName ? 'Pick a service type' : null
  if (isEdit) return { label: 'Save changes', disabledReason }
  return { label: serviceTypeName ? `Log ${serviceTypeName}` : 'Log service', disabledReason }
}

export interface LastRide {
  name: string
  moved_at: string
  elapsed_time: number | null
}

// "After last ride": when the component's latest counted ride ended --
// its start plus elapsed time (none recorded: its start), never later
// than now.
export function lastRideEnd(ride: LastRide, now: Date = new Date()): Date {
  const end = new Date(new Date(ride.moved_at).getTime() + (ride.elapsed_time ?? 0) * 1000)
  return end > now ? now : end
}

// "Last ride before this: Hill repeats, Nov 14, 9:15 am"
export function lastRideLine(ride: LastRide | null | undefined): string {
  if (!ride) return 'No ride on this component before this'
  const at = new Date(ride.moved_at)
  const day = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `Last ride before this: ${ride.name}, ${day}, ${time}`
}

// The edit-in-session line: "Part of the Nov 14 service session on Libre".
export function sessionLockText(session: { performed_at: string } | undefined, bikeName: string | undefined): string {
  if (!session) return 'Part of a service session'
  const day = new Date(session.performed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Part of the ${day} service session${bikeName ? ` on ${bikeName}` : ''}`
}

// --- "What this resets" ---

export interface ResetRow {
  id: number
  name: string
  rule: string
  fraction: number
  status: ServiceStatus
  resets: boolean
  // "196 km → 0 · resets" / "Reset at 1,160 km" / "Not affected".
  outcome: string
}

const amount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 })

// How much of the driving dimension is used: "196 km", "10 hrs", "40 days".
export function usedText(requirement: ComponentServiceRequirementWithStatus): string {
  const { used } = drivingAmounts(requirement)
  const value = used ?? 0
  switch (requirement.driving_dimension) {
    case 'distance':
      return `${amount(Math.round(value / 1000))} km`
    case 'moving_time':
      return `${amount(value / 3600)} hrs`
    default:
      return `${amount(value)} ${value === 1 ? 'day' : 'days'}`
  }
}

// One row per enabled requirement. Logging: a requirement whose
// satisfiers include the chosen type resets ("196 km → 0 · resets"),
// the rest are "Not affected". Editing: the same split, worded as what
// happened -- "Reset at 1,160 km" (the component's distance at the
// service).
export function resetRows(
  requirements: readonly ComponentServiceRequirementWithStatus[],
  serviceTypeId: number | null,
  mode: { kind: 'log' } | { kind: 'edit'; distanceAtServiceMeters: number },
): ResetRow[] {
  return requirements
    .filter((requirement) => requirement.enabled)
    .map((requirement) => {
      const resets = serviceTypeId != null && requirement.satisfiers.some((satisfier) => satisfier.service_type_id === serviceTypeId)
      let outcome = 'Not affected'
      if (resets) outcome = mode.kind === 'log' ? `${usedText(requirement)} → 0 · resets` : `Reset at ${formatDistance(mode.distanceAtServiceMeters)}`
      return {
        id: requirement.id,
        name: requirement.requirement_name,
        rule: requirementRuleText(requirement),
        fraction: requirementFraction(requirement),
        status: requirement.status,
        resets,
        outcome,
      }
    })
}

export function resetsTitle(isEdit: boolean): string {
  return isEdit ? 'What this service reset' : 'What this resets'
}

// --- the component picker ---

export interface PickerChip {
  label: string
  color: string
}

export interface PickerOption {
  // Unique per group: a component can sit in Needs attention and its own
  // group, and a shared cassette under each of its bikes.
  key: string
  component: ComponentListItem
  line: string
  chip: PickerChip | null
}

export interface PickerGroup {
  key: string
  label: string
  options: PickerOption[]
}

// The worst requirement as a chip: "Wax due" (red), "Clean soon"
// (orange); nothing when it's OK or there's no requirement.
export function statusChip(component: Pick<ComponentListItem, 'service_status' | 'worst_requirement_name'>): PickerChip | null {
  const name = component.worst_requirement_name ?? 'Service'
  if (component.service_status === 'due') return { label: `${name} due`, color: 'red' }
  if (component.service_status === 'warning') return { label: `${name} soon`, color: 'orange' }
  return null
}

// The dimmed line under a component: "Chain · on Juan Solo · 1,356 km
// lifetime", "Chain · last on Soloist · ...", "Chain · retired · ...".
export function pickerLine(component: ComponentListItem): string {
  const state = componentState(component)
  const where =
    state === 'installed'
      ? `on ${component.current_bikes.map((bike) => bike.name).sort((a, b) => a.localeCompare(b)).join(', ')}`
      : state === 'retired'
        ? 'retired'
        : component.last_bike
          ? `last on ${component.last_bike.name}`
          : 'never installed'
  return [categoryLabel(component.category), where, `${formatDistance(component.lifetime_distance_meters)} lifetime`].join(' · ')
}

// The picker's groups, in order: Needs attention (due, then soon, most
// used first, across bikes and spares); one group per active bike A-Z with
// its mounted components in category order (a shared cassette under each
// of its bikes); Spares, with a rotating spare's "<type> · ready" chip;
// Retired, only when asked for. A component in Needs attention also shows
// in its own group. Search (label, brand, model) narrows every group;
// empty groups are left out.
export function componentPickerGroups(
  components: readonly ComponentListItem[],
  {
    bikes,
    categoryOrder,
    q = '',
    showRetired = false,
  }: { bikes: readonly Pick<Bike, 'id' | 'name' | 'retired_on'>[]; categoryOrder: readonly string[]; q?: string; showRetired?: boolean },
): PickerGroup[] {
  const matching = components.filter((component) => matchesSearch(component, q))
  const byCategory = (a: ComponentListItem, b: ComponentListItem) =>
    compareCategory(a.category, b.category, categoryOrder) || a.label.localeCompare(b.label)
  const option = (group: string, component: ComponentListItem, chip = statusChip(component)): PickerOption => ({
    key: `${group}-${component.id}`,
    component,
    line: pickerLine(component),
    chip,
  })

  const groups: PickerGroup[] = []
  const attention = matching
    .filter((component) => componentState(component) !== 'retired' && (component.service_status === 'due' || component.service_status === 'warning'))
    .sort(
      (a, b) =>
        SEVERITY[b.service_status!] - SEVERITY[a.service_status!] || (b.fraction_used ?? 0) - (a.fraction_used ?? 0) || a.label.localeCompare(b.label),
    )
  groups.push({ key: 'attention', label: 'Needs attention', options: attention.map((c) => option('attention', c)) })

  for (const bike of [...bikes].filter((b) => !b.retired_on).sort((a, b) => a.name.localeCompare(b.name))) {
    const mounted = matching
      .filter((component) => componentState(component) === 'installed' && component.current_bikes.some((current) => current.id === bike.id))
      .sort(byCategory)
    groups.push({ key: `bike-${bike.id}`, label: bike.name, options: mounted.map((c) => option(`bike-${bike.id}`, c)) })
  }

  const spares = matching.filter((component) => componentState(component) === 'spare').sort(byCategory)
  groups.push({
    key: 'spares',
    label: 'Spares',
    options: spares.map((c) => {
      const ready = spareReadyLabel(c)
      return option('spares', c, statusChip(c) ?? (ready ? { label: ready, color: 'teal' } : null))
    }),
  })

  if (showRetired) {
    const retired = matching.filter((component) => componentState(component) === 'retired').sort(byCategory)
    groups.push({ key: 'retired', label: 'Retired', options: retired.map((c) => option('retired', c, null)) })
  }

  return groups.filter((group) => group.options.length > 0)
}

// Switching component keeps the chosen type when it still fits the new
// one -- one of its pills, or a type the category-scoped picker lists
// first for its category (tagged for it, or untagged/universal) -- else
// falls back to the new component's default.
export function serviceTypeAfterComponentChange(
  current: string,
  next: { pills: ServicePill[]; category: string; serviceTypes: readonly Pick<ServiceType, 'id' | 'categories'>[]; defaultId: number | undefined },
): string {
  if (current === CREATE_NEW_SERVICE_TYPE) return current
  const id = Number(current)
  if (current && next.pills.some((pill) => pill.serviceTypeId === id)) return current
  const type = next.serviceTypes.find((candidate) => candidate.id === id)
  if (current && type && (type.categories.length === 0 || type.categories.includes(next.category))) return current
  return next.defaultId ? String(next.defaultId) : ''
}
