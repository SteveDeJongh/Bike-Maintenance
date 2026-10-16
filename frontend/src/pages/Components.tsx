import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Anchor, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useComponents, useTableViewPreference } from '../api/queries'
import { useDeleteComponent } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import ComponentFormModal from '../components/forms/ComponentFormModal'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import SortableHeaderCell from '../components/datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../hooks/useTableViewPreferences'
import {
  categoryLabel,
  COMPONENT_LIST_COLUMN_LABELS,
  COMPONENT_LIST_COLUMNS,
  COMPONENT_LIST_SORT_COLUMNS,
  DEFAULT_COMPONENT_LIST_COLUMNS,
  type ComponentListColumn,
  type ComponentListSortColumn,
} from '../constants'
import { formatDate } from '../utils/datetime'
import type { Component, TableViewPreferenceData } from '../types/models'

const COMPONENT_LIST_COLUMN_OPTIONS = COMPONENT_LIST_COLUMNS.map((column) => ({
  key: column,
  label: COMPONENT_LIST_COLUMN_LABELS[column],
}))

const componentRenderer: Record<ComponentListColumn, (c: Component) => ReactNode> = {
  category: (c) => categoryLabel(c.category),
  acquired_on: (c) => formatDate(c.acquired_on),
  retired_on: (c) => (c.retired_on ? formatDate(c.retired_on) : 'Active'),
}

const componentValue: Record<ComponentListSortColumn, (c: Component) => string | number | null> = {
  label: (c) => c.label,
  category: (c) => c.category,
  acquired_on: (c) => c.acquired_on,
  retired_on: (c) => c.retired_on,
}

export default function Components() {
  const { data, isPending, isError, error } = useComponents()
  const { data: preferenceData, isPending: preferencePending } = useTableViewPreference('components')
  const deleteComponent = useDeleteComponent()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<Component | null>(null)

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(component: Component) {
    setEditing(component)
    setModalOpened(true)
  }

  function handleDelete(component: Component) {
    confirmDelete({
      title: 'Delete component',
      message: `Delete "${component.label}"? This also deletes its assignment and maintenance event history.`,
      onConfirm: () => deleteComponent.mutate(component.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Components</Title>
        <Button onClick={openCreate}>+ New Component</Button>
      </Group>

      {(isPending || preferencePending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load components">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No components yet.</Text>}

      {data && data.length > 0 && preferenceData && (
        <ComponentsTable
          components={data}
          initialData={preferenceData.data}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <ComponentFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        component={editing ?? undefined}
      />
    </>
  )
}

function ComponentsTable({
  components,
  initialData,
  onEdit,
  onDelete,
}: {
  components: Component[]
  initialData: TableViewPreferenceData
  onEdit: (component: Component) => void
  onDelete: (component: Component) => void
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
  } = useTableViewPreferences<ComponentListColumn, ComponentListSortColumn>({
    tableKey: 'components',
    initialData,
    allColumns: COMPONENT_LIST_COLUMNS,
    defaultColumns: DEFAULT_COMPONENT_LIST_COLUMNS,
    sortColumns: COMPONENT_LIST_SORT_COLUMNS,
    defaultSort: { column: 'label', direction: 'asc' },
  })
  const headerDragSensors = useColumnDragSensors()

  const sortedComponents = useMemo(() => {
    const accessor = componentValue[sortColumn]
    return components
      .map((component, index) => ({ component, index }))
      .sort((a, b) => {
        const av = accessor(a.component)
        const bv = accessor(b.component)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ component }) => component)
  }, [components, sortColumn, sortDirection])

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
                  label="Label"
                  active={sortColumn === 'label'}
                  direction={sortDirection}
                  onClick={() => setSort('label')}
                />
                {orderedColumns.map((column) => (
                  <DraggableHeaderCell
                    key={column}
                    columnKey={column}
                    label={COMPONENT_LIST_COLUMN_LABELS[column]}
                    active={sortColumn === column}
                    direction={sortDirection}
                    onSort={() => setSort(column)}
                  />
                ))}
                <Table.Th />
                <Table.Th>
                  <ColumnPicker
                    allColumns={COMPONENT_LIST_COLUMN_OPTIONS}
                    orderedVisible={orderedColumns}
                    onToggle={(key) => toggleColumn(key as ComponentListColumn)}
                    onReorder={(activeKey, overKey) =>
                      reorderColumn(activeKey as ComponentListColumn, overKey as ComponentListColumn)
                    }
                  />
                </Table.Th>
              </Table.Tr>
            </SortableContext>
          </DndContext>
        </Table.Thead>
        <Table.Tbody>
          {sortedComponents.map((component) => (
            <Table.Tr key={component.id}>
              <Table.Td>
                <Anchor component={Link} to={`/components/${component.id}`}>
                  {component.label}
                </Anchor>
              </Table.Td>
              {orderedColumns.map((column) => (
                <Table.Td key={column}>{componentRenderer[column](component)}</Table.Td>
              ))}
              <Table.Td>
                <Group justify="flex-end" gap="xs">
                  <Button size="xs" variant="subtle" onClick={() => onEdit(component)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => onDelete(component)}>
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
