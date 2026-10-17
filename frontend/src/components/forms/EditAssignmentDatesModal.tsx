import { useState } from 'react'
import { Alert, Button, Group, Modal, Stack } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useUpdateComponentAssignment } from '../../api/mutations'
import { isoUtcToDate, mantineLocalStringToIsoUtc } from '../../utils/datetime'
import type { ComponentAssignment } from '../../types/models'

interface EditAssignmentDatesFormValues {
  started_at: string | null
  ended_at: string | null
}

interface EditAssignmentDatesModalProps {
  opened: boolean
  onClose: () => void
  assignment: ComponentAssignment | null
  componentLabel: string
}

export default function EditAssignmentDatesModal({
  opened,
  onClose,
  assignment,
  componentLabel,
}: EditAssignmentDatesModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Edit dates for ${componentLabel}`}>
      {opened && assignment && (
        <EditAssignmentDatesForm key={assignment.id} onClose={onClose} assignment={assignment} />
      )}
    </Modal>
  )
}

function EditAssignmentDatesForm({
  onClose,
  assignment,
}: {
  onClose: () => void
  assignment: ComponentAssignment
}) {
  // Uninstalled-on is only editable once there's already a real value to
  // edit (a past/History row) — an active row has no ended_at yet, and
  // setting one here would duplicate what the dedicated "Remove" flow
  // (EndAssignmentModal) already does.
  const isPast = assignment.ended_at !== null
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<EditAssignmentDatesFormValues>({
    initialValues: { started_at: assignment.started_at, ended_at: assignment.ended_at },
    validate: {
      started_at: (value) => (value ? null : 'Installed date is required'),
      ended_at: (value) => (isPast && !value ? 'Uninstalled date is required' : null),
    },
  })

  const updateAssignment = useUpdateComponentAssignment(assignment.id)

  function handleSubmit(values: EditAssignmentDatesFormValues) {
    setBaseErrors([])
    const payload = isPast
      ? { started_at: values.started_at ?? '', ended_at: values.ended_at }
      : { started_at: values.started_at ?? '' }

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
  )
}
