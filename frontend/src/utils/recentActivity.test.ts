import { describe, expect, it } from 'vitest'
import { rideSportLabel } from './recentActivity'

describe('rideSportLabel', () => {
  it('humanises the sport type', () => {
    expect(rideSportLabel('GravelRide')).toBe('Gravel Ride')
    expect(rideSportLabel('VirtualRide')).toBe('Virtual Ride')
  })

  it('falls back to "Ride" with no type', () => {
    expect(rideSportLabel(null)).toBe('Ride')
  })
})
