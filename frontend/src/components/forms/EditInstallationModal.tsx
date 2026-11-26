import { useState } from 'react'
import { Alert, Button, Group, Stack } from '@mantine/core'
import AppModal from '../AppModal'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useDeleteComponentAssignment, useUpdateComponentAssignment } from '../../api/mutations'
import { confirmDelete } from '../confirmDelete'
import RideContextCheckboxes from '../RideContextCheckboxes'
import { isoUtcToDate, mantineLocalStringToIsoUtc } from '../../utils/datetime'
import type { ComponentAssignmentWithStats } from '../../types/models'

interface EditInstallationFormValues {
  started_at: string | null
  ended_at: string | null
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
}

interface EditInstallationModalProps {
  opened: boolean
  onClose: () => void
  assignment: ComponentAssignmentWithStats
  // After Delete installation: the installation it was opened from is gone,
  // so the opener (the installation modal) closes too.
  onDeleted?: () => void
}

export default function EditInstallationModal({ opened, onClose, assignment, onDeleted }: EditInstallationModalProps) {
  return (
    <AppModal opened={opened} onClose={onClose} title="Edit installation">
      {opened && <EditInstallationForm key={assignment.id} onClose={onClose} assignment={assignment} onDeleted={onDeleted} />}
    </AppModal>
  )
}

function EditInstallationForm({
  onClose,
  assignment,
  onDeleted,
}: {
  onClose: () => void
  assignment: ComponentAssignmentWithStats
  onDeleted?: () => void
}) {
  // Uninstalled-on is only editable once there's already a real value to
  // edit (a past/History row) — an active row has no ended_at yet, and
  // setting one here would duplicate what the dedicated "Remove" flow
  // (EndAssignmentModal) already does.
  const isPast = assignment.ended_at !== null
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<EditInstallationFormValues>({
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
  const deleteAssignment = useDeleteComponentAssignment()

  // Removes the record outright (a mistaken install, or a stint to re-add
  // on another bike) -- unlike Remove, which ends it. Its rides stop
  // counting toward the component.
  function handleDelete() {
    confirmDelete({
      title: 'Delete installation',
      message: `Delete this installation of ${assignment.component.label}? Its rides stop counting toward it. This cannot be undone.`,
      onConfirm: () =>
        deleteAssignment.mutate(assignment.id, {
          onSuccess: () => {
            onClose()
            onDeleted?.()
          },
          onError: (error) => setBaseErrors(applyApiErrors(form, error)),
        }),
    })
  }

  function handleSubmit(values: EditInstallationFormValues) {
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

        <Group justify="space-between">
          <Button variant="outline" color="red" onClick={handleDelete} loading={deleteAssignment.isPending}>
            Delete installation
          </Button>
          <Group gap="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={updateAssignment.isPending}>
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  )
}
