import { useState, type ReactNode } from 'react'
import { ActionIcon, Alert, Anchor, Badge, Button, Card, Group, Menu, Select, Stack, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { IconDots } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { useComponentCategorySettings } from '../../api/queries'
import { useCreateComponentAssignment, useDeleteBikeComponentSlot } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import ComponentFormModal from '../forms/ComponentFormModal'
import SwapComponentModal from '../forms/SwapComponentModal'
import RideContextCheckboxes from '../RideContextCheckboxes'
import { categoryLabel, RIDE_CONTEXT_LABELS, type InstalledComponentColumn } from '../../constants'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import type { BikeComponentSlot, BikeDetail as BikeDetailData, Component, ComponentAssignmentWithStats } from '../../types/models'

const CREATE_NEW_COMPONENT = '__create_new__'

// One row of the Installed-components table, same shape BikeDetail.tsx's
// own InstalledComponentRowEntry uses -- redefined here rather than
// imported since that interface is local to BikeDetail.tsx and this file
// is deliberately independent of it (see the module comment below).
interface InstalledComponentRowEntry {
  slot: BikeComponentSlot
  assignment?: ComponentAssignmentWithStats
}

// The card-view counterpart of BikeDetail.tsx's InstalledComponentsTableInner
// -- pulled into its own file (per this feature's instructions) rather than
// grown inline in that already-1,000+-line page. Deliberately NOT built on
// the shared DataCardList: a row here is one of two entirely different UI
// shapes (a real assignment vs. an empty slot's own inline install form,
// see BikeDetail.tsx's own SlotRow/EmptySlotRow split), and the filled case
// has a row-level click-to-open-modal behavior DataCardList has no concept
// of -- both are a poor fit for a single generic column-renderer component.
export default function InstalledComponentsCardList({
  bike,
  rows,
  components,
  activeAssignmentsElsewhereByComponentId,
  onEndAssignment,
  onRowClick,
  orderedColumns,
  columnLabels,
  columnRenderer,
}: {
  bike: BikeDetailData
  rows: InstalledComponentRowEntry[]
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  orderedColumns: InstalledComponentColumn[]
  columnLabels: Record<InstalledComponentColumn, string>
  columnRenderer: Record<InstalledComponentColumn, (a: ComponentAssignmentWithStats) => ReactNode>
}) {
  return (
    <Stack gap="xs">
      {rows.map(({ slot, assignment }) =>
        assignment ? (
          <FilledSlotCard
            key={`assignment-${assignment.id}`}
            slot={slot}
            assignment={assignment}
            onEndAssignment={onEndAssignment}
            onRowClick={onRowClick}
            orderedColumns={orderedColumns}
            columnLabels={columnLabels}
            columnRenderer={columnRenderer}
          />
        ) : (
          <EmptySlotCard
            key={`slot-${slot.id}`}
            bike={bike}
            slot={slot}
            hasHistory={bike.component_assignments.some((a) => a.component.category === slot.category)}
            components={components}
            activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
          />
        ),
      )}
    </Stack>
  )
}

function FilledSlotCard({
  slot,
  assignment,
  onEndAssignment,
  onRowClick,
  orderedColumns,
  columnLabels,
  columnRenderer,
}: {
  slot: BikeComponentSlot
  assignment: ComponentAssignmentWithStats
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  orderedColumns: InstalledComponentColumn[]
  columnLabels: Record<InstalledComponentColumn, string>
  columnRenderer: Record<InstalledComponentColumn, (a: ComponentAssignmentWithStats) => ReactNode>
}) {
  const [swapOpened, setSwapOpened] = useState(false)

  return (
    <Card withBorder padding="sm" onClick={() => onRowClick(assignment)} style={{ cursor: 'pointer' }}>
      <Group justify="space-between" wrap="wrap" align="flex-start" gap="xs">
        <div>
          <Text size="xs" c="dimmed">
            {categoryLabel(slot.category)}
          </Text>
          <Anchor
            component={Link}
            to={`/components/${assignment.component_id}`}
            fw={500}
            onClick={(event) => event.stopPropagation()}
          >
            {assignment.component.label}
          </Anchor>
        </div>
        <Group gap="xs" wrap="wrap" align="center">
          {assignment.ride_context !== 'both' && (
            <Badge size="sm" color={assignment.ride_context === 'indoor_only' ? 'grape' : 'blue'}>
              {RIDE_CONTEXT_LABELS[assignment.ride_context]}
            </Badge>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Row actions"
                size={44}
                onClick={(event) => event.stopPropagation()}
              >
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                onClick={(event) => {
                  event.stopPropagation()
                  setSwapOpened(true)
                }}
              >
                Swap…
              </Menu.Item>
              <Menu.Item color="red" onClick={() => onEndAssignment(assignment)}>
                Remove
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <SwapComponentModal
        opened={swapOpened}
        onClose={() => setSwapOpened(false)}
        assignmentId={assignment.id}
        category={assignment.component.category}
        currentComponentId={assignment.component_id}
      />
      <Group gap="md" wrap="wrap" mt={6}>
        {orderedColumns.map((column) => (
          <Stack key={column} gap={0} miw={90}>
            <Text size="xs" c="dimmed">
              {columnLabels[column]}
            </Text>
            <Text size="sm">{columnRenderer[column](assignment)}</Text>
          </Stack>
        ))}
      </Group>
    </Card>
  )
}

// Reproduces EmptySlotRow's own install-flow state/logic (BikeDetail.tsx)
// independently rather than sharing it -- see this file's own module
// comment for why. Behavior intentionally matches EmptySlotRow exactly,
// just as a Card's vertical Stack instead of a <Table.Tr> that relies on
// the surrounding table's columns for horizontal room.
function EmptySlotCard({
  bike,
  slot,
  hasHistory,
  components,
  activeAssignmentsElsewhereByComponentId,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  hasHistory: boolean
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
}) {
  const [componentId, setComponentId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(hasHistory ? nowIsoUtc() : bike.created_at)
  const { data: categorySettings } = useComponentCategorySettings()
  const defaultRideContext =
    categorySettings?.find((setting) => setting.category === slot.category)?.default_ride_context ?? 'both'
  const [rideContext, setRideContext] = useState<'both' | 'outdoor_only' | 'indoor_only'>(defaultRideContext)

  const [createOpened, setCreateOpened] = useState(false)
  const [baseErrors, setBaseErrors] = useState<string[]>([])
  const createAssignment = useCreateComponentAssignment()
  const deleteSlot = useDeleteBikeComponentSlot()

  const categoryAllowsMultiple =
    categorySettings?.find((setting) => setting.category === slot.category)?.allows_multiple_assignments ?? false

  const availableComponents = components
    .filter((component) => component.category === slot.category)
    .filter((component) => {
      const elsewhere = activeAssignmentsElsewhereByComponentId.get(component.id) ?? []
      if (elsewhere.length === 0) return true

      return (
        slot.ride_context === 'indoor_only' &&
        categoryAllowsMultiple &&
        elsewhere.every((context) => context === 'indoor_only')
      )
    })

  function assign(targetComponentId: number) {
    setBaseErrors([])
    createAssignment.mutate(
      {
        component_id: targetComponentId,
        bike_id: bike.id,
        started_at: startedAt ?? nowIsoUtc(),
        ended_at: null,
        ride_context: slot.ride_context === 'both' ? rideContext : slot.ride_context,
      },
      { onError: (error) => setBaseErrors(parseApiError(error).baseErrors) },
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
      label:
        (activeAssignmentsElsewhereByComponentId.get(component.id)?.length ?? 0) > 0
          ? `${component.label} — shared, indoor only`
          : component.label,
    })),
    { value: CREATE_NEW_COMPONENT, label: `+ Create new ${categoryLabel(slot.category)}` },
  ]

  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Text size="xs" c="dimmed">
            {categoryLabel(slot.category)}
          </Text>
          {slot.ride_context !== 'both' && (
            <Badge size="sm" color={slot.ride_context === 'indoor_only' ? 'grape' : 'blue'}>
              {RIDE_CONTEXT_LABELS[slot.ride_context]}
            </Badge>
          )}
        </div>
        <Button
          size="xs"
          variant="subtle"
          loading={deleteSlot.isPending}
          onClick={() => {
            setBaseErrors([])
            deleteSlot.mutate(slot.id, { onError: (error) => setBaseErrors(parseApiError(error).baseErrors) })
          }}
          style={MOBILE_TAP_TARGET_STYLE}
        >
          Stop tracking
        </Button>
      </Group>

      <Stack gap="xs" mt="xs">
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
        {slot.ride_context === 'both' ? (
          <RideContextCheckboxes value={rideContext} onChange={setRideContext} />
        ) : (
          <Text size="sm" c="dimmed">
            {RIDE_CONTEXT_LABELS[slot.ride_context]}
          </Text>
        )}
        <Button
          size="sm"
          disabled={!componentId}
          loading={createAssignment.isPending}
          onClick={() => componentId && assign(Number(componentId))}
          style={MOBILE_TAP_TARGET_STYLE}
        >
          Install
        </Button>
      </Stack>

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
    </Card>
  )
}
