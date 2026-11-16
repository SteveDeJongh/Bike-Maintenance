import type { ReactNode } from 'react'
import { Anchor, Menu, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import DataCardList from '../datatable/DataCardList'
import { categoryLabel, type HistoryColumn } from '../../constants'
import type { ComponentAssignmentWithStats } from '../../types/models'

// The card-view counterpart of BikeDetail.tsx's HistoryTableInner -- pulled
// into its own file (per this feature's instructions) rather than grown
// inline in that already-1,000+-line page. Unlike Installed components,
// every row here is a real, uniform ComponentAssignmentWithStats with a
// single action (Delete), so this fits the shared DataCardList directly.
export default function ComponentHistoryCardList({
  rows,
  orderedColumns,
  columnLabels,
  columnRenderer,
  onDelete,
  onRowClick,
}: {
  rows: ComponentAssignmentWithStats[]
  orderedColumns: HistoryColumn[]
  columnLabels: Record<HistoryColumn, string>
  columnRenderer: Record<HistoryColumn, (a: ComponentAssignmentWithStats) => ReactNode>
  onDelete: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
}) {
  return (
    <DataCardList
      rows={rows}
      getKey={(assignment) => assignment.id}
      onRowClick={onRowClick}
      renderTitle={(assignment) => (
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            {categoryLabel(assignment.component.category)}
          </Text>
          <Anchor
            component={Link}
            to={`/components/${assignment.component_id}`}
            fw={500}
            onClick={(event) => event.stopPropagation()}
          >
            {assignment.component.label}
          </Anchor>
        </Stack>
      )}
      orderedColumns={orderedColumns}
      columnLabels={columnLabels}
      columnRenderer={columnRenderer}
      renderActions={(assignment) => (
        <Menu.Item
          color="red"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(assignment)
          }}
        >
          Delete
        </Menu.Item>
      )}
    />
  )
}
