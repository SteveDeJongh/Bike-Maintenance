import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { ApiError } from '../api/client'
import { parseApiError } from '../api/errors'
import { useBike, useComponentAssignments, useComponents } from '../api/queries'
import {
  useCreateBikeComponentSlot,
  useCreateComponentAssignment,
  useDeleteBikeComponentSlot,
} from '../api/mutations'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import EndAssignmentModal from '../components/forms/EndAssignmentModal'
import { COMPONENT_CATEGORIES, categoryLabel } from '../constants'
import {
  formatDate,
  formatDateTime,
  isoUtcToDate,
  mantineLocalStringToIsoUtc,
  nowIsoUtc,
} from '../utils/datetime'
import { formatDistance } from '../utils/distance'
import { formatDuration } from '../utils/duration'
import type {
  BikeComponentSlot,
  BikeDetail as BikeDetailData,
  Component,
  ComponentAssignment,
} from '../types/models'

const CREATE_NEW_COMPONENT = '__create_new__'

export default function BikeDetail() {
  const { id } = useParams<{ id: string }>()
  const bikeId = Number(id)

  const { data: bike, isPending: bikePending, error: bikeError } = useBike(bikeId)
  const { data: assignments, isPending: assignmentsPending } = useComponentAssignments()
  const { data: components } = useComponents()

  const [endingAssignment, setEndingAssignment] = useState<ComponentAssignment | null>(null)
  const [addCategory, setAddCategory] = useState<string | null>(null)
  const createSlot = useCreateBikeComponentSlot()

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

  function rawCategory(componentId: number): string | undefined {
    return components?.find((c) => c.id === componentId)?.category
  }

  function componentCategory(componentId: number) {
    const category = rawCategory(componentId)
    return category ? categoryLabel(category) : ''
  }

  const bikeAssignments = (assignments ?? []).filter((a) => a.bike_id === bikeId)
  const historyAssignments = bikeAssignments
    .filter((a) => a.ended_at !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
  const activeComponentIdsEverywhere = (assignments ?? [])
    .filter((a) => a.ended_at === null)
    .map((a) => a.component_id)

  const orderedSlots = COMPONENT_CATEGORIES.map((category) =>
    bike.bike_component_slots.find((slot) => slot.category === category),
  ).filter((slot): slot is BikeComponentSlot => slot !== undefined)

  const untrackedCategories = COMPONENT_CATEGORIES.filter(
    (category) => !bike.bike_component_slots.some((slot) => slot.category === category),
  )

  const confirmedBikeId = bike.id

  function handleAddCategory(value: string | null) {
    setAddCategory(value)
    if (value) {
      createSlot.mutate(
        { bike_id: confirmedBikeId, category: value },
        { onSuccess: () => setAddCategory(null) },
      )
    }
  }

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

      <Group gap="xl">
        <div>
          <Text size="sm" c="dimmed">
            Total distance
          </Text>
          <Text fw={500}>{formatDistance(bike.total_distance)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Total time
          </Text>
          <Text fw={500}>{formatDuration(bike.total_moving_time)}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            First ride
          </Text>
          <Text fw={500}>{bike.first_ride_on ? formatDate(bike.first_ride_on) : 'No rides yet'}</Text>
        </div>
      </Group>

      <Title order={3}>Installed components</Title>

      {orderedSlots.length === 0 && <Text c="dimmed">No component types tracked yet.</Text>}

      {orderedSlots.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Component</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {orderedSlots.map((slot) => {
              const categoryAssignments = bikeAssignments.filter(
                (a) => rawCategory(a.component_id) === slot.category,
              )
              const endedCount = categoryAssignments.filter((a) => a.ended_at !== null).length

              return (
                <SlotRow
                  key={slot.id}
                  bike={bike}
                  slot={slot}
                  assignment={categoryAssignments.find((a) => a.ended_at === null)}
                  hasHistory={categoryAssignments.length > 0}
                  endedCount={endedCount}
                  components={components ?? []}
                  activeComponentIdsEverywhere={activeComponentIdsEverywhere}
                  componentLabel={componentLabel}
                  onEndAssignment={setEndingAssignment}
                />
              )
            })}
          </Table.Tbody>
        </Table>
      )}

      {untrackedCategories.length > 0 && (
        <Select
          placeholder="+ Track a new component type"
          data={untrackedCategories.map((category) => ({
            value: category,
            label: categoryLabel(category),
          }))}
          value={addCategory}
          onChange={handleAddCategory}
          disabled={createSlot.isPending}
        />
      )}

      <Title order={3}>History</Title>

      {historyAssignments.length === 0 && <Text c="dimmed">No past assignments.</Text>}

      {historyAssignments.length > 0 && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Category</Table.Th>
              <Table.Th>Component</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Ended</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {historyAssignments.map((assignment) => (
              <Table.Tr key={assignment.id}>
                <Table.Td>{componentCategory(assignment.component_id)}</Table.Td>
                <Table.Td>{componentLabel(assignment.component_id)}</Table.Td>
                <Table.Td>{formatDateTime(assignment.started_at)}</Table.Td>
                <Table.Td>{formatDateTime(assignment.ended_at)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <EndAssignmentModal
        opened={endingAssignment !== null}
        onClose={() => setEndingAssignment(null)}
        assignment={endingAssignment}
        componentLabel={endingAssignment ? componentLabel(endingAssignment.component_id) : ''}
      />
    </Stack>
  )
}

function SlotRow({
  bike,
  slot,
  assignment,
  hasHistory,
  endedCount,
  components,
  activeComponentIdsEverywhere,
  componentLabel,
  onEndAssignment,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  assignment: ComponentAssignment | undefined
  hasHistory: boolean
  endedCount: number
  components: Component[]
  activeComponentIdsEverywhere: number[]
  componentLabel: (componentId: number) => string
  onEndAssignment: (assignment: ComponentAssignment) => void
}) {
  if (assignment) {
    return (
      <Table.Tr>
        <Table.Td>{categoryLabel(slot.category)}</Table.Td>
        <Table.Td>
          <Anchor component={Link} to={`/components/${assignment.component_id}`}>
            {componentLabel(assignment.component_id)}
          </Anchor>
          <Text size="sm" c="dimmed">
            Since {formatDateTime(assignment.started_at)}
          </Text>
        </Table.Td>
        <Table.Td>
          <Group justify="flex-end">
            <Button size="xs" variant="subtle" color="red" onClick={() => onEndAssignment(assignment)}>
              Remove
            </Button>
          </Group>
        </Table.Td>
      </Table.Tr>
    )
  }

  // Keyed on endedCount so this remounts (and recomputes its default start
  // date) the moment a prior assignment in this slot ends — otherwise the
  // row would keep whatever "now" it first mounted with, which can end up
  // earlier than the just-ended assignment's end date and get rejected by
  // the backend's overlap validation with no visible error.
  return (
    <EmptySlotRow
      key={endedCount}
      bike={bike}
      slot={slot}
      hasHistory={hasHistory}
      components={components}
      activeComponentIdsEverywhere={activeComponentIdsEverywhere}
    />
  )
}

function EmptySlotRow({
  bike,
  slot,
  hasHistory,
  components,
  activeComponentIdsEverywhere,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  hasHistory: boolean
  components: Component[]
  activeComponentIdsEverywhere: number[]
}) {
  const [componentId, setComponentId] = useState<string | null>(null)
  // A slot being assigned for the first time defaults to the bike's own
  // created_at (it was presumably already mounted when the bike was added
  // to the tracker); a slot with prior history defaults to now.
  const [startedAt, setStartedAt] = useState<string | null>(
    hasHistory ? nowIsoUtc() : bike.created_at,
  )
  const [createOpened, setCreateOpened] = useState(false)
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const createAssignment = useCreateComponentAssignment()
  const deleteSlot = useDeleteBikeComponentSlot()

  const availableComponents = components.filter(
    (component) =>
      component.category === slot.category && !activeComponentIdsEverywhere.includes(component.id),
  )

  function assign(targetComponentId: number) {
    setBaseErrors([])
    createAssignment.mutate(
      {
        component_id: targetComponentId,
        bike_id: bike.id,
        started_at: startedAt ?? nowIsoUtc(),
        ended_at: null,
      },
      {
        onError: (error) => setBaseErrors(parseApiError(error).baseErrors),
      },
    )
  }

  function handleChange(value: string | null) {
    if (value === CREATE_NEW_COMPONENT) {
      setCreateOpened(true)
      return
    }
    setComponentId(value)
  }

  const options = [
    ...availableComponents.map((component) => ({
      value: String(component.id),
      label: component.label,
    })),
    { value: CREATE_NEW_COMPONENT, label: `+ Create new ${categoryLabel(slot.category)}` },
  ]

  return (
    <Table.Tr>
      <Table.Td>{categoryLabel(slot.category)}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Select
            data={options}
            value={componentId}
            onChange={handleChange}
            placeholder="Pick a component"
            disabled={createAssignment.isPending}
          />
          <DateTimePicker
            label="Started"
            size="sm"
            value={isoUtcToDate(startedAt)}
            onChange={(value) => setStartedAt(mantineLocalStringToIsoUtc(value))}
          />
          <Button
            size="sm"
            disabled={!componentId}
            loading={createAssignment.isPending}
            onClick={() => componentId && assign(Number(componentId))}
          >
            Install
          </Button>
        </Group>

        {baseErrors.length > 0 && (
          <Alert color="red" mt="xs">
            {baseErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}

        <ComponentFormModal
          opened={createOpened}
          onClose={() => setCreateOpened(false)}
          createDefaults={{ category: slot.category }}
          onCreateSuccess={(component) => setComponentId(String(component.id))}
        />
      </Table.Td>
      <Table.Td>
        <Group justify="flex-end">
          <Button size="xs" variant="subtle" onClick={() => deleteSlot.mutate(slot.id)}>
            Stop tracking
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  )
}
