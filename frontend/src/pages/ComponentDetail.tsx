import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { ApiError } from '../api/client'
import { useComponent, useMaintenanceEvents } from '../api/queries'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import MaintenanceEventFormModal from '../components/forms/MaintenanceEventFormModal'

export default function ComponentDetail() {
  const { id } = useParams<{ id: string }>()
  const componentId = Number(id)

  const { data: component, isPending, error } = useComponent(componentId)
  const { data: events } = useMaintenanceEvents()

  const [editOpened, setEditOpened] = useState(false)
  const [logOpened, setLogOpened] = useState(false)

  const history = useMemo(() => {
    return (events ?? [])
      .filter((event) => event.component_id === componentId)
      .sort((a, b) => b.performed_on.localeCompare(a.performed_on))
  }, [events, componentId])

  if (!Number.isFinite(componentId) || (error instanceof ApiError && error.status === 404)) {
    return (
      <Stack>
        <Text>Component not found.</Text>
        <Anchor component={Link} to="/components">
          Back to components
        </Anchor>
      </Stack>
    )
  }

  if (isPending) return <Loader />

  if (error) {
    return (
      <Alert color="red" title="Failed to load component">
        {error.message}
      </Alert>
    )
  }

  if (!component) return null

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Group gap="sm">
            <Title order={2}>{component.label}</Title>
            {component.retired_on && <Badge color="gray">Retired</Badge>}
          </Group>
          <Text c="dimmed">
            {component.category} · Acquired {component.acquired_on}
          </Text>
        </div>
        <Button variant="default" onClick={() => setEditOpened(true)}>
          Edit
        </Button>
      </Group>

      <Group gap="xl">
        <div>
          <Text size="sm" c="dimmed">
            Total distance
          </Text>
          <Text fw={500}>{component.total_distance} m</Text>
        </div>
        {component.category === 'chain' && (
          <div>
            <Text size="sm" c="dimmed">
              Distance since last wax
            </Text>
            <Text fw={500}>{component.distance_since_wax} m</Text>
          </div>
        )}
      </Group>

      <Group justify="space-between">
        <Title order={3}>Maintenance history</Title>
        <Button onClick={() => setLogOpened(true)}>+ Log maintenance event</Button>
      </Group>

      {history.length === 0 && <Text c="dimmed">No maintenance events logged yet.</Text>}

      {history.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Performed On</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {history.map((event) => (
              <Table.Tr key={event.id}>
                <Table.Td>{event.performed_on}</Table.Td>
                <Table.Td>{event.event_type}</Table.Td>
                <Table.Td>{event.notes ?? ''}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <ComponentFormModal
        opened={editOpened}
        onClose={() => setEditOpened(false)}
        component={component}
      />

      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={componentId}
      />
    </Stack>
  )
}
