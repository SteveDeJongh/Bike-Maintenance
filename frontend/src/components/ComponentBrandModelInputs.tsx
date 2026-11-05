import { Autocomplete, Group, Stack, type MantineSize } from '@mantine/core'
import { COMMON_COMPONENT_BRANDS } from '../constants'
import { useComponentSuggestions } from '../hooks/useComponentSuggestions'
import { buildBrandGroups, buildModelSuggestions, resolveCasing, type ComponentSuggestionInput } from '../utils/componentSuggestions'

interface ComponentBrandModelInputsProps {
  brand: string
  model: string
  // Patch-style, not two separate callbacks -- lets picking a model also
  // set the brand in one call, and lets this work unchanged whether the
  // caller is @mantine/form (ComponentFormModal, which translates this
  // into form.setFieldValue per key present) or BikeSetup's own row state
  // (whose onChange already has this exact Partial<...> shape).
  onChange: (changes: { brand?: string; model?: string }) => void
  // Narrows model suggestions to this category and ranks a matching
  // category first -- omitted where a category genuinely isn't known yet
  // (e.g. ComponentFormModal before one's picked), per
  // buildModelSuggestions' own fallback to usage-count-only ranking.
  category?: string
  // 'stacked' (default): full-width, one per line, for the modal.
  // 'inline': side by side, for a single setup-page table cell.
  layout?: 'stacked' | 'inline'
  size?: MantineSize
  disabled?: boolean
  // Unsaved values from elsewhere (e.g. BikeSetup's other checklist rows)
  // to merge into the suggestion pool before anything's saved. Must be a
  // stable (memoized) array -- see useComponentSuggestions.
  extraSuggestions?: ComponentSuggestionInput[]
}

export default function ComponentBrandModelInputs({
  brand,
  model,
  onChange,
  category,
  layout = 'stacked',
  size,
  disabled,
  extraSuggestions,
}: ComponentBrandModelInputsProps) {
  const suggestions = useComponentSuggestions(extraSuggestions)

  const brandGroups = buildBrandGroups(suggestions.brands, COMMON_COMPONENT_BRANDS)
  const allBrandNames = brandGroups.flatMap((group) => group.items)
  const modelSuggestions = buildModelSuggestions(suggestions.models, { brand, category })
  const modelOptions = modelSuggestions.map((entry) => entry.model)

  function handleModelOptionSubmit(value: string) {
    // "If the brand field is empty and the user picks a model suggestion,
    // fill in that model's brand" -- never overwrites an already-typed brand.
    if (brand.trim()) return
    const match = modelSuggestions.find((entry) => entry.model === value)
    if (match) onChange({ brand: match.brand, model: value })
  }

  const fieldStyle = layout === 'inline' ? { flex: 1, minWidth: 0 } : undefined
  const fields = (
    <>
      <Autocomplete
        label="Brand"
        size={size}
        disabled={disabled}
        data={brandGroups}
        limit={10}
        value={brand}
        onChange={(value) => onChange({ brand: value })}
        onBlur={() => onChange({ brand: resolveCasing(brand, allBrandNames) })}
        style={fieldStyle}
      />
      <Autocomplete
        label="Model"
        size={size}
        disabled={disabled}
        data={modelOptions}
        limit={10}
        value={model}
        onChange={(value) => onChange({ model: value })}
        onOptionSubmit={handleModelOptionSubmit}
        onBlur={() => onChange({ model: resolveCasing(model, modelOptions) })}
        style={fieldStyle}
      />
    </>
  )

  return layout === 'inline' ? (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      {fields}
    </Group>
  ) : (
    <Stack gap="xs">{fields}</Stack>
  )
}
