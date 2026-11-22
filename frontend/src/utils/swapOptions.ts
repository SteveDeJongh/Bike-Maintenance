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
    if (component.category !== slot.category || component.id === slot.componentId || component.retired_on) continue

    if (component.current_bikes.length === 0) {
      options.push({ component, kind: 'spare' })
      continue
    }

    const shareable =
      allowsMultiple &&
      slot.rideContext === 'indoor_only' &&
      component.current_bikes.every((bike) => bike.ride_context === 'indoor_only' && bike.id !== slot.bikeId)
    if (shareable) options.push({ component, kind: 'shared' })
  }
  return orderSwapOptions(options)
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
