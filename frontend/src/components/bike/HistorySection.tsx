import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Anchor, Button, Group, Loader, Stack, Table } from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useTableViewPreference } from '../../api/queries'
import { useDeleteComponentAssignment } from '../../api/mutations'
import { confirmDelete } from '../confirmDelete'
import ComponentHistoryCardList from './ComponentHistoryCardList'
import ColumnPicker from '../datatable/ColumnPicker'
import DraggableHeaderCell from '../datatable/DraggableHeaderCell'
import MobileSortControl from '../datatable/MobileSortControl'
import SortableHeaderCell from '../datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../datatable/useColumnDragSensors'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import {
  categoryLabel,
  DEFAULT_HISTORY_COLUMNS,
  HISTORY_COLUMN_LABELS,
  HISTORY_COLUMNS,
  HISTORY_SORT_COLUMNS,
  type HistoryColumn,
  type HistorySortColumn,
} from '../../constants'
import { HISTORY_COLUMN_OPTIONS, HISTORY_SORT_COLUMN_LABELS, historyRenderer, historyValue } from './historyColumns'
import type { ComponentAssignmentWithStats, TableViewPreferenceData } from '../../types/models'

export default function HistoryTable({
  historyAssignments,
  onRowClick,
}: {
  historyAssignments: ComponentAssignmentWithStats[]
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
}) {
  const { data: preferenceData, isPending } = useTableViewPreference('bike_history')

  if (isPending || !preferenceData) return <Loader />

  return (
    <HistoryTableInner
      historyAssignments={historyAssignments}
      onRowClick={onRowClick}
      initialData={preferenceData.data}
    />
  )
}

function HistoryTableInner({
  historyAssignments,
  onRowClick,
  initialData,
}: {
  historyAssignments: ComponentAssignmentWithStats[]
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
  initialData: TableViewPreferenceData
}) {
  const {
    orderedColumns,
    toggleColumn,
    reorderColumn,
    onHeaderDragEnd,
    sortColumn,
    sortDirection,
    setSort,
    saveError,
    clearSaveError,
  } = useTableViewPreferences<HistoryColumn, HistorySortColumn>({
    tableKey: 'bike_history',
    initialData,
    allColumns: HISTORY_COLUMNS,
    defaultColumns: DEFAULT_HISTORY_COLUMNS,
    sortColumns: HISTORY_SORT_COLUMNS,
    defaultSort: { column: 'started_on', direction: 'desc' },
  })
  const headerDragSensors = useColumnDragSensors()
  const isMobile = useIsMobile()
  const deleteAssignment = useDeleteComponentAssignment()

  function handleDelete(assignment: ComponentAssignmentWithStats) {
    const category = categoryLabel(assignment.component.category)
    confirmDelete({
      title: 'Delete installation record',
      message: `Delete the record of "${assignment.component.label}" having been installed as the ${category} on this bike? This cannot be undone.`,
      onConfirm: () => deleteAssignment.mutate(assignment.id),
    })
  }

  const sortedAssignments = useMemo(() => {
    const accessor = historyValue[sortColumn]
    return historyAssignments
      .map((assignment, index) => ({ assignment, index }))
      .sort((a, b) => {
        const av = accessor(a.assignment)
        const bv = accessor(b.assignment)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ assignment }) => assignment)
  }, [historyAssignments, sortColumn, sortDirection])

  return (
    <>
      {saveError && (
        <Alert color="red" mb="sm" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      {isMobile ? (
        <Stack gap="sm">
          <MobileSortControl
            sortColumns={HISTORY_SORT_COLUMNS}
            columnLabels={HISTORY_SORT_COLUMN_LABELS}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onChange={setSort}
          />
          <ComponentHistoryCardList
            rows={sortedAssignments}
            orderedColumns={orderedColumns}
            columnLabels={HISTORY_COLUMN_LABELS}
            columnRenderer={historyRenderer}
            onDelete={handleDelete}
            onRowClick={onRowClick}
          />
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={700}>
          <Table striped>
            <Table.Thead>
              <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
                <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
                  <Table.Tr>
                    <SortableHeaderCell
                      label="Category"
                      active={sortColumn === 'category'}
                      direction={sortDirection}
                      onClick={() => setSort('category')}
                    />
                    <SortableHeaderCell
                      label="Component"
                      active={sortColumn === 'component_label'}
                      direction={sortDirection}
                      onClick={() => setSort('component_label')}
                    />
                    {orderedColumns.map((column) => (
                      <DraggableHeaderCell
                        key={column}
                        columnKey={column}
                        label={HISTORY_COLUMN_LABELS[column]}
                        active={sortColumn === column}
                        direction={sortDirection}
                        onSort={() => setSort(column)}
                      />
                    ))}
                    <Table.Th>Action</Table.Th>
                    <Table.Th>
                      <ColumnPicker
                        allColumns={HISTORY_COLUMN_OPTIONS}
                        orderedVisible={orderedColumns}
                        onToggle={(key) => toggleColumn(key as HistoryColumn)}
                        onReorder={(activeKey, overKey) =>
                          reorderColumn(activeKey as HistoryColumn, overKey as HistoryColumn)
                        }
                      />
                    </Table.Th>
                  </Table.Tr>
                </SortableContext>
              </DndContext>
            </Table.Thead>
            <Table.Tbody>
              {sortedAssignments.map((assignment) => (
                <Table.Tr key={assignment.id} onClick={() => onRowClick(assignment)} style={{ cursor: 'pointer' }}>
                  <Table.Td>{categoryLabel(assignment.component.category)}</Table.Td>
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
                    <Table.Td key={column}>{historyRenderer[column](assignment)}</Table.Td>
                  ))}
                  <Table.Td>
                    <Group justify="flex-end">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleDelete(assignment)
                        }}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </>
  )
}
