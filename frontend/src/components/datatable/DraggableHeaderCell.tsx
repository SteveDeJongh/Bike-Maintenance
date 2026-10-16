import { Group, Table, Text } from '@mantine/core'
import { useColumnDragHandle } from './useColumnDragHandle'

interface DraggableHeaderCellProps {
  columnKey: string
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onSort: () => void
}

// Like SortableHeaderCell, but for configurable (non-pinned) columns: a drag
// handle sits next to the sortable label, kept as a separate click target so
// dragging to reorder and clicking to sort never contend over the same
// gesture on the same element.
export default function DraggableHeaderCell({ columnKey, label, active, direction, onSort }: DraggableHeaderCellProps) {
  const { setNodeRef, containerStyle, handleProps } = useColumnDragHandle(columnKey)

  return (
    <Table.Th ref={setNodeRef} style={containerStyle}>
      <Group gap={4} wrap="nowrap">
        <Text span {...handleProps}>
          {'⠿'}
        </Text>
        <Text span onClick={onSort} style={{ cursor: 'pointer', userSelect: 'none' }}>
          {label}
          {active ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
        </Text>
      </Group>
    </Table.Th>
  )
}
