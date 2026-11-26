import { SERVICE_STATUS_SEVERITY } from '../../constants'
import { formatDrivingRemaining } from '../../utils/serviceInterval'
import { formatShortDate } from '../../utils/datetime'
import { spareReadyLabel } from '../../utils/componentState'
import type { ComponentListItem, ServiceableComponent, ServiceableComponentRequirement, ServiceStatus } from '../../types/models'

// BatchServiceModal's pure pieces (docs/service-requirements.md, "Batch
// service logging").

// One row per (component, service type) that satisfies at least one of that
// component's enabled requirements -- not one row per requirement. A
// service type satisfying two requirements at once (e.g. a 200h service
// that also clears a 50h one) is a single checkbox that logs one
// MaintenanceEvent and clears both. The row shows the worst of them
// (`worst`): its status chip and what's left.
export interface ServiceTypeRow {
  key: string
  componentId: number
  serviceTypeId: number
  serviceTypeName: string
  requirements: { id: number; name: string; status: ServiceStatus }[]
  worst: ServiceableComponentRequirement
}

export function rowKey(componentId: number, serviceTypeId: number): string {
  return `${componentId}:${serviceTypeId}`
}

function componentIdOfKey(key: string): number {
  return Number(key.split(':')[0])
}

// A worse status wins; ties keep the first (the server's order).
function worse(a: ServiceableComponentRequirement, b: ServiceableComponentRequirement): boolean {
  return SERVICE_STATUS_SEVERITY[a.status] > SERVICE_STATUS_SEVERITY[b.status]
}

export function rowsForComponent(component: ServiceableComponent): ServiceTypeRow[] {
  const byType = new Map<number, ServiceTypeRow>()

  for (const requirement of component.service_requirements) {
    for (const satisfier of requirement.satisfiers) {
      const existing = byType.get(satisfier.service_type_id)
      const row: ServiceTypeRow = existing ?? {
        key: rowKey(component.id, satisfier.service_type_id),
        componentId: component.id,
        serviceTypeId: satisfier.service_type_id,
        serviceTypeName: satisfier.service_type_name,
        requirements: [],
        worst: requirement,
      }
      row.requirements.push({ id: requirement.id, name: requirement.requirement_name, status: requirement.status })
      if (worse(requirement, row.worst)) row.worst = requirement
      byType.set(satisfier.service_type_id, row)
    }
  }

  return [...byType.values()]
}

export function allRowKeys(data: { mounted: ServiceableComponent[]; off_bike: ServiceableComponent[] } | undefined): Set<string> {
  if (!data) return new Set()
  return new Set([...data.mounted, ...data.off_bike].flatMap((component) => rowsForComponent(component).map((row) => row.key)))
}

// "Select all due and soon": per non-ok requirement, its position-1
// satisfier -- deduped, so two due requirements sharing a satisfier add one
// row.
export function dueAndSoonKeys(components: readonly ServiceableComponent[]): string[] {
  const keys = new Set<string>()
  for (const component of components) {
    for (const requirement of component.service_requirements) {
      if (requirement.status === 'ok') continue
      const primary = [...requirement.satisfiers].sort((a, b) => a.position - b.position)[0]
      if (primary) keys.add(rowKey(component.id, primary.service_type_id))
    }
  }
  return [...keys]
}

// The pill's count: what it would add (hidden at 0).
export function dueAndSoonCount(components: readonly ServiceableComponent[], checked: ReadonlySet<string>): number {
  return dueAndSoonKeys(components).filter((key) => !checked.has(key)).length
}

// The footer's "4 selected · 3 components": checked rows plus complete
// "Other service" rows, over the distinct components among them.
export function batchFooterCounts(checked: ReadonlySet<string>, otherComponentIds: readonly number[]): { count: number; text: string } {
  const components = new Set([...[...checked].map(componentIdOfKey), ...otherComponentIds])
  const count = checked.size + otherComponentIds.length
  if (count === 0) return { count, text: 'Nothing selected' }
  return { count, text: `${count} selected · ${components.size} ${components.size === 1 ? 'component' : 'components'}` }
}

// Switching bikes with anything selected asks first: "Clear 3
// selections?". null when there's nothing to lose.
export function bikeSwitchConfirm(selectionCount: number): string | null {
  if (selectionCount === 0) return null
  return `Clear ${selectionCount} ${selectionCount === 1 ? 'selection' : 'selections'}?`
}

const CHIP: Record<ServiceStatus, { label: string; color: string }> = {
  due: { label: 'Due', color: 'red' },
  warning: { label: 'Soon', color: 'orange' },
  ok: { label: 'OK', color: 'teal' },
}

// A row's chip and right-aligned metric ("8 km over", "40 km left", "6
// days left") in the status colour -- dimmed when OK.
export function rowStatus(row: Pick<ServiceTypeRow, 'worst'>): { chip: { label: string; color: string }; metric: string; metricColor: string } {
  const status = row.worst.status
  return {
    chip: CHIP[status],
    metric: formatDrivingRemaining(row.worst),
    metricColor: status === 'ok' ? 'dimmed' : CHIP[status].color,
  }
}

// A rotating spare's line beside its category, from the Components list's
// ready signal (spareReadyLabel): "drip wax Nov 20" -- the latest service
// since it came off. null unless it's ready.
export function readyLine(component: ComponentListItem | undefined, now: Date = new Date()): string | null {
  if (!component || !spareReadyLabel(component) || !component.latest_service) return null
  return `${component.latest_service.service_type_name.toLowerCase()} ${formatShortDate(component.latest_service.performed_at, now)}`
}
