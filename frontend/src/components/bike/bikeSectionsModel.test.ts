import { describe, expect, it } from 'vitest'
import { bikeServiceFeedParams, ridesSummary, serviceHistoryFoldedSummary } from './bikeSectionsModel'

describe('serviceHistoryFoldedSummary', () => {
  it('counts services and component changes', () => {
    expect(serviceHistoryFoldedSummary({ services: 18, changes: 22 })).toBe('18 services · 22 component changes')
  })

  it('is singular for one', () => {
    expect(serviceHistoryFoldedSummary({ services: 1, changes: 1 })).toBe('1 service · 1 component change')
  })

  it('leaves out a zero part', () => {
    expect(serviceHistoryFoldedSummary({ services: 0, changes: 3 })).toBe('3 component changes')
    expect(serviceHistoryFoldedSummary({ services: 4, changes: 0 })).toBe('4 services')
  })

  it('says so when both are zero', () => {
    expect(serviceHistoryFoldedSummary({ services: 0, changes: 0 })).toBe('No service or component changes')
  })

  it('shows only the changes until the service count arrives', () => {
    expect(serviceHistoryFoldedSummary({ services: null, changes: 2 })).toBe('2 component changes')
    expect(serviceHistoryFoldedSummary({ services: null, changes: 0 })).toBe('')
  })
})

describe('ridesSummary', () => {
  const now = new Date(2026, 10, 24, 18)
  const at = (year: number, month: number, day: number) => new Date(year, month, day, 12).toISOString()

  it('is the ride count when open', () => {
    expect(ridesSummary(214, at(2026, 10, 24), false, now)).toBe('214 on this bike')
  })

  it('adds the last ride when folded', () => {
    expect(ridesSummary(214, at(2026, 10, 24), true, now)).toBe('214 on this bike · last ride today')
    expect(ridesSummary(214, at(2026, 10, 23), true, now)).toBe('214 on this bike · last ride yesterday')
    expect(ridesSummary(214, at(2025, 2, 2), true, now)).toMatch(/^214 on this bike · last ride .*2025$/)
  })

  it('has no last-ride part without rides', () => {
    expect(ridesSummary(0, null, true, now)).toBe('0 on this bike')
  })
})

describe('bikeServiceFeedParams', () => {
  it("is BikeServiceCard's query: this bike's service, newest first", () => {
    expect(bikeServiceFeedParams(7, 'UTC')).toEqual({ kinds: ['service'], bikeId: 7, tz: 'UTC', order: 'desc', sort: 'date' })
  })
})
