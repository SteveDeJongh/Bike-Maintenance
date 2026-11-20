import { useState } from 'react'
import { ActionIcon, Alert, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { IconPencil } from '@tabler/icons-react'
import { useServiceTypes } from '../../api/queries'
import ServiceTypeEditModal from '../../components/forms/ServiceTypeEditModal'
import { ServiceTypeTagPills } from '../../components/ServiceTypeTagPills'
import type { ServiceType } from '../../types/models'

// Each type's category tags decide where pickers suggest it first; an
// untagged type is suggested everywhere. Editing (name, tags, delete) goes
// through ServiceTypeEditModal; "Add type" opens the same modal in create
// mode, starting universal.
export default function ServiceTypesPage() {
  const { data: serviceTypes, isPending, isError, error } = useServiceTypes()
  // undefined = closed, null = create mode, a type = editing it.
  const [editing, setEditing] = useState<ServiceType | null | undefined>(undefined)

  const sorted = [...(serviceTypes ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Title order={3}>Service Types</Title>
        <Button variant="default" onClick={() => setEditing(null)}>
          Add type
        </Button>
      </Group>
      <Text c="dimmed">
        The kinds of maintenance you log and build service intervals around (wax, sealant top-up, brake bleed, ...).
        Tag a type with the component categories it's for, and pickers will suggest it there first — every type stays
        available behind "Show all types". A type can't be deleted while anything still uses it.
      </Text>

      {isPending && <Loader />}
      {isError && (
        <Alert color="red" title="Failed to load service types">
          {error.message}
        </Alert>
      )}

      {serviceTypes && (
        <Table.ScrollContainer minWidth={420}>
          <Table>
            <Table.Tbody>
              {sorted.map((type) => (
                <Table.Tr key={type.id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {type.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <ServiceTypeTagPills categories={type.categories} />
                  </Table.Td>
                  <Table.Td w={48}>
                    <ActionIcon variant="subtle" color="gray" aria-label={`Edit ${type.name}`} onClick={() => setEditing(type)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <ServiceTypeEditModal
        opened={editing !== undefined}
        onClose={() => setEditing(undefined)}
        serviceType={editing ?? undefined}
      />
    </Stack>
  )
}
