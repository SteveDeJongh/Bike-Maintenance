import { useState } from 'react'
import { Alert, Button, Group, Modal, Stack } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useUpdateComponentAssignment } from '../../api/mutations'
import type { ComponentAssignment } from '../../types/models'

function todayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface EndAssignmentFormValues {
  ended_on: string | null
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
    initialValues: { ended_on: todayString() },
    validate: {
      ended_on: (value) => (value ? null : 'End date is required'),
    },
  })

  const updateAssignment = useUpdateComponentAssignment(assignment.id)

  function handleSubmit(values: EndAssignmentFormValues) {
    setBaseErrors([])
    updateAssignment.mutate(
      { ended_on: values.ended_on },
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

        <DateInput label="Ended on" required {...form.getInputProps('ended_on')} />

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
