import { useMemo, useState } from 'react'
import { Alert, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { useComponents, useMaintenanceEvents } from '../api/queries'
import { useDeleteMaintenanceEvent } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import MaintenanceEventFormModal from '../components/forms/MaintenanceEventFormModal'
import type { MaintenanceEvent } from '../types/models'

const RECENT_LIMIT = 10

export default function MaintenanceEvents() {
  const { data, isPending, isError, error } = useMaintenanceEvents()
  const { data: components } = useComponents()
  const deleteEvent = useDeleteMaintenanceEvent()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<MaintenanceEvent | null>(null)

  const componentLabels = useMemo(() => {
    const map = new Map<number, string>()
    for (const component of components ?? []) {
      map.set(component.id, component.label)
    }
    return map
  }, [components])

  // No dedicated "recent events" endpoint or sort/limit param exists on
  // GET /maintenance_events; sorting/limiting is done here client-side. If
  // more views need this, consider adding a sort/limit param or a
  // /maintenance_events/recent endpoint — flag to the project plan doc
  // rather than letting this workaround grow.
  const recentEvents = useMemo(() => {
    if (!data) return []
    return [...data]
      .sort((a, b) => b.performed_on.localeCompare(a.performed_on))
      .slice(0, RECENT_LIMIT)
  }, [data])

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(event: MaintenanceEvent) {
    setEditing(event)
    setModalOpened(true)
  }

  function handleDelete(event: MaintenanceEvent) {
    confirmDelete({
      title: 'Delete maintenance event',
      message: 'Delete this maintenance event? This cannot be undone.',
      onConfirm: () => deleteEvent.mutate(event.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Maintenance Events</Title>
        <Button onClick={openCreate}>+ New Maintenance Event</Button>
      </Group>

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load maintenance events">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && (
        <Text c="dimmed">No maintenance events yet.</Text>
      )}

      {data && data.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Performed On</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Component</Table.Th>
              <Table.Th>Notes</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {recentEvents.map((event) => (
              <Table.Tr key={event.id}>
                <Table.Td>{event.performed_on}</Table.Td>
                <Table.Td>{event.event_type}</Table.Td>
                <Table.Td>
                  {componentLabels.get(event.component_id) ?? `Component #${event.component_id}`}
                </Table.Td>
                <Table.Td>{event.notes ?? ''}</Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button size="xs" variant="subtle" onClick={() => openEdit(event)}>
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleDelete(event)}
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

      <MaintenanceEventFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        event={editing ?? undefined}
      />
    </>
  )
}
