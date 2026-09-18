import { useState } from 'react'
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
import { useBike, useComponentAssignments, useComponents } from '../api/queries'
import ComponentAssignmentFormModal from '../components/forms/ComponentAssignmentFormModal'
import EndAssignmentModal from '../components/forms/EndAssignmentModal'
import type { ComponentAssignment } from '../types/models'

export default function BikeDetail() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending: bikePending, error: bikeError } = useBike(bikeId)
  const { data: assignments, isPending: assignmentsPending } = useComponentAssignments()
  const { data: components } = useComponents()

  const [installOpened, setInstallOpened] = useState(false)
  const [endingAssignment, setEndingAssignment] = useState<ComponentAssignment | null>(null)

  if (!Number.isFinite(bikeId) || (bikeError instanceof ApiError && bikeError.status === 404)) {
    return (
      <Stack>
        <Text>Bike not found.</Text>
        <Anchor component={Link} to="/bikes">
          Back to bikes
        </Anchor>
      </Stack>
    )
  }

  if (bikePending || assignmentsPending) return <Loader />

  if (bikeError) {
    return (
      <Alert color="red" title="Failed to load bike">
        {bikeError.message}
      </Alert>
    )
  }

  if (!bike) return null

  function componentLabel(componentId: number) {
    return components?.find((c) => c.id === componentId)?.label ?? `Component #${componentId}`
  }

  const bikeAssignments = (assignments ?? []).filter((a) => a.bike_id === bikeId)
  const activeAssignments = bikeAssignments.filter((a) => a.ended_on === null)
  const historyAssignments = bikeAssignments
    .filter((a) => a.ended_on !== null)
    .sort((a, b) => b.started_on.localeCompare(a.started_on))
  const activeComponentIdsEverywhere = (assignments ?? [])
    .filter((a) => a.ended_on === null)
    .map((a) => a.component_id)

  return (
    <Stack>
      <div>
        <Group gap="sm">
          <Title order={2}>{bike.name}</Title>
          {bike.retired_on && <Badge color="gray">Retired</Badge>}
        </Group>
        <Text c="dimmed">
          {[bike.make, bike.model].filter(Boolean).join(' ') || 'Unknown make/model'}
        </Text>
      </div>

      <Group justify="space-between">
        <Title order={3}>Installed components</Title>
        <Button onClick={() => setInstallOpened(true)}>Install component</Button>
      </Group>

      {activeAssignments.length === 0 && <Text c="dimmed">No components installed.</Text>}

      {activeAssignments.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Component</Table.Th>
              <Table.Th>Since</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {activeAssignments.map((assignment) => (
              <Table.Tr key={assignment.id}>
                <Table.Td>
                  <Anchor component={Link} to={`/components/${assignment.component_id}`}>
                    {componentLabel(assignment.component_id)}
                  </Anchor>
                </Table.Td>
                <Table.Td>{assignment.started_on}</Table.Td>
                <Table.Td>
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => setEndingAssignment(assignment)}
                    >
                      Remove
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Title order={3}>History</Title>

      {historyAssignments.length === 0 && <Text c="dimmed">No past assignments.</Text>}

      {historyAssignments.length > 0 && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Component</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Ended</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {historyAssignments.map((assignment) => (
              <Table.Tr key={assignment.id}>
                <Table.Td>{componentLabel(assignment.component_id)}</Table.Td>
                <Table.Td>{assignment.started_on}</Table.Td>
                <Table.Td>{assignment.ended_on}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <ComponentAssignmentFormModal
        opened={installOpened}
        onClose={() => setInstallOpened(false)}
        lockBike={bike}
        excludeComponentIds={activeComponentIdsEverywhere}
      />

      <EndAssignmentModal
        opened={endingAssignment !== null}
        onClose={() => setEndingAssignment(null)}
        assignment={endingAssignment}
        componentLabel={endingAssignment ? componentLabel(endingAssignment.component_id) : ''}
      />
    </Stack>
  )
}
