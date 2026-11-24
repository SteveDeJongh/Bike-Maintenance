import { RIDE_CONTEXT_LABELS } from '../../constants'
import { installationRange } from '../component/componentPageModel'
import { formatShortDate } from '../../utils/datetime'
import type { ComponentAssignment, ComponentCurrentBike } from '../../types/models'

// The installation modal's pure helpers (docs/frontend-ui.md, "Installation
// modal"). Current = the assignment is still open; past = it has ended.

type Bike = { id: number; name: string }

export type WhereItIs =
  | { kind: 'current'; bike: Bike; since: string; rideContext: ComponentAssignment['ride_context']; alsoOn: Bike[] }
  | { kind: 'past'; bike: Bike; range: string; rideContext: ComponentAssignment['ride_context'] }

// Where this installation is (or was). A shared cassette's other current
// bikes come from the component's current_bikes, A-Z, this one left out.
export function whereItIs(
  assignment: Pick<ComponentAssignment, 'bike_id' | 'started_at' | 'ended_at' | 'ride_context'>,
  bikeName: string,
  componentCurrentBikes: readonly ComponentCurrentBike[] = [],
): WhereItIs {
  const bike = { id: assignment.bike_id, name: bikeName }
  if (assignment.ended_at) {
    return { kind: 'past', bike, range: installationRange(assignment), rideContext: assignment.ride_context }
  }
  const alsoOn = componentCurrentBikes
    .filter((other) => other.id !== assignment.bike_id)
    .map((other) => ({ id: other.id, name: other.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { kind: 'current', bike, since: assignment.started_at, rideContext: assignment.ride_context, alsoOn }
}

// The same as plain text: "On Soloist since Oct 15 · All rides · also on
// Juan Solo", "Was on Soloist · Jun 2 → Sep 30, 2026 · Trainer only". The
// modal renders these words with the bikes linked and the context as a chip.
export function whereItIsText(where: WhereItIs, now: Date = new Date()): string {
  const context = RIDE_CONTEXT_LABELS[where.rideContext]
  if (where.kind === 'past') return `Was on ${where.bike.name} · ${where.range} · ${context}`
  const also = where.alsoOn.length ? ` · also on ${where.alsoOn.map((bike) => bike.name).join(', ')}` : ''
  return `On ${where.bike.name} since ${formatShortDate(where.since, now)} · ${context}${also}`
}

export type InstallationAction = 'log_service' | 'edit' | 'remove'

// Current: Log service, Edit installation, Remove from bike. Past: only
// Edit installation (its dates and context can still be corrected).
export function installationActions(assignment: Pick<ComponentAssignment, 'ended_at'>): InstallationAction[] {
  return assignment.ended_at ? ['edit'] : ['log_service', 'edit', 'remove']
}
