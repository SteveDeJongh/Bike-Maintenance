import { categoryLabel, RIDE_CONTEXT_LABELS } from '../../constants'
import { compareLastRidden } from '../bikes/bikesList'
import { canTakeComponent } from '../../utils/swapOptions'
import { componentState } from '../../utils/componentState'
import type { BikeComponentSlot, BikeWithStats, ComponentAssignmentWithStats, ComponentDetail } from '../../types/models'

// The Install on bike modal's pure pieces (docs/components-and-setup.md,
// "Install on bike").

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

export interface BikeOption {
  value: string
  label: string
  // Dimmed beside it: "Not tracked on this bike" / "Retired".
  note: string | null
  tracked: boolean
  retired: boolean
}

// Active bikes most recently ridden first (the Bikes page's Last ridden
// order), then -- only when asked, for back-filling -- retired ones in the
// same order. A bike without a slot for the category says so.
export function bikeOptions(
  bikes: readonly Pick<BikeWithStats, 'id' | 'name' | 'retired_on' | 'last_ride_on' | 'slot_categories'>[],
  category: string,
  showRetired: boolean,
): BikeOption[] {
  const option = (bike: (typeof bikes)[number]): BikeOption => {
    const tracked = bike.slot_categories.includes(category)
    const retired = Boolean(bike.retired_on)
    return {
      value: String(bike.id),
      label: bike.name,
      note: [retired ? 'Retired' : null, tracked ? null : 'Not tracked on this bike'].filter(Boolean).join(' · ') || null,
      tracked,
      retired,
    }
  }
  const active = bikes.filter((bike) => !bike.retired_on).sort(compareLastRidden)
  const retired = showRetired ? bikes.filter((bike) => bike.retired_on).sort(compareLastRidden) : []
  return [...active, ...retired].map(option)
}

export interface SlotOption {
  slotId: number
  rideContext: RideContext
  // The open installation in it now, if any (the swap's "occupant").
  occupant: { assignmentId: number; label: string } | null
  label: string
}

// The open installation filling a slot: an unsplit slot takes any open
// assignment of its category, a split one only its own ride context (the
// bike page's installedRows rule).
function occupantOf(slot: BikeComponentSlot, assignments: readonly ComponentAssignmentWithStats[], componentId: number) {
  const open = assignments.find(
    (a) =>
      a.ended_at === null &&
      a.component.category === slot.category &&
      a.component_id !== componentId &&
      (slot.ride_context === 'both' || a.ride_context === slot.ride_context),
  )
  return open ? { assignmentId: open.id, label: open.component.label } : null
}

// The bike's slots for the component's category, each with its occupant:
// "Chain · All rides · Chain S2 installed" / "… · empty". Installing now
// (no Removed on) offers only the slots that can take the component
// (canTakeComponent: a spare, or a shared indoor cassette); a past stint
// can go in any of them (the server's overlap checks decide).
export function slotOptions({
  component,
  bike,
  allowsMultiple,
  past,
}: {
  component: Pick<ComponentDetail, 'id' | 'category' | 'retired_on' | 'current_bikes'>
  bike: { id: number; bike_component_slots: BikeComponentSlot[]; component_assignments: ComponentAssignmentWithStats[] }
  allowsMultiple: boolean
  past: boolean
}): SlotOption[] {
  const open = component.current_bikes.map((current) => ({ bikeId: current.id, rideContext: current.ride_context }))
  return bike.bike_component_slots
    .filter((slot) => slot.category === component.category)
    .filter(
      (slot) => past || canTakeComponent(component, open, { bikeId: bike.id, category: slot.category, rideContext: slot.ride_context }, allowsMultiple),
    )
    .map((slot) => {
      const occupant = occupantOf(slot, bike.component_assignments, component.id)
      return {
        slotId: slot.id,
        rideContext: slot.ride_context,
        occupant,
        label: [categoryLabel(slot.category), RIDE_CONTEXT_LABELS[slot.ride_context], occupant ? `${occupant.label} installed` : 'empty'].join(' · '),
      }
    })
}

// The Slot field shows only when there's a choice.
export function showSlotField(options: readonly SlotOption[]): boolean {
  return options.length > 1
}

// A mounted component can only get a past stint here (moving it is the
// swap pill's job), and so can a retired bike.
export function removedOnRequired(component: Pick<ComponentDetail, 'retired_on' | 'current_bikes'>, bikeRetired: boolean): string | null {
  if (componentState(component) === 'installed') return "It's on a bike now, so this can only be a past installation"
  if (bikeRetired) return 'A retired bike can only get a past installation'
  return null
}

export type SubmitCase = 'install' | 'swap' | 'closed'

// What the submit does: a Removed on date makes a closed stint (it never
// ends or moves anything else); otherwise an occupied slot is a swap, an
// empty one (or a new slot) a plain install.
export function submitCase({ removedOn, occupant }: { removedOn: string | null; occupant: SlotOption['occupant'] }): SubmitCase {
  if (removedOn) return 'closed'
  return occupant ? 'swap' : 'install'
}

export function primaryLabel(kind: SubmitCase, origin: 'menu' | 'history'): string {
  if (kind === 'swap') return 'Swap in'
  if (kind === 'closed' && origin === 'history') return 'Add installation'
  return 'Install'
}

const day = (value: string, now: Date) => {
  const date = new Date(value)
  return date.toLocaleDateString('en-US', date.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

// "This will remove Chain S2 from Soloist on Nov 26."
export function swapNote(occupant: string, bikeName: string, at: string, now: Date = new Date()): string {
  return `This will remove ${occupant} from ${bikeName} on ${day(at, now)}.`
}

// The attribution summary: "Rides on Soloist from Jun 2 to Sep 30 will
// count toward this component." ("to now" while it's still on).
export function attributionLine(bikeName: string, start: string, end: string | null, now: Date = new Date()): string {
  return `Rides on ${bikeName} from ${day(start, now)} to ${end ? day(end, now) : 'now'} will count toward this component.`
}

// The client-side date rules (the server checks them too): Removed on
// after Installed on, neither in the future (5 minutes of slack, as the
// server allows).
export function dateErrors(start: string | null, end: string | null, now: Date = new Date()): { started_at?: string; ended_at?: string } {
  const limit = now.getTime() + 5 * 60 * 1000
  const errors: { started_at?: string; ended_at?: string } = {}
  if (!start) errors.started_at = 'Installed on is required'
  else if (new Date(start).getTime() > limit) errors.started_at = "Can't be in the future"
  if (end) {
    if (new Date(end).getTime() > limit) errors.ended_at = "Can't be in the future"
    else if (start && new Date(end) <= new Date(start)) errors.ended_at = 'Must be after Installed on'
  }
  return errors
}

// The new installation's ride context: a split slot's own, else the
// category's default (the empty-slot picker's rule).
export function installRideContext(slotContext: RideContext | null, categoryDefault: RideContext | undefined): RideContext {
  return slotContext && slotContext !== 'both' ? slotContext : (categoryDefault ?? 'both')
}
