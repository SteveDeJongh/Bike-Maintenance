import { describe, expect, it } from 'vitest'
import { IconArrowBarUp, IconArrowsExchange, IconBike, IconTool } from '@tabler/icons-react'
import { activityItemIconMeta, initialPerformedAtForRide, nonRideNote } from './activityItemMeta'
import type { ActivityItem, ActivityRideItem } from '../../types/models'

// Minimal fixtures: these three helpers only ever branch on kind/action/
// note/notes/moved_at/elapsed_time, so a cast through unknown (rather than
// a fully realistic ActivityItem) keeps each test focused on just the
// field(s) that matter to it.
function item(partial: Record<string, unknown>): ActivityItem {
  return partial as unknown as ActivityItem
}

describe('activityItemIconMeta', () => {
  it('returns the bike icon for a ride', () => {
    expect(activityItemIconMeta(item({ kind: 'ride' })).Icon).toBe(IconBike)
    expect(activityItemIconMeta(item({ kind: 'ride' })).label).toBe('Ride')
  })

  it('returns the tool icon for a maintenance_event', () => {
    const meta = activityItemIconMeta(item({ kind: 'maintenance_event' }))
    expect(meta.Icon).toBe(IconTool)
    expect(meta.label).toBe('Service')
  })

  it('returns the tool icon for a service_session, with the same label as a maintenance_event', () => {
    const meta = activityItemIconMeta(item({ kind: 'service_session' }))
    expect(meta.Icon).toBe(IconTool)
    expect(meta.label).toBe('Service')
  })

  it('returns the exchange icon for a setup_change that installed or replaced', () => {
    expect(activityItemIconMeta(item({ kind: 'setup_change', action: 'installed' })).Icon).toBe(IconArrowsExchange)
    expect(activityItemIconMeta(item({ kind: 'setup_change', action: 'replaced' })).Icon).toBe(IconArrowsExchange)
  })

  it('returns the removal icon for a setup_change that removed', () => {
    expect(activityItemIconMeta(item({ kind: 'setup_change', action: 'removed' })).Icon).toBe(IconArrowBarUp)
  })
})

describe('nonRideNote', () => {
  it("returns a maintenance_event's own note", () => {
    expect(nonRideNote(item({ kind: 'maintenance_event', note: 'Chain felt gritty' }))).toBe('Chain felt gritty')
  })

  it('returns null for a maintenance_event with no note', () => {
    expect(nonRideNote(item({ kind: 'maintenance_event', note: null }))).toBeNull()
  })

  it("returns a service_session's own notes", () => {
    expect(nonRideNote(item({ kind: 'service_session', notes: 'Full tune-up' }))).toBe('Full tune-up')
  })

  it('returns null for a ride', () => {
    expect(nonRideNote(item({ kind: 'ride' }))).toBeNull()
  })

  it('returns null for a setup_change', () => {
    expect(nonRideNote(item({ kind: 'setup_change' }))).toBeNull()
  })
})

describe('initialPerformedAtForRide', () => {
  function ride(partial: Record<string, unknown>): ActivityRideItem {
    return partial as unknown as ActivityRideItem
  }

  it("adds the ride's elapsed time to its start", () => {
    const result = initialPerformedAtForRide(ride({ moved_at: '2026-03-01T08:00:00.000Z', elapsed_time: 3600 }))
    expect(result).toBe('2026-03-01T09:00:00.000Z')
  })

  it('falls back to the start time when elapsed_time is null', () => {
    const result = initialPerformedAtForRide(ride({ moved_at: '2026-03-01T08:00:00.000Z', elapsed_time: null }))
    expect(result).toBe('2026-03-01T08:00:00.000Z')
  })
})
