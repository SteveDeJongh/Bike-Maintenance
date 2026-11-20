import { describe, expect, it } from 'vitest'
import { formatDrivingRemaining, primarySatisfier } from './serviceInterval'

const empty = { distance_remaining_meters: null, moving_time_remaining_seconds: null, days_remaining: null }

describe('formatDrivingRemaining', () => {
  it('shows distance left or over', () => {
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'distance', distance_remaining_meters: 8_000 })).toBe('8 km left')
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'distance', distance_remaining_meters: -120_000 })).toBe('120 km over')
  })

  it('shows moving time left or over', () => {
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'moving_time', moving_time_remaining_seconds: 5_400 })).toBe('1.5 hrs left')
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'moving_time', moving_time_remaining_seconds: -3_600 })).toBe('1 hrs over')
  })

  it('shows days left or over, singular for one', () => {
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'days', days_remaining: 3 })).toBe('3 days left')
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'days', days_remaining: 1 })).toBe('1 day left')
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'days', days_remaining: -1 })).toBe('1 day over')
  })

  it('uses only the driving dimension, ignoring the others', () => {
    expect(
      formatDrivingRemaining({ driving_dimension: 'days', distance_remaining_meters: 500, moving_time_remaining_seconds: 60, days_remaining: 2 }),
    ).toBe('2 days left')
  })

  it('shows a dash when the driving amount is missing', () => {
    expect(formatDrivingRemaining({ ...empty, driving_dimension: 'distance' })).toBe('—')
  })
})

describe('primarySatisfier', () => {
  it('picks the lowest position, whatever the order', () => {
    expect(primarySatisfier([{ position: 2, id: 'b' }, { position: 1, id: 'a' }])?.id).toBe('a')
  })

  it('is undefined with no satisfiers', () => {
    expect(primarySatisfier([])).toBeUndefined()
  })
})
