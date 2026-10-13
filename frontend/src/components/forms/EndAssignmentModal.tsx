import { useState } from 'react'
import { Alert, Button, Group, Modal, Stack } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useUpdateComponentAssignment } from '../../api/mutations'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import type { ComponentAssignment } from '../../types/models'

interface EndAssignmentFormValues {
  ended_at: string | null
}

interface EndAssignmentModalProps {
  opened: boolean
  onClose: () => void
  assignment: ComponentAssignment | null
  componentLabel: string
}

export default function EndAssignmentModal({
  opened,
  onClose,
  assignment,
  componentLabel,
}: EndAssignmentModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Remove ${componentLabel}`}>
      {opened && assignment && (
        <EndAssignmentForm key={assignment.id} onClose={onClose} assignment={assignment} />
      )}
    </Modal>
  )
}

function EndAssignmentForm({
  onClose,
  assignment,
}: {
  onClose: () => void
  assignment: ComponentAssignment
}) {
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<EndAssignmentFormValues>({
    initialValues: { ended_at: nowIsoUtc() },
    validate: {
      ended_at: (value) => (value ? null : 'End date is required'),
    },
  })

  const updateAssignment = useUpdateComponentAssignment(assignment.id)

  function handleSubmit(values: EndAssignmentFormValues) {
    setBaseErrors([])
    updateAssignment.mutate(
      { ended_at: values.ended_at },
      {
        onSuccess: () => onClose(),
        onError: (error) => setBaseErrors(applyApiErrors(form, error)),
      },
    )
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
          label="Ended on"
          required
          value={isoUtcToDate(form.values.ended_at)}
          onChange={(value) =>
            form.setFieldValue('ended_at', mantineLocalStringToIsoUtc(value))
          }
          error={form.errors.ended_at}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" color="red" loading={updateAssignment.isPending}>
            Remove
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
