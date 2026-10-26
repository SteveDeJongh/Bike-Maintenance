import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Textarea } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateMaintenanceEvent,
  useUpdateMaintenanceEvent,
  type MaintenanceEventPayload,
} from '../../api/mutations'
import { useComponents } from '../../api/queries'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import type { Component, MaintenanceEvent } from '../../types/models'
import ServiceTypeSelect, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypeSelect'

interface MaintenanceEventFormValues {
  component_id: string
  service_type_id: string
  performed_at: string | null
  notes: string
}

function emptyValues(defaultComponentId?: number): MaintenanceEventFormValues {
  return {
    component_id: defaultComponentId ? String(defaultComponentId) : '',
    service_type_id: '',
    performed_at: nowIsoUtc(),
    notes: '',
  }
}

function toFormValues(event: MaintenanceEvent): MaintenanceEventFormValues {
  return {
    component_id: String(event.component_id),
    service_type_id: String(event.service_type_id),
    performed_at: event.performed_at,
    notes: event.notes ?? '',
  }
}

function toPayload(values: MaintenanceEventFormValues): MaintenanceEventPayload {
  return {
    component_id: Number(values.component_id),
    service_type_id: Number(values.service_type_id),
    performed_at: values.performed_at ?? '',
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
      service_type_id: (value) =>
        value && value !== CREATE_NEW_SERVICE_TYPE ? null : 'Service type is required',
      performed_at: (value) => (value ? null : 'Date is required'),
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

  function handleServiceTypeChange(value: string) {
    form.setFieldValue('service_type_id', value)
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
        <ServiceTypeSelect
          value={form.values.service_type_id}
          onChange={handleServiceTypeChange}
          error={typeof form.errors.service_type_id === 'string' ? form.errors.service_type_id : undefined}
        />
        <DateTimePicker
          label="Performed at"
          required
          value={isoUtcToDate(form.values.performed_at)}
          onChange={(value) =>
            form.setFieldValue('performed_at', mantineLocalStringToIsoUtc(value))
          }
          error={form.errors.performed_at}
        />
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
