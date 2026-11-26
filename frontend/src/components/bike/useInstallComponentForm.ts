import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useComponentCategorySettings } from '../../api/queries'
import { useCreateComponentAssignment, useDeleteBikeComponentSlot } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import { categoryLabel } from '../../constants'
import { nowIsoUtc } from '../../utils/datetime'
import { canTakeComponent } from '../../utils/swapOptions'
import type { BikeComponentSlot, BikeDetail as BikeDetailData, Component } from '../../types/models'

function showError(title: string, error: unknown) {
  const messages = parseApiError(error).baseErrors
  notifications.show({ color: 'red', title, message: messages.join(' ') || 'Something went wrong. Try again.' })
}

// An empty slot's install logic (EmptySlotPill): which components it can
// take, installing one straight away, creating a new one, and stopping
// tracking the slot. Installs use the defaults the old inline form
// pre-filled -- the bike's created_at for a slot with no history (it was
// presumably already on the bike), otherwise now; a split slot's own ride
// context, else the category's default. Both can be changed afterwards with
// the installation modal's Edit installation.
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
  const { data: categorySettings } = useComponentCategorySettings()
  const setting = categorySettings?.find((s) => s.category === slot.category)
  const rideContext = slot.ride_context === 'both' ? (setting?.default_ride_context ?? 'both') : slot.ride_context
  const categoryAllowsMultiple = setting?.allows_multiple_assignments ?? false

  const [createOpened, setCreateOpened] = useState(false)
  const createAssignment = useCreateComponentAssignment()
  const deleteSlot = useDeleteBikeComponentSlot()

  // canTakeComponent (utils/swapOptions.ts), the swap pill's rule: a spare,
  // or a shared indoor cassette for an indoor_only slot. The map only holds
  // other bikes' installations, hence bikeId null.
  const availableComponents = components.filter((component) => {
    const open = (activeAssignmentsElsewhereByComponentId.get(component.id) ?? []).map((rideContext) => ({ bikeId: null, rideContext }))
    return canTakeComponent(component, open, { bikeId: bike.id, category: slot.category, rideContext: slot.ride_context }, categoryAllowsMultiple)
  })

  function install(componentId: number) {
    createAssignment.mutate(
      {
        component_id: componentId,
        bike_id: bike.id,
        started_at: hasHistory ? nowIsoUtc() : bike.created_at,
        ended_at: null,
        ride_context: rideContext,
      },
      { onError: (error) => showError("Couldn't install the component", error) },
    )
  }

  function stopTracking() {
    deleteSlot.mutate(slot.id, { onError: (error) => showError("Couldn't stop tracking this slot", error) })
  }

  const options = availableComponents.map((component) => ({
    value: String(component.id),
    label:
      (activeAssignmentsElsewhereByComponentId.get(component.id)?.length ?? 0) > 0
        ? `${component.label} — shared, indoor only`
        : component.label,
  }))

  return {
    options,
    createLabel: `+ Create new ${categoryLabel(slot.category)}`,
    install,
    isInstalling: createAssignment.isPending,
    createOpened,
    setCreateOpened,
    stopTracking,
    isStoppingTracking: deleteSlot.isPending,
  }
}
