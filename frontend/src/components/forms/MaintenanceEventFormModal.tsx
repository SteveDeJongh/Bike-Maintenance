import { useId, useState } from 'react'
import { Alert, Button, Group, Select, Stack, Textarea } from '@mantine/core'
import AppModal from '../AppModal'
import { confirmDelete } from '../confirmDelete'
import { DateTimePicker } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateMaintenanceEvent,
  useDeleteMaintenanceEvent,
  useUpdateMaintenanceEvent,
  type MaintenanceEventPayload,
} from '../../api/mutations'
import { useComponents } from '../../api/queries'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import type { Component, MaintenanceEvent } from '../../types/models'
import ServiceTypePicker, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypePicker'
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
    <MaintenanceEventForm
      key={event?.id ?? 'new'}
      opened={opened}
      onClose={onClose}
      event={event}
      defaultComponentId={defaultComponentId}
      defaultServiceTypeId={defaultServiceTypeId}
    />
  )
}

// Owns the AppModal itself, not just the form inside it -- unlike every
// other form modal, this one needs its submit/cancel row as AppModal's
// `footer` prop (for the sticky-on-mobile treatment), and that footer's
// own disabled/loading state depends on this component's own form/
// mutation state, which the previous split (a non-keyed outer Modal
// wrapper around a keyed inner form) had no way to reach. Keying this
// whole component by event identity (same as the old inner form did)
// still forces a clean remount of all of it -- including AppModal --
// whenever the edit target changes; in practice `opened` already cycles
// through false whenever that happens, so AppModal's close transition is
// unaffected.
function MaintenanceEventForm({
  opened,
  onClose,
  event,
  defaultComponentId,
  defaultServiceTypeId,
}: {
  opened: boolean
  onClose: () => void
  event?: MaintenanceEvent
  defaultComponentId?: number
  defaultServiceTypeId?: number
}) {
  const formId = useId()
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
  const deleteEvent = useDeleteMaintenanceEvent()

  // Edit mode only: deleting one service (the Maintenance page's rows open
  // this modal and carry no row actions of their own).
  function handleDelete() {
    if (!event) return
    confirmDelete({
      title: 'Delete service',
      message: 'Delete this service? This cannot be undone.',
      onConfirm: () =>
        deleteEvent.mutate(event.id, {
          onSuccess: () => onClose(),
          onError: (error) => setBaseErrors(applyApiErrors(form, error)),
        }),
    })
  }

  async function handleSubmit(values: MaintenanceEventFormValues) {
    setBaseErrors([])

    if (values.service_type_id === CREATE_NEW_SERVICE_TYPE && !values.service_type_new_name.trim()) {
      form.setFieldError('service_type_new_name', 'Name is required')
      return
    }

    let resolvedServiceTypeId: number
    try {
      resolvedServiceTypeId = await resolveServiceTypeId(values.service_type_id, values.service_type_new_name, selectedCategory)
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

  // The picker's category context: whichever component is picked right now
  // (none picked yet = no filter).
  const selectedCategory = components?.find((component) => String(component.id) === form.values.component_id)?.category ?? null

  const componentOptions = (components ?? []).map((component: Component) => ({
    value: String(component.id),
    label: component.label,
  }))

  return (
    <AppModal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Edit service' : 'Log service'}
      footer={
        opened && (
          <Group justify={isEdit ? 'space-between' : 'flex-end'}>
            {isEdit && (
              <Button variant="subtle" color="red" onClick={handleDelete} loading={deleteEvent.isPending}>
                Delete service
              </Button>
            )}
            <Group gap="sm">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form={formId} loading={mutation.isPending || isCreatingServiceType}>
                {isEdit ? 'Save' : 'Log service'}
              </Button>
            </Group>
          </Group>
        )
      }
    >
      {opened && (
        <form id={formId} onSubmit={form.onSubmit(handleSubmit)}>
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
            <ServiceTypePicker
              value={form.values.service_type_id}
              category={selectedCategory}
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
              disabled={event?.service_session_id != null}
              description={
                event?.service_session_id != null
                  ? "Part of a service session — edit the date from the session marker on this component's history instead."
                  : undefined
              }
            />
            <Textarea label="Notes" {...form.getInputProps('notes')} />
          </Stack>
        </form>
      )}
    </AppModal>
  )
}
