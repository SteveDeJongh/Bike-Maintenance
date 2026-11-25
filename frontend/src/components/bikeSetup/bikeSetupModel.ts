import { ApiError } from '../../api/client'
import { formatDate } from '../../utils/datetime'
import type { BikeDetail, BikeType, ComponentCategorySetting } from '../../types/models'

// The Bike setup page's row model and pure helpers (docs/components-and-
// setup.md, "Bike setup"). Typing/blur rules are in utils/setupRowActivation.ts,
// the saved label in utils/setupRowLabel.ts.

export type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

export interface SetupRow {
  key: string
  rideContext: RideContext
  // false only for the one case where the user actually has a choice: a
  // fresh (no existing slot), allows_multiple_assignments category's sole
  // starting row. Every other row's context is fixed by circumstance --
  // "both" for a plain category, or whichever split context is the only
  // one left once its sibling already exists.
  rideContextEditable: boolean
  checked: boolean
  // Checked by typing (not the checkbox, "Check all"/"Clear all" or a bike
  // type preset): unchecks itself when emptied (setupRowActivation.ts).
  autoChecked: boolean
  // Checked by the bike type's preset, shown as "Ticked by {type} preset".
  // Display only: cleared once the user unchecks the row, uses Check all /
  // Clear all, or types into it (setupRowActivation.ts).
  presetChecked: boolean
  label: string
  brand: string
  model: string
  notes: string
  notesExpanded: boolean
}

// Label starts blank: left empty, it saves setupRowLabel's brand/model
// fallback, which the input shows as its placeholder.
// `checked` here is the bike type preset's, so it's also presetChecked.
export function makeRow(key: string, rideContext: RideContext, rideContextEditable: boolean, checked: boolean): SetupRow {
  return { key, rideContext, rideContextEditable, checked, autoChecked: false, presetChecked: checked, label: '', brand: '', model: '', notes: '', notesExpanded: false }
}

// One row per addable (category, ride_context) combination -- a plain
// category gets at most one ("both"); an allows_multiple_assignments
// category gets up to two (outdoor_only + indoor_only), and only the
// context(s) not already slotted on this bike. A fully-tracked category
// (every valid context already has a slot) gets none -- the checklist
// shows it as an "Already tracked" row instead, never blocked, never hidden.
export function buildInitialRows(
  categories: string[],
  bike: BikeDetail,
  bikeType: BikeType | undefined,
  categorySettings: ComponentCategorySetting[],
): Record<string, SetupRow[]> {
  const existingContextsByCategory = new Map<string, Set<RideContext>>()
  for (const slot of bike.bike_component_slots) {
    const set = existingContextsByCategory.get(slot.category) ?? new Set<RideContext>()
    set.add(slot.ride_context)
    existingContextsByCategory.set(slot.category, set)
  }

  const result: Record<string, SetupRow[]> = {}
  for (const category of categories) {
    const existing = existingContextsByCategory.get(category) ?? new Set<RideContext>()
    const setting = categorySettings.find((s) => s.category === category)
    const allowsMultiple = setting?.allows_multiple_assignments ?? false
    const defaultRideContext = setting?.default_ride_context ?? 'both'
    const defaultChecked = Boolean(bikeType?.default_categories.includes(category))

    if (existing.has('both')) {
      result[category] = []
      continue
    }

    if (!allowsMultiple) {
      result[category] = existing.size > 0 ? [] : [makeRow(`${category}:both`, 'both', false, defaultChecked)]
      continue
    }

    const hasOutdoor = existing.has('outdoor_only')
    const hasIndoor = existing.has('indoor_only')
    if (hasOutdoor && hasIndoor) {
      result[category] = []
    } else if (hasOutdoor) {
      result[category] = [makeRow(`${category}:indoor_only`, 'indoor_only', false, false)]
    } else if (hasIndoor) {
      result[category] = [makeRow(`${category}:outdoor_only`, 'outdoor_only', false, false)]
    } else {
      result[category] = [makeRow(`${category}:${defaultRideContext}`, defaultRideContext, true, defaultChecked)]
    }
  }
  return result
}

// POST /bikes/:id/component_setup returns { row_errors: { "<index>": {field: [messages]} } }
// on a 422 -- index is the position within the *submitted* components
// array, not a row key, so the caller re-maps it back to a row.
export function parseRowErrorsByIndex(error: unknown): Record<number, string> {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object' || !('row_errors' in error.body)) {
    return {}
  }
  const rowErrors = (error.body as { row_errors: Record<string, Record<string, string[]>> }).row_errors
  return Object.fromEntries(
    Object.entries(rowErrors).map(([index, fieldErrors]) => [
      Number(index),
      Object.values(fieldErrors).flat().join(', '),
    ]),
  )
}

// A checked row "with details": any of Label, Brand, Model or Notes filled in.
export function rowHasDetails(row: Pick<SetupRow, 'label' | 'brand' | 'model' | 'notes'>): boolean {
  return [row.label, row.brand, row.model, row.notes].some((value) => value.trim() !== '')
}

// "8 of 14 ticked": checked rows of every row that can be tracked (an
// "Already tracked" category has no rows, so it never counts).
export function tickedCount(rowsByCategory: Record<string, SetupRow[]>): { ticked: number; total: number } {
  const rows = Object.values(rowsByCategory).flat()
  return { ticked: rows.filter((row) => row.checked).length, total: rows.length }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// The primary button: "Set up 8 components", "Set up 1 component", or
// "Set up components" (disabled) at 0.
export function setupButtonLabel(count: number): string {
  return count === 0 ? 'Set up components' : `Set up ${plural(count, 'component', 'components')}`
}

export interface ActionBarSummary {
  // Nothing checked: there's nothing to set up.
  empty: boolean
  headline: string
  detail: string | null
  // The phone bar's one line.
  phoneLine: string
}

// The sticky bar: "8 components will be created and installed on Soloist"
// over "From Apr 4, 2026 · 5 with details · 3 ticked without details ·
// 1 row needs a fix", zero parts left out.
export function actionBarSummary({
  rowsByCategory,
  installedOn,
  bikeName,
  errorCount,
}: {
  rowsByCategory: Record<string, SetupRow[]>
  installedOn: string
  bikeName: string
  errorCount: number
}): ActionBarSummary {
  const checked = Object.values(rowsByCategory).flat().filter((row) => row.checked)
  const from = formatDate(installedOn)
  if (checked.length === 0) {
    return { empty: true, headline: 'Nothing to set up yet', detail: null, phoneLine: 'Nothing to set up yet' }
  }
  const withDetails = checked.filter(rowHasDetails).length
  const withoutDetails = checked.length - withDetails
  const detail = [
    `From ${from}`,
    withDetails ? `${withDetails} with details` : null,
    withoutDetails ? `${withoutDetails} ticked without details` : null,
    errorCount ? `${plural(errorCount, 'row needs', 'rows need')} a fix` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return {
    empty: false,
    headline: `${plural(checked.length, 'component', 'components')} will be created and installed on ${bikeName}`,
    detail,
    phoneLine: `${checked.length} will be installed from ${from}`,
  }
}

// The Notes cell's pill: "Hide notes" when open, "1 note" when a note is
// typed but hidden, else "+ Notes".
export function notesPillLabel(row: Pick<SetupRow, 'notes' | 'notesExpanded'>): string {
  if (row.notesExpanded) return 'Hide notes'
  return row.notes.trim() ? '1 note' : '+ Notes'
}

// An "Already tracked" row's dimmed part label: the bike's open
// assignments in that category (two for a split category), from the same
// GET /bikes/:id payload -- or null when nothing's installed in the slot.
export function trackedLabel(bike: Pick<BikeDetail, 'component_assignments'>, category: string): string | null {
  const labels = bike.component_assignments
    .filter((assignment) => assignment.ended_at === null && assignment.component.category === category)
    .map((assignment) => assignment.component.label)
  return labels.length ? labels.join(', ') : null
}
