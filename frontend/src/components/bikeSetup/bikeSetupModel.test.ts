import { describe, expect, it } from 'vitest'
import {
  actionBarSummary,
  makeRow,
  notesPillLabel,
  rowHasDetails,
  setupButtonLabel,
  tickedCount,
  trackedLabel,
  type SetupRow,
} from './bikeSetupModel'
import type { BikeDetail } from '../../types/models'
import { formatDate } from '../../utils/datetime'

const row = (key: string, overrides: Partial<SetupRow> = {}): SetupRow => ({ ...makeRow(key, 'both', false, false), ...overrides })
const from = formatDate('2026-04-04')
const summary = (rowsByCategory: Record<string, SetupRow[]>, errorCount = 0) =>
  actionBarSummary({ rowsByCategory, installedOn: '2026-04-04', bikeName: 'Soloist', errorCount })

describe('rowHasDetails', () => {
  it('is any of Label, Brand, Model or Notes, trimmed', () => {
    expect(rowHasDetails(row('a'))).toBe(false)
    expect(rowHasDetails(row('a', { notes: '  ' }))).toBe(false)
    expect(rowHasDetails(row('a', { model: 'X11' }))).toBe(true)
  })
})

describe('tickedCount', () => {
  it('counts checked rows of every row that can be tracked', () => {
    const rows = { chain: [row('chain', { checked: true })], cassette: [row('c1'), row('c2', { checked: true })], tires: [] }
    expect(tickedCount(rows)).toEqual({ ticked: 2, total: 3 })
  })
})

describe('setupButtonLabel', () => {
  it('reads singular, plural, and plain at 0', () => {
    expect(setupButtonLabel(0)).toBe('Set up components')
    expect(setupButtonLabel(1)).toBe('Set up 1 component')
    expect(setupButtonLabel(8)).toBe('Set up 8 components')
  })
})

describe('actionBarSummary', () => {
  it('splits with and without details', () => {
    const s = summary({
      chain: [row('chain', { checked: true, brand: 'KMC' })],
      cassette: [row('cassette', { checked: true })],
      tire: [row('tire', { checked: true, label: 'Front' }), row('x')],
    })
    expect(s.headline).toBe('3 components will be created and installed on Soloist')
    expect(s.detail).toBe(`From ${from} · 2 with details · 1 ticked without details`)
    expect(s.phoneLine).toBe(`3 will be installed from ${from}`)
  })

  it('drops zero parts, uses the singular, and adds the needs-a-fix part', () => {
    const one = { chain: [row('chain', { checked: true })] }
    expect(summary(one).headline).toBe('1 component will be created and installed on Soloist')
    expect(summary(one).detail).toBe(`From ${from} · 1 ticked without details`)
    expect(summary(one, 1).detail).toBe(`From ${from} · 1 ticked without details · 1 row needs a fix`)
    expect(summary(one, 2).detail).toMatch(/· 2 rows need a fix$/)
  })

  it('reads "Nothing to set up yet" at 0 checked', () => {
    expect(summary({ chain: [row('chain')] })).toEqual({
      empty: true,
      headline: 'Nothing to set up yet',
      detail: null,
      phoneLine: 'Nothing to set up yet',
    })
  })
})

describe('notesPillLabel', () => {
  it('reads "+ Notes", "1 note" for a hidden note, "Hide notes" when open', () => {
    expect(notesPillLabel({ notes: ' ', notesExpanded: false })).toBe('+ Notes')
    expect(notesPillLabel({ notes: 'Two coats', notesExpanded: false })).toBe('1 note')
    expect(notesPillLabel({ notes: '', notesExpanded: true })).toBe('Hide notes')
  })
})

describe('trackedLabel', () => {
  const assignment = (label: string, category: string, endedAt: string | null) => ({
    ended_at: endedAt,
    component: { label, category },
  })
  const bike = (assignments: ReturnType<typeof assignment>[]) =>
    ({ component_assignments: assignments }) as unknown as Pick<BikeDetail, 'component_assignments'>

  it("joins the category's open assignments, ignoring ended ones and other categories", () => {
    const b = bike([
      assignment('Cassette A', 'cassette', null),
      assignment('Cassette B', 'cassette', null),
      assignment('Old cassette', 'cassette', '2026-01-01T00:00:00Z'),
      assignment('Chain A', 'chain', null),
    ])
    expect(trackedLabel(b, 'cassette')).toBe('Cassette A, Cassette B')
    expect(trackedLabel(b, 'tire_front')).toBeNull()
  })
})
