import type { ComponentCurrentBike, ComponentLastBike, ServiceStatus } from '../types/models'

// The one definition of a component's state (docs/components-and-setup.md,
// "Installed, spare and retired"), used by every count, pill, band and Bike
// cell -- never re-derive it inline. Mutually exclusive:
// - retired: retired_on is set (even if an assignment is somehow still
//   open -- `components:audit_retired_mounted` finds those);
// - installed: not retired, with an open assignment on any bike;
// - spare: neither -- on the shelf.
export type ComponentState = 'installed' | 'spare' | 'retired'

interface StateFields {
  retired_on: string | null
  current_bikes: readonly ComponentCurrentBike[]
}

export function componentState(component: StateFields): ComponentState {
  if (component.retired_on) return 'retired'
  return component.current_bikes.length > 0 ? 'installed' : 'spare'
}

interface ReadyFields extends StateFields {
  rotates: boolean
  service_status: ServiceStatus | null
  last_bike: ComponentLastBike | null
  latest_service: { service_type_name: string; performed_at: string } | null
}

// A rotating spare that's been serviced since it came off ("Wax · ready"):
// a spare, in a category set to rotate, whose latest service is after its
// last removal (or that was never installed), and not due. The service
// name is the user's own, with its first letter capitalised to lead the
// phrase. null when it isn't ready.
export function spareReadyLabel(component: ReadyFields): string | null {
  if (componentState(component) !== 'spare' || !component.rotates) return null
  const service = component.latest_service
  if (!service || component.service_status === 'due') return null
  const removedAt = component.last_bike?.removed_at
  if (removedAt && new Date(service.performed_at) <= new Date(removedAt)) return null
  const name = service.service_type_name
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} · ready`
}
