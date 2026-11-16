import { useState } from 'react'
import { useComponentCategorySettings } from '../../api/queries'
import { useCreateComponentAssignment, useDeleteBikeComponentSlot } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import { categoryLabel } from '../../constants'
import { nowIsoUtc } from '../../utils/datetime'
import type { BikeComponentSlot, BikeDetail as BikeDetailData, Component } from '../../types/models'

export const CREATE_NEW_COMPONENT = '__create_new__'

// EmptySlotRow's own state and submit logic, pulled out of its markup --
// everything the row needs to let a user pick (or create) a component,
// set a start date/ride context, install it, or stop tracking the slot
// entirely. The only thing EmptySlotRow itself still owns is the JSX.
export function useInstallComponentForm({
  bike,
  slot,
  hasHistory,
  components,
  activeAssignmentsElsewhereByComponentId,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  hasHistory: boolean
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
}) {
  const [componentId, setComponentId] = useState<string | null>(null)
  // A slot being assigned for the first time defaults to the bike's own
  // created_at (it was presumably already mounted when the bike was added
  // to the tracker); a slot with prior history defaults to now.
  const [startedAt, setStartedAt] = useState<string | null>(
    hasHistory ? nowIsoUtc() : bike.created_at,
  )
  const { data: categorySettings } = useComponentCategorySettings()
  const defaultRideContext =
    categorySettings?.find((setting) => setting.category === slot.category)?.default_ride_context ?? 'both'
  // Only meaningful for a "both" slot -- a split slot's ride_context is
  // fixed by the slot itself, not a user choice.
  const [rideContext, setRideContext] = useState<'both' | 'outdoor_only' | 'indoor_only'>(defaultRideContext)

  const [createOpened, setCreateOpened] = useState(false)
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const createAssignment = useCreateComponentAssignment()
  const deleteSlot = useDeleteBikeComponentSlot()

  const categoryAllowsMultiple =
    categorySettings?.find((setting) => setting.category === slot.category)?.allows_multiple_assignments ?? false

  // A component already active on a different bike is normally excluded --
  // unless this slot is indoor_only, the category allows sharing, and every
  // one of the component's active-elsewhere assignments is also
  // indoor_only (e.g. a cassette that physically lives on the trainer, not
  // on any one bike's frame).
  const availableComponents = components
    .filter((component) => component.category === slot.category)
    .filter((component) => {
      const elsewhere = activeAssignmentsElsewhereByComponentId.get(component.id) ?? []
      if (elsewhere.length === 0) return true

      return (
        slot.ride_context === 'indoor_only' &&
        categoryAllowsMultiple &&
        elsewhere.every((context) => context === 'indoor_only')
      )
    })

  function assign(targetComponentId: number) {
    setBaseErrors([])
    createAssignment.mutate(
      {
        component_id: targetComponentId,
        bike_id: bike.id,
        started_at: startedAt ?? nowIsoUtc(),
        ended_at: null,
        ride_context: slot.ride_context === 'both' ? rideContext : slot.ride_context,
      },
      {
        onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
      },
    )
  }

  function handleChange(value: string | null) {
    if (value === CREATE_NEW_COMPONENT) {
      setCreateOpened(true)
      return
    }
    setComponentId(value)
  }

  function stopTracking() {
    setBaseErrors([])
    deleteSlot.mutate(slot.id, {
      onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
    })
  }

  const options = [
    ...availableComponents.map((component) => ({
      value: String(component.id),
      label:
        (activeAssignmentsElsewhereByComponentId.get(component.id)?.length ?? 0) > 0
          ? `${component.label} — shared, indoor only`
          : component.label,
    })),
    { value: CREATE_NEW_COMPONENT, label: `+ Create new ${categoryLabel(slot.category)}` },
  ]

  return {
    componentId,
    setComponentId,
    startedAt,
    setStartedAt,
    rideContext,
    setRideContext,
    createOpened,
    setCreateOpened,
    baseErrors,
    options,
    handleChange,
    assign,
    isAssigning: createAssignment.isPending,
    stopTracking,
    isStoppingTracking: deleteSlot.isPending,
  }
}
