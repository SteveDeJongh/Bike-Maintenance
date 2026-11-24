import { describe, expect, it } from 'vitest'
import { componentWearValue } from './wear'

const none = { distance_remaining_meters: null, moving_time_remaining_seconds: null, days_remaining: null, total_distance_meters: null }

describe('componentWearValue', () => {
  it("shows what's left on the driving requirement", () => {
    expect(componentWearValue({ ...none, driving_dimension: 'distance', distance_remaining_meters: 4_000 })).toBe('4 km left')
    expect(componentWearValue({ ...none, driving_dimension: 'days', days_remaining: 16 })).toBe('16 days left')
  })

  it('shows how far over a due requirement is', () => {
    expect(componentWearValue({ ...none, driving_dimension: 'distance', distance_remaining_meters: -120_000 })).toBe('120 km over')
  })

  it('shows the lifetime total with no requirement', () => {
    expect(componentWearValue({ ...none, driving_dimension: null, total_distance_meters: 2_140_000 })).toBe('2,140 km total')
  })

  it('is a dash with neither', () => {
    expect(componentWearValue({ ...none, driving_dimension: null })).toBe('—')
  })
})
