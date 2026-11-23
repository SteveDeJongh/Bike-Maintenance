import { describe, expect, it } from 'vitest'
import { activityGridTemplate, canAddField, effectiveGroupBy } from './activityListModel'

describe('effectiveGroupBy', () => {
  it('keeps the saved grouping in date order and turns it off for a field sort', () => {
    expect(effectiveGroupBy('occurred_at', 'week')).toBe('week')
    expect(effectiveGroupBy('occurred_at', 'none')).toBe('none')
    expect(effectiveGroupBy('distance_meters', 'week')).toBe('none')
  })
})

describe('canAddField', () => {
  it('allows up to six fields', () => {
    expect(canAddField(['a', 'b', 'c', 'd', 'e'])).toBe(true)
    expect(canAddField(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false)
  })
})

describe('activityGridTemplate', () => {
  it('adds one column per field after the fixed three', () => {
    expect(activityGridTemplate(0)).toBe('88px 32px minmax(220px, 1fr)')
    expect(activityGridTemplate(2)).toBe('88px 32px minmax(220px, 1fr) repeat(2, minmax(84px, auto))')
  })
})
