import { memo } from 'react'
import { Anchor, Badge, Checkbox, Group, Select, Stack, Text, Textarea, TextInput } from '@mantine/core'
import DataListRow from '../datalist/DataListRow'
import ComponentBrandModelInputs from '../ComponentBrandModelInputs'
import NotesPill from './NotesPill'
import { categoryLabel, RIDE_CONTEXT_LABELS } from '../../constants'
import { setupRowLabel } from '../../utils/setupRowLabel'
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
}: SetupRowItemProps) {
  const change = (changes: Partial<SetupRow>) => onChange(category, row.key, changes)
  const blur = () => onBlur(category, row.key)
  const inputCell = { opacity: row.checked ? 1 : 0.5, minWidth: 0 }

  const name = `${categoryLabel(category)}${row.rideContext === 'both' ? '' : `, ${RIDE_CONTEXT_LABELS[row.rideContext]}`}`

  return (
    <DataListRow tone={error ? 'error' : undefined}>
      <Checkbox
        aria-label={`Track ${name}`}
        checked={row.checked}
        onChange={(event) => change(deliberateCheck(event.currentTarget.checked))}
      />

      <Stack gap={2} style={{ minWidth: 0 }}>
        <Group gap={6} wrap="wrap">
          {isFirstRowOfCategory && (
            <Text size="sm" fw={500} c={row.checked ? undefined : 'dimmed'}>
              {categoryLabel(category)}
            </Text>
          )}
          {allowsMultiple && !row.rideContextEditable && (
            <Badge size="xs" variant="light" tt="none" color={row.rideContext === 'indoor_only' ? 'grape' : 'blue'}>
              {RIDE_CONTEXT_LABELS[row.rideContext]}
            </Badge>
          )}
        </Group>
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
              <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => onAddComplementary(category)}>
                + Add {row.rideContext === 'outdoor_only' ? 'indoor' : 'outdoor'} too
              </Anchor>
            )}
            {canRemove && (
              <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => onRemove(category, row.key)}>
                Remove
              </Anchor>
            )}
          </Group>
        )}
      </Stack>

      <div style={inputCell}>
        <TextInput
          size="sm"
          aria-label={`${name} label`}
          classNames={{ input: 'setup-label-input' }}
          value={row.label}
          placeholder={setupRowLabel({ ...row, label: '' }, { bikeName, category })}
          error={error}
          onChange={(event) => change(typedChange(row, { label: event.currentTarget.value }))}
          onBlur={blur}
        />
      </div>

      <ComponentBrandModelInputs
        layout="cells"
        size="sm"
        brand={row.brand}
        model={row.model}
        category={category}
        suggestions={suggestions}
        ariaLabels={{ brand: `${name} brand`, model: `${name} model` }}
        cellStyle={inputCell}
        onBlur={blur}
        onChange={(changes, reason) => change(reason === 'input' ? typedChange(row, changes) : changes)}
      />

      <div style={inputCell}>
        <NotesPill row={row} ariaLabel={`${name} notes`} onToggle={() => change({ notesExpanded: !row.notesExpanded })} />
      </div>

      {row.notesExpanded && (
        <div style={{ ...inputCell, gridColumn: '3 / -1', paddingTop: 'var(--mantine-spacing-xs)' }}>
          <Textarea
            size="sm"
            aria-label={`${name} notes`}
            autosize
            minRows={2}
            value={row.notes}
            onChange={(event) => change(typedChange(row, { notes: event.currentTarget.value }))}
            onBlur={blur}
          />
        </div>
      )}
    </DataListRow>
  )
})

export default SetupRowItem
