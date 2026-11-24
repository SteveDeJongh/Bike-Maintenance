import { describe, expect, it } from 'vitest'
import { historyRows } from './historyRows'
import type { ComponentAssignmentWithStats } from '../../types/models'

function assignment(
  id: number,
  label: string,
  { category = 'chain', started_at, ended_at = null, ride_context = 'both', distance = 196_000 }: {
    category?: string
    started_at: string
    ended_at?: string | null
    ride_context?: 'both' | 'outdoor_only' | 'indoor_only'
    distance?: number
  },
) {
  return {
    id,
    bike_id: 1,
    component_id: id * 10,
    started_at,
    ended_at,
    ride_context,
    distance_meters: distance,
    moving_time: 0,
    elevation_gain: 0,
    average_power: null,
    component: { id: id * 10, label, category, total_distance: 2_410_000 },
  } as unknown as ComponentAssignmentWithStats
}

const SWAP = '2026-11-20T18:00:00.000Z'

describe('historyRows', () => {
  it('reads a swap as old → new, with the category and distance ran', () => {
    const rows = historyRows([
      assignment(1, 'Chain S2', { started_at: '2026-10-01T00:00:00Z', ended_at: SWAP }),
      assignment(2, 'Chain S1', { started_at: SWAP }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Chain S2 → Chain S1', subLine: 'Chain · ran 196 km', lifetime: '2,410 km', endedAt: SWAP })
  })

  it('reads an installation with no successor as a removal', () => {
    const rows = historyRows([
      assignment(1, 'Continental GP5000', { category: 'tire_rear', started_at: '2026-01-01T00:00:00Z', ended_at: SWAP }),
    ])
    expect(rows[0].title).toBe('Removed Continental GP5000')
    expect(rows[0].subLine).toBe('Rear Tire · ran 196 km')
  })

  it("doesn't pair across categories or ride contexts", () => {
    const rows = historyRows([
      assignment(1, 'Outdoor cassette', { category: 'cassette', ride_context: 'outdoor_only', started_at: '2026-01-01T00:00:00Z', ended_at: SWAP }),
      assignment(2, 'Trainer cassette', { category: 'cassette', ride_context: 'indoor_only', started_at: SWAP }),
      assignment(3, 'Saddle', { category: 'saddle', started_at: SWAP }),
    ])
    expect(rows[0].title).toBe('Removed Outdoor cassette')
  })

  it('lists the most recently ended first, leaving open installations out', () => {
    const rows = historyRows([
      assignment(1, 'Old', { started_at: '2025-01-01T00:00:00Z', ended_at: '2025-06-01T00:00:00Z' }),
      assignment(2, 'Newer', { started_at: '2025-06-01T00:00:00Z', ended_at: '2026-01-01T00:00:00Z' }),
      assignment(3, 'Current', { started_at: '2026-01-01T00:00:00Z' }),
    ])
    expect(rows.map((row) => row.title)).toEqual(['Newer → Current', 'Old → Newer'])
  })
})
