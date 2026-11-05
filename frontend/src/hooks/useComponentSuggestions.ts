import { useMemo } from 'react'
import { useComponents } from '../api/queries'
import { countBrands, countModels, type ComponentSuggestionInput } from '../utils/componentSuggestions'

// Wraps the existing useComponents() query (GET /components, every
// component including retired ones -- a retired chain is still a good hint
// for its replacement) rather than a new endpoint: every component mutation
// already invalidates ['components'], so this stays current for free, and
// nothing about this app's per-user component count suggests the full
// index is slow to load into a form.
//
// extra lets a caller merge in values that haven't been saved yet (e.g.
// BikeSetup's other checklist rows) -- pass a value memoized over whatever
// it's derived from, or this hook's own memoization is defeated by a new
// array identity every render.
export function useComponentSuggestions(extra: ComponentSuggestionInput[] = []) {
  const { data: components } = useComponents()

  return useMemo(() => {
    const rows: ComponentSuggestionInput[] = [
      ...(components ?? []).map((component) => ({
        brand: component.brand,
        model: component.model,
        category: component.category,
      })),
      ...extra,
    ]
    return { brands: countBrands(rows), models: countModels(rows) }
  }, [components, extra])
}
