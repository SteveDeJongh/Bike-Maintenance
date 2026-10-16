import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Anchor, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useBikes, useComponentAssignments, useComponents, useTableViewPreference } from '../api/queries'
import { useDeleteComponentAssignment } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import ComponentAssignmentFormModal from '../components/forms/ComponentAssignmentFormModal'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import SortableHeaderCell from '../components/datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../hooks/useTableViewPreferences'
import {
  ASSIGNMENT_LIST_COLUMN_LABELS,
  ASSIGNMENT_LIST_COLUMNS,
  ASSIGNMENT_LIST_SORT_COLUMNS,
  categoryLabel,
  DEFAULT_ASSIGNMENT_LIST_COLUMNS,
  type AssignmentListColumn,
  type AssignmentListSortColumn,
} from '../constants'
import { formatDateTime } from '../utils/datetime'
import type { Bike, Component, ComponentAssignment, TableViewPreferenceData } from '../types/models'

const ASSIGNMENT_LIST_COLUMN_OPTIONS = ASSIGNMENT_LIST_COLUMNS.map((column) => ({
  key: column,
  label: ASSIGNMENT_LIST_COLUMN_LABELS[column],
}))

export default function Assignments() {
  const { data, isPending, isError, error } = useComponentAssignments()
  const { data: components } = useComponents()
  const { data: bikes } = useBikes()
  const { data: preferenceData, isPending: preferencePending } = useTableViewPreference('assignments')
  const deleteAssignment = useDeleteComponentAssignment()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<ComponentAssignment | null>(null)

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(assignment: ComponentAssignment) {
    setEditing(assignment)
    setModalOpened(true)
  }

  function handleDelete(assignment: ComponentAssignment) {
    confirmDelete({
      title: 'Delete assignment',
      message: 'Delete this assignment record? This cannot be undone.',
      onConfirm: () => deleteAssignment.mutate(assignment.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Assignments</Title>
        <Button onClick={openCreate}>+ New Assignment</Button>
      </Group>

      {(isPending || preferencePending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load assignments">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No assignments yet.</Text>}

      {data && data.length > 0 && preferenceData && (
        <AssignmentsTable
          assignments={data}
          components={components ?? []}
          bikes={bikes ?? []}
          initialData={preferenceData.data}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <ComponentAssignmentFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        assignment={editing ?? undefined}
      />
    </>
  )
}

function AssignmentsTable({
  assignments,
  components,
  bikes,
  initialData,
  onEdit,
  onDelete,
}: {
  assignments: ComponentAssignment[]
  components: Component[]
  bikes: Bike[]
  initialData: TableViewPreferenceData
  onEdit: (assignment: ComponentAssignment) => void
  onDelete: (assignment: ComponentAssignment) => void
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
  } = useTableViewPreferences<AssignmentListColumn, AssignmentListSortColumn>({
    tableKey: 'assignments',
    initialData,
    allColumns: ASSIGNMENT_LIST_COLUMNS,
    defaultColumns: DEFAULT_ASSIGNMENT_LIST_COLUMNS,
    sortColumns: ASSIGNMENT_LIST_SORT_COLUMNS,
    defaultSort: { column: 'started_at', direction: 'desc' },
  })
  const headerDragSensors = useColumnDragSensors()

  function componentLabel(componentId: number) {
    return components.find((c) => c.id === componentId)?.label ?? `Component #${componentId}`
  }

  function componentCategory(componentId: number): string | undefined {
    return components.find((c) => c.id === componentId)?.category
  }

  function bikeName(bikeId: number) {
    return bikes.find((b) => b.id === bikeId)?.name ?? `Bike #${bikeId}`
  }

  const assignmentRenderer: Record<AssignmentListColumn, (a: ComponentAssignment) => ReactNode> = {
    category: (a) => {
      const category = componentCategory(a.component_id)
      return category ? categoryLabel(category) : ''
    },
    started_at: (a) => formatDateTime(a.started_at),
    ended_at: (a) => (a.ended_at ? formatDateTime(a.ended_at) : 'Present'),
  }

  const sortedAssignments = useMemo(() => {
    const assignmentValue: Record<AssignmentListSortColumn, (a: ComponentAssignment) => string | number | null> = {
      component_label: (a) => components.find((c) => c.id === a.component_id)?.label ?? null,
      bike_name: (a) => bikes.find((b) => b.id === a.bike_id)?.name ?? null,
      category: (a) => components.find((c) => c.id === a.component_id)?.category ?? null,
      started_at: (a) => a.started_at,
      ended_at: (a) => a.ended_at,
    }
    const accessor = assignmentValue[sortColumn]
    return assignments
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
  }, [assignments, components, bikes, sortColumn, sortDirection])

  return (
    <>
      {saveError && (
        <Alert color="red" mb="sm" withCloseButton onClose={clearSaveError}>
          {saveError}
        </Alert>
      )}

      <Table striped highlightOnHover>
        <Table.Thead>
          <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
            <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
              <Table.Tr>
                <SortableHeaderCell
                  label="Component"
                  active={sortColumn === 'component_label'}
                  direction={sortDirection}
                  onClick={() => setSort('component_label')}
                />
                <SortableHeaderCell
                  label="Bike"
                  active={sortColumn === 'bike_name'}
                  direction={sortDirection}
                  onClick={() => setSort('bike_name')}
                />
                {orderedColumns.map((column) => (
                  <DraggableHeaderCell
                    key={column}
                    columnKey={column}
                    label={ASSIGNMENT_LIST_COLUMN_LABELS[column]}
                    active={sortColumn === column}
                    direction={sortDirection}
                    onSort={() => setSort(column)}
                  />
                ))}
                <Table.Th />
                <Table.Th>
                  <ColumnPicker
                    allColumns={ASSIGNMENT_LIST_COLUMN_OPTIONS}
                    orderedVisible={orderedColumns}
                    onToggle={(key) => toggleColumn(key as AssignmentListColumn)}
                    onReorder={(activeKey, overKey) =>
                      reorderColumn(activeKey as AssignmentListColumn, overKey as AssignmentListColumn)
                    }
                  />
                </Table.Th>
              </Table.Tr>
            </SortableContext>
          </DndContext>
        </Table.Thead>
        <Table.Tbody>
          {sortedAssignments.map((assignment) => (
            <Table.Tr key={assignment.id}>
              <Table.Td>
                <Anchor component={Link} to={`/components/${assignment.component_id}`}>
                  {componentLabel(assignment.component_id)}
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Anchor component={Link} to={`/bikes/${assignment.bike_id}`}>
                  {bikeName(assignment.bike_id)}
                </Anchor>
              </Table.Td>
              {orderedColumns.map((column) => (
                <Table.Td key={column}>{assignmentRenderer[column](assignment)}</Table.Td>
              ))}
              <Table.Td>
                <Group justify="flex-end" gap="xs">
                  <Button size="xs" variant="subtle" onClick={() => onEdit(assignment)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => onDelete(assignment)}>
                    Delete
                  </Button>
                </Group>
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  )
}
