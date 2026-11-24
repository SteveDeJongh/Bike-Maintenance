import type { ColumnOption } from '../datatable/ColumnPicker'

// DataList's pure helpers. A DataList is one CSS grid: fixed leading
// columns, one flexible main column, then one column per shown field. The
// header and every row are subgrids of it, so their cells always line up.

// The grid template: each leading track, the main track, each field track.
export function dataListTemplate({
  leading,
  main = 'minmax(220px, 1fr)',
  fields,
}: {
  leading: readonly string[]
  main?: string
  fields: readonly string[]
}): string {
  return [...leading, main, ...fields].join(' ')
}

// The narrowest the grid gets before its Paper scrolls sideways: every
// track's minimum, the gaps between tracks and the row's side padding.
export function dataListMinWidth({
  leading,
  main,
  fields,
  gap = 12,
  paddingX = 12,
}: {
  leading: readonly number[]
  main: number
  fields: readonly number[]
  gap?: number
  paddingX?: number
}): number {
  const tracks = [...leading, main, ...fields]
  const sum = tracks.reduce((total, width) => total + width, 0)
  return sum + (tracks.length - 1) * gap + paddingX * 2
}

// Whether another field can be shown under the Fields picker's cap.
export function canAddField(visible: readonly string[], cap: number): boolean {
  return visible.length < cap
}

export interface FieldPickerState {
  // Always shown: listed first, checked and disabled, never dragged.
  locked: ColumnOption[]
  // The chosen fields, in order (draggable).
  visible: ColumnOption[]
  available: ColumnOption[]
  atCap: boolean
}

// What the Fields picker lists. Locked fields sit outside the cap: they're
// never in `visible` or `available` and don't count toward `cap`.
export function fieldPickerState({
  all,
  visible,
  locked = [],
  cap,
}: {
  all: readonly ColumnOption[]
  visible: readonly string[]
  locked?: readonly ColumnOption[]
  cap?: number
}): FieldPickerState {
  const lockedKeys = new Set(locked.map((column) => column.key))
  const labelByKey = new Map(all.map((column) => [column.key, column.label]))
  const chosen = visible.filter((key) => !lockedKeys.has(key))

  return {
    locked: [...locked],
    visible: chosen.map((key) => ({ key, label: labelByKey.get(key) ?? key })),
    available: all.filter((column) => !lockedKeys.has(column.key) && !chosen.includes(column.key)),
    atCap: cap != null && !canAddField(chosen, cap),
  }
}

// Whether a click on a field's checkbox does anything: a locked field never
// toggles, a shown one can always be hidden, and a hidden one only shows
// under the cap.
export function canToggleField(
  key: string,
  { visible, locked = [], cap }: { visible: readonly string[]; locked?: readonly string[]; cap?: number },
): boolean {
  if (locked.includes(key)) return false
  if (visible.includes(key)) return true
  return cap == null || canAddField(visible.filter((k) => !locked.includes(k)), cap)
}
