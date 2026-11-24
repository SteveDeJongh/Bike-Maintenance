import { describe, expect, it } from 'vitest'
import {
  activeElsewhereByComponent,
  addableSlotOptions,
  installedRows,
  installedFoldedSummary,
  installedSummaryLine,
  orderSlots,
  sortInstalledRows,
  type InstalledRow,
} from './installedComponentsModel'
import type { BikeComponentSlot, ComponentAssignmentWithStats, DashboardMountedComponent } from '../../types/models'

type RideContext = BikeComponentSlot['ride_context']

const slot = (id: number, category: string, ride_context: RideContext = 'both'): BikeComponentSlot => ({ id, bike_id: 1, category, ride_context })

function assignment(id: number, category: string, ride_context: RideContext = 'both', ended_at: string | null = null) {
  return {
    id,
    bike_id: 1,
    component_id: id * 10,
    started_at: '2026-01-01T00:00:00Z',
    ended_at,
    ride_context,
    distance_meters: id * 1_000,
    moving_time: 0,
    elevation_gain: 0,
    average_power: null,
    component: { id: id * 10, label: `${category} ${id}`, category, total_distance: id * 5_000, service_status: null },
  } as unknown as ComponentAssignmentWithStats
}

function wear(assignmentId: number, fraction: number | null): DashboardMountedComponent {
  return {
    assignment_id: assignmentId,
    fraction_used: fraction,
    driving_dimension: fraction === null ? null : 'distance',
  } as DashboardMountedComponent
}

const ORDER = ['chain', 'cassette', 'tire_front', 'saddle']

describe('orderSlots', () => {
  it('follows the category order, with the unsplit slot, then outdoor, then indoor', () => {
    const ordered = orderSlots(
      [slot(1, 'saddle'), slot(2, 'cassette', 'indoor_only'), slot(3, 'chain'), slot(4, 'cassette', 'outdoor_only')],
      ORDER,
    )
    expect(ordered.map((s) => s.id)).toEqual([3, 4, 2, 1])
  })
})

describe('installedRows', () => {
  const slots = orderSlots([slot(1, 'chain'), slot(2, 'cassette', 'outdoor_only'), slot(3, 'cassette', 'indoor_only'), slot(4, 'saddle')], ORDER)
  const assignments = [
    assignment(11, 'chain'),
    assignment(12, 'cassette', 'indoor_only'),
    assignment(13, 'cassette', 'outdoor_only'),
    assignment(14, 'saddle', 'both', '2026-02-01T00:00:00Z'), // ended: the saddle slot is empty
  ]
  const rows = installedRows(slots, assignments, [wear(11, 0.8), wear(12, null), wear(13, 0.2)])

  it('fills each slot in order and leaves an empty slot without an assignment', () => {
    expect(rows.map((row) => [row.slot.id, row.assignment?.id ?? null])).toEqual([
      [1, 11],
      [2, 13],
      [3, 12],
      [4, null],
    ])
  })

  it('matches each half of the indoor/outdoor cassette pair to its own slot', () => {
    expect(rows[1].assignment?.ride_context).toBe('outdoor_only')
    expect(rows[2].assignment?.ride_context).toBe('indoor_only')
  })

  it("attaches each installation's wear, all-null when it has no requirement", () => {
    expect(rows[0].wear?.fraction_used).toBe(0.8)
    expect(rows[2].wear?.fraction_used).toBeNull()
    expect(rows[3].wear).toBeUndefined()
  })

  it('summarises installed and empty slots', () => {
    expect(installedSummaryLine(rows)).toBe('3 installed · 1 empty slot')
    expect(installedSummaryLine(rows.slice(0, 3))).toBe('3 installed')
  })

  it('sorts Category by slot order, and puts empty and no-requirement rows last', () => {
    expect(sortInstalledRows(rows, 'category', 'desc').map((row) => row.slot.id)).toEqual([4, 3, 2, 1])
    expect(sortInstalledRows(rows, 'wear', 'desc').map((row) => row.slot.id)).toEqual([1, 2, 3, 4])
    expect(sortInstalledRows(rows, 'wear', 'asc').map((row) => row.slot.id)).toEqual([2, 1, 3, 4])
  })
})

describe('addableSlotOptions', () => {
  const settings = [
    { category: 'cassette', trackable: true, allows_multiple_assignments: true },
    { category: 'saddle', trackable: false, allows_multiple_assignments: false },
  ]

  it('offers untracked categories, split variants where allowed, and skips untrackable ones', () => {
    const options = addableSlotOptions(['chain', 'cassette', 'saddle'], [], settings)
    expect(options).toEqual([
      { category: 'chain', rideContext: 'both' },
      { category: 'cassette', rideContext: 'both' },
      { category: 'cassette', rideContext: 'outdoor_only' },
      { category: 'cassette', rideContext: 'indoor_only' },
    ])
  })

  it('offers only the missing half of a split pair, and nothing after an unsplit slot', () => {
    expect(addableSlotOptions(['cassette'], [slot(1, 'cassette', 'indoor_only')], settings)).toEqual([
      { category: 'cassette', rideContext: 'outdoor_only' },
    ])
    expect(addableSlotOptions(['chain'], [slot(1, 'chain')], settings)).toEqual([])
  })
})

describe('activeElsewhereByComponent', () => {
  it("collects other bikes' open installations per component, ignoring this bike's and ended ones", () => {
    const map = activeElsewhereByComponent(
      [
        { component_id: 1, bike_id: 2, ended_at: null, ride_context: 'indoor_only' },
        { component_id: 1, bike_id: 3, ended_at: null, ride_context: 'indoor_only' },
        { component_id: 2, bike_id: 1, ended_at: null, ride_context: 'both' },
        { component_id: 3, bike_id: 2, ended_at: '2026-01-01T00:00:00Z', ride_context: 'both' },
      ],
      1,
    )
    expect([...map.entries()]).toEqual([[1, ['indoor_only', 'indoor_only']]])
  })
})

describe('installedFoldedSummary', () => {
  const row = (id: number, status: 'ok' | 'warning' | 'due' | null, filled = true): InstalledRow => ({
    slot: slot(id, `cat${id}`),
    order: id,
    assignment: filled ? ({ id } as ComponentAssignmentWithStats) : undefined,
    wear: filled ? ({ assignment_id: id, service_status: status } as DashboardMountedComponent) : undefined,
  })

  it('counts installed, due, soon and empty slots', () => {
    const rows = [row(1, 'due'), row(2, 'warning'), row(3, 'warning'), row(4, 'ok'), row(5, null), row(6, null, false)]
    expect(installedFoldedSummary(rows)).toBe('5 installed · 1 due · 2 soon · 1 empty slot')
  })

  it('leaves out the parts that are zero', () => {
    expect(installedFoldedSummary([row(1, 'ok'), row(2, null)])).toBe('2 installed')
    expect(installedFoldedSummary([row(1, 'due'), row(2, 'due')])).toBe('2 installed · 2 due')
  })

  it('pluralises empty slots', () => {
    expect(installedFoldedSummary([row(1, 'ok'), row(2, null, false), row(3, null, false)])).toBe('1 installed · 2 empty slots')
  })

  it('reads 0 installed when the bike has only empty slots', () => {
    expect(installedFoldedSummary([row(1, null, false)])).toBe('0 installed · 1 empty slot')
  })
})
