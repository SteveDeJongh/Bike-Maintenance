import { useComponentCategorySettings } from '../api/queries'
import { COMPONENT_CATEGORIES } from '../constants'

// The hardcoded baseline merged with any custom categories a user has added
// (proven to exist by having a ComponentCategorySetting row) -- the single
// place this merge happens, used everywhere a category picker is built.
export function useAllCategories(): string[] {
  const { data: settings } = useComponentCategorySettings()

  const baseline: readonly string[] = COMPONENT_CATEGORIES
  const extra = (settings ?? []).map((setting) => setting.category).filter((category) => !baseline.includes(category))

  return [...COMPONENT_CATEGORIES, ...extra]
}
