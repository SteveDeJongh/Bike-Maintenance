import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core'
import { ApiError } from '../api/client'
import { useBike, useBikeTypes, useComponentCategorySettings } from '../api/queries'
import { useComponentSetup, type ComponentSetupRow } from '../api/mutations'
import { useAllCategories } from '../hooks/useAllCategories'
import { todayIsoDate } from '../utils/datetime'
import { setupRowLabel } from '../utils/setupRowLabel'
import { applyRowChange, blurChange } from '../utils/setupRowActivation'
import { useComponentSuggestions } from '../hooks/useComponentSuggestions'
import type { ComponentSuggestionInput } from '../utils/componentSuggestions'
import type { BikeDetail, BikeType, ComponentCategorySetting } from '../types/models'
import {
  buildInitialRows,
  makeRow,
  parseRowErrorsByIndex,
  actionBarSummary,
  tickedCount,
  trackedLabel,
  type RideContext,
  type SetupRow,
} from '../components/bikeSetup/bikeSetupModel'
import BikeSetupHeader from '../components/bikeSetup/BikeSetupHeader'
import BikeSetupToolbar from '../components/bikeSetup/BikeSetupToolbar'
import BikeSetupActionBar from '../components/bikeSetup/BikeSetupActionBar'
import SetupActions from '../components/bikeSetup/SetupActions'
import SetupChecklistList from '../components/bikeSetup/SetupChecklistList'
import SetupRowItem from '../components/bikeSetup/SetupRowItem'
import AlreadyTrackedRow from '../components/bikeSetup/AlreadyTrackedRow'
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

      <SetupChecklistList stacked={false}>
        {trackableCategories.map((category) => {
          const rows = rowsByCategory[category]
          const setting = categorySettings.find((s) => s.category === category)
          const existingContexts = existingContextsByCategory[category] ?? NO_CONTEXTS

          if (rows.length === 0) {
            return <AlreadyTrackedRow key={category} category={category} label={trackedLabel(bike, category)} stacked={false} />
          }

          return rows.map((row, rowIndex) => (
            <SetupRowItem
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
      </SetupChecklistList>

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
