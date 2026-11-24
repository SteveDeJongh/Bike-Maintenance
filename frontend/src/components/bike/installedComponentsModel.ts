import { SERVICE_STATUS_SEVERITY, type InstalledComponentSortColumn } from '../../constants'
import type {
  BikeComponentSlot,
  ComponentAssignment,
  ComponentAssignmentWithStats,
  ComponentCategorySetting,
  DashboardMountedComponent,
} from '../../types/models'

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

const RIDE_CONTEXT_SORT_ORDER: Record<RideContext, number> = { both: 0, outdoor_only: 1, indoor_only: 2 }

// The bike's slots in the bike page's order: by category (useAllCategories:
// the baseline list, then custom ones), and within a category the unsplit
// slot, then outdoor-only, then indoor-only. A category can have two
// independent slots (the indoor/outdoor cassette pair).
export function orderSlots(slots: BikeComponentSlot[], allCategories: readonly string[]): BikeComponentSlot[] {
  return allCategories.flatMap((category) =>
    slots
      .filter((slot) => slot.category === category)
      .sort((a, b) => RIDE_CONTEXT_SORT_ORDER[a.ride_context] - RIDE_CONTEXT_SORT_ORDER[b.ride_context]),
  )
}

export interface AddableSlotOption {
  category: string
  rideContext: RideContext
}

// What "+ Track component type" offers: a trackable category with no slot
// yet offers a plain entry, plus (when it allows multiple assignments)
// separate outdoor-only and indoor-only entries, so the user can start with
// just the one they want (e.g. only the shared trainer cassette). A
// category with an unsplit slot offers nothing more; one with split slots
// offers whichever variant isn't tracked yet.
export function addableSlotOptions(
  allCategories: readonly string[],
  slots: BikeComponentSlot[],
  categorySettings: Pick<ComponentCategorySetting, 'category' | 'trackable' | 'allows_multiple_assignments'>[] | undefined,
): AddableSlotOption[] {
  return allCategories.flatMap((category) => {
    const setting = categorySettings?.find((s) => s.category === category)
    if (!(setting?.trackable ?? true)) return []

    const existing = slots.filter((slot) => slot.category === category)
    if (existing.length === 0) {
      const contexts: RideContext[] = setting?.allows_multiple_assignments ? ['both', 'outdoor_only', 'indoor_only'] : ['both']
      return contexts.map((rideContext) => ({ category, rideContext }))
    }
    if (existing.some((slot) => slot.ride_context === 'both')) return []

    const tracked = new Set(existing.map((slot) => slot.ride_context))
    return (['outdoor_only', 'indoor_only'] as const).filter((context) => !tracked.has(context)).map((rideContext) => ({ category, rideContext }))
  })
}

export interface InstalledRow {
  slot: BikeComponentSlot
  // The slot's position in orderSlots -- what the Category sort uses.
  order: number
  // The open assignment filling the slot; absent for an empty slot.
  assignment?: ComponentAssignmentWithStats
  // Its wear from the bike's overview (worst requirement); absent when
  // empty, and all-null fields when it has no requirement.
  wear?: DashboardMountedComponent
}

// One row per slot, in slot order. An unsplit slot takes any open
// assignment of its category; a split slot only one with its own ride
// context.
export function installedRows(
  orderedSlots: BikeComponentSlot[],
  assignments: ComponentAssignmentWithStats[],
  mounted: DashboardMountedComponent[],
): InstalledRow[] {
  const wearByAssignment = new Map(mounted.map((component) => [component.assignment_id, component]))
  return orderedSlots.map((slot, order) => {
    const assignment = assignments.find(
      (a) =>
        a.ended_at === null &&
        a.component.category === slot.category &&
        (slot.ride_context === 'both' || a.ride_context === slot.ride_context),
    )
    return { slot, order, assignment, wear: assignment ? wearByAssignment.get(assignment.id) : undefined }
  })
}

// "13 installed · 1 empty slot" (the empty part only when there are any).
export function installedSummaryLine(rows: InstalledRow[]): string {
  const installed = rows.filter((row) => row.assignment).length
  const empty = rows.length - installed
  const head = `${installed} installed`
  return empty > 0 ? `${head} · ${empty} empty ${empty === 1 ? 'slot' : 'slots'}` : head
}

// Each sortable column's value; null (an empty slot, no requirement) sorts
// last whichever the direction.
export function installedSortValue(row: InstalledRow, column: InstalledComponentSortColumn): string | number | null {
  const a = row.assignment
  switch (column) {
    case 'category':
      return row.order
    case 'ride_context':
      return a?.ride_context ?? (row.slot.ride_context !== 'both' ? row.slot.ride_context : null)
    case 'component_label':
      return a?.component.label ?? null
    case 'wear':
      return row.wear?.fraction_used ?? null
    case 'period_distance':
      return a?.distance_meters ?? null
    case 'period_time':
      return a?.moving_time ?? null
    case 'period_elevation':
      return a?.elevation_gain ?? null
    case 'period_avg_power':
      return a?.average_power ?? null
    case 'component_total_distance':
      return a?.component.total_distance ?? null
    case 'component_total_time':
      return a?.component.total_moving_time ?? null
    case 'component_total_elevation':
      return a?.component.total_elevation_gain ?? null
    case 'component_avg_power':
      return a?.component.average_power ?? null
    case 'service_status':
      return a?.component.service_status ? SERVICE_STATUS_SEVERITY[a.component.service_status] : null
    case 'installed_on':
      return a?.started_at ?? null
  }
}

export function sortInstalledRows(rows: InstalledRow[], column: InstalledComponentSortColumn, direction: 'asc' | 'desc'): InstalledRow[] {
  return [...rows].sort((x, y) => {
    const xv = installedSortValue(x, column)
    const yv = installedSortValue(y, column)
    if (xv === null || yv === null) return xv === yv ? x.order - y.order : xv === null ? 1 : -1
    const cmp = typeof xv === 'string' ? xv.localeCompare(yv as string) : xv - (yv as number)
    return (direction === 'asc' ? cmp : -cmp) || x.order - y.order
  })
}

// For each component actively mounted on some *other* bike, the ride
// contexts it's mounted with there. An empty slot normally can't take such
// a component -- unless the slot is indoor-only, the category allows
// sharing, and every one of those is indoor-only (a cassette that lives on
// the trainer, not on any one bike).
export function activeElsewhereByComponent(
  assignments: Pick<ComponentAssignment, 'component_id' | 'bike_id' | 'ended_at' | 'ride_context'>[],
  bikeId: number,
): Map<number, RideContext[]> {
  const byComponent = new Map<number, RideContext[]>()
  for (const a of assignments) {
    if (a.ended_at !== null || a.bike_id === bikeId) continue
    byComponent.set(a.component_id, [...(byComponent.get(a.component_id) ?? []), a.ride_context])
  }
  return byComponent
}
