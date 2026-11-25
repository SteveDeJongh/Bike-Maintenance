// Bike setup: entered values decide what's tracked (docs/components-and-
// setup.md, "Bike setup"). Typing in an unchecked row's Label, Brand, Model
// or Notes checks it as autoChecked; an autoChecked row unchecks itself when
// it's emptied, on blur. The checkbox, "Check all"/"Clear all" and a bike
// type preset check deliberately (autoChecked: false), so those rows stay
// checked when empty. Clicking or Tab alone never checks a row, and
// Brand/Model's blur casing fix isn't typing.

interface Checkable {
  checked: boolean
  autoChecked: boolean
}

interface RowValues {
  label: string
  brand: string
  model: string
  notes: string
}

// A typed value: the change itself, with the auto-check merged in when the
// row is unchecked -- one state update, not two.
export function withActivation<T extends object>(
  row: Checkable,
  changes: T,
): T | (T & { checked: true; autoChecked: true }) {
  return row.checked ? changes : { ...changes, checked: true, autoChecked: true }
}

export function isEmptyRow(row: RowValues): boolean {
  return [row.label, row.brand, row.model, row.notes].every((value) => !value.trim())
}

// Focus leaving a Label/Brand/Model/Notes input: an autoChecked row with
// nothing left in it unchecks; anything else sends nothing (null), so a
// plain blur re-renders no row.
export function blurChange(row: Checkable & RowValues): { checked: false; autoChecked: false } | null {
  return row.checked && row.autoChecked && isEmptyRow(row) ? { checked: false, autoChecked: false } : null
}

// Any typed value (Label, Brand/Model input, Notes): withActivation, and
// from then on the row is the user's, so a preset's "Ticked by" note clears.
// Never touches autoChecked on a checked row.
export function typedChange<T extends object>(row: Checkable & { presetChecked?: boolean }, changes: T) {
  const activated = withActivation(row, changes)
  return row.presetChecked ? { ...activated, presetChecked: false as const } : activated
}

// The checkbox, "Check all" and "Clear all": a deliberate check (stays
// checked when emptied) that also clears the preset's note.
export function deliberateCheck(checked: boolean): { checked: boolean; autoChecked: false; presetChecked: false } {
  return { checked, autoChecked: false, presetChecked: false }
}

// How a row applies a change: a shallow merge, so unchecking
// ({ checked: false }) keeps whatever was typed.
export function applyRowChange<R extends Checkable>(row: R, changes: Partial<R>): R {
  return { ...row, ...changes }
}
