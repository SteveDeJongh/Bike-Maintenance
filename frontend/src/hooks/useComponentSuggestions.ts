import { useMemo } from 'react'
import { useComponents } from '../api/queries'
import { buildSuggestionPool, type ComponentSuggestionInput, type SuggestionPool } from '../utils/componentSuggestions'

// Module-level so the default keeps one identity -- a `= []` default is a
// new array every render and would defeat the useMemo below.
const NO_EXTRA: ComponentSuggestionInput[] = []

// Wraps the existing useComponents() query (GET /components, every
// component including retired ones -- a retired chain is still a good hint
// for its replacement) rather than a new endpoint: every component mutation
// already invalidates ['components'], so this stays current for free.
//
// extra merges in values that haven't been saved yet (BikeSetup's checklist
// rows, which builds one pool for the whole page and passes it down) --
// pass a memoized value, or this hook's memoization is defeated by a new
// array identity every render.
export function useComponentSuggestions(extra: ComponentSuggestionInput[] = NO_EXTRA): SuggestionPool {
  const { data: components } = useComponents()
  return useMemo(() => buildSuggestionPool(components ?? [], extra), [components, extra])
}
