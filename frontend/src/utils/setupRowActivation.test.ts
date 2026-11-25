import { describe, expect, it } from 'vitest'
import { applyRowChange, blurChange, deliberateCheck, isEmptyRow, typedChange, withActivation } from './setupRowActivation'

const blank = { checked: false, autoChecked: false, label: '', brand: '', model: '', notes: '' }
const deliberate = { ...blank, checked: true } // checkbox, "Check all" or a preset
const auto = { ...blank, checked: true, autoChecked: true }

describe('clicking or focusing alone', () => {
  it('sends nothing for an untouched unchecked row (there is no pointer handler; blur is a no-op)', () => {
    expect(blurChange(blank)).toBeNull()
  })
})

describe('withActivation (typing)', () => {
  it.each(['label', 'brand', 'model', 'notes'])('checks an unchecked row, autoChecked, on %s', (field) => {
    expect(withActivation(blank, { [field]: 'x' })).toEqual({ [field]: 'x', checked: true, autoChecked: true })
  })

  it('checks on picking a model suggestion (which may fill the brand too)', () => {
    expect(withActivation(blank, { brand: 'Shimano', model: 'CS-R8100' })).toEqual({
      brand: 'Shimano',
      model: 'CS-R8100',
      checked: true,
      autoChecked: true,
    })
  })

  it('leaves the change alone on a checked row, keeping how it was checked', () => {
    expect(withActivation(deliberate, { brand: 'Shi' })).toEqual({ brand: 'Shi' })
  })
})

describe('blurChange', () => {
  it('unchecks an emptied auto-checked row; whitespace counts as empty', () => {
    expect(blurChange(auto)).toEqual({ checked: false, autoChecked: false })
    expect(blurChange({ ...auto, label: '  ', notes: '\n' })).toEqual({ checked: false, autoChecked: false })
  })

  it('keeps an auto-checked row with any value', () => {
    expect(blurChange({ ...auto, notes: 'used' })).toBeNull()
  })

  it('keeps an emptied row checked by the checkbox, "Check all" or a preset', () => {
    expect(blurChange(deliberate)).toBeNull()
  })
})

describe('isEmptyRow', () => {
  it('looks at label, brand, model and notes, trimmed', () => {
    expect(isEmptyRow({ label: ' ', brand: '', model: '', notes: '' })).toBe(true)
    expect(isEmptyRow({ label: '', brand: '', model: 'X11', notes: '' })).toBe(false)
  })
})

describe('applyRowChange', () => {
  it('keeps the typed values when unchecking by hand', () => {
    const typed = { ...auto, label: 'Race', brand: 'Shimano', model: 'CS-R8100' }
    expect(applyRowChange(typed, { checked: false, autoChecked: false })).toEqual({ ...typed, checked: false, autoChecked: false })
  })
})

describe('presetChecked ("Ticked by preset")', () => {
  const preset = { ...blank, checked: true, presetChecked: true }

  it('clears on typing, and never makes a preset row autoChecked', () => {
    expect(typedChange(preset, { brand: 'S' })).toEqual({ brand: 'S', presetChecked: false })
  })

  it('leaves a row without the note alone, so an unchecked row still auto-checks', () => {
    expect(typedChange({ ...blank, presetChecked: false }, { label: 'x' })).toEqual({ label: 'x', checked: true, autoChecked: true })
  })

  it('clears on the checkbox (uncheck), Check all and Clear all, as a deliberate check', () => {
    expect(deliberateCheck(false)).toEqual({ checked: false, autoChecked: false, presetChecked: false })
    expect(deliberateCheck(true)).toEqual({ checked: true, autoChecked: false, presetChecked: false })
  })

  it('stays checked when emptied (a preset is deliberate)', () => {
    expect(blurChange(preset)).toBeNull()
  })
})
