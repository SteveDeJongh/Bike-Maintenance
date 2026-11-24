import { describe, expect, it } from 'vitest'
import { formatHeaderDate, formatShortDate, isoWeekNumber, relativeDay } from './datetime'

describe('isoWeekNumber', () => {
  it('numbers an ordinary week', () => {
    expect(isoWeekNumber(new Date(2026, 10, 20))).toBe(47)
  })

  it('puts early January in the previous year’s last week when the year starts late in the week', () => {
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53) // Friday; 2026 has 53 ISO weeks
    expect(isoWeekNumber(new Date(2027, 0, 4))).toBe(1) // the following Monday
  })

  it('puts late December in week 1 when the next year starts early in the week', () => {
    expect(isoWeekNumber(new Date(2024, 11, 30))).toBe(1) // Monday; 2025-01-01 is a Wednesday
  })

  it('treats Sunday as the end of the week', () => {
    expect(isoWeekNumber(new Date(2026, 10, 22))).toBe(47)
    expect(isoWeekNumber(new Date(2026, 10, 23))).toBe(48)
  })
})

describe('formatHeaderDate', () => {
  it('reads weekday, short month and day, then the week', () => {
    expect(formatHeaderDate(new Date(2026, 10, 20), 'en-US')).toBe('Friday, Nov 20 · week 47')
  })
})

// Assertions look for the year, not exact text: formatShortDate uses the
// browser's locale. Dates are local noon so no zone shifts the day.
describe('formatShortDate', () => {
  const now = new Date(2026, 10, 24, 12)
  const local = (year: number, month: number, day: number) => new Date(year, month, day, 12).toISOString()

  it('leaves the year out for this year', () => {
    const text = formatShortDate(local(2026, 10, 16), now)
    expect(text).toMatch(/16/)
    expect(text).not.toMatch(/2026/)
  })

  it('includes the year for an earlier year', () => {
    expect(formatShortDate(local(2025, 2, 2), now)).toMatch(/2025/)
  })

  it('compares years in local time, not UTC', () => {
    expect(formatShortDate(local(2026, 0, 1), now)).not.toMatch(/2026/)
    expect(formatShortDate(local(2025, 11, 31), now)).toMatch(/2025/)
  })
})

describe('relativeDay', () => {
  const now = new Date(2026, 10, 24, 9)
  const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month, day, hour).toISOString()

  it('says today and yesterday by calendar day, not 24 hours', () => {
    expect(relativeDay(at(2026, 10, 24, 0), now)).toBe('today')
    expect(relativeDay(at(2026, 10, 23, 23), now)).toBe('yesterday')
    expect(relativeDay(at(2026, 10, 23, 0), now)).toBe('yesterday')
  })

  it('falls back to the short date, with the year only before this year', () => {
    expect(relativeDay(at(2026, 10, 22), now)).toBe(formatShortDate(at(2026, 10, 22), now))
    expect(relativeDay(at(2026, 10, 22), now)).not.toMatch(/2026/)
    expect(relativeDay(at(2025, 2, 2), now)).toMatch(/2025/)
  })

  it('handles yesterday across a month boundary', () => {
    expect(relativeDay(at(2026, 10, 30), new Date(2026, 11, 1, 8))).toBe('yesterday')
  })
})
