import { describe, expect, it } from 'vitest'
import { installationActions, whereItIs, whereItIsText } from './installationModel'

const now = new Date(2026, 10, 24, 12)
const day = (year: number, month: number, date: number) => new Date(year, month, date, 12).toISOString()
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fullDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const current = { bike_id: 2, started_at: day(2026, 9, 15), ended_at: null, ride_context: 'both' as const }

describe('whereItIs / whereItIsText', () => {
  it('reads "On <bike> since <date> · <context>" for a current installation', () => {
    const where = whereItIs(current, 'Soloist', [{ id: 2, name: 'Soloist', ride_context: 'both' }])
    expect(where).toMatchObject({ kind: 'current', bike: { id: 2, name: 'Soloist' }, alsoOn: [] })
    expect(whereItIsText(where, now)).toBe(`On Soloist since ${shortDay(current.started_at)} · All rides`)
  })

  it('adds "· also on <other bikes>" for a shared cassette, leaving this bike out', () => {
    const shared = { ...current, ride_context: 'indoor_only' as const }
    const where = whereItIs(shared, 'Soloist', [
      { id: 2, name: 'Soloist', ride_context: 'indoor_only' },
      { id: 4, name: 'Zwift rig', ride_context: 'indoor_only' },
      { id: 3, name: 'Juan Solo', ride_context: 'indoor_only' },
    ])
    expect(whereItIsText(where, now)).toBe(`On Soloist since ${shortDay(current.started_at)} · Trainer only · also on Juan Solo, Zwift rig`)
  })

  it('reads "Was on <bike> · <start> → <end> · <context>" for a past one, ignoring current bikes', () => {
    const past = { bike_id: 2, started_at: day(2026, 5, 2), ended_at: day(2026, 8, 30), ride_context: 'outdoor_only' as const }
    const where = whereItIs(past, 'Soloist', [{ id: 5, name: 'Elsewhere', ride_context: 'both' }])
    expect(where.kind).toBe('past')
    expect(whereItIsText(where, now)).toBe(`Was on Soloist · ${shortDay(past.started_at)} → ${fullDay(past.ended_at)} · Outdoor only`)
  })
})

describe('installationActions', () => {
  it('offers Log service, Edit and Remove for a current installation', () => {
    expect(installationActions({ ended_at: null })).toEqual(['log_service', 'edit', 'remove'])
  })

  it('offers only Edit for a past one', () => {
    expect(installationActions({ ended_at: day(2026, 8, 30) })).toEqual(['edit'])
  })
})
