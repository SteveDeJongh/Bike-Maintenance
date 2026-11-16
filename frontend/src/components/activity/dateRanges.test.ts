/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { daysAgoIso, startOfMonthIso, startOfWeekIso, startOfYearIso, todayIso, toIsoDate } from './dateRanges'

// Every function here reads new Date() (or a passed-in Date) in whatever
// timezone the process is running in -- there's no explicit IANA zone the
// way Dashboard's own tz query param uses. process.env.TZ is what Node
// reads for that, so fixing it per test is what makes these assertions
// deterministic regardless of where the suite actually runs, and is also
// how the tests below exercise that very assumption directly (the first
// two toIsoDate cases read the *same* instant as two different calendar
// dates, purely because of a TZ change).
describe('dateRanges', () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    process.env.TZ = originalTz
    vi.useRealTimers()
  })

  describe('toIsoDate', () => {
    it('reads the local calendar date, which can be a day ahead of UTC', () => {
      process.env.TZ = 'Pacific/Kiritimati' // UTC+14
      expect(toIsoDate(new Date('2026-01-01T00:30:00Z'))).toBe('2026-01-01')
    })

    it('reads the local calendar date, which can be a day behind UTC', () => {
      process.env.TZ = 'Pacific/Midway' // UTC-11
      expect(toIsoDate(new Date('2026-01-01T00:30:00Z'))).toBe('2025-12-31')
    })
  })

  describe('startOfWeekIso', () => {
    it('returns today when today is already Monday', () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-03-02T12:00:00Z')) // a Monday
      expect(startOfWeekIso()).toBe('2026-03-02')
    })

    it('returns the preceding Monday when today is Sunday (the week-boundary case)', () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-03-08T12:00:00Z')) // a Sunday
      expect(startOfWeekIso()).toBe('2026-03-02')
    })
  })

  describe('startOfMonthIso', () => {
    it("returns the 1st of the month that just started (a month boundary)", () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-03-01T00:30:00Z'))
      expect(startOfMonthIso()).toBe('2026-03-01')
    })

    it('returns the 1st of the current month mid-month', () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
      expect(startOfMonthIso()).toBe('2026-03-01')
    })
  })

  describe('startOfYearIso', () => {
    it('returns Jan 1 of the year that just started (a year boundary)', () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-01-01T00:30:00Z'))
      expect(startOfYearIso()).toBe('2026-01-01')
    })
  })

  describe('daysAgoIso', () => {
    it('subtracts the given number of days, crossing a month boundary', () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
      expect(daysAgoIso(30)).toBe('2026-02-13')
    })
  })

  describe('todayIso', () => {
    it("returns today's local date", () => {
      process.env.TZ = 'UTC'
      vi.setSystemTime(new Date('2026-03-15T12:00:00Z'))
      expect(todayIso()).toBe('2026-03-15')
    })
  })
})
