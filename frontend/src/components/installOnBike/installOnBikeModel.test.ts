import { describe, expect, it } from 'vitest'
import {
  attributionLine,
  bikeOptions,
  dateErrors,
  installRideContext,
  primaryLabel,
  removedOnRequired,
  showSlotField,
  slotOptions,
  submitCase,
  swapNote,
} from './installOnBikeModel'
import type { BikeComponentSlot, ComponentAssignmentWithStats } from '../../types/models'

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

const slot = (id: number, category: string, ride_context: RideContext = 'both'): BikeComponentSlot => ({ id, bike_id: 1, category, ride_context })
const open = (id: number, componentId: number, label: string, category: string, ride_context: RideContext = 'both') =>
  ({
    id,
    component_id: componentId,
    bike_id: 1,
    started_at: '2026-01-01T00:00:00Z',
    ended_at: null,
    ride_context,
    component: { id: componentId, label, category },
  }) as unknown as ComponentAssignmentWithStats
const spareChain = { id: 9, category: 'chain', retired_on: null, current_bikes: [] }

describe('bikeOptions', () => {
  const bikes = [
    { id: 1, name: 'Soloist', retired_on: null, last_ride_on: '2026-11-20T09:00:00Z', slot_categories: ['chain'] },
    { id: 2, name: 'Libre', retired_on: null, last_ride_on: '2026-11-25T09:00:00Z', slot_categories: [] },
    { id: 3, name: 'Old MTB', retired_on: '2025-01-01', last_ride_on: '2024-10-01T09:00:00Z', slot_categories: ['chain'] },
    { id: 4, name: 'Never', retired_on: null, last_ride_on: null, slot_categories: ['chain'] },
  ]

  it('orders active bikes by last ride, flags untracked ones, and keeps retired behind the toggle', () => {
    expect(bikeOptions(bikes, 'chain', false).map((o) => [o.label, o.note])).toEqual([
      ['Libre', 'Not tracked on this bike'],
      ['Soloist', null],
      ['Never', null],
    ])
    const withRetired = bikeOptions(bikes, 'chain', true)
    expect(withRetired.at(-1)).toMatchObject({ label: 'Old MTB', note: 'Retired', retired: true })
  })
})

describe('slotOptions', () => {
  const bike = {
    id: 1,
    bike_component_slots: [slot(10, 'chain'), slot(11, 'cassette', 'outdoor_only'), slot(12, 'cassette', 'indoor_only')],
    component_assignments: [open(100, 5, 'Chain S2', 'chain'), open(101, 6, 'Road cassette', 'cassette', 'outdoor_only')],
  }

  it('labels a slot with its context and occupant, and hides the field with one choice', () => {
    const options = slotOptions({ component: spareChain, bike, allowsMultiple: false, past: false })
    expect(options).toEqual([
      { slotId: 10, rideContext: 'both', occupant: { assignmentId: 100, label: 'Chain S2' }, label: 'Chain · All rides · Chain S2 installed' },
    ])
    expect(showSlotField(options)).toBe(false)
  })

  it('offers both split slots to a spare cassette, empty or not', () => {
    const cassette = { id: 7, category: 'cassette', retired_on: null, current_bikes: [] }
    const options = slotOptions({ component: cassette, bike, allowsMultiple: true, past: false })
    expect(options.map((o) => o.label)).toEqual(['Cassette · Outdoor only · Road cassette installed', 'Cassette · Trainer only · empty'])
    expect(showSlotField(options)).toBe(true)
  })

  it('offers a shared indoor cassette only the indoor slot when installing now, and every slot for a past stint', () => {
    const shared = { id: 8, category: 'cassette', retired_on: null, current_bikes: [{ id: 2, name: 'Trainer', ride_context: 'indoor_only' as const }] }
    expect(slotOptions({ component: shared, bike, allowsMultiple: true, past: false }).map((o) => o.slotId)).toEqual([12])
    expect(slotOptions({ component: shared, bike, allowsMultiple: false, past: false })).toEqual([])
    expect(slotOptions({ component: shared, bike, allowsMultiple: true, past: true }).map((o) => o.slotId)).toEqual([11, 12])
  })
})

describe('the submit case', () => {
  const occupant = { assignmentId: 100, label: 'Chain S2' }

  it('is closed with a Removed on date, a swap into an occupied slot, else an install', () => {
    expect(submitCase({ removedOn: '2026-05-01T00:00:00Z', occupant })).toBe('closed')
    expect(submitCase({ removedOn: null, occupant })).toBe('swap')
    expect(submitCase({ removedOn: null, occupant: null })).toBe('install')
    expect(primaryLabel('swap', 'menu')).toBe('Swap in')
    expect(primaryLabel('closed', 'history')).toBe('Add installation')
    expect(primaryLabel('closed', 'menu')).toBe('Install')
    expect(primaryLabel('install', 'history')).toBe('Install')
  })

  it('requires Removed on for a mounted component or a retired bike', () => {
    expect(removedOnRequired({ retired_on: null, current_bikes: [{ id: 1, name: 'Soloist', ride_context: 'both' }] }, false)).toMatch(/past installation/)
    expect(removedOnRequired({ retired_on: null, current_bikes: [] }, true)).toMatch(/retired bike/)
    expect(removedOnRequired({ retired_on: null, current_bikes: [] }, false)).toBeNull()
  })
})

describe('dates and lines', () => {
  const now = new Date('2026-11-26T12:00:00Z')

  it('checks the order and the future', () => {
    expect(dateErrors('2026-03-01T00:00:00Z', '2026-05-01T00:00:00Z', now)).toEqual({})
    expect(dateErrors('2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z', now)).toEqual({ ended_at: 'Must be after Installed on' })
    expect(dateErrors('2026-12-01T00:00:00Z', null, now)).toEqual({ started_at: "Can't be in the future" })
    expect(dateErrors('2026-03-01T00:00:00Z', '2026-12-01T00:00:00Z', now)).toEqual({ ended_at: "Can't be in the future" })
    expect(dateErrors(null, null, now)).toEqual({ started_at: 'Installed on is required' })
  })

  it('reads the attribution summary and the swap note', () => {
    expect(attributionLine('Soloist', '2026-06-02T12:00:00Z', '2026-09-30T12:00:00Z', now)).toBe(
      'Rides on Soloist from Jun 2 to Sep 30 will count toward this component.',
    )
    expect(attributionLine('Soloist', '2025-06-02T12:00:00Z', null, now)).toBe('Rides on Soloist from Jun 2, 2025 to now will count toward this component.')
    expect(swapNote('Chain S2', 'Soloist', '2026-11-26T10:00:00Z', now)).toBe('This will remove Chain S2 from Soloist on Nov 26.')
  })

  it("takes a split slot's context, else the category default", () => {
    expect(installRideContext('indoor_only', 'both')).toBe('indoor_only')
    expect(installRideContext('both', 'outdoor_only')).toBe('outdoor_only')
    expect(installRideContext(null, undefined)).toBe('both')
  })
})
