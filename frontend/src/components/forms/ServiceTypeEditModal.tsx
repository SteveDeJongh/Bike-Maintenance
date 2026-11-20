import { useState } from 'react'
import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconLock } from '@tabler/icons-react'
import AppModal from '../AppModal'
import CategoryTagInput from '../CategoryTagInput'
import { confirmDelete } from '../confirmDelete'
import { useServiceTypes } from '../../api/queries'
import { useCreateServiceType, useDeleteServiceType, useUpdateServiceType } from '../../api/mutations'
import { formatApiError, parseApiError } from '../../api/errors'
import { useAllCategories } from '../../hooks/useAllCategories'
import { appliesToSummary } from '../../utils/categoryTagInput'
import type { ServiceType } from '../../types/models'

interface ServiceTypeEditModalProps {
  opened: boolean
  onClose: () => void
  // Omitted = create mode ("Add type"), which starts universal.
  serviceType?: ServiceType
}

// Name + "Applies to" category tags for one service type, plus its usage
// and (only while unused) delete. Mounted only while open, so each opening
// starts from the type's current values.
export default function ServiceTypeEditModal({ opened, onClose, serviceType }: ServiceTypeEditModalProps) {
  if (!opened) return null
  return <ServiceTypeEditForm key={serviceType?.id ?? 'new'} onClose={onClose} serviceType={serviceType} />
}

function usageText(serviceType: ServiceType | undefined): string {
  if (!serviceType || (serviceType.requirement_count === 0 && serviceType.event_count === 0)) return 'Not used yet.'
  const intervals = `${serviceType.requirement_count} service ${serviceType.requirement_count === 1 ? 'interval' : 'intervals'}`
  const events = `${serviceType.event_count} logged ${serviceType.event_count === 1 ? 'event' : 'events'}`
  return `Used by ${intervals} and ${events}.`
}

function ServiceTypeEditForm({ onClose, serviceType }: { onClose: () => void; serviceType?: ServiceType }) {
  const isEdit = Boolean(serviceType)
  const { data: serviceTypes } = useServiceTypes()
  const allCategories = useAllCategories()
  const createServiceType = useCreateServiceType()
  const updateServiceType = useUpdateServiceType(serviceType?.id ?? -1)
  const deleteServiceType = useDeleteServiceType()
  const mutation = isEdit ? updateServiceType : createServiceType

  const [name, setName] = useState(serviceType?.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [categories, setCategories] = useState<string[]>(serviceType?.categories ?? [])

  const trimmed = name.trim()
  const duplicate = (serviceTypes ?? []).some(
    (type) => type.id !== serviceType?.id && type.name.toLowerCase() === trimmed.toLowerCase(),
  )
  const nameProblem = trimmed === '' ? 'Enter a name' : duplicate ? "That name's already taken. Try another." : null
  const serverNameError = mutation.isError ? parseApiError(mutation.error).fieldErrors.name?.join(', ') : undefined
  const nameError = (nameTouched || duplicate ? nameProblem : null) ?? serverNameError

  const inUse = Boolean(serviceType && (serviceType.requirement_count > 0 || serviceType.event_count > 0))

  function handleSave() {
    setNameTouched(true)
    if (nameProblem) return
    mutation.mutate({ name: trimmed, categories }, { onSuccess: () => onClose() })
  }

  function handleDelete() {
    if (!serviceType) return
    confirmDelete({
      title: 'Delete service type',
      message: `Delete "${serviceType.name}"? This cannot be undone.`,
      onConfirm: () => deleteServiceType.mutate(serviceType.id, { onSuccess: () => onClose() }),
    })
  }

  const baseError = mutation.isError ? parseApiError(mutation.error).baseErrors.join(', ') : ''

  return (
    <AppModal
      opened
      onClose={onClose}
      title={isEdit ? 'Edit service type' : 'Add service type'}
      footer={
        <Group justify="space-between" wrap="nowrap">
          <div>
            {isEdit &&
              (inUse ? (
                <Group gap={4} wrap="nowrap">
                  <IconLock size={14} color="var(--mantine-color-dimmed)" />
                  <Text size="sm" c="dimmed">
                    In use, can't delete
                  </Text>
                </Group>
              ) : (
                <Button variant="subtle" color="red" onClick={handleDelete} loading={deleteServiceType.isPending}>
                  Delete
                </Button>
              ))}
          </div>
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={nameProblem !== null} loading={mutation.isPending}>
              Save
            </Button>
          </Group>
        </Group>
      }
    >
      <Stack>
        <TextInput
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={() => setNameTouched(true)}
          error={nameError}
          data-autofocus
        />

        <Stack gap={4}>
          <CategoryTagInput value={categories} onChange={setCategories} categories={allCategories} />
          <Text size="xs" c="dimmed">
            {appliesToSummary(categories)}
          </Text>
        </Stack>

        <Alert color="gray" variant="light">
          {usageText(serviceType)}
        </Alert>

        {baseError && <Alert color="red">{baseError}</Alert>}
        {deleteServiceType.isError && <Alert color="red">{formatApiError(deleteServiceType.error)}</Alert>}
      </Stack>
    </AppModal>
  )
}
