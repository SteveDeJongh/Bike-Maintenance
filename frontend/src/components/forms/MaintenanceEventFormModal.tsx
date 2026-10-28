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
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'

interface MaintenanceEventFormValues {
  component_id: string
  service_type_id: string
  // Only ever read when service_type_id is the CREATE_NEW_SERVICE_TYPE
  // sentinel -- not sent to the API directly, see toPayload.
  service_type_new_name: string
  performed_at: string | null
  notes: string
}

function emptyValues(defaultComponentId?: number, defaultServiceTypeId?: number): MaintenanceEventFormValues {
  return {
    component_id: defaultComponentId ? String(defaultComponentId) : '',
    service_type_id: defaultServiceTypeId ? String(defaultServiceTypeId) : '',
    service_type_new_name: '',
    performed_at: nowIsoUtc(),
    notes: '',
  }
}

function toFormValues(event: MaintenanceEvent): MaintenanceEventFormValues {
  return {
    component_id: String(event.component_id),
    service_type_id: String(event.service_type_id),
    service_type_new_name: '',
    performed_at: event.performed_at,
    notes: event.notes ?? '',
  }
}

function toPayload(values: MaintenanceEventFormValues, resolvedServiceTypeId: number): MaintenanceEventPayload {
  return {
    component_id: Number(values.component_id),
    service_type_id: resolvedServiceTypeId,
    performed_at: values.performed_at ?? '',
    notes: values.notes.trim() || null,
  }
}

interface MaintenanceEventFormModalProps {
  opened: boolean
  onClose: () => void
  event?: MaintenanceEvent
  defaultComponentId?: number
  defaultServiceTypeId?: number
}

export default function MaintenanceEventFormModal({
  opened,
  onClose,
  event,
  defaultComponentId,
  defaultServiceTypeId,
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
          defaultServiceTypeId={defaultServiceTypeId}
        />
      )}
    </Modal>
  )
}

function MaintenanceEventForm({
  onClose,
  event,
  defaultComponentId,
  defaultServiceTypeId,
}: {
  onClose: () => void
  event?: MaintenanceEvent
  defaultComponentId?: number
  defaultServiceTypeId?: number
}) {
  const isEdit = Boolean(event)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const { data: components } = useComponents()
  const { resolveServiceTypeId, isCreatingServiceType } = useServiceTypeIdResolver()

  const form = useForm<MaintenanceEventFormValues>({
    initialValues: event ? toFormValues(event) : emptyValues(defaultComponentId, defaultServiceTypeId),
    validate: {
      component_id: (value) => (value ? null : 'Component is required'),
      service_type_id: (value) => (value ? null : 'Service type is required'),
      performed_at: (value) => (value ? null : 'Date is required'),
    },
  })

  const createEvent = useCreateMaintenanceEvent()
  const updateEvent = useUpdateMaintenanceEvent(event?.id ?? -1)
  const mutation = isEdit ? updateEvent : createEvent

  async function handleSubmit(values: MaintenanceEventFormValues) {
    setBaseErrors([])

    if (values.service_type_id === CREATE_NEW_SERVICE_TYPE && !values.service_type_new_name.trim()) {
      form.setFieldError('service_type_new_name', 'Name is required')
      return
    }

    let resolvedServiceTypeId: number
    try {
      resolvedServiceTypeId = await resolveServiceTypeId(values.service_type_id, values.service_type_new_name)
    } catch (error) {
      setBaseErrors(applyApiErrors(form, error))
      return
    }

    mutation.mutate(toPayload(values, resolvedServiceTypeId), {
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
          newTypeName={form.values.service_type_new_name}
          onNewTypeNameChange={(value) => form.setFieldValue('service_type_new_name', value)}
          error={typeof form.errors.service_type_id === 'string' ? form.errors.service_type_id : undefined}
          newTypeNameError={
            typeof form.errors.service_type_new_name === 'string' ? form.errors.service_type_new_name : undefined
          }
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
          <Button type="submit" loading={mutation.isPending || isCreatingServiceType}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
