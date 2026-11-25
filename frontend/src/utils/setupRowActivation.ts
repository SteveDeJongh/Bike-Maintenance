// Bike setup: a click, tap or keystroke in an unchecked row's Label, Brand
// or Model checks the row (docs/components-and-setup.md, "Bike setup").
// Plain focus (Tab) and the on-blur casing fix never do.

interface Checkable {
  checked: boolean
}

// A pointer-down in an input: check an unchecked row, else nothing to send.
export function activationChange(row: Checkable): { checked: true } | null {
  return row.checked ? null : { checked: true }
}

// A typed value: the change itself, with checked: true merged in when the
// row is unchecked -- one state update, not two.
export function withActivation<T extends object>(row: Checkable, changes: T): T | (T & { checked: true }) {
  return row.checked ? changes : { ...changes, checked: true }
}

// How a row applies a change: a shallow merge, so unchecking
// ({ checked: false }) keeps whatever was typed.
export function applyRowChange<R extends Checkable>(row: R, changes: Partial<R>): R {
  return { ...row, ...changes }
}
