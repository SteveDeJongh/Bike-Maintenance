import { describe, expect, it } from 'vitest'
import { formatHeaderDate, isoWeekNumber } from './datetime'

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
