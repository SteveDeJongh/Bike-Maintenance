import { describe, expect, it } from 'vitest'
import { formatSportType } from './strava'

describe('formatSportType', () => {
  it('splits CamelCase sport types into words', () => {
    expect(formatSportType('Ride')).toBe('Ride')
    expect(formatSportType('GravelRide')).toBe('Gravel Ride')
    expect(formatSportType('VirtualRide')).toBe('Virtual Ride')
    expect(formatSportType('MountainBikeRide')).toBe('Mountain Bike Ride')
  })

  it('handles any other multi-word type the same way', () => {
    expect(formatSportType('EMountainBikeRide')).toBe('E-Mountain Bike Ride')
    expect(formatSportType('Handcycle')).toBe('Handcycle')
    expect(formatSportType('Velomobile')).toBe('Velomobile')
  })

  it('hyphenates the e-bike prefix', () => {
    expect(formatSportType('EBikeRide')).toBe('E-Bike Ride')
    expect(formatSportType('EMountainBikeRide')).toBe('E-Mountain Bike Ride')
  })
})
