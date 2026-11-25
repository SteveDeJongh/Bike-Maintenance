import { memo } from 'react'
import { Anchor, Badge, Checkbox, Group, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core'
import DataListRow from '../datalist/DataListRow'
import ComponentBrandModelInputs from '../ComponentBrandModelInputs'
import NotesPill from './NotesPill'
import { categoryLabel, RIDE_CONTEXT_LABELS } from '../../constants'
import { setupRowLabel } from '../../utils/setupRowLabel'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { deliberateCheck, typedChange } from '../../utils/setupRowActivation'
import type { SuggestionPool } from '../../utils/componentSuggestions'
import type { RideContext, SetupRow } from './bikeSetupModel'

export interface SetupRowItemProps {
  category: string
  bikeName: string
  // The bike type's name, for "Ticked by {type} preset" (null without one).
  presetName: string | null
  row: SetupRow
  isFirstRowOfCategory: boolean
  existingContexts: RideContext[]
  allowsMultiple: boolean
  canAddComplementary: boolean
  canRemove: boolean
  error: string | undefined
  suggestions: SuggestionPool
  onChange: (category: string, key: string, changes: Partial<SetupRow>) => void
  onRideContextChange: (category: string, key: string, rideContext: RideContext) => void
  onAddComplementary: (category: string) => void
  onRemove: (category: string, key: string) => void
  onBlur: (category: string, key: string) => void
  // A phone: the row becomes a stacked card section.
  stacked: boolean
}

const RIDE_CONTEXT_OPTIONS = (['both', 'outdoor_only', 'indoor_only'] as const).map((value) => ({
  value,
  label: RIDE_CONTEXT_LABELS[value],
}))

// One checklist row on the DataList grid: checkbox | Category | Label |
// Brand | Model | Notes, with an open note on its own line from the Label
// column to the end. A plain DataListRow (no onOpen), since the row is full
// of inputs. Memoized: every prop is stable across another row's keystroke
// (the callbacks take the row's category and key), so typing re-renders
// one row. Unchecked rows dim their inputs (opacity only, so checking never
// changes the row's height); typing checks the row, emptying an
// auto-checked one unchecks it on blur (utils/setupRowActivation.ts).
const SetupRowItem = memo(function SetupRowItem({
  category,
  bikeName,
  presetName,
  row,
  isFirstRowOfCategory,
  existingContexts,
  allowsMultiple,
  canAddComplementary,
  canRemove,
  error,
  suggestions,
  onChange,
  onRideContextChange,
  onAddComplementary,
  onRemove,
  onBlur,
  stacked,
}: SetupRowItemProps) {
  const change = (changes: Partial<SetupRow>) => onChange(category, row.key, changes)
  const blur = () => onBlur(category, row.key)
  const inputCell = { opacity: row.checked ? 1 : 0.5, minWidth: 0 }

  const name = `${categoryLabel(category)}${row.rideContext === 'both' ? '' : `, ${RIDE_CONTEXT_LABELS[row.rideContext]}`}`

  const inputSize = stacked ? 'md' : 'sm'
  const tap = stacked ? MOBILE_TAP_TARGET_STYLE : undefined

  const nameText = isFirstRowOfCategory && (
    <Text size="sm" fw={500} c={row.checked ? undefined : 'dimmed'}>
      {categoryLabel(category)}
    </Text>
  )
  const chip = allowsMultiple && !row.rideContextEditable && (
    <Badge size="xs" variant="light" tt="none" color={row.rideContext === 'indoor_only' ? 'grape' : 'blue'}>
      {RIDE_CONTEXT_LABELS[row.rideContext]}
    </Badge>
  )
  const checkbox = (
    <Checkbox
      aria-label={stacked ? undefined : `Track ${name}`}
      label={stacked ? nameText || categoryLabel(category) : undefined}
      size={stacked ? 'md' : 'sm'}
      checked={row.checked}
      onChange={(event) => change(deliberateCheck(event.currentTarget.checked))}
    />
  )

  // Under the name: the preset's note, what's already tracked, the
  // ride-context Select, and the add / remove links.
  const extras = (
    <>
      {row.presetChecked && presetName && (
        <Text size="xs" c="dimmed">
          Ticked by {presetName} preset
        </Text>
      )}
      {existingContexts.length > 0 && (
        <Text size="xs" c="dimmed">
          {existingContexts.map((context) => RIDE_CONTEXT_LABELS[context]).join(', ')} already tracked
        </Text>
      )}
      {allowsMultiple && row.rideContextEditable && (
        <Select
          aria-label={`${categoryLabel(category)} ride context`}
          size="xs"
          variant="unstyled"
          w={130}
          data={RIDE_CONTEXT_OPTIONS}
          value={row.rideContext}
          onChange={(value) => value && onRideContextChange(category, row.key, value as RideContext)}
          allowDeselect={false}
          styles={{ input: { color: 'var(--mantine-color-dimmed)', minHeight: 0, height: 'auto' } }}
        />
      )}
      {(canAddComplementary || canRemove) && (
        <Group gap="sm">
          {canAddComplementary && (
            <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => onAddComplementary(category)} style={tap}>
              + Add {row.rideContext === 'outdoor_only' ? 'indoor' : 'outdoor'} too
            </Anchor>
          )}
          {canRemove && (
            <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => onRemove(category, row.key)} style={tap}>
              Remove
            </Anchor>
          )}
        </Group>
      )}
    </>
  )

  const labelInput = (
    <TextInput
      size={inputSize}
      aria-label={`${name} label`}
      classNames={{ input: 'setup-label-input' }}
      value={row.label}
      placeholder={setupRowLabel({ ...row, label: '' }, { bikeName, category })}
      error={error}
      onChange={(event) => change(typedChange(row, { label: event.currentTarget.value }))}
      onBlur={blur}
    />
  )
  const brandModel = (
    <ComponentBrandModelInputs
      layout="cells"
      size={inputSize}
      brand={row.brand}
      model={row.model}
      category={category}
      suggestions={suggestions}
      ariaLabels={{ brand: `${name} brand`, model: `${name} model` }}
      cellStyle={inputCell}
      onBlur={blur}
      onChange={(changes, reason) => change(reason === 'input' ? typedChange(row, changes) : changes)}
    />
  )
  const notesPill = (
    <NotesPill row={row} ariaLabel={`${name} notes`} onToggle={() => change({ notesExpanded: !row.notesExpanded })} style={tap} />
  )
  const notesInput = row.notesExpanded && (
    <Textarea
      size={inputSize}
      aria-label={`${name} notes`}
      autosize
      minRows={2}
      value={row.notes}
      onChange={(event) => change(typedChange(row, { notes: event.currentTarget.value }))}
      onBlur={blur}
    />
  )

  // A phone: a card section -- checkbox + name (one label, so tapping the
  // name toggles) and chip, then Label, then Brand | Model, then Notes.
  if (stacked) {
    return (
      <DataListRow tone={error ? 'error' : undefined} stacked>
        <Stack gap="xs">
          <Stack gap={2}>
            <Group gap={6} wrap="wrap">
              {checkbox}
              {chip}
            </Group>
            {extras}
          </Stack>
          <div style={inputCell}>{labelInput}</div>
          <SimpleGrid cols={2} spacing="xs">
            {brandModel}
          </SimpleGrid>
          <div style={inputCell}>
            {notesPill}
            {notesInput && <div style={{ marginTop: 'var(--mantine-spacing-xs)' }}>{notesInput}</div>}
          </div>
        </Stack>
      </DataListRow>
    )
  }

  return (
    <DataListRow tone={error ? 'error' : undefined}>
      {checkbox}
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap={6} wrap="wrap">
          {nameText}
          {chip}
        </Group>
        {extras}
      </Stack>
      <div style={inputCell}>{labelInput}</div>
      {brandModel}
      <div style={inputCell}>{notesPill}</div>
      {notesInput && (
        <div style={{ ...inputCell, gridColumn: '3 / -1', paddingTop: 'var(--mantine-spacing-xs)' }}>{notesInput}</div>
      )}
    </DataListRow>
  )
})

export default SetupRowItem
