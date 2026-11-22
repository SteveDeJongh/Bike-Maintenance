import { useState } from 'react'
import { Alert, Button, Group, Select, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useSwapComponentAssignment } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import AppModal from '../AppModal'
import CandidateOption from './CandidateOption'
import { useSwapOptions } from './useSwapOptions'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'

interface SwapComponentModalProps {
  opened: boolean
  onClose: () => void
  assignmentId: number
  category: string
  currentComponentId: number
  bikeId: number
  rideContext: 'both' | 'outdoor_only' | 'indoor_only'
}

// The one-step swap action's modal -- ends assignmentId and installs the
// chosen component in its place at "when", via POST
// /component_assignments/:id/swap. Shared by every row-actions surface
// that offers "Swap…" (the bike page's installed-components table and its
// mobile cards, ComponentDetail, the dashboard's BikeCard) -- one modal,
// not a copy per entry point.
export default function SwapComponentModal({
  opened,
  onClose,
  assignmentId,
  category,
  currentComponentId,
  bikeId,
  rideContext,
}: SwapComponentModalProps) {
  const swap = useSwapComponentAssignment()
  // Kept only until the dashboard card moves to AssignmentDetailModal.
  const { options } = useSwapOptions({ assignmentId, bikeId, componentId: currentComponentId, category, rideContext })
  const eligible = options

  const [componentId, setComponentId] = useState<string | null>(() =>
    eligible.length === 1 ? eligible[0].value : null,
  )
  const [swappedAt, setSwappedAt] = useState<string | null>(nowIsoUtc())
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  // The common case (the other chain) is one tap: when exactly one other
  // eligible component exists, it's preselected rather than making the
  // user pick from a list of one -- adjusted during render (not an
  // effect, which would need a setState-in-effect lint exception) the
  // same "resetting state when a dependency changes" pattern RidesTab's
  // own prevFilters and BatchServiceModal's own prevData already use.
  const [prevEligibleCount, setPrevEligibleCount] = useState(eligible.length)
  if (eligible.length !== prevEligibleCount) {
    setPrevEligibleCount(eligible.length)
    if (componentId === null && eligible.length === 1) setComponentId(eligible[0].value)
  }

  function handleClose() {
    setComponentId(null)
    setSwappedAt(nowIsoUtc())
    setBaseErrors([])
    onClose()
  }

  function handleSubmit() {
    if (!componentId || !swappedAt) return
    setBaseErrors([])
    swap.mutate(
      { assignmentId, component_id: Number(componentId), swapped_at: swappedAt },
      {
        onSuccess: handleClose,
        onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
      },
    )
  }

  return (
    <AppModal opened={opened} onClose={handleClose} title="Swap component">
      {opened && (
        <Stack>
          {eligible.length === 0 ? (
            <Text c="dimmed">No other non-retired component in this category to swap in.</Text>
          ) : (
            <Select
              label="Install instead"
              required
              data={options}
              value={componentId}
              onChange={setComponentId}
              renderOption={({ option }) => {
                const view = options.find((o) => o.value === option.value)
                return <CandidateOption label={option.label} brandModel={view?.brandModel} status={view?.status} />
              }}
            />
          )}
          <DateTimePicker
            label="When"
            required
            value={isoUtcToDate(swappedAt)}
            onChange={(value) => setSwappedAt(mantineLocalStringToIsoUtc(value))}
          />

          {baseErrors.length > 0 && (
            <Alert color="red">
              {baseErrors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!componentId} loading={swap.isPending}>
              Swap
            </Button>
          </Group>
        </Stack>
      )}
    </AppModal>
  )
}
