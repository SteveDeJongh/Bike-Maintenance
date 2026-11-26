import { categoryLabel } from '../constants'
import type { ComponentWithServiceStatus } from '../types/models'

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

// The slot being swapped: the open assignment, its bike, and the context
// the new component would inherit.
export interface SwapSlot {
  assignmentId: number
  bikeId: number
  componentId: number
  category: string
  rideContext: RideContext
}

export type SwapOptionKind = 'spare' | 'shared'

export interface SwapOption {
  component: ComponentWithServiceStatus
  kind: SwapOptionKind
}

// Exactly what POST /component_assignments/:id/swap accepts (see
// ComponentAssignments::Swap and ComponentAssignment's two overlap
// validations): same category, not retired, not the current component,
// and either
//   - a spare: no open assignment anywhere, or
//   - a shared indoor cassette: the category allows multiple assignments,
//     the slot is indoor_only, every one of its open assignments is
//     indoor_only, and none is on this bike.
// So a trainer cassette on three bikes stays offered for any other bike's
// indoor_only slot, and never for a both/outdoor_only one.
export function swapOptions(
  components: ComponentWithServiceStatus[],
  slot: SwapSlot,
  allowsMultiple: boolean,
): SwapOption[] {
  const options: SwapOption[] = []
  for (const component of components) {
    if (component.id === slot.componentId) continue
    const open = component.current_bikes.map((bike) => ({ bikeId: bike.id, rideContext: bike.ride_context }))
    const kind = canTakeComponent(component, open, slot, allowsMultiple)
    if (kind) options.push({ component, kind })
  }
  return orderSwapOptions(options)
}

// One open installation of a component: its bike (null when it's only
// known to be on another bike than the slot's) and ride context.
export interface OpenInstallation {
  bikeId: number | null
  rideContext: RideContext
}

// The one rule for "can this slot take this component now" -- the swap
// pill, the empty-slot picker and the Install on bike modal all use it,
// mirroring what the server accepts (ComponentAssignment's two overlap
// validations): same category, not retired, and either a spare (no open
// installation) or a shared indoor cassette (the category allows multiple
// assignments, the slot is indoor_only, and every open installation is
// indoor_only and on another bike). null when it can't.
export function canTakeComponent(
  component: { category: string; retired_on: string | null },
  open: readonly OpenInstallation[],
  slot: { bikeId: number; category: string; rideContext: RideContext },
  allowsMultiple: boolean,
): SwapOptionKind | null {
  if (component.category !== slot.category || component.retired_on) return null
  if (open.length === 0) return 'spare'
  const shareable =
    allowsMultiple &&
    slot.rideContext === 'indoor_only' &&
    open.every((installation) => installation.rideContext === 'indoor_only' && installation.bikeId !== slot.bikeId)
  return shareable ? 'shared' : null
}

// Spares most recently removed first, then never-installed spares by name,
// then shared cassettes by name.
export function orderSwapOptions(options: SwapOption[]): SwapOption[] {
  const rank = (option: SwapOption) => (option.kind === 'shared' ? 2 : option.component.last_bike ? 0 : 1)
  return [...options].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    if (rank(a) === 0) {
      const removed = Date.parse(b.component.last_bike!.removed_at) - Date.parse(a.component.last_bike!.removed_at)
      if (removed !== 0) return removed
    }
    return a.component.label.localeCompare(b.component.label)
  })
}

// The dimmed status line under an option.
export function swapOptionStatus(option: SwapOption): string {
  const { component } = option
  if (option.kind === 'shared') return `Also on ${component.current_bikes.map((bike) => bike.name).join(', ')} (indoor)`
  return component.last_bike ? `Last on ${component.last_bike.name}` : 'Never installed'
}

// The disabled row shown when nothing is eligible, e.g. "No spare cassettes".
export function emptyOptionLabel(category: string): string {
  const label = categoryLabel(category).toLowerCase()
  return `No spare ${label.endsWith('s') ? label : `${label}s`}`
}
