import { describe, expect, it } from 'vitest'
import { formatPercentChange } from './stats'

describe('formatPercentChange', () => {
  it('formats an increase with a plus sign', () => {
    expect(formatPercentChange(7_925, 7_140)).toEqual({ text: '+11%', up: true })
  })

  it('formats a decrease with a minus sign', () => {
    expect(formatPercentChange(6_000, 8_000)).toEqual({ text: '-25%', up: false })
  })

  it('counts no change as up', () => {
    expect(formatPercentChange(5_000, 5_000)).toEqual({ text: '+0%', up: true })
  })

  it('rounds to a whole percent, never "-0%"', () => {
    expect(formatPercentChange(9_996, 10_000)).toEqual({ text: '+0%', up: true })
  })

  it('is null with nothing last year to compare against', () => {
    expect(formatPercentChange(1_000, 0)).toBeNull()
  })
})
