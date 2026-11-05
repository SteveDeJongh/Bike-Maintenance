import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { ApiError } from '../api/client'
import { useBike, useBikeTypes, useComponentCategorySettings } from '../api/queries'
import { useComponentSetup, type ComponentSetupRow } from '../api/mutations'
import { useAllCategories } from '../hooks/useAllCategories'
import { categoryLabel, RIDE_CONTEXT_LABELS } from '../constants'
import { todayIsoDate } from '../utils/datetime'
import ComponentBrandModelInputs from '../components/ComponentBrandModelInputs'
import type { ComponentSuggestionInput } from '../utils/componentSuggestions'
import type { BikeDetail, BikeType, ComponentCategorySetting } from '../types/models'

type RideContext = 'both' | 'outdoor_only' | 'indoor_only'

interface SetupRow {
  key: string
  rideContext: RideContext
  // false only for the one case where the user actually has a choice: a
  // fresh (no existing slot), allows_multiple_assignments category's sole
  // starting row. Every other row's context is fixed by circumstance --
  // "both" for a plain category, or whichever split context is the only
  // one left once its sibling already exists.
  rideContextEditable: boolean
  checked: boolean
  label: string
  brand: string
  model: string
  notes: string
  notesExpanded: boolean
}

function makeRow(
  key: string,
  rideContext: RideContext,
  rideContextEditable: boolean,
  checked: boolean,
  label: string,
): SetupRow {
  return { key, rideContext, rideContextEditable, checked, label, brand: '', model: '', notes: '', notesExpanded: false }
}

// One row per addable (category, ride_context) combination -- a plain
// category gets at most one ("both"); an allows_multiple_assignments
// category gets up to two (outdoor_only + indoor_only), and only the
// context(s) not already slotted on this bike. A fully-tracked category
// (every valid context already has a slot) gets none -- the checklist
// shows it as an "Already tracked" row instead, never blocked, never hidden.
function buildInitialRows(
  categories: string[],
  bike: BikeDetail,
  bikeType: BikeType | undefined,
  categorySettings: ComponentCategorySetting[],
): Record<string, SetupRow[]> {
  const existingContextsByCategory = new Map<string, Set<RideContext>>()
  for (const slot of bike.bike_component_slots) {
    const set = existingContextsByCategory.get(slot.category) ?? new Set<RideContext>()
    set.add(slot.ride_context)
    existingContextsByCategory.set(slot.category, set)
  }

  const result: Record<string, SetupRow[]> = {}
  for (const category of categories) {
    const existing = existingContextsByCategory.get(category) ?? new Set<RideContext>()
    const setting = categorySettings.find((s) => s.category === category)
    const allowsMultiple = setting?.allows_multiple_assignments ?? false
    const defaultRideContext = setting?.default_ride_context ?? 'both'
    const defaultChecked = Boolean(bikeType?.default_categories.includes(category))
    const label = `${bike.name} ${categoryLabel(category)}`

    if (existing.has('both')) {
      result[category] = []
      continue
    }

    if (!allowsMultiple) {
      result[category] = existing.size > 0 ? [] : [makeRow(`${category}:both`, 'both', false, defaultChecked, label)]
      continue
    }

    const hasOutdoor = existing.has('outdoor_only')
    const hasIndoor = existing.has('indoor_only')
    if (hasOutdoor && hasIndoor) {
      result[category] = []
    } else if (hasOutdoor) {
      result[category] = [makeRow(`${category}:indoor_only`, 'indoor_only', false, false, label)]
    } else if (hasIndoor) {
      result[category] = [makeRow(`${category}:outdoor_only`, 'outdoor_only', false, false, label)]
    } else {
      result[category] = [makeRow(`${category}:${defaultRideContext}`, defaultRideContext, true, defaultChecked, label)]
    }
  }
  return result
}

// POST /bikes/:id/component_setup returns { row_errors: { "<index>": {field: [messages]} } }
// on a 422 -- index is the position within the *submitted* components
// array, not a row key, so the caller re-maps it back to a row.
function parseRowErrorsByIndex(error: unknown): Record<number, string> {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object' || !('row_errors' in error.body)) {
    return {}
  }
  const rowErrors = (error.body as { row_errors: Record<string, Record<string, string[]>> }).row_errors
  return Object.fromEntries(
    Object.entries(rowErrors).map(([index, fieldErrors]) => [
      Number(index),
      Object.values(fieldErrors).flat().join(', '),
    ]),
  )
}

export default function BikeSetup() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending: bikePending, error: bikeError } = useBike(bikeId)
  const { data: bikeTypes, isPending: bikeTypesPending } = useBikeTypes()
  const { data: categorySettings, isPending: settingsPending } = useComponentCategorySettings()
  const allCategories = useAllCategories()

  if (!Number.isFinite(bikeId) || (bikeError instanceof ApiError && bikeError.status === 404)) {
    return (
      <Stack>
        <Text>Bike not found.</Text>
        <Anchor component={Link} to="/bikes">
          Back to bikes
        </Anchor>
      </Stack>
    )
  }

  if (bikePending || bikeTypesPending || settingsPending) return <Loader />

  if (bikeError) {
    return (
      <Alert color="red" title="Failed to load bike">
        {bikeError.message}
      </Alert>
    )
  }

  if (!bike || !categorySettings) return null

  const trackableCategories = allCategories.filter(
    (category) => categorySettings.find((setting) => setting.category === category)?.trackable ?? true,
  )
  const bikeType = bikeTypes?.find((type) => type.id === bike.bike_type_id)

  return (
    <SetupChecklist
      bike={bike}
      bikeType={bikeType}
      categorySettings={categorySettings}
      trackableCategories={trackableCategories}
    />
  )
}

function SetupChecklist({
  bike,
  bikeType,
  categorySettings,
  trackableCategories,
}: {
  bike: BikeDetail
  bikeType: BikeType | undefined
  categorySettings: ComponentCategorySetting[]
  trackableCategories: string[]
}) {
  const navigate = useNavigate()
  const componentSetup = useComponentSetup(bike.id)

  // bike/bikeType/categorySettings are already fully resolved by the time
  // this component mounts (gated by BikeSetup above), so this lazy
  // initializer running once at mount is safe -- no async-data-into-state
  // race like there would be computing this at the top of BikeSetup itself.
  const [rowsByCategory, setRowsByCategory] = useState<Record<string, SetupRow[]>>(() =>
    buildInitialRows(trackableCategories, bike, bikeType, categorySettings),
  )
  const [installedOnOverride, setInstalledOnOverride] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [baseError, setBaseError] = useState<string | null>(null)

  const installedOn = installedOnOverride ?? bike.acquired_on ?? todayIsoDate()

  // Every row's current (unsaved) brand/model/category, merged into
  // suggestions everywhere -- so typing "SRAM" in the chain row offers
  // "SRAM" in the cassette row before anything's submitted. Memoized over
  // rowsByCategory so useComponentSuggestions' own memoization isn't
  // defeated by a new array identity every render.
  const unsavedSuggestions: ComponentSuggestionInput[] = useMemo(
    () =>
      Object.entries(rowsByCategory).flatMap(([category, rows]) =>
        rows.map((row) => ({ brand: row.brand || null, model: row.model || null, category })),
      ),
    [rowsByCategory],
  )

  function updateRow(category: string, key: string, changes: Partial<SetupRow>) {
    setRowsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].map((row) => (row.key === key ? { ...row, ...changes } : row)),
    }))
  }

  function changeRideContext(category: string, key: string, rideContext: RideContext) {
    setRowsByCategory((prev) => {
      const rows = prev[category]
      const updated = rows.map((row) => (row.key === key ? { ...row, key: `${category}:${rideContext}`, rideContext } : row))
      // Switching back to "both" only makes sense alone -- drop any
      // complementary split row that might have been added.
      return { ...prev, [category]: rideContext === 'both' ? updated.slice(0, 1) : updated }
    })
  }

  function addComplementaryRow(category: string) {
    setRowsByCategory((prev) => {
      const rows = prev[category]
      const primary = rows[0]
      if (!primary || rows.length > 1) return prev
      const other: RideContext = primary.rideContext === 'outdoor_only' ? 'indoor_only' : 'outdoor_only'
      const newRow = makeRow(`${category}:${other}`, other, false, false, primary.label)
      return { ...prev, [category]: [...rows, newRow] }
    })
  }

  function removeRow(category: string, key: string) {
    setRowsByCategory((prev) => ({ ...prev, [category]: prev[category].filter((row) => row.key !== key) }))
  }

  function setAllChecked(checked: boolean) {
    setRowsByCategory((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([category, rows]) => [category, rows.map((row) => ({ ...row, checked }))]),
      ),
    )
  }

  function handleSubmit() {
    setBaseError(null)
    setRowErrors({})

    const checkedRows = Object.values(rowsByCategory)
      .flat()
      .filter((row) => row.checked)
    const components: ComponentSetupRow[] = checkedRows.map((row) => {
      const [category] = row.key.split(':')
      return {
        category,
        ride_context: row.rideContext,
        label: row.label.trim(),
        brand: row.brand.trim() || null,
        model: row.model.trim() || null,
        notes: row.notes.trim() || null,
      }
    })

    componentSetup.mutate(
      { installed_on: installedOn, components },
      {
        onSuccess: () => navigate(`/bikes/${bike.id}`),
        onError: (error) => {
          const byIndex = parseRowErrorsByIndex(error)
          if (Object.keys(byIndex).length > 0) {
            const byKey: Record<string, string> = {}
            Object.entries(byIndex).forEach(([indexStr, message]) => {
              const row = checkedRows[Number(indexStr)]
              if (row) byKey[row.key] = message
            })
            setRowErrors(byKey)
          } else {
            setBaseError(error instanceof Error ? error.message : 'Something went wrong.')
          }
        },
      },
    )
  }

  return (
    <Stack>
      <Title order={2}>Set up components for {bike.name}</Title>
      <Text c="dimmed">
        Check the parts this bike has. Each one gets tracked, created, and installed in one step.
      </Text>

      <DateInput
        label="Installed since"
        description="Strava rides before this date won't count toward these components' mileage."
        value={installedOn}
        onChange={(value) => setInstalledOnOverride(value)}
        maw={250}
      />

      <Group>
        <Button size="xs" variant="default" onClick={() => setAllChecked(true)}>
          Check all
        </Button>
        <Button size="xs" variant="default" onClick={() => setAllChecked(false)}>
          Clear all
        </Button>
      </Group>

      {baseError && <Alert color="red">{baseError}</Alert>}

      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Category</Table.Th>
            <Table.Th>Label</Table.Th>
            <Table.Th>Brand / Model</Table.Th>
            <Table.Th>Notes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {trackableCategories.map((category) => {
            const rows = rowsByCategory[category]
            const setting = categorySettings.find((s) => s.category === category)
            const existingContexts = new Set(
              bike.bike_component_slots.filter((slot) => slot.category === category).map((slot) => slot.ride_context),
            )

            if (rows.length === 0) {
              return (
                <Table.Tr key={category}>
                  <Table.Td colSpan={4}>
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">
                        {categoryLabel(category)}
                      </Text>
                      <Badge size="xs" color="gray">
                        Already tracked
                      </Badge>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              )
            }

            return rows.map((row, rowIndex) => (
              <SetupTableRow
                key={row.key}
                category={category}
                row={row}
                isFirstRowOfCategory={rowIndex === 0}
                existingContexts={existingContexts}
                allowsMultiple={setting?.allows_multiple_assignments ?? false}
                canAddComplementary={rows.length === 1 && row.rideContextEditable && row.rideContext !== 'both'}
                canRemove={rowIndex > 0}
                error={rowErrors[row.key]}
                extraSuggestions={unsavedSuggestions}
                onChange={(changes) => updateRow(category, row.key, changes)}
                onRideContextChange={(rideContext) => changeRideContext(category, row.key, rideContext)}
                onAddComplementary={() => addComplementaryRow(category)}
                onRemove={() => removeRow(category, row.key)}
              />
            ))
          })}
        </Table.Tbody>
      </Table>

      <Group justify="flex-end">
        <Button variant="default" onClick={() => navigate(`/bikes/${bike.id}`)}>
          Skip for now
        </Button>
        <Button onClick={handleSubmit} loading={componentSetup.isPending}>
          Set up components
        </Button>
      </Group>
    </Stack>
  )
}

function SetupTableRow({
  category,
  row,
  isFirstRowOfCategory,
  existingContexts,
  allowsMultiple,
  canAddComplementary,
  canRemove,
  error,
  extraSuggestions,
  onChange,
  onRideContextChange,
  onAddComplementary,
  onRemove,
}: {
  category: string
  row: SetupRow
  isFirstRowOfCategory: boolean
  existingContexts: Set<string>
  allowsMultiple: boolean
  canAddComplementary: boolean
  canRemove: boolean
  error: string | undefined
  extraSuggestions: ComponentSuggestionInput[]
  onChange: (changes: Partial<SetupRow>) => void
  onRideContextChange: (rideContext: RideContext) => void
  onAddComplementary: () => void
  onRemove: () => void
}) {
  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Checkbox
            mt={2}
            checked={row.checked}
            onChange={(event) => onChange({ checked: event.currentTarget.checked })}
          />
          <Stack gap={2}>
            {isFirstRowOfCategory && <Text size="sm">{categoryLabel(category)}</Text>}
            {existingContexts.size > 0 && (
              <Text size="xs" c="dimmed">
                {Array.from(existingContexts).map((context) => RIDE_CONTEXT_LABELS[context as RideContext]).join(', ')}{' '}
                already tracked
              </Text>
            )}
            {allowsMultiple && row.rideContextEditable && (
              <Select
                size="xs"
                w={140}
                data={[
                  { value: 'both', label: RIDE_CONTEXT_LABELS.both },
                  { value: 'outdoor_only', label: RIDE_CONTEXT_LABELS.outdoor_only },
                  { value: 'indoor_only', label: RIDE_CONTEXT_LABELS.indoor_only },
                ]}
                value={row.rideContext}
                onChange={(value) => value && onRideContextChange(value as RideContext)}
                allowDeselect={false}
              />
            )}
            {allowsMultiple && !row.rideContextEditable && (
              <Badge size="xs" variant="light" color={row.rideContext === 'indoor_only' ? 'grape' : 'blue'}>
                {RIDE_CONTEXT_LABELS[row.rideContext]}
              </Badge>
            )}
            {canAddComplementary && (
              <UnstyledButton onClick={onAddComplementary}>
                <Text size="xs" c="dimmed">
                  + Add {row.rideContext === 'outdoor_only' ? 'indoor' : 'outdoor'} too
                </Text>
              </UnstyledButton>
            )}
            {canRemove && (
              <UnstyledButton onClick={onRemove}>
                <Text size="xs" c="dimmed">
                  Remove
                </Text>
              </UnstyledButton>
            )}
          </Stack>
        </Group>
        {error && (
          <Text c="red" size="xs" mt={4}>
            {error}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <TextInput
          size="sm"
          disabled={!row.checked}
          value={row.label}
          onChange={(event) => onChange({ label: event.currentTarget.value })}
        />
      </Table.Td>
      <Table.Td>
        <ComponentBrandModelInputs
          layout="inline"
          size="sm"
          disabled={!row.checked}
          brand={row.brand}
          model={row.model}
          category={category}
          extraSuggestions={extraSuggestions}
          onChange={(changes) => onChange(changes)}
        />
      </Table.Td>
      <Table.Td>
        <Stack gap={4}>
          <UnstyledButton disabled={!row.checked} onClick={() => onChange({ notesExpanded: !row.notesExpanded })}>
            <Text size="xs" c="dimmed">
              {row.notesExpanded ? 'Hide notes' : '+ Notes'}
            </Text>
          </UnstyledButton>
          <Collapse expanded={row.checked && row.notesExpanded}>
            <Textarea
              size="sm"
              value={row.notes}
              onChange={(event) => onChange({ notes: event.currentTarget.value })}
            />
          </Collapse>
        </Stack>
      </Table.Td>
    </Table.Tr>
  )
}
