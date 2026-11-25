import { describe, expect, it } from 'vitest'
import { setupRowLabel, type SetupRowLabelInput } from './setupRowLabel'
import { categoryLabel } from '../constants'

const ctx = { bikeName: 'Soloist', category: 'cassette' }
const row = (overrides: Partial<SetupRowLabelInput> = {}): SetupRowLabelInput => ({
  label: '',
  brand: '',
  model: '',
  rideContext: 'both',
  ...overrides,
})

describe('setupRowLabel', () => {
  it('keeps a typed label, trimmed, never rewritten', () => {
    expect(setupRowLabel(row({ label: '  Race cassette ', brand: 'Shimano' }), ctx)).toBe('Race cassette')
    expect(setupRowLabel(row({ label: 'Race cassette', rideContext: 'indoor_only' }), ctx)).toBe('Race cassette')
  })

  it('falls back to brand, model, or both', () => {
    expect(setupRowLabel(row({ brand: 'Shimano' }), ctx)).toBe('Shimano')
    expect(setupRowLabel(row({ model: 'CS-R8100' }), ctx)).toBe('CS-R8100')
    expect(setupRowLabel(row({ brand: 'Shimano', model: 'CS-R8100' }), ctx)).toBe('Shimano CS-R8100')
  })

  it('falls back to "{bike} {category}" with neither', () => {
    expect(setupRowLabel(row(), ctx)).toBe(`Soloist ${categoryLabel('cassette')}`)
  })

  it('adds the ride context on a split row', () => {
    expect(setupRowLabel(row({ brand: 'Shimano', model: 'CS-R8100', rideContext: 'indoor_only' }), ctx)).toBe(
      'Shimano CS-R8100 (Trainer only)',
    )
    expect(setupRowLabel(row({ rideContext: 'outdoor_only' }), ctx)).toBe(`Soloist ${categoryLabel('cassette')} (Outdoor only)`)
  })

  it('trims whitespace-only and padded fields', () => {
    expect(setupRowLabel(row({ label: '   ', brand: '  Shimano ', model: ' CS-R8100  ' }), ctx)).toBe('Shimano CS-R8100')
    expect(setupRowLabel(row({ brand: '   ', model: '  ' }), ctx)).toBe(`Soloist ${categoryLabel('cassette')}`)
  })
})
