import { useState } from 'react'
import { Alert, Anchor, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useComponents } from '../api/queries'
import { useDeleteComponent } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import type { Component } from '../types/models'

export default function Components() {
  const { data, isPending, isError, error } = useComponents()
  const deleteComponent = useDeleteComponent()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<Component | null>(null)

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(component: Component) {
    setEditing(component)
    setModalOpened(true)
  }

  function handleDelete(component: Component) {
    confirmDelete({
      title: 'Delete component',
      message: `Delete "${component.label}"? This also deletes its assignment and maintenance event history.`,
      onConfirm: () => deleteComponent.mutate(component.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Components</Title>
        <Button onClick={openCreate}>+ New Component</Button>
      </Group>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load components">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No components yet.</Text>}

      {data && data.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Label</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Acquired</Table.Th>
              <Table.Th>Retired</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((component) => (
              <Table.Tr key={component.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/components/${component.id}`}>
                    {component.label}
                  </Anchor>
                </Table.Td>
                <Table.Td>{component.category}</Table.Td>
                <Table.Td>{component.acquired_on}</Table.Td>
                <Table.Td>{component.retired_on ?? 'Active'}</Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="subtle" onClick={() => openEdit(component)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(component)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <ComponentFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        component={editing ?? undefined}
      />
    </>
  )
}
