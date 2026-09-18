import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateComponentAssignment,
  useUpdateComponentAssignment,
  type ComponentAssignmentPayload,
} from '../../api/mutations'
import { useBikes, useComponents } from '../../api/queries'
import type { Bike, Component, ComponentAssignment } from '../../types/models'

interface AssignmentFormValues {
  component_id: string
  bike_id: string
  started_on: string | null
  ended_on: string | null
}

function emptyValues(lockBike?: Bike): AssignmentFormValues {
  return {
    component_id: '',
    bike_id: lockBike ? String(lockBike.id) : '',
    started_on: null,
    ended_on: null,
  }
}

function toFormValues(assignment: ComponentAssignment): AssignmentFormValues {
  return {
    component_id: String(assignment.component_id),
    bike_id: String(assignment.bike_id),
    started_on: assignment.started_on,
    ended_on: assignment.ended_on,
  }
}

function toPayload(values: AssignmentFormValues): ComponentAssignmentPayload {
  return {
    component_id: Number(values.component_id),
    bike_id: Number(values.bike_id),
    started_on: values.started_on ?? '',
    ended_on: values.ended_on,
  }
}

interface ComponentAssignmentFormModalProps {
  opened: boolean
  onClose: () => void
  assignment?: ComponentAssignment
  // When set, the bike is fixed (shown as static text) rather than an
  // editable Select — used from the Bike detail page's "Install component"
  // flow, so the user can't accidentally assign to the wrong bike.
  lockBike?: Bike
  // Component ids to omit from the picker (e.g. components already actively
  // assigned elsewhere) — only applied on create, ignored when editing.
  excludeComponentIds?: number[]
}

export default function ComponentAssignmentFormModal({
  opened,
  onClose,
  assignment,
  lockBike,
  excludeComponentIds,
}: ComponentAssignmentFormModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={assignment ? 'Edit Assignment' : 'Install Component'}
    >
      {opened && (
        <AssignmentForm
          key={assignment?.id ?? 'new'}
          onClose={onClose}
          assignment={assignment}
          lockBike={lockBike}
          excludeComponentIds={excludeComponentIds}
        />
      )}
    </Modal>
  )
}

function AssignmentForm({
  onClose,
  assignment,
  lockBike,
  excludeComponentIds,
}: {
  onClose: () => void
  assignment?: ComponentAssignment
  lockBike?: Bike
  excludeComponentIds?: number[]
}) {
  const isEdit = Boolean(assignment)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const { data: components } = useComponents()
  const { data: bikes } = useBikes()

  const form = useForm<AssignmentFormValues>({
    initialValues: assignment ? toFormValues(assignment) : emptyValues(lockBike),
    validate: {
      component_id: (value) => (value ? null : 'Component is required'),
      bike_id: (value) => (value ? null : 'Bike is required'),
      started_on: (value) => (value ? null : 'Start date is required'),
    },
  })

  const createAssignment = useCreateComponentAssignment()
  const updateAssignment = useUpdateComponentAssignment(assignment?.id ?? -1)
  const mutation = isEdit ? updateAssignment : createAssignment

  function handleSubmit(values: AssignmentFormValues) {
    setBaseErrors([])
    mutation.mutate(toPayload(values), {
      onSuccess: () => onClose(),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

  const componentOptions = (components ?? [])
    .filter((component: Component) => isEdit || !excludeComponentIds?.includes(component.id))
    .map((component: Component) => ({
      value: String(component.id),
      label: `${component.label} (${component.category})`,
    }))
  const bikeOptions = (bikes ?? []).map((bike: Bike) => ({
    value: String(bike.id),
    label: bike.name,
  }))

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

        <Select
          label="Component"
          required
          data={componentOptions}
          {...form.getInputProps('component_id')}
        />

        {lockBike ? (
          <Text size="sm">
            Bike: <strong>{lockBike.name}</strong>
          </Text>
        ) : (
          <Select label="Bike" required data={bikeOptions} {...form.getInputProps('bike_id')} />
        )}

        <DateInput label="Started on" required {...form.getInputProps('started_on')} />
        <DateInput label="Ended on" clearable {...form.getInputProps('ended_on')} />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? 'Save' : 'Install'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
