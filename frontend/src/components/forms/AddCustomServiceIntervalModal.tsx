import { useRef, useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import { useCreateComponentServiceRequirement } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import {
  CALENDAR_UNIT_OPTIONS,
  RIDE_FILTER_OPTIONS,
  draftSatisfiersReady,
  emptyDraftSatisfier,
  hoursToSeconds,
  kmToMeters,
  resolveDraftSatisfiers,
} from './serviceRequirementHelpers'
import type { ActiveDimensions, DraftSatisfier } from './serviceRequirementHelpers'
import { DraftSatisfierRow } from './serviceRequirementShared'
import type { CalendarUnit, RideFilter } from '../../types/models'

interface AddCustomServiceIntervalModalProps {
  opened: boolean
  onClose: () => void
  componentId: number
}

// A custom (unlinked) requirement, created with its satisfiers inline in
// one transactional call -- same create-then-apply-nothing shape as a
// brand-new category template, minus the apply-to-components step (there's
// nothing to apply a component-specific requirement to).
export default function AddCustomServiceIntervalModal({
  opened,
  onClose,
  componentId,
}: AddCustomServiceIntervalModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add custom service requirement">
      {opened && <AddCustomServiceRequirementForm key={componentId} onClose={onClose} componentId={componentId} />}
    </Modal>
  )
}

function AddCustomServiceRequirementForm({ onClose, componentId }: { onClose: () => void; componentId: number }) {
  const createRequirement = useCreateComponentServiceRequirement()
  const { resolveServiceTypeId, isCreatingServiceType, createServiceTypeError } = useServiceTypeIdResolver()
  const nextDraftKey = useRef(1)

  const [name, setName] = useState('')
  const [km, setKm] = useState<number | ''>('')
  const [hours, setHours] = useState<number | ''>('')
  const [calendarAmount, setCalendarAmount] = useState<number | ''>('')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>('month')
  const [rideFilter, setRideFilter] = useState<RideFilter>('all')
  const [draftSatisfiers, setDraftSatisfiers] = useState<DraftSatisfier[]>([emptyDraftSatisfier('0')])

  const activeDimensions: ActiveDimensions = { distance: km !== '', movingTime: hours !== '', calendar: calendarAmount !== '' }

  function updateDraft(key: string, changes: Partial<DraftSatisfier>) {
    setDraftSatisfiers((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)))
  }

  function addDraftRow() {
    const key = String(nextDraftKey.current++)
    setDraftSatisfiers((prev) => [...prev, emptyDraftSatisfier(key)])
  }

  function removeDraftRow(key: string) {
    setDraftSatisfiers((prev) => (prev.length > 1 ? prev.filter((d) => d.key !== key) : prev))
  }

  const thresholdSet = km !== '' || hours !== '' || calendarAmount !== ''
  const canSubmit = name.trim() !== '' && thresholdSet && draftSatisfiersReady(draftSatisfiers)

  async function handleSubmit() {
    if (!canSubmit) return

    const resolvedSatisfiers = await resolveDraftSatisfiers(draftSatisfiers, resolveServiceTypeId)
    if (resolvedSatisfiers === null) return

    createRequirement.mutate(
      {
        values: {
          component_id: componentId,
          category_service_requirement_id: null,
          name: name.trim(),
          distance_meters: kmToMeters(km),
          moving_time_seconds: hoursToSeconds(hours),
          calendar_amount: calendarAmount === '' ? null : calendarAmount,
          calendar_unit: calendarAmount === '' ? null : calendarUnit,
          ride_filter: rideFilter,
          enabled: true,
        },
        satisfiers: resolvedSatisfiers,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} required w={300} />
      <Group align="flex-end" wrap="wrap">
        <NumberInput label="Every (km)" value={km} onChange={(v) => setKm(v === '' ? '' : Number(v))} min={0} w={120} />
        <NumberInput label="Every (hours)" value={hours} onChange={(v) => setHours(v === '' ? '' : Number(v))} min={0} w={120} />
        <Group gap={4} align="flex-end" wrap="nowrap">
          <NumberInput
            label="Every"
            value={calendarAmount}
            onChange={(v) => setCalendarAmount(v === '' ? '' : Number(v))}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={calendarUnit}
            onChange={(v) => setCalendarUnit((v as CalendarUnit | null) ?? 'month')}
            w={100}
            allowDeselect={false}
          />
        </Group>
      </Group>
      {!thresholdSet && (
        <Text size="xs" c="red">
          Set at least one of distance, hours, or calendar.
        </Text>
      )}

      <div>
        <Text size="sm" fw={500} mb={4}>
          Counts
        </Text>
        <SegmentedControl data={RIDE_FILTER_OPTIONS} value={rideFilter} onChange={(v) => setRideFilter(v as RideFilter)} />
        {rideFilter !== 'all' && calendarAmount !== '' && (
          <Text size="xs" c="dimmed" mt={4}>
            Calendar time keeps counting on indoor rides.
          </Text>
        )}
      </div>

      <Text fw={500} size="sm">
        Satisfied by
      </Text>
      {draftSatisfiers.map((draft) => (
        <DraftSatisfierRow
          key={draft.key}
          draft={draft}
          activeDimensions={activeDimensions}
          canRemove={draftSatisfiers.length > 1}
          onChange={(changes) => updateDraft(draft.key, changes)}
          onRemove={() => removeDraftRow(draft.key)}
        />
      ))}
      <Button size="xs" variant="default" onClick={addDraftRow} style={{ alignSelf: 'flex-start' }}>
        + Add another satisfier
      </Button>

      {createServiceTypeError && <Alert color="red">{formatApiError(createServiceTypeError)}</Alert>}
      {createRequirement.isError && <Alert color="red">{formatApiError(createRequirement.error)}</Alert>}

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} loading={createRequirement.isPending || isCreatingServiceType}>
          Add
        </Button>
      </Group>
    </Stack>
  )
}
