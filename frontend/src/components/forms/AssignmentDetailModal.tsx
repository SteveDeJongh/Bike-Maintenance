import { useState } from 'react'
import { Alert, Button, Divider, Group, Modal, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useUpdateComponentAssignment } from '../../api/mutations'
import ComponentOverview from '../ComponentOverview'
import RideContextCheckboxes from '../RideContextCheckboxes'
import { isoUtcToDate, mantineLocalStringToIsoUtc } from '../../utils/datetime'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import { formatPower } from '../../utils/power'
import type { ComponentAssignmentWithStats } from '../../types/models'

interface AssignmentDetailFormValues {
  started_at: string | null
  ended_at: string | null
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
}

interface AssignmentDetailModalProps {
  opened: boolean
  onClose: () => void
  assignment: ComponentAssignmentWithStats | null
}

export default function AssignmentDetailModal({ opened, onClose, assignment }: AssignmentDetailModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={assignment?.component.label ?? ''} size="xl">
      {opened && assignment && (
        <AssignmentDetailContent key={assignment.id} onClose={onClose} assignment={assignment} />
      )}
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={500}>{value}</Text>
    </div>
  )
}

function AssignmentDetailContent({
  onClose,
  assignment,
}: {
  onClose: () => void
  assignment: ComponentAssignmentWithStats
}) {
  // Uninstalled-on is only editable once there's already a real value to
  // edit (a past/History row) — an active row has no ended_at yet, and
  // setting one here would duplicate what the dedicated "Remove" flow
  // (EndAssignmentModal) already does.
  const isPast = assignment.ended_at !== null
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<AssignmentDetailFormValues>({
    initialValues: {
      started_at: assignment.started_at,
      ended_at: assignment.ended_at,
      ride_context: assignment.ride_context,
    },
    validate: {
      started_at: (value) => (value ? null : 'Installed date is required'),
      ended_at: (value) => (isPast && !value ? 'Uninstalled date is required' : null),
    },
  })

  const updateAssignment = useUpdateComponentAssignment(assignment.id)

  function handleSubmit(values: AssignmentDetailFormValues) {
    setBaseErrors([])
    const payload = isPast
      ? { started_at: values.started_at ?? '', ended_at: values.ended_at, ride_context: values.ride_context }
      : { started_at: values.started_at ?? '', ride_context: values.ride_context }

    updateAssignment.mutate(payload, {
      onSuccess: () => onClose(),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

  return (
    <Stack>
      <ComponentOverview componentId={assignment.component_id} />

      <Divider label="This installation" labelPosition="left" />
      <Group gap="xl">
        <Stat label="Distance" value={formatDistance(assignment.distance_meters)} />
        <Stat label="Time" value={formatDuration(assignment.moving_time)} />
        <Stat label="Elevation" value={formatElevation(assignment.elevation_gain)} />
        <Stat label="Avg Power" value={formatPower(assignment.average_power)} />
      </Group>

      <Divider label="Lifetime (all installations)" labelPosition="left" />
      <Group gap="xl">
        <Stat label="Total Distance" value={formatDistance(assignment.component.total_distance)} />
        <Stat label="Total Time" value={formatDuration(assignment.component.total_moving_time)} />
        <Stat label="Total Elevation" value={formatElevation(assignment.component.total_elevation_gain)} />
        <Stat label="Total Avg Power" value={formatPower(assignment.component.average_power)} />
      </Group>

      <Divider label="Edit this installation" labelPosition="left" />

      {/* Scoped to just these fields -- ComponentOverview above renders its
          own buttons/inputs (service intervals, logging a service) that
          must not accidentally submit this installation's own edit form
          on Enter. */}
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          {baseErrors.length > 0 && (
            <Alert color="red">
              {baseErrors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </Alert>
          )}

          <DateTimePicker
            label="Installed on"
            required
            value={isoUtcToDate(form.values.started_at)}
            onChange={(value) => form.setFieldValue('started_at', mantineLocalStringToIsoUtc(value))}
            error={form.errors.started_at}
          />

          {isPast && (
            <DateTimePicker
              label="Uninstalled on"
              required
              value={isoUtcToDate(form.values.ended_at)}
              onChange={(value) => form.setFieldValue('ended_at', mantineLocalStringToIsoUtc(value))}
              error={form.errors.ended_at}
            />
          )}

          <RideContextCheckboxes
            value={form.values.ride_context}
            onChange={(value) => form.setFieldValue('ride_context', value)}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updateAssignment.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  )
}
