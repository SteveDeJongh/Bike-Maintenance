import { categoryLabel, RIDE_CONTEXT_LABELS } from '../constants'

export interface SetupRowLabelInput {
  label: string
  brand: string
  model: string
  rideContext: keyof typeof RIDE_CONTEXT_LABELS
}

// The label a Bike setup row saves (docs/components-and-setup.md, "Bike
// setup"). A typed label is sent as typed, trimmed. Left empty, it falls
// back to "{brand} {model}" (whichever exist), else "{bike} {category}" --
// so a label is always sent. A split row (outdoor_only/indoor_only) adds its
// ride context, e.g. "Shimano CS-R8100 (Trainer only)", so the two rows of
// a split category don't read the same. The row's placeholder is this with
// the label blanked, so what's shown is what's saved.
export function setupRowLabel(row: SetupRowLabelInput, { bikeName, category }: { bikeName: string; category: string }): string {
  const typed = row.label.trim()
  if (typed) return typed

  const brandModel = [row.brand.trim(), row.model.trim()].filter(Boolean).join(' ')
  const base = brandModel || `${bikeName} ${categoryLabel(category)}`
  return row.rideContext === 'both' ? base : `${base} (${RIDE_CONTEXT_LABELS[row.rideContext]})`
}
