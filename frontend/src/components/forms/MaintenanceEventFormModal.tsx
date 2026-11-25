import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Group, Stack, Tooltip } from '@mantine/core'
import AppModal from '../AppModal'
import { confirmDelete } from '../confirmDelete'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateMaintenanceEvent,
  useDeleteMaintenanceEvent,
  useUpdateMaintenanceEvent,
  type MaintenanceEventPayload,
} from '../../api/mutations'
import { useBikes, useComponent, useComponents, useServiceSession, useServiceTypes } from '../../api/queries'
import { nowIsoUtc } from '../../utils/datetime'
import type { MaintenanceEvent } from '../../types/models'
import { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypePicker'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import ServiceNotesField from './ServiceNotesField'
import ServiceSessionViewModal from './ServiceSessionViewModal'
import LogServiceTitle from '../logService/LogServiceTitle'
import ServicePills from '../logService/ServicePills'
import DoneOnField from '../logService/DoneOnField'
import ResetsPanel from '../logService/ResetsPanel'
import {
  defaultServiceTypeId,
  primaryAction,
  serviceTypeAfterComponentChange,
  servicePills,
  sessionLockText,
} from '../logService/logServiceModel'
import ComponentPicker from '../logService/ComponentPicker'

interface MaintenanceEventFormValues {
  component_id: string
  service_type_id: string
  // Only ever read when service_type_id is the CREATE_NEW_SERVICE_TYPE
  // sentinel -- not sent to the API directly, see toPayload.
  service_type_new_name: string
  performed_at: string | null
  notes: string
}

function emptyValues(defaultComponentId?: number, defaultServiceTypeIdValue?: number): MaintenanceEventFormValues {
  return {
    component_id: defaultComponentId ? String(defaultComponentId) : '',
    service_type_id: defaultServiceTypeIdValue ? String(defaultServiceTypeIdValue) : '',
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
  // Given by an opener that can start a service session (the Maintenance
  // page): the no-component version links to it ("Log a service session").
  onLogSession?: () => void
}

// The Log service modal: logging or editing one service on one component
// (docs/frontend-ui.md, "Log service modal"). Opened with a component, or
// editing, it's that component's; opened without one it starts with the
// component picker.
export default function MaintenanceEventFormModal({
  opened,
  onClose,
  event,
  defaultComponentId,
  defaultServiceTypeId: preselectedServiceTypeId,
  onLogSession,
}: MaintenanceEventFormModalProps) {
  return (
    <MaintenanceEventForm
      key={event?.id ?? 'new'}
      opened={opened}
      onClose={onClose}
      event={event}
      defaultComponentId={defaultComponentId}
      preselectedServiceTypeId={preselectedServiceTypeId}
      onLogSession={onLogSession}
    />
  )
}

// Owns the AppModal itself, not just the form inside it -- the footer
// (AppModal's `footer`, sticky on mobile) and the lifted title both depend
// on this form's state. Keyed by event identity, so changing the edit
// target remounts all of it.
function MaintenanceEventForm({
  opened,
  onClose,
  event,
  defaultComponentId,
  preselectedServiceTypeId,
  onLogSession,
}: {
  opened: boolean
  onClose: () => void
  event?: MaintenanceEvent
  defaultComponentId?: number
  preselectedServiceTypeId?: number
  onLogSession?: () => void
}) {
  const formId = useId()
  const isEdit = Boolean(event)
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const [sessionOpened, setSessionOpened] = useState(false)

  const { data: components } = useComponents()
  const { data: serviceTypes } = useServiceTypes()
  const { data: bikes } = useBikes()
  const { resolveServiceTypeId, isCreatingServiceType } = useServiceTypeIdResolver()

  const form = useForm<MaintenanceEventFormValues>({
    initialValues: event ? toFormValues(event) : emptyValues(defaultComponentId, preselectedServiceTypeId),
    validate: {
      component_id: (value) => (value ? null : 'Component is required'),
      service_type_id: (value) => (value ? null : 'Service type is required'),
      performed_at: (value) => (value ? null : 'Date is required'),
    },
  })

  const componentId = form.values.component_id ? Number(form.values.component_id) : undefined
  const { data: component } = useComponent(opened && componentId != null ? componentId : NaN)
  const sessionId = event?.service_session_id ?? null
  const { data: session } = useServiceSession(opened && sessionId != null ? sessionId : NaN)
  const sessionBikeName = bikes?.find((bike) => bike.id === session?.bike_id)?.name

  // Logging (not editing), as each component's requirements load: the
  // first one starts on its default type unless the opener preselected
  // one; switching to another keeps the type only if it still fits
  // (serviceTypeAfterComponentChange). Date and notes always stay.
  const typedFor = useRef<number | null>(null)
  useEffect(() => {
    if (isEdit || !component || typedFor.current === component.id) return
    const first = typedFor.current == null
    typedFor.current = component.id
    const current = form.values.service_type_id
    const defaultId = defaultServiceTypeId(component, first ? preselectedServiceTypeId : undefined)
    const next = first
      ? current || (defaultId ? String(defaultId) : '')
      : serviceTypeAfterComponentChange(current, {
          pills: servicePills(component),
          category: component.category,
          serviceTypes: serviceTypes ?? [],
          defaultId,
        })
    if (next !== current) form.setFieldValue('service_type_id', next)
  }, [component, isEdit, preselectedServiceTypeId, form, serviceTypes])

  const createEvent = useCreateMaintenanceEvent()
  const updateEvent = useUpdateMaintenanceEvent(event?.id ?? -1)
  const mutation = isEdit ? updateEvent : createEvent
  const deleteEvent = useDeleteMaintenanceEvent()

  const category = component?.category ?? components?.find((c) => c.id === componentId)?.category ?? null
  const pills = component ? servicePills(component) : []

  async function handleSubmit(values: MaintenanceEventFormValues) {
    setBaseErrors([])

    if (values.service_type_id === CREATE_NEW_SERVICE_TYPE && !values.service_type_new_name.trim()) {
      form.setFieldError('service_type_new_name', 'Name is required')
      return
    }

    let resolvedServiceTypeId: number
    try {
      resolvedServiceTypeId = await resolveServiceTypeId(values.service_type_id, values.service_type_new_name, category)
    } catch (error) {
      setBaseErrors(applyApiErrors(form, error))
      return
    }

    mutation.mutate(toPayload(values, resolvedServiceTypeId), {
      onSuccess: () => onClose(),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

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

  const selectedTypeName =
    form.values.service_type_id === CREATE_NEW_SERVICE_TYPE
      ? form.values.service_type_new_name.trim() || null
      : (pills.find((pill) => String(pill.serviceTypeId) === form.values.service_type_id)?.name ??
        serviceTypes?.find((type) => String(type.id) === form.values.service_type_id)?.name ??
        null)
  const primary = primaryAction({ isEdit, hasComponent: componentId != null, serviceTypeName: selectedTypeName })

  const noComponent = componentId == null

  return (
    <AppModal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={<LogServiceTitle isEdit={isEdit} component={component} onNavigate={onClose} onLogSession={onLogSession} />}
      footer={
        opened && (
          <Group justify={isEdit ? 'space-between' : 'flex-end'}>
            {isEdit && (
              <Button variant="outline" color="red" onClick={handleDelete} loading={deleteEvent.isPending}>
                Delete
              </Button>
            )}
            <Group gap="sm">
              <Button variant="default" onClick={onClose}>
                Cancel
              </Button>
              <Tooltip label={primary.disabledReason} disabled={!primary.disabledReason}>
                <span>
                  <Button
                    type="submit"
                    form={formId}
                    disabled={primary.disabledReason != null}
                    loading={mutation.isPending || isCreatingServiceType}
                  >
                    {primary.label}
                  </Button>
                </span>
              </Tooltip>
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

            {!isEdit && defaultComponentId == null && (
              <ComponentPicker
                value={componentId}
                onChange={(id) => form.setFieldValue('component_id', String(id))}
                error={typeof form.errors.component_id === 'string' ? form.errors.component_id : undefined}
              />
            )}

            <ServicePills
              pills={pills}
              value={form.values.service_type_id}
              onChange={(value) => form.setFieldValue('service_type_id', value)}
              category={category}
              newTypeName={form.values.service_type_new_name}
              onNewTypeNameChange={(value) => form.setFieldValue('service_type_new_name', value)}
              error={typeof form.errors.service_type_id === 'string' ? form.errors.service_type_id : undefined}
              newTypeNameError={typeof form.errors.service_type_new_name === 'string' ? form.errors.service_type_new_name : undefined}
              disabled={noComponent}
            />

            <DoneOnField
              value={form.values.performed_at}
              onChange={(value) => form.setFieldValue('performed_at', value)}
              componentId={componentId}
              error={typeof form.errors.performed_at === 'string' ? form.errors.performed_at : undefined}
              disabled={noComponent}
              locked={
                sessionId != null
                  ? { text: sessionLockText(session, sessionBikeName), onOpenSession: () => setSessionOpened(true) }
                  : undefined
              }
            />

            <ServiceNotesField
              value={form.values.notes}
              onChange={(value) => form.setFieldValue('notes', value)}
              disabled={noComponent}
            />

            {component && (
              <ResetsPanel
                componentId={component.id}
                requirements={component.service_requirements}
                serviceTypeId={
                  form.values.service_type_id && form.values.service_type_id !== CREATE_NEW_SERVICE_TYPE
                    ? Number(form.values.service_type_id)
                    : null
                }
                isEdit={isEdit}
                distanceAtServiceMeters={
                  component.maintenance_events.find((logged) => logged.id === event?.id)?.component_distance_at_event_meters ?? 0
                }
                onNavigate={onClose}
              />
            )}
          </Stack>
        </form>
      )}
      {sessionId != null && sessionOpened && (
        <ServiceSessionViewModal opened onClose={() => setSessionOpened(false)} sessionId={sessionId} />
      )}
    </AppModal>
  )
}
