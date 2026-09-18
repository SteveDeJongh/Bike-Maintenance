import { useState } from 'react'
import { Alert, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { useBikes, useComponentAssignments, useComponents } from '../api/queries'
import { useDeleteComponentAssignment } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import ComponentAssignmentFormModal from '../components/forms/ComponentAssignmentFormModal'
import type { ComponentAssignment } from '../types/models'

export default function Assignments() {
  const { data, isPending, isError, error } = useComponentAssignments()
  const { data: components } = useComponents()
  const { data: bikes } = useBikes()
  const deleteAssignment = useDeleteComponentAssignment()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<ComponentAssignment | null>(null)

  function componentLabel(componentId: number) {
    return components?.find((c) => c.id === componentId)?.label ?? `Component #${componentId}`
  }

  function bikeName(bikeId: number) {
    return bikes?.find((b) => b.id === bikeId)?.name ?? `Bike #${bikeId}`
  }

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(assignment: ComponentAssignment) {
    setEditing(assignment)
    setModalOpened(true)
  }

  function handleDelete(assignment: ComponentAssignment) {
    confirmDelete({
      title: 'Delete assignment',
      message: 'Delete this assignment record? This cannot be undone.',
      onConfirm: () => deleteAssignment.mutate(assignment.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Assignments</Title>
        <Button onClick={openCreate}>+ New Assignment</Button>
      </Group>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load assignments">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No assignments yet.</Text>}

      {data && data.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Component</Table.Th>
              <Table.Th>Bike</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Ended</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((assignment) => (
              <Table.Tr key={assignment.id}>
                <Table.Td>{componentLabel(assignment.component_id)}</Table.Td>
                <Table.Td>{bikeName(assignment.bike_id)}</Table.Td>
                <Table.Td>{assignment.started_on}</Table.Td>
                <Table.Td>{assignment.ended_on ?? 'Present'}</Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="subtle" onClick={() => openEdit(assignment)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(assignment)}
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

      <ComponentAssignmentFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        assignment={editing ?? undefined}
      />
    </>
  )
}
