import { Link } from 'react-router-dom'
import { Anchor, Badge, Button, Group, Table } from '@mantine/core'
import EmptySlotRow from './EmptySlotRow'
import { installedComponentRenderer } from './installedComponentColumns'
import { categoryLabel, RIDE_CONTEXT_LABELS, type InstalledComponentColumn } from '../../constants'
import type { BikeComponentSlot, BikeDetail as BikeDetailData, Component, ComponentAssignmentWithStats } from '../../types/models'

export default function SlotRow({
  bike,
  slot,
  assignment,
  hasHistory,
  endedCount,
  components,
  activeAssignmentsElsewhereByComponentId,
  onEndAssignment,
  onRowClick,
  orderedColumns,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  assignment: ComponentAssignmentWithStats | undefined
  hasHistory: boolean
  endedCount: number
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  orderedColumns: InstalledComponentColumn[]
}) {

  if (assignment) {
    return (
      <>
        <Table.Tr onClick={() => onRowClick(assignment)} style={{ cursor: 'pointer' }}>
          <Table.Td>{categoryLabel(slot.category)}</Table.Td>
          <Table.Td>
            {assignment.ride_context === 'both' ? (
              RIDE_CONTEXT_LABELS.both
            ) : (
              <Badge size="sm" color={assignment.ride_context === 'indoor_only' ? 'grape' : 'blue'}>
                {RIDE_CONTEXT_LABELS[assignment.ride_context]}
              </Badge>
            )}
          </Table.Td>
          <Table.Td>
            <Anchor
              component={Link}
              to={`/components/${assignment.component_id}`}
              onClick={(event) => event.stopPropagation()}
            >
              {assignment.component.label}
            </Anchor>
          </Table.Td>
          {orderedColumns.map((column) => (
            <Table.Td key={column}>{installedComponentRenderer[column](assignment)}</Table.Td>
          ))}
          <Table.Td>
            <Group justify="flex-end" gap="xs">
              <Button
                size="xs"
                variant="subtle"
                color="red"
                onClick={(event) => {
                  event.stopPropagation()
                  onEndAssignment(assignment)
                }}
              >
                Remove
              </Button>
            </Group>
          </Table.Td>
          <Table.Td />
        </Table.Tr>
      </>
    )
  }

  // Keyed on endedCount so this remounts (and recomputes its default start
  // date/ride context) the moment a prior assignment in this slot ends —
  // otherwise the row would keep whatever "now" it first mounted with,
  // which can end up earlier than the just-ended assignment's end date and
  // get rejected by the backend's overlap validation with no visible error.
  return (
    <EmptySlotRow
      key={endedCount}
      bike={bike}
      slot={slot}
      hasHistory={hasHistory}
      components={components}
      activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
      columnSpan={1 + orderedColumns.length}
    />
  )
}
