import { useMemo, type CSSProperties } from 'react'
import { Autocomplete, Stack, type MantineSize } from '@mantine/core'
import { useComponentCategorySettings } from '../api/queries'
import { useComponentSuggestions } from '../hooks/useComponentSuggestions'
import { buildBrandGroups, buildModelSuggestions, resolveCasing, type SuggestionPool } from '../utils/componentSuggestions'

interface ComponentBrandModelInputsProps {
  brand: string
  model: string
  // Patch-style, not two separate callbacks -- lets picking a model also
  // set the brand in one call, and lets this work unchanged whether the
  // caller is @mantine/form (ComponentFormModal, which translates this
  // into form.setFieldValue per key present) or BikeSetup's own row state
  // (whose onChange already has this exact Partial<...> shape).
  // reason: 'input' for typing or picking a suggestion, 'blur' for the
  // casing fix -- BikeSetup checks its row on input only, so tabbing past
  // a field never checks it. The modal ignores it.
  onChange: (changes: { brand?: string; model?: string }, reason: 'input' | 'blur') => void
  // Called when either field loses focus, after its casing fix (BikeSetup:
  // an auto-checked row that's been emptied unchecks itself).
  onBlur?: () => void
  // Narrows model suggestions to this category (ranking a matching category
  // first) and picks which category's ComponentCategorySetting#common_brands
  // feeds the "Common brands" group -- omitted where a category genuinely
  // isn't known yet (e.g. ComponentFormModal before one's picked), in which
  // case "Common brands" just doesn't render and model ranking falls back to
  // usage-count-only (see buildModelSuggestions).
  category?: string
  // 'stacked' (default): full-width, one per line, for the modal.
  // 'cells': the two fields alone (a fragment) with no visible labels, for
  // two grid cells (Bike setup's Brand and Model columns) -- pass ariaLabels.
  layout?: 'stacked' | 'cells'
  ariaLabels?: { brand: string; model: string }
  // 'cells' only: each field's own style (Bike setup dims unchecked rows).
  cellStyle?: CSSProperties
  size?: MantineSize
  disabled?: boolean
  // A pool built once by the caller (BikeSetup: saved components plus every
  // checklist row's unsaved values), instead of this field's own
  // useComponentSuggestions -- so 18 rows don't each rebuild it. Omitted,
  // the field uses the hook (ComponentFormModal).
  suggestions?: SuggestionPool
}

export default function ComponentBrandModelInputs({
  brand,
  model,
  onChange,
  category,
  layout = 'stacked',
  size,
  disabled,
  suggestions: pool,
  onBlur,
  ariaLabels,
  cellStyle,
}: ComponentBrandModelInputsProps) {
  // Cheap with a pool passed: memoized on the cached components list, so it
  // only computes when that changes.
  const ownPool = useComponentSuggestions()
  const suggestions = pool ?? ownPool
  const { data: categorySettings } = useComponentCategorySettings()
  const commonBrands = categorySettings?.find((setting) => setting.category === category)?.common_brands

  const brandGroups = useMemo(() => buildBrandGroups(suggestions.brands, commonBrands ?? []), [suggestions.brands, commonBrands])
  const allBrandNames = useMemo(() => brandGroups.flatMap((group) => group.items), [brandGroups])
  const modelSuggestions = useMemo(
    () => buildModelSuggestions(suggestions.models, { brand, category }),
    [suggestions.models, brand, category],
  )
  const modelOptions = useMemo(() => modelSuggestions.map((entry) => entry.model), [modelSuggestions])

  // On blur, only report a change when the casing fix actually changes the
  // value -- otherwise leaving a field re-renders the caller for nothing.
  function resolveOnBlur(field: 'brand' | 'model', value: string, options: string[]) {
    const resolved = resolveCasing(value, options)
    if (resolved !== value) onChange({ [field]: resolved }, 'blur')
    onBlur?.()
  }

  function handleModelOptionSubmit(value: string) {
    // "If the brand field is empty and the user picks a model suggestion,
    // fill in that model's brand" -- never overwrites an already-typed brand.
    if (brand.trim()) return
    const match = modelSuggestions.find((entry) => entry.model === value)
    if (match) onChange({ brand: match.brand, model: value }, 'input')
  }

  const cells = layout === 'cells'
  const fieldStyle = cells ? { minWidth: 0, ...cellStyle } : undefined
  const fields = (
    <>
      <Autocomplete
        label={cells ? undefined : 'Brand'}
        aria-label={ariaLabels?.brand}
        size={size}
        disabled={disabled}
        data={brandGroups}
        limit={10}
        value={brand}
        onChange={(value) => onChange({ brand: value }, 'input')}
        onBlur={() => resolveOnBlur('brand', brand, allBrandNames)}
        style={fieldStyle}
      />
      <Autocomplete
        label={cells ? undefined : 'Model'}
        aria-label={ariaLabels?.model}
        size={size}
        disabled={disabled}
        data={modelOptions}
        limit={10}
        value={model}
        onChange={(value) => onChange({ model: value }, 'input')}
        onOptionSubmit={handleModelOptionSubmit}
        onBlur={() => resolveOnBlur('model', model, modelOptions)}
        style={fieldStyle}
      />
    </>
  )

  return cells ? fields : <Stack gap="xs">{fields}</Stack>
}
