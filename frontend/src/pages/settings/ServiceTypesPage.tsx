import { useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useServiceTypes } from '../../api/queries'
import { useCreateServiceType, useDeleteServiceType, useUpdateServiceType } from '../../api/mutations'
import { confirmDelete } from '../../components/confirmDelete'
import { parseApiError } from '../../api/errors'
import type { ServiceType } from '../../types/models'

export default function ServiceTypesPage() {
  const { data: serviceTypes, isPending, isError, error } = useServiceTypes()
  const [newName, setNewName] = useState('')
  const createServiceType = useCreateServiceType()

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    createServiceType.mutate({ name }, { onSuccess: () => setNewName('') })
  }

  return (
    <Stack>
      <Title order={3}>Service Types</Title>
      <Text c="dimmed">
        The kinds of maintenance you log and build service intervals around (wax, sealant top-up,
        brake bleed, ...). Renaming is safe everywhere it's used. A type can't be deleted while any
        maintenance event or service interval still references it.
      </Text>

      {isPending && <Loader />}
      {isError && (
        <Alert color="red" title="Failed to load service types">
          {error.message}
        </Alert>
      )}

      {serviceTypes && (
        <Table>
          <Table.Tbody>
            {serviceTypes.map((type) => (
              <ServiceTypeRow key={type.id} serviceType={type} />
            ))}
            <Table.Tr>
              <Table.Td>
                <TextInput
                  placeholder="New service type name"
                  value={newName}
                  onChange={(event) => setNewName(event.currentTarget.value)}
                  disabled={createServiceType.isPending}
                />
              </Table.Td>
              <Table.Td>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!newName.trim() || createServiceType.isPending}
                  onClick={handleCreate}
                >
                  Add
                </Button>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}

      {createServiceType.isError && (
        <Alert color="red">{parseApiError(createServiceType.error).baseErrors.join(', ')}</Alert>
      )}
    </Stack>
  )
}

function ServiceTypeRow({ serviceType }: { serviceType: ServiceType }) {
  const [name, setName] = useState(serviceType.name)
  const updateServiceType = useUpdateServiceType(serviceType.id)
  const deleteServiceType = useDeleteServiceType()

  const dirty = name.trim() !== serviceType.name

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    updateServiceType.mutate({ name: trimmed })
  }

  function handleDelete() {
    confirmDelete({
      title: 'Delete service type',
      message: `Delete "${serviceType.name}"? This cannot be undone.`,
      onConfirm: () => deleteServiceType.mutate(serviceType.id),
    })
  }

  const deleteError = deleteServiceType.isError ? parseApiError(deleteServiceType.error).baseErrors.join(', ') : null

  return (
    <Table.Tr>
      <Table.Td>
        <TextInput value={name} onChange={(event) => setName(event.currentTarget.value)} />
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="default" disabled={!dirty} loading={updateServiceType.isPending} onClick={handleSave}>
            Save
          </Button>
          <Button size="xs" variant="subtle" color="red" loading={deleteServiceType.isPending} onClick={handleDelete}>
            Delete
          </Button>
        </Group>
        {deleteError && (
          <Text c="red" size="xs" mt={4}>
            {deleteError}
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  )
}
