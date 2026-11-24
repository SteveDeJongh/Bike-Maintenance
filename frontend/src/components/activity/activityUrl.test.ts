import { describe, expect, it } from 'vitest'
import { activityUrl, parseActivityUrl } from './activityUrl'

describe('activityUrl', () => {
  it('links to Activity filtered to a bike and kinds', () => {
    expect(activityUrl({ bikeId: 12, kinds: ['ride'] })).toBe('/activity?bike_id=12&kinds=ride')
    expect(activityUrl({ bikeId: 12, kinds: ['service', 'setup'] })).toBe('/activity?bike_id=12&kinds=service%2Csetup')
  })

  it('leaves out what is not given', () => {
    expect(activityUrl({})).toBe('/activity')
    expect(activityUrl({ kinds: ['service'] })).toBe('/activity?kinds=service')
  })
})

describe('parseActivityUrl', () => {
  it('round-trips what activityUrl builds', () => {
    const url = new URL(activityUrl({ bikeId: 12, kinds: ['service', 'setup'] }), 'http://x')
    expect(parseActivityUrl(url.searchParams)).toEqual({ bikeId: 12, kinds: ['service', 'setup'] })
  })

  it('ignores a malformed bike id and unknown kinds', () => {
    expect(parseActivityUrl(new URLSearchParams('bike_id=abc&kinds=ride,bogus'))).toEqual({ bikeId: undefined, kinds: ['ride'] })
    expect(parseActivityUrl(new URLSearchParams('kinds=bogus'))).toEqual({ bikeId: undefined, kinds: undefined })
  })
})
