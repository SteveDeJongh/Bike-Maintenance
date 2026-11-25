import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Badge,
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
  UnstyledButton,
} from '@mantine/core'
import { ApiError } from '../api/client'
import { useBike, useBikeTypes, useComponentCategorySettings } from '../api/queries'
import { useComponentSetup, type ComponentSetupRow } from '../api/mutations'
import { useAllCategories } from '../hooks/useAllCategories'
import { categoryLabel, RIDE_CONTEXT_LABELS } from '../constants'
import { todayIsoDate } from '../utils/datetime'
import { setupRowLabel } from '../utils/setupRowLabel'
import { applyRowChange, blurChange, withActivation } from '../utils/setupRowActivation'
import ComponentBrandModelInputs from '../components/ComponentBrandModelInputs'
import { useComponentSuggestions } from '../hooks/useComponentSuggestions'
import type { ComponentSuggestionInput, SuggestionPool } from '../utils/componentSuggestions'
import type { BikeDetail, BikeType, ComponentCategorySetting } from '../types/models'
import {
  buildInitialRows,
  makeRow,
  parseRowErrorsByIndex,
  actionBarSummary,
  tickedCount,
  type RideContext,
  type SetupRow,
} from '../components/bikeSetup/bikeSetupModel'
import BikeSetupHeader from '../components/bikeSetup/BikeSetupHeader'
import BikeSetupToolbar from '../components/bikeSetup/BikeSetupToolbar'
import BikeSetupActionBar from '../components/bikeSetup/BikeSetupActionBar'
import SetupActions from '../components/bikeSetup/SetupActions'
import { MOBILE_TAP_TARGET_STYLE } from '../utils/touchTarget'

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

  // One suggestion pool for the page: saved components plus every row's
  // unsaved brand/model, so "SRAM" typed in the chain row is offered in the
  // cassette row before anything's submitted. The unsaved list is keyed on
  // just brand/model/category, so typing a label or note, or ticking a
  // row, leaves the pool alone. useDeferredValue lets a keystroke update its
  // own row first; the other rows' suggestions catch up in a background,
  // interruptible render (the only "debounce" on this page).
  const unsavedSignature = JSON.stringify(
    Object.entries(rowsByCategory).flatMap(([category, rows]) => rows.map((row) => [category, row.brand, row.model])),
  )
  const unsavedSuggestions: ComponentSuggestionInput[] = useMemo(
    () =>
      (JSON.parse(unsavedSignature) as [string, string, string][]).map(([category, brand, model]) => ({
        brand: brand || null,
        model: model || null,
        category,
      })),
    [unsavedSignature],
  )
  const suggestionPool = useComponentSuggestions(useDeferredValue(unsavedSuggestions))

  // What's already slotted per category -- the bike doesn't change while
  // this page is open, so built once (a fresh Set per render would defeat
  // SetupTableRow's memo).
  const existingContextsByCategory = useMemo(() => {
    const result: Record<string, RideContext[]> = {}
    for (const slot of bike.bike_component_slots) (result[slot.category] ??= []).push(slot.ride_context)
    return result
  }, [bike.bike_component_slots])

  // Stable (functional updates only), so a keystroke re-renders just the
  // row it changed -- SetupTableRow is memoized.
  const updateRow = useCallback((category: string, key: string, changes: Partial<SetupRow>) => {
    setRowsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].map((row) => (row.key === key ? applyRowChange(row, changes) : row)),
    }))
  }, [])

  const changeRideContext = useCallback((category: string, key: string, rideContext: RideContext) => {
    setRowsByCategory((prev) => {
      const rows = prev[category]
      const updated = rows.map((row) => (row.key === key ? { ...row, key: `${category}:${rideContext}`, rideContext } : row))
      // Switching back to "both" only makes sense alone -- drop any
      // complementary split row that might have been added.
      return { ...prev, [category]: rideContext === 'both' ? updated.slice(0, 1) : updated }
    })
  }, [])

  const addComplementaryRow = useCallback((category: string) => {
    setRowsByCategory((prev) => {
      const rows = prev[category]
      const primary = rows[0]
      if (!primary || rows.length > 1) return prev
      const other: RideContext = primary.rideContext === 'outdoor_only' ? 'indoor_only' : 'outdoor_only'
      return { ...prev, [category]: [...rows, makeRow(`${category}:${other}`, other, false, false)] }
    })
  }, [])

  const removeRow = useCallback((category: string, key: string) => {
    setRowsByCategory((prev) => ({ ...prev, [category]: prev[category].filter((row) => row.key !== key) }))
  }, [])

  // Blur from Label/Brand/Model/Notes: uncheck an emptied auto-checked row.
  // Inside the updater, so it sees a change queued on the same blur (the
  // casing fix); returning prev when there's nothing to do skips the render.
  const blurRow = useCallback((category: string, key: string) => {
    setRowsByCategory((prev) => {
      const row = prev[category]?.find((r) => r.key === key)
      const changes = row && blurChange(row)
      if (!changes) return prev
      return { ...prev, [category]: prev[category].map((r) => (r.key === key ? applyRowChange(r, changes) : r)) }
    })
  }, [])

  function setAllChecked(checked: boolean) {
    setRowsByCategory((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([category, rows]) => [category, rows.map((row) => ({ ...row, checked, autoChecked: false }))]),
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
        label: setupRowLabel(row, { bikeName: bike.name, category }),
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

  const { ticked, total } = tickedCount(rowsByCategory)
  const summary = actionBarSummary({
    rowsByCategory,
    installedOn,
    bikeName: bike.name,
    errorCount: Object.keys(rowErrors).length,
  })
  const skip = () => navigate(`/bikes/${bike.id}`)
  const actions = (
    <SetupActions count={ticked} submitting={componentSetup.isPending} onSkip={skip} onSubmit={handleSubmit} />
  )

  return (
    <Stack>
      <BikeSetupHeader bike={bike} typeName={bikeType?.name ?? null} actions={actions} />

      <BikeSetupToolbar
        installedOn={installedOn}
        onInstalledOnChange={(value) => setInstalledOnOverride(value)}
        ticked={ticked}
        total={total}
        onCheckAll={() => setAllChecked(true)}
        onClearAll={() => setAllChecked(false)}
      />

      {baseError && <Alert color="red">{baseError}</Alert>}

      <Table.ScrollContainer minWidth={700}>
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
            const existingContexts = existingContextsByCategory[category] ?? NO_CONTEXTS

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
                bikeName={bike.name}
                row={row}
                isFirstRowOfCategory={rowIndex === 0}
                existingContexts={existingContexts}
                allowsMultiple={setting?.allows_multiple_assignments ?? false}
                canAddComplementary={rows.length === 1 && row.rideContextEditable && row.rideContext !== 'both'}
                canRemove={rowIndex > 0}
                error={rowErrors[row.key]}
                suggestions={suggestionPool}
                onChange={updateRow}
                onRideContextChange={changeRideContext}
                onAddComplementary={addComplementaryRow}
                onRemove={removeRow}
                onBlur={blurRow}
              />
            ))
          })}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>

      <BikeSetupActionBar
        summary={summary}
        actions={actions}
        phoneActions={
          <SetupActions
            count={ticked}
            submitting={componentSetup.isPending}
            onSkip={skip}
            onSubmit={handleSubmit}
            grow
            buttonStyle={MOBILE_TAP_TARGET_STYLE}
          />
        }
      />
    </Stack>
  )
}

const NO_CONTEXTS: RideContext[] = []

// Memoized: every prop is stable across another row's keystroke (the
// callbacks take the row's category and key), so typing re-renders one row.
const SetupTableRow = memo(function SetupTableRow({
  category,
  bikeName,
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
}: {
  category: string
  bikeName: string
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
}) {
  const change = (changes: Partial<SetupRow>) => onChange(category, row.key, changes)
  // Typing in Label/Brand/Model/Notes checks an unchecked row (merged into
  // the same change); emptying an auto-checked one unchecks it on blur.
  // Clicking, Tab and the casing fix don't check.
  const blur = () => onBlur(category, row.key)
  const inputCell = { opacity: row.checked ? 1 : 0.5 }

  return (
    <Table.Tr>
      <Table.Td>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Checkbox
            mt={2}
            checked={row.checked}
            onChange={(event) => change({ checked: event.currentTarget.checked, autoChecked: false })}
          />
          <Stack gap={2}>
            {isFirstRowOfCategory && <Text size="sm">{categoryLabel(category)}</Text>}
            {existingContexts.length > 0 && (
              <Text size="xs" c="dimmed">
                {existingContexts.map((context) => RIDE_CONTEXT_LABELS[context]).join(', ')}{' '}
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
                onChange={(value) => value && onRideContextChange(category, row.key, value as RideContext)}
                allowDeselect={false}
              />
            )}
            {allowsMultiple && !row.rideContextEditable && (
              <Badge size="xs" variant="light" color={row.rideContext === 'indoor_only' ? 'grape' : 'blue'}>
                {RIDE_CONTEXT_LABELS[row.rideContext]}
              </Badge>
            )}
            {canAddComplementary && (
              <UnstyledButton onClick={() => onAddComplementary(category)}>
                <Text size="xs" c="dimmed">
                  + Add {row.rideContext === 'outdoor_only' ? 'indoor' : 'outdoor'} too
                </Text>
              </UnstyledButton>
            )}
            {canRemove && (
              <UnstyledButton onClick={() => onRemove(category, row.key)}>
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
      <Table.Td style={inputCell}>
        <TextInput
          size="sm"
          value={row.label}
          placeholder={setupRowLabel({ ...row, label: '' }, { bikeName, category })}
          onChange={(event) => change(withActivation(row, { label: event.currentTarget.value }))}
          onBlur={blur}
        />
      </Table.Td>
      <Table.Td style={inputCell}>
        <ComponentBrandModelInputs
          layout="inline"
          size="sm"
          brand={row.brand}
          model={row.model}
          category={category}
          suggestions={suggestions}
          onBlur={blur}
          onChange={(changes, reason) => change(reason === 'input' ? withActivation(row, changes) : changes)}
        />
      </Table.Td>
      <Table.Td style={inputCell}>
        <Stack gap={4}>
          <UnstyledButton
            onClick={() => change({ notesExpanded: !row.notesExpanded })}
          >
            <Text size="xs" c="dimmed">
              {row.notesExpanded ? 'Hide notes' : '+ Notes'}
            </Text>
          </UnstyledButton>
          <Collapse expanded={row.notesExpanded}>
            <Textarea
              size="sm"
              value={row.notes}
              onChange={(event) => change(withActivation(row, { notes: event.currentTarget.value }))}
              onBlur={blur}
            />
          </Collapse>
        </Stack>
      </Table.Td>
    </Table.Tr>
  )
})
