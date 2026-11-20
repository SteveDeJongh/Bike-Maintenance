import { categoryLabel } from '../constants'

// The categories the tag input's dropdown offers: every known category not
// already selected, matching `query` as a case-insensitive substring of its
// display label or its raw key, in the canonical list's own order.
export function availableCategories(all: string[], selected: string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  return all.filter(
    (category) =>
      !selected.includes(category) &&
      (needle === '' || categoryLabel(category).toLowerCase().includes(needle) || category.toLowerCase().includes(needle)),
  )
}

// Why the dropdown is empty, when it is.
export function emptyCategoriesMessage(all: string[], selected: string[]): string {
  return all.every((category) => selected.includes(category)) ? 'Every category is selected' : 'No matching categories'
}

export interface TextPart {
  text: string
  match: boolean
}

// Splits `text` around the first case-insensitive occurrence of `query`, so
// the matching part can be emphasised.
export function splitMatch(text: string, query: string): TextPart[] {
  const needle = query.trim()
  const index = needle === '' ? -1 : text.toLowerCase().indexOf(needle.toLowerCase())
  if (index === -1) return [{ text, match: false }]

  return [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, index + needle.length), match: true },
    { text: text.slice(index + needle.length), match: false },
  ].filter((part) => part.text !== '')
}

// "Pickers show this type on …" helper line under the field.
export function appliesToSummary(selected: string[]): string {
  if (selected.length === 0) return 'Pickers show this type on every component. Past events are kept.'
  return `Pickers show this type on ${selected.map(categoryLabel).join(', ')} components only. Past events are kept.`
}
