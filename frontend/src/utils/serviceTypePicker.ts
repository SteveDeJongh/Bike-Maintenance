import { categoryLabel } from '../constants'

export interface PickableServiceType {
  id: number
  name: string
  categories: string[]
}

export interface PickerRow {
  type: PickableServiceType
  // Small muted label beside the name: the matching category, "any" for a
  // universal type, or (for a hidden type) its own tags. null when there's
  // no category context at all (the picker shows plain names, as before).
  label: string | null
}

export interface PartitionedServiceTypes {
  // Shown up front: tagged for the category, then universal, then -- only
  // if it would otherwise be hidden -- the currently selected type, so an
  // old event's type never disappears from its own edit form.
  visible: PickerRow[]
  // Behind "Show all types (N hidden)".
  hidden: PickerRow[]
}

function byName(a: PickableServiceType, b: PickableServiceType): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function tagsLabel(type: PickableServiceType): string {
  return type.categories.length === 0 ? 'any' : type.categories.map(categoryLabel).join(', ')
}

// Pickers filter, they never forbid: every type is reachable, the category
// only decides what's up front.
export function partitionServiceTypes(
  types: PickableServiceType[],
  category: string | null | undefined,
  selectedId: number | null,
): PartitionedServiceTypes {
  const sorted = [...types].sort(byName)

  if (!category) {
    return { visible: sorted.map((type) => ({ type, label: null })), hidden: [] }
  }

  const tagged = sorted.filter((type) => type.categories.includes(category))
  const universal = sorted.filter((type) => type.categories.length === 0)
  const others = sorted.filter((type) => type.categories.length > 0 && !type.categories.includes(category))

  const visible: PickerRow[] = [
    ...tagged.map((type) => ({ type, label: categoryLabel(category) })),
    ...universal.map((type) => ({ type, label: 'any' })),
  ]
  const pinned = others.find((type) => type.id === selectedId)
  if (pinned) visible.push({ type: pinned, label: tagsLabel(pinned) })

  return {
    visible,
    hidden: others.filter((type) => type !== pinned).map((type) => ({ type, label: tagsLabel(type) })),
  }
}
