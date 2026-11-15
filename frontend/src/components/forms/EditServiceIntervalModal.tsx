import { useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { useUpdateComponentServiceRequirement } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import { categoryLabel } from '../../constants'
import {
  CALENDAR_UNIT_OPTIONS,
  RIDE_FILTER_LABELS,
  RIDE_FILTER_OPTIONS,
  formatThresholdSummary,
  hoursToSeconds,
  kmToMeters,
  metersToKm,
  secondsToHours,
} from './serviceRequirementHelpers'
import type { CalendarUnit, CategoryServiceRequirement, ComponentServiceRequirementWithStatus, RideFilter } from '../../types/models'

interface EditServiceIntervalModalProps {
  opened: boolean
  onClose: () => void
  requirement: ComponentServiceRequirementWithStatus
  // Looked up by the caller (already has the templates list fetched for
  // "Add from category defaults") -- undefined if this requirement's
  // template has since been deleted. Only ever rendered for a linked
  // requirement -- a custom row edits inline instead (see
  // ServiceIntervalsSection), never through this modal.
  template: CategoryServiceRequirement | undefined
  category: string
}

export default function EditServiceIntervalModal({
  opened,
  onClose,
  requirement,
  template,
  category,
}: EditServiceIntervalModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Edit ${requirement.requirement_name} override`}>
      {opened && (
        <EditServiceRequirementForm
          key={requirement.id}
          onClose={onClose}
          requirement={requirement}
          template={template}
          category={category}
        />
      )}
    </Modal>
  )
}

function EditServiceRequirementForm({
  onClose,
  requirement,
  template,
  category,
}: Omit<EditServiceIntervalModalProps, 'opened'>) {
  const [km, setKm] = useState<number | ''>(metersToKm(requirement.distance_meters))
  const [hours, setHours] = useState<number | ''>(secondsToHours(requirement.moving_time_seconds))
  const [calendarAmount, setCalendarAmount] = useState<number | ''>(requirement.calendar_amount ?? '')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(requirement.calendar_unit ?? 'month')
  const [rideFilter, setRideFilter] = useState<RideFilter>(requirement.ride_filter)
  const updateRequirement = useUpdateComponentServiceRequirement(requirement.id)

  function handleSave() {
    updateRequirement.mutate(
      {
        distance_meters: kmToMeters(km),
        moving_time_seconds: hoursToSeconds(hours),
        calendar_amount: calendarAmount === '' ? null : calendarAmount,
        calendar_unit: calendarAmount === '' ? null : calendarUnit,
        ride_filter: rideFilter,
      },
      { onSuccess: onClose },
    )
  }

  function handleResetToDefault() {
    // null on every override column means "inherit the template" -- no
    // backend change needed, this is already how a linked row's effective
    // values are resolved.
    updateRequirement.mutate(
      { distance_meters: null, moving_time_seconds: null, calendar_amount: null, calendar_unit: null, ride_filter: null },
      { onSuccess: onClose },
    )
  }

  return (
    <Stack>
      {template && (
        <Text size="sm" c="dimmed">
          From {categoryLabel(category)} default: {formatThresholdSummary(template)} · {RIDE_FILTER_LABELS[template.ride_filter]}
        </Text>
      )}

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

      {updateRequirement.isError && <Alert color="red">{formatApiError(updateRequirement.error)}</Alert>}

      <Group justify="space-between">
        <Button variant="subtle" onClick={handleResetToDefault} loading={updateRequirement.isPending}>
          Reset to default
        </Button>
        <Group>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={updateRequirement.isPending}>
            Save
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
