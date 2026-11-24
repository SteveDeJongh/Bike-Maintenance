import { describe, expect, it } from 'vitest'
import { canAddField, canToggleField, dataListMinWidth, dataListTemplate, fieldPickerState } from './dataListModel'

const ALL = [
  { key: 'distance', label: 'Distance' },
  { key: 'time', label: 'Moving time' },
  { key: 'elevation', label: 'Elevation' },
  { key: 'power', label: 'Avg power' },
]

describe('dataListTemplate', () => {
  it('joins the leading tracks, the main track and one track per field', () => {
    expect(dataListTemplate({ leading: ['88px', '32px'], fields: [] })).toBe('88px 32px minmax(220px, 1fr)')
    expect(dataListTemplate({ leading: ['88px', '32px'], fields: ['minmax(84px, auto)', 'minmax(84px, auto)'] })).toBe(
      '88px 32px minmax(220px, 1fr) minmax(84px, auto) minmax(84px, auto)',
    )
  })

  it('takes a custom main track and no leading tracks', () => {
    expect(dataListTemplate({ leading: [], main: 'minmax(160px, 2fr)', fields: ['96px'] })).toBe('minmax(160px, 2fr) 96px')
  })
})

describe('dataListMinWidth', () => {
  it('sums the track minimums, the gaps between them and the side padding', () => {
    // Activity with 4 fields: 88 + 32 + 220 + 4*84, 6 gaps of 12, 2*12 padding.
    expect(dataListMinWidth({ leading: [88, 32], main: 220, fields: [84, 84, 84, 84] })).toBe(88 + 32 + 220 + 336 + 72 + 24)
  })

  it('has no gaps for a single track', () => {
    expect(dataListMinWidth({ leading: [], main: 200, fields: [], paddingX: 0 })).toBe(200)
  })
})

describe('canAddField', () => {
  it('allows fields up to the cap', () => {
    expect(canAddField(['a', 'b', 'c', 'd', 'e'], 6)).toBe(true)
    expect(canAddField(['a', 'b', 'c', 'd', 'e', 'f'], 6)).toBe(false)
  })
})

describe('fieldPickerState', () => {
  it('splits shown fields, in order, from available ones', () => {
    const state = fieldPickerState({ all: ALL, visible: ['power', 'distance'], cap: 3 })

    expect(state.visible.map((c) => c.key)).toEqual(['power', 'distance'])
    expect(state.available.map((c) => c.key)).toEqual(['time', 'elevation'])
    expect(state.atCap).toBe(false)
    expect(state.locked).toEqual([])
  })

  it('reports the cap once the shown fields reach it', () => {
    expect(fieldPickerState({ all: ALL, visible: ['distance', 'time'], cap: 2 }).atCap).toBe(true)
  })

  it('never has a cap without one', () => {
    expect(fieldPickerState({ all: ALL, visible: ['distance', 'time', 'elevation', 'power'] }).atCap).toBe(false)
  })

  it('keeps locked fields out of the cap, the shown list and the available list', () => {
    const state = fieldPickerState({
      all: ALL,
      visible: ['distance', 'time'],
      locked: [{ key: 'distance', label: 'Distance' }],
      cap: 2,
    })

    expect(state.locked.map((c) => c.key)).toEqual(['distance'])
    expect(state.visible.map((c) => c.key)).toEqual(['time'])
    expect(state.available.map((c) => c.key)).toEqual(['elevation', 'power'])
    expect(state.atCap).toBe(false)
  })
})

describe('canToggleField', () => {
  it('never toggles a locked field', () => {
    expect(canToggleField('distance', { visible: ['distance'], locked: ['distance'] })).toBe(false)
  })

  it('always lets a shown field be hidden, even at the cap', () => {
    expect(canToggleField('time', { visible: ['time', 'power'], cap: 2 })).toBe(true)
  })

  it('shows a hidden field only under the cap, not counting locked ones', () => {
    expect(canToggleField('power', { visible: ['time', 'elevation'], cap: 2 })).toBe(false)
    expect(canToggleField('power', { visible: ['distance', 'time'], locked: ['distance'], cap: 2 })).toBe(true)
  })
})
