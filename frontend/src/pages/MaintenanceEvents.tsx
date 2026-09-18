import { useMemo } from 'react'
import { Alert, Loader, Table, Text, Title } from '@mantine/core'
import { useMaintenanceEvents } from '../api/queries'

const RECENT_LIMIT = 10

export default function MaintenanceEvents() {
  const { data, isPending, isError, error } = useMaintenanceEvents()

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

  return (
    <>
      <Title order={2} mb="md">
        Maintenance Events
      </Title>

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
              {/* component_id has no expansion from the API (no serializer) —
                  showing the raw id for now; a detail/expansion view is
                  future work. */}
              <Table.Th>Component</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {recentEvents.map((event) => (
              <Table.Tr key={event.id}>
                <Table.Td>{event.performed_on}</Table.Td>
                <Table.Td>{event.event_type}</Table.Td>
                <Table.Td>Component #{event.component_id}</Table.Td>
                <Table.Td>{event.notes ?? ''}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  )
}
