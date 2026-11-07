import { Group, Table, Text } from '@mantine/core'
import { useColumnDragHandle } from './useColumnDragHandle'

interface DraggableHeaderCellProps {
  columnKey: string
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onSort: () => void
  // false for a table whose configurable columns are drag-to-reorder only,
  // never click-to-sort (e.g. bike_rides, where the only sortable thing is
  // a fixed date order driven by a separate toggle, not any column). Default
  // true preserves every existing adopter's click-to-sort label.
  sortable?: boolean
}

// Like SortableHeaderCell, but for configurable (non-pinned) columns: a drag
// handle sits next to the sortable label, kept as a separate click target so
// dragging to reorder and clicking to sort never contend over the same
// gesture on the same element.
export default function DraggableHeaderCell({
  columnKey,
  label,
  active,
  direction,
  onSort,
  sortable = true,
}: DraggableHeaderCellProps) {
  const { setNodeRef, containerStyle, handleProps } = useColumnDragHandle(columnKey)

  return (
    <Table.Th ref={setNodeRef} style={containerStyle}>
      <Group gap={4} wrap="nowrap">
        <Text span {...handleProps}>
          {'⠿'}
        </Text>
        {sortable ? (
          <Text span onClick={onSort} style={{ cursor: 'pointer', userSelect: 'none' }}>
            {label}
            {active ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
          </Text>
        ) : (
          <Text span>{label}</Text>
        )}
      </Group>
    </Table.Th>
  )
}
