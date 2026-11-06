// Pure ranking/casing logic behind the brand/model autocomplete
// (ComponentBrandModelInputs). Kept separate from the hook and the
// component so it's ready to unit test later with no refactor -- this
// project currently has no frontend test runner configured, so none are
// added here, but the logic is isolated for when one exists.

export interface ComponentSuggestionInput {
  brand: string | null
  model: string | null
  category: string
}

export interface BrandCount {
  brand: string
  count: number
}

export interface ModelCount {
  brand: string
  model: string
  category: string
  count: number
}

// Groups case-insensitively so pre-existing inconsistent data ("Shimano" /
// "shimano") counts as one brand instead of splintering the ranking --
// the whole point of this feature. The casing shown is whichever variant
// was encountered first; new entries converge on it over time via the
// on-blur casing fix (resolveCasing below), same as there's no backfill
// migration server-side (see Component#normalizes).
export function countBrands(rows: ComponentSuggestionInput[]): BrandCount[] {
  const countsByKey = new Map<string, BrandCount>()

  for (const row of rows) {
    if (!row.brand) continue
    const key = row.brand.toLowerCase()
    const existing = countsByKey.get(key)
    if (existing) existing.count += 1
    else countsByKey.set(key, { brand: row.brand, count: 1 })
  }

  return Array.from(countsByKey.values()).sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))
}

// Same case-insensitive grouping, keyed on (brand, model, category) --
// a model's category matters for ranking (see buildModelSuggestions), so
// two components sharing a model name in different categories are
// genuinely distinct suggestions.
export function countModels(rows: ComponentSuggestionInput[]): ModelCount[] {
  const countsByKey = new Map<string, ModelCount>()

  for (const row of rows) {
    if (!row.model) continue
    const brand = row.brand ?? ''
    const key = `${brand.toLowerCase()}::${row.model.toLowerCase()}::${row.category}`
    const existing = countsByKey.get(key)
    if (existing) existing.count += 1
    else countsByKey.set(key, { brand, model: row.model, category: row.category, count: 1 })
  }

  return Array.from(countsByKey.values())
}

// "Your brands" (already ranked by countBrands) first, then "Common
// brands" -- whatever the caller passes as commonBrands (see
// ComponentBrandModelInputs, which sources this from the current
// category's own ComponentCategorySetting#common_brands) minus anything
// already covered by the user's own data (case-insensitively), alphabetical.
// Groups with no items are omitted entirely rather than shown empty.
export function buildBrandGroups(
  userBrands: BrandCount[],
  commonBrands: readonly string[],
): { group: string; items: string[] }[] {
  const userBrandKeys = new Set(userBrands.map((b) => b.brand.toLowerCase()))
  const common = commonBrands
    .filter((brand) => !userBrandKeys.has(brand.toLowerCase()))
    .slice()
    .sort((a, b) => a.localeCompare(b))

  const groups: { group: string; items: string[] }[] = []
  if (userBrands.length > 0) groups.push({ group: 'Your brands', items: userBrands.map((b) => b.brand) })
  if (common.length > 0) groups.push({ group: 'Common brands', items: common })
  return groups
}

// Brand set -> every model of that brand (any category), models matching
// the given category ranked first, then by usage count. Brand empty ->
// models for the given category only, ranked by count. Neither known ->
// nothing to suggest. Deduped by model text (keeping the best-ranked
// entry), since Autocomplete requires unique values and the same model
// text can legitimately appear under more than one category for the same
// brand. Returns the full entries, not just strings, so a caller filling
// in the brand on selection (see ComponentBrandModelInputs) picks the same
// brand that was actually ranked first for that model text, not whichever
// one happens to iterate first.
export function buildModelSuggestions(
  models: ModelCount[],
  { brand, category }: { brand: string; category?: string },
): ModelCount[] {
  const trimmedBrand = brand.trim().toLowerCase()

  let candidates: ModelCount[]
  if (trimmedBrand) {
    candidates = models.filter((m) => m.brand.toLowerCase() === trimmedBrand)
  } else if (category) {
    candidates = models.filter((m) => m.category === category)
  } else {
    return []
  }

  const ranked = candidates.slice().sort((a, b) => {
    if (category) {
      const aMatch = a.category === category ? 0 : 1
      const bMatch = b.category === category ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
    }
    return b.count - a.count || a.model.localeCompare(b.model)
  })

  const seenModels = new Set<string>()
  const deduped: ModelCount[] = []
  for (const entry of ranked) {
    const key = entry.model.toLowerCase()
    if (seenModels.has(key)) continue
    seenModels.add(key)
    deduped.push(entry)
  }
  return deduped
}

// Trims, then swaps in an existing suggestion's casing if one matches
// case-insensitively -- "shimano" -> "Shimano". Falls back to the trimmed
// value when nothing matches, since brand/model always stay free text.
export function resolveCasing(value: string, suggestions: string[]): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed

  const match = suggestions.find((suggestion) => suggestion.toLowerCase() === trimmed.toLowerCase())
  return match ?? trimmed
}
