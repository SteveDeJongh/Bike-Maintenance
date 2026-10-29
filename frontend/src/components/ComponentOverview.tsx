import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Anchor, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { useComponent, useMaintenanceEvents, useServiceTypes } from '../api/queries'
import MaintenanceEventFormModal from './forms/MaintenanceEventFormModal'
import ServiceIntervalsSection from './ServiceIntervalsSection'
import { categoryLabel } from '../constants'
import { formatDateTime } from '../utils/datetime'

// Shared between the standalone ComponentDetail page and the Bike page's
// AssignmentDetailModal -- everything about a component beyond whatever
// context-specific stats/header each caller already shows around it:
// identity (category/component/status) up front, then service intervals
// (with the ability to add/edit/remove/log a service against any of them),
// and the full maintenance history with its own "+ Log maintenance event"
// button. Fetches its own data from just a componentId so either caller
// can drop it in without threading props through.
export default function ComponentOverview({ componentId }: { componentId: number }) {
  const { data: component, isPending, error } = useComponent(componentId)
  const { data: events } = useMaintenanceEvents()
  const { data: serviceTypes } = useServiceTypes()
  const [logOpened, setLogOpened] = useState(false)

  const history = useMemo(() => {
    return (events ?? [])
      .filter((event) => event.component_id === componentId)
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
  }, [events, componentId])

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
      <Group gap="xl">
        <div>
          <Text size="sm" c="dimmed">
            Category
          </Text>
          <Text fw={500}>{categoryLabel(component.category)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Component
          </Text>
          <Anchor component={Link} to={`/components/${component.id}`} fw={500}>
            {component.label}
          </Anchor>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Status
          </Text>
          {component.current_bikes.length === 0 ? (
            <Text fw={500}>Uninstalled</Text>
          ) : (
            <Text fw={500}>
              Installed -{' '}
              {component.current_bikes.map((bike, index) => (
                <span key={bike.id}>
                  {index > 0 && ', '}
                  <Anchor component={Link} to={`/bikes/${bike.id}`}>
                    {bike.name}
                  </Anchor>
                </span>
              ))}
            </Text>
          )}
        </div>
      </Group>

      <ServiceIntervalsSection component={component} />

      <Group justify="space-between">
        <Title order={4}>Maintenance history</Title>
        <Button size="sm" onClick={() => setLogOpened(true)}>
          + Log maintenance event
        </Button>
      </Group>

      {history.length === 0 && <Text c="dimmed">No maintenance events logged yet.</Text>}

      {history.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Performed At</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {history.map((event) => (
              <Table.Tr key={event.id}>
                <Table.Td>{formatDateTime(event.performed_at)}</Table.Td>
                <Table.Td>{serviceTypes?.find((t) => t.id === event.service_type_id)?.name ?? ''}</Table.Td>
                <Table.Td>{event.notes ?? ''}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <MaintenanceEventFormModal
        opened={logOpened}
        onClose={() => setLogOpened(false)}
        defaultComponentId={componentId}
      />
    </Stack>
  )
}
