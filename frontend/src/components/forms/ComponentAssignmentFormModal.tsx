import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateComponentAssignment,
  useUpdateComponentAssignment,
  type ComponentAssignmentPayload,
} from '../../api/mutations'
import { useBikes, useComponentCategorySettings, useComponents } from '../../api/queries'
import { categoryLabel, RIDE_CONTEXTS, RIDE_CONTEXT_LABELS } from '../../constants'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import type { Bike, Component, ComponentAssignment } from '../../types/models'

interface AssignmentFormValues {
  category: string
  component_id: string
  bike_id: string
  started_at: string | null
  ended_at: string | null
  ride_context: string
}

function emptyValues(lockBike?: Bike): AssignmentFormValues {
  return {
    category: '',
    component_id: '',
    bike_id: lockBike ? String(lockBike.id) : '',
    started_at: nowIsoUtc(),
    ended_at: null,
    ride_context: 'both',
  }
}

function toPayload(values: AssignmentFormValues): ComponentAssignmentPayload {
  return {
    component_id: Number(values.component_id),
    bike_id: Number(values.bike_id),
    started_at: values.started_at ?? '',
    ended_at: values.ended_at,
    ride_context: values.ride_context as 'both' | 'outdoor_only' | 'indoor_only',
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
  const { data: categorySettings } = useComponentCategorySettings()

  const initialComponent = assignment
    ? (components ?? []).find((c) => c.id === assignment.component_id)
    : undefined

  const form = useForm<AssignmentFormValues>({
    initialValues: assignment
      ? {
          category: initialComponent?.category ?? '',
          component_id: String(assignment.component_id),
          bike_id: String(assignment.bike_id),
          started_at: assignment.started_at,
          ended_at: assignment.ended_at,
          ride_context: assignment.ride_context,
        }
      : emptyValues(lockBike),
    validate: {
      category: (value) => (value ? null : 'Category is required'),
      component_id: (value) => (value ? null : 'Component is required'),
      bike_id: (value) => (value ? null : 'Bike is required'),
      started_at: (value) => (value ? null : 'Start date is required'),
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

  const availableComponents = (components ?? []).filter(
    (component: Component) => isEdit || !excludeComponentIds?.includes(component.id),
  )
  const categoryOptions = [...new Set(availableComponents.map((c) => c.category))].map(
    (category) => ({ value: category, label: categoryLabel(category) }),
  )
  const componentOptions = availableComponents
    .filter((component) => component.category === form.values.category)
    .map((component) => ({ value: String(component.id), label: component.label }))

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
          label="Category"
          required
          data={categoryOptions}
          {...form.getInputProps('category')}
          onChange={(value) => {
            form.setFieldValue('category', value ?? '')
            form.setFieldValue('component_id', '')
            if (!isEdit) {
              const accruesIndoor =
                categorySettings?.find((setting) => setting.category === value)?.accrues_indoor_mileage ?? true
              form.setFieldValue('ride_context', accruesIndoor ? 'both' : 'outdoor_only')
            }
          }}
        />

        <Select
          label="Component"
          required
          disabled={!form.values.category}
          placeholder={form.values.category ? undefined : 'Pick a category first'}
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

        <Select
          label="Ride context"
          required
          allowDeselect={false}
          data={RIDE_CONTEXTS.map((context) => ({ value: context, label: RIDE_CONTEXT_LABELS[context] }))}
          {...form.getInputProps('ride_context')}
        />

        <DateTimePicker
          label="Started on"
          required
          value={isoUtcToDate(form.values.started_at)}
          onChange={(value) =>
            form.setFieldValue('started_at', mantineLocalStringToIsoUtc(value))
          }
          error={form.errors.started_at}
        />
        <DateTimePicker
          label="Ended on"
          clearable
          value={isoUtcToDate(form.values.ended_at)}
          onChange={(value) => form.setFieldValue('ended_at', mantineLocalStringToIsoUtc(value))}
          error={form.errors.ended_at}
        />

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
