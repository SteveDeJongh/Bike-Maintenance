import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Textarea } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateMaintenanceEvent,
  useUpdateMaintenanceEvent,
  type MaintenanceEventPayload,
} from '../../api/mutations'
import { useComponents } from '../../api/queries'
import { MAINTENANCE_EVENT_TYPES } from '../../constants'
import type { Component, MaintenanceEvent } from '../../types/models'

function todayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface MaintenanceEventFormValues {
  component_id: string
  event_type: string
  performed_on: string | null
  notes: string
}

function emptyValues(defaultComponentId?: number): MaintenanceEventFormValues {
  return {
    component_id: defaultComponentId ? String(defaultComponentId) : '',
    event_type: '',
    performed_on: todayString(),
    notes: '',
  }
}

function toFormValues(event: MaintenanceEvent): MaintenanceEventFormValues {
  return {
    component_id: String(event.component_id),
    event_type: event.event_type,
    performed_on: event.performed_on,
    notes: event.notes ?? '',
  }
}

function toPayload(values: MaintenanceEventFormValues): MaintenanceEventPayload {
  return {
    component_id: Number(values.component_id),
    event_type: values.event_type as MaintenanceEvent['event_type'],
    performed_on: values.performed_on ?? '',
    notes: values.notes.trim() || null,
  }
}

interface MaintenanceEventFormModalProps {
  opened: boolean
  onClose: () => void
  event?: MaintenanceEvent
  defaultComponentId?: number
}

export default function MaintenanceEventFormModal({
  opened,
  onClose,
  event,
  defaultComponentId,
}: MaintenanceEventFormModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={event ? 'Edit Maintenance Event' : 'New Maintenance Event'}
    >
      {opened && (
        <MaintenanceEventForm
          key={event?.id ?? 'new'}
          onClose={onClose}
          event={event}
          defaultComponentId={defaultComponentId}
        />
      )}
    </Modal>
  )
}

function MaintenanceEventForm({
  onClose,
  event,
  defaultComponentId,
}: {
  onClose: () => void
  event?: MaintenanceEvent
  defaultComponentId?: number
}) {
  const isEdit = Boolean(event)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const { data: components } = useComponents()

  const form = useForm<MaintenanceEventFormValues>({
    initialValues: event ? toFormValues(event) : emptyValues(defaultComponentId),
    validate: {
      component_id: (value) => (value ? null : 'Component is required'),
      event_type: (value) => (value ? null : 'Event type is required'),
      performed_on: (value) => (value ? null : 'Date is required'),
    },
  })

  const createEvent = useCreateMaintenanceEvent()
  const updateEvent = useUpdateMaintenanceEvent(event?.id ?? -1)
  const mutation = isEdit ? updateEvent : createEvent

  function handleSubmit(values: MaintenanceEventFormValues) {
    setBaseErrors([])
    mutation.mutate(toPayload(values), {
      onSuccess: () => onClose(),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

  const componentOptions = (components ?? []).map((component: Component) => ({
    value: String(component.id),
    label: component.label,
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
        <Select
          label="Event type"
          required
          data={[...MAINTENANCE_EVENT_TYPES]}
          {...form.getInputProps('event_type')}
        />
        <DateInput label="Performed on" required {...form.getInputProps('performed_on')} />
        <Textarea label="Notes" {...form.getInputProps('notes')} />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
