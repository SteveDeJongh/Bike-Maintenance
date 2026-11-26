import { useMemo, useState } from 'react'
import { Anchor, Button, Checkbox, Group, Paper, Select, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import AppModal from '../AppModal'
import { useCreateComponentAssignment, useSwapComponentAssignment } from '../../api/mutations'
import { useBike, useBikes, useComponentCategorySettings } from '../../api/queries'
import { parseApiError } from '../../api/errors'
import { categoryLabel } from '../../constants'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import {
  attributionLine,
  bikeOptions,
  dateErrors,
  installRideContext,
  primaryLabel,
  removedOnRequired,
  showSlotField,
  slotOptions,
  submitCase,
  swapNote,
} from './installOnBikeModel'
import type { ComponentDetail } from '../../types/models'

const KICKER = { size: 'xs', c: 'dimmed', tt: 'uppercase', fw: 500, style: { letterSpacing: '0.04em' } } as const

interface InstallOnBikeModalProps {
  opened: boolean
  onClose: () => void
  component: ComponentDetail
  // Which entry point opened it: the ⋯ menu's "Install on bike…" or
  // Installation history's "+ Add installation" (whose past-stint button
  // reads "Add installation").
  origin: 'menu' | 'history'
  // The new installation's id, for Installation history's highlight.
  onInstalled?: (assignmentId: number) => void
}

// Install on bike (docs/components-and-setup.md, "Install on bike"): from
// the component, through one of the bike's slots -- a plain install, a swap
// into an occupied slot, or a closed past stint (Removed on set) that never
// ends or moves anything else. A fresh form on every open.
export default function InstallOnBikeModal(props: InstallOnBikeModalProps) {
  const [wasOpened, setWasOpened] = useState(props.opened)
  const [generation, setGeneration] = useState(0)
  if (props.opened !== wasOpened) {
    setWasOpened(props.opened)
    if (props.opened) setGeneration((current) => current + 1)
  }
  return <InstallOnBikeForm key={generation} {...props} />
}

function InstallOnBikeForm({ opened, onClose, component, origin, onInstalled }: InstallOnBikeModalProps) {
  const { data: bikes } = useBikes()
  const { data: categorySettings } = useComponentCategorySettings()
  const setting = categorySettings?.find((s) => s.category === component.category)
  const createAssignment = useCreateComponentAssignment()
  const swapAssignment = useSwapComponentAssignment()

  const [showRetired, setShowRetired] = useState(false)
  const options = useMemo(() => bikeOptions(bikes ?? [], component.category, showRetired), [bikes, component.category, showRetired])
  const [bikeValue, setBikeValue] = useState<string | null>(null)
  const chosenBikeValue = bikeValue ?? options[0]?.value ?? null
  const chosenBike = options.find((option) => option.value === chosenBikeValue) ?? null
  const bikeName = bikes?.find((bike) => String(bike.id) === chosenBikeValue)?.name ?? ''
  const { data: bike } = useBike(opened && chosenBikeValue ? Number(chosenBikeValue) : NaN)

  const [startedAt, setStartedAt] = useState<string | null>(nowIsoUtc())
  const [endedAt, setEndedAt] = useState<string | null>(null)
  const [trackSlot, setTrackSlot] = useState(false)
  const [slotValue, setSlotValue] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<{ started_at?: string; ended_at?: string; base: string[] }>({ base: [] })
  const [submitted, setSubmitted] = useState(false)

  const past = Boolean(endedAt)
  const requiredReason = removedOnRequired(component, chosenBike?.retired ?? false)
  const slots = bike ? slotOptions({ component, bike, allowsMultiple: setting?.allows_multiple_assignments ?? false, past }) : []
  const slot = slots.find((option) => String(option.slotId) === slotValue) ?? slots[0] ?? null
  const untracked = chosenBike != null && !chosenBike.tracked
  // A bike tracking the category but with no slot that can take it now.
  const noFreeSlot = bike != null && !untracked && slots.length === 0
  const kind = submitCase({ removedOn: endedAt, occupant: slot?.occupant ?? null })
  const mustTrack = untracked && !past
  const tracking = untracked && (mustTrack || trackSlot)

  const clientErrors = dateErrors(startedAt, endedAt)
  const removedMissing = requiredReason != null && !endedAt
  const blocked = !chosenBike || !bike || noFreeSlot || removedMissing || Object.keys(clientErrors).length > 0
  const pending = createAssignment.isPending || swapAssignment.isPending

  function handleError(error: unknown) {
    const { fieldErrors, baseErrors } = parseApiError(error)
    setServerErrors({
      started_at: fieldErrors.started_at?.join(', '),
      ended_at: fieldErrors.ended_at?.join(', '),
      base: [...baseErrors, ...Object.entries(fieldErrors).filter(([key]) => key !== 'started_at' && key !== 'ended_at').flatMap(([, v]) => v)],
    })
  }

  function done(assignmentId: number) {
    onInstalled?.(assignmentId)
    onClose()
  }

  function handleSubmit() {
    setSubmitted(true)
    setServerErrors({ base: [] })
    if (blocked || !startedAt || !chosenBikeValue) return

    if (kind === 'swap' && slot?.occupant) {
      swapAssignment.mutate(
        { assignmentId: slot.occupant.assignmentId, component_id: component.id, swapped_at: startedAt },
        { onSuccess: (result) => done(result.assignment.id), onError: handleError },
      )
      return
    }
    createAssignment.mutate(
      {
        component_id: component.id,
        bike_id: Number(chosenBikeValue),
        started_at: startedAt,
        ended_at: endedAt,
        ride_context: installRideContext(slot?.rideContext ?? null, setting?.default_ride_context),
        track_slot: tracking,
      },
      { onSuccess: (assignment) => done(assignment.id), onError: handleError },
    )
  }

  const startError = serverErrors.started_at ?? (submitted ? clientErrors.started_at : undefined)
  const endError =
    serverErrors.ended_at ??
    (submitted || endedAt ? clientErrors.ended_at : undefined) ??
    (submitted && removedMissing ? 'Removed on is required here' : undefined)

  return (
    <AppModal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Stack gap={2}>
          <Text {...KICKER}>Install · {categoryLabel(component.category)}</Text>
          <Text fz="lg" fw={700} lh={1.25} style={{ overflowWrap: 'anywhere' }}>
            {component.label}
          </Text>
        </Stack>
      }
      footer={
        opened && (
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={pending} disabled={!chosenBike || noFreeSlot}>
              {primaryLabel(kind, origin)}
            </Button>
          </Group>
        )
      }
    >
      {opened && (
        <Stack pb="xl">
          <Stack gap={4}>
            <Select
              label="Bike"
              required
              data={options.map((option) => ({ value: option.value, label: option.label }))}
              value={chosenBikeValue}
              onChange={(value) => {
                setBikeValue(value)
                setSlotValue(null)
                setTrackSlot(false)
                setServerErrors({ base: [] })
              }}
              allowDeselect={false}
              renderOption={({ option }) => {
                const note = options.find((candidate) => candidate.value === option.value)?.note
                return (
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm">{option.label}</Text>
                    {note && (
                      <Text size="xs" c="dimmed">
                        {note}
                      </Text>
                    )}
                  </Group>
                )
              }}
              description={chosenBike?.note ?? undefined}
            />
            <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => setShowRetired((current) => !current)} style={{ alignSelf: 'flex-start' }}>
              {showRetired ? 'Hide retired bikes' : 'Show retired bikes'}
            </Anchor>
          </Stack>

          {untracked && (
            <Checkbox
              label={`Track ${categoryLabel(component.category)} on ${bikeName}`}
              description={
                mustTrack
                  ? `${bikeName} doesn't track ${categoryLabel(component.category).toLowerCase()} yet; installing starts tracking it.`
                  : 'Optional for a past installation: leave it off to keep the bike’s lineup as it is.'
              }
              checked={tracking}
              disabled={mustTrack}
              onChange={(event) => setTrackSlot(event.currentTarget.checked)}
            />
          )}

          {!untracked && showSlotField(slots) && (
            <Select
              label="Slot"
              data={slots.map((option) => ({ value: String(option.slotId), label: option.label }))}
              value={slot ? String(slot.slotId) : null}
              onChange={setSlotValue}
              allowDeselect={false}
            />
          )}
          {!untracked && slots.length === 1 && slot?.occupant && (
            <Text size="xs" c="dimmed">
              {slot.label}
            </Text>
          )}
          {noFreeSlot && (
            <Text size="sm" c="dimmed">
              No slot on {bikeName} can take {component.label} now. Add a Removed on date for a past installation.
            </Text>
          )}

          <Group gap="sm" align="flex-start" wrap="wrap">
            <DateTimePicker
              label="Installed on"
              required
              value={isoUtcToDate(startedAt)}
              onChange={(value) => {
                setStartedAt(mantineLocalStringToIsoUtc(value))
                setServerErrors((current) => ({ ...current, started_at: undefined }))
              }}
              maxDate={new Date()}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              error={startError}
              style={{ flex: '1 1 220px' }}
            />
            <DateTimePicker
              label="Removed on"
              required={requiredReason != null}
              clearable
              value={isoUtcToDate(endedAt)}
              onChange={(value) => {
                setEndedAt(mantineLocalStringToIsoUtc(value))
                setServerErrors((current) => ({ ...current, ended_at: undefined }))
              }}
              maxDate={new Date()}
              description={requiredReason ?? "Leave blank if it's still on the bike."}
              // Helper text under the input, so both fields' labels and inputs
              // share rows; errors stay under their own field.
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              error={endError}
              style={{ flex: '1 1 220px' }}
            />
          </Group>
          {serverErrors.base.length > 0 && (
            <Text size="sm" c="red">
              {serverErrors.base.join(' ')}
            </Text>
          )}

          {kind === 'swap' && slot?.occupant && startedAt && (
            <Text size="sm">{swapNote(slot.occupant.label, bikeName, startedAt)}</Text>
          )}
          {chosenBike && startedAt && (
            <Paper radius="md" p="sm" bg="var(--mantine-color-default-hover)">
              <Text size="sm">{attributionLine(bikeName, startedAt, endedAt)}</Text>
            </Paper>
          )}
        </Stack>
      )}
    </AppModal>
  )
}
