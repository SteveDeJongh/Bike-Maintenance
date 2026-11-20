import { describe, expect, it } from 'vitest'
import { initialPerformedAtForRide } from './rideTiming'
import type { ActivityRideItem } from '../types/models'

describe('initialPerformedAtForRide', () => {
  function ride(partial: Record<string, unknown>): ActivityRideItem {
    return partial as unknown as ActivityRideItem
  }

  it("adds the ride's elapsed time to its start", () => {
    const result = initialPerformedAtForRide(ride({ moved_at: '2026-03-01T08:00:00.000Z', elapsed_time: 3600 }))
    expect(result).toBe('2026-03-01T09:00:00.000Z')
  })

  it('falls back to the start time when elapsed_time is null', () => {
    const result = initialPerformedAtForRide(ride({ moved_at: '2026-03-01T08:00:00.000Z', elapsed_time: null }))
    expect(result).toBe('2026-03-01T08:00:00.000Z')
  })

  it('accepts the minimal { moved_at, elapsed_time } shape, no full ride payload needed', () => {
    const result = initialPerformedAtForRide({ moved_at: '2026-03-01T08:00:00.000Z', elapsed_time: 90 })
    expect(result).toBe('2026-03-01T08:01:30.000Z')
  })
})
