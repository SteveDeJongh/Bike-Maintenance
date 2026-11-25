import { describe, expect, it } from 'vitest'
import { activationChange, applyRowChange, withActivation } from './setupRowActivation'

const unchecked = { checked: false, label: '', brand: '', model: '' }
const checked = { ...unchecked, checked: true }

describe('activationChange (a click or tap in Brand, Model or Label)', () => {
  it('checks an unchecked row, and sends nothing for a checked one', () => {
    expect(activationChange(unchecked)).toEqual({ checked: true })
    expect(activationChange(checked)).toBeNull()
  })
})

describe('withActivation (a keystroke)', () => {
  it('merges checked: true into the typed change on an unchecked row', () => {
    expect(withActivation(unchecked, { label: 'R' })).toEqual({ label: 'R', checked: true })
  })

  it('leaves the change alone on a checked row', () => {
    expect(withActivation(checked, { brand: 'Shi' })).toEqual({ brand: 'Shi' })
  })
})

describe('Tab alone', () => {
  it('never checks a row: focus sends nothing, and the blur casing fix goes through as is', () => {
    // BikeSetup routes onChange(changes, "blur") straight to the row,
    // without withActivation; an unchecked row stays unchecked.
    expect(applyRowChange(unchecked, { brand: 'Shimano' }).checked).toBe(false)
  })
})

describe('applyRowChange', () => {
  it('keeps the typed values when unchecking', () => {
    const typed = { ...checked, label: 'Race', brand: 'Shimano', model: 'CS-R8100' }
    expect(applyRowChange(typed, { checked: false })).toEqual({ ...typed, checked: false })
  })
})
