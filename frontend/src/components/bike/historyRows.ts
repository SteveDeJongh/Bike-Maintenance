import { categoryLabel } from '../../constants'
import { formatDistance } from '../../utils/distance'
import type { ComponentAssignmentWithStats } from '../../types/models'

export interface HistoryRow {
  assignment: ComponentAssignmentWithStats
  endedAt: string
  // "Chain S2 → Chain S1" for a swap, "Removed Continental GP5000" otherwise.
  title: string
  // "Chain · ran 196 km": the category and this installation's distance.
  subLine: string
  // The component's lifetime distance, across every bike.
  lifetime: string
}

// The bike's ended installations, most recently ended first. An ended
// installation is a swap when another one on this bike, in the same
// category and ride context, starts at the instant it ended -- exactly how
// the one-step swap writes the pair; anything else reads as a removal.
export function historyRows(assignments: ComponentAssignmentWithStats[]): HistoryRow[] {
  return assignments
    .filter((assignment): assignment is ComponentAssignmentWithStats & { ended_at: string } => assignment.ended_at !== null)
    .sort((a, b) => Date.parse(b.ended_at) - Date.parse(a.ended_at) || b.id - a.id)
    .map((assignment) => {
      const endedAt = Date.parse(assignment.ended_at)
      const successor = assignments.find(
        (other) =>
          other.id !== assignment.id &&
          other.component.category === assignment.component.category &&
          other.ride_context === assignment.ride_context &&
          Date.parse(other.started_at) === endedAt,
      )
      return {
        assignment,
        endedAt: assignment.ended_at,
        title: successor
          ? `${assignment.component.label} → ${successor.component.label}`
          : `Removed ${assignment.component.label}`,
        subLine: `${categoryLabel(assignment.component.category)} · ran ${formatDistance(assignment.distance_meters)}`,
        lifetime: formatDistance(assignment.component.total_distance),
      }
    })
}
