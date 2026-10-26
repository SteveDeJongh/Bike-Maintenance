import { useMemo, useState, type ReactNode } from 'react'
import { Alert, Anchor, Button, Group, Loader, Table, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useComponents, useMaintenanceEvents, useServiceTypes, useTableViewPreference } from '../api/queries'
import { useDeleteMaintenanceEvent } from '../api/mutations'
import { confirmDelete } from '../components/confirmDelete'
import MaintenanceEventFormModal from '../components/forms/MaintenanceEventFormModal'
import ColumnPicker from '../components/datatable/ColumnPicker'
import DraggableHeaderCell from '../components/datatable/DraggableHeaderCell'
import SortableHeaderCell from '../components/datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../components/datatable/useColumnDragSensors'
import { useTableViewPreferences } from '../hooks/useTableViewPreferences'
import {
  DEFAULT_MAINTENANCE_EVENT_LIST_COLUMNS,
  MAINTENANCE_EVENT_LIST_COLUMN_LABELS,
  MAINTENANCE_EVENT_LIST_COLUMNS,
  MAINTENANCE_EVENT_LIST_SORT_COLUMNS,
  type MaintenanceEventListColumn,
  type MaintenanceEventListSortColumn,
} from '../constants'
import { formatDateTime } from '../utils/datetime'
import type { Component, MaintenanceEvent, ServiceType, TableViewPreferenceData } from '../types/models'

const RECENT_LIMIT = 10

const MAINTENANCE_EVENT_LIST_COLUMN_OPTIONS = MAINTENANCE_EVENT_LIST_COLUMNS.map((column) => ({
  key: column,
  label: MAINTENANCE_EVENT_LIST_COLUMN_LABELS[column],
}))

export default function MaintenanceEvents() {
  const { data, isPending, isError, error } = useMaintenanceEvents()
  const { data: components } = useComponents()
  const { data: serviceTypes } = useServiceTypes()
  const { data: preferenceData, isPending: preferencePending } = useTableViewPreference('maintenance_events')
  const deleteEvent = useDeleteMaintenanceEvent()

  const [modalOpened, setModalOpened] = useState(false)
  const [editing, setEditing] = useState<MaintenanceEvent | null>(null)

  // No dedicated "recent events" endpoint or sort/limit param exists on
  // GET /maintenance_events; sorting/limiting is done here client-side. If
  // more views need this, consider adding a sort/limit param or a
  // /maintenance_events/recent endpoint — flag to the project plan doc
  // rather than letting this workaround grow. This slice happens before the
  // user's own sort/column choices below, which only reorder/reformat these
  // same 10 most-recent-by-performed_at events, not a wider set.
  const recentEvents = useMemo(() => {
    if (!data) return []
    return [...data]
      .sort((a, b) => b.performed_at.localeCompare(a.performed_at))
      .slice(0, RECENT_LIMIT)
  }, [data])

  function openCreate() {
    setEditing(null)
    setModalOpened(true)
  }

  function openEdit(event: MaintenanceEvent) {
    setEditing(event)
    setModalOpened(true)
  }

  function handleDelete(event: MaintenanceEvent) {
    confirmDelete({
      title: 'Delete maintenance event',
      message: 'Delete this maintenance event? This cannot be undone.',
      onConfirm: () => deleteEvent.mutate(event.id),
    })
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Maintenance Events</Title>
        <Button onClick={openCreate}>+ New Maintenance Event</Button>
      </Group>

      {(isPending || preferencePending) && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load maintenance events">
          {error.message}
        </Alert>
      )}

      {data && data.length === 0 && <Text c="dimmed">No maintenance events yet.</Text>}

      {data && data.length > 0 && preferenceData && (
        <MaintenanceEventsTable
          events={recentEvents}
          components={components ?? []}
          serviceTypes={serviceTypes ?? []}
          initialData={preferenceData.data}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <MaintenanceEventFormModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        event={editing ?? undefined}
      />
    </>
  )
}

function MaintenanceEventsTable({
  events,
  components,
  serviceTypes,
  initialData,
  onEdit,
  onDelete,
}: {
  events: MaintenanceEvent[]
  components: Component[]
  serviceTypes: ServiceType[]
  initialData: TableViewPreferenceData
  onEdit: (event: MaintenanceEvent) => void
  onDelete: (event: MaintenanceEvent) => void
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
  } = useTableViewPreferences<MaintenanceEventListColumn, MaintenanceEventListSortColumn>({
    tableKey: 'maintenance_events',
    initialData,
    allColumns: MAINTENANCE_EVENT_LIST_COLUMNS,
    defaultColumns: DEFAULT_MAINTENANCE_EVENT_LIST_COLUMNS,
    sortColumns: MAINTENANCE_EVENT_LIST_SORT_COLUMNS,
    defaultSort: { column: 'performed_at', direction: 'desc' },
  })
  const headerDragSensors = useColumnDragSensors()

  function componentLabel(componentId: number) {
    return components.find((c) => c.id === componentId)?.label ?? `Component #${componentId}`
  }

  function serviceTypeName(serviceTypeId: number) {
    return serviceTypes.find((t) => t.id === serviceTypeId)?.name ?? `Service type #${serviceTypeId}`
  }

  const maintenanceEventRenderer: Record<MaintenanceEventListColumn, (e: MaintenanceEvent) => ReactNode> = {
    performed_at: (e) => formatDateTime(e.performed_at),
    service_type: (e) => serviceTypeName(e.service_type_id),
    notes: (e) => e.notes ?? '',
  }

  const sortedEvents = useMemo(() => {
    const eventValue: Record<MaintenanceEventListSortColumn, (e: MaintenanceEvent) => string | number | null> = {
      component_label: (e) => components.find((c) => c.id === e.component_id)?.label ?? null,
      performed_at: (e) => e.performed_at,
      service_type: (e) => serviceTypes.find((t) => t.id === e.service_type_id)?.name ?? null,
      notes: (e) => e.notes,
    }
    const accessor = eventValue[sortColumn]
    return events
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        const av = accessor(a.event)
        const bv = accessor(b.event)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ event }) => event)
  }, [events, components, serviceTypes, sortColumn, sortDirection])

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
                {orderedColumns.map((column) => (
                  <DraggableHeaderCell
                    key={column}
                    columnKey={column}
                    label={MAINTENANCE_EVENT_LIST_COLUMN_LABELS[column]}
                    active={sortColumn === column}
                    direction={sortDirection}
                    onSort={() => setSort(column)}
                  />
                ))}
                <Table.Th />
                <Table.Th>
                  <ColumnPicker
                    allColumns={MAINTENANCE_EVENT_LIST_COLUMN_OPTIONS}
                    orderedVisible={orderedColumns}
                    onToggle={(key) => toggleColumn(key as MaintenanceEventListColumn)}
                    onReorder={(activeKey, overKey) =>
                      reorderColumn(activeKey as MaintenanceEventListColumn, overKey as MaintenanceEventListColumn)
                    }
                  />
                </Table.Th>
              </Table.Tr>
            </SortableContext>
          </DndContext>
        </Table.Thead>
        <Table.Tbody>
          {sortedEvents.map((event) => (
            <Table.Tr key={event.id}>
              <Table.Td>
                <Anchor component={Link} to={`/components/${event.component_id}`}>
                  {componentLabel(event.component_id)}
                </Anchor>
              </Table.Td>
              {orderedColumns.map((column) => (
                <Table.Td key={column}>{maintenanceEventRenderer[column](event)}</Table.Td>
              ))}
              <Table.Td>
                <Group justify="flex-end" gap="xs">
                  <Button size="xs" variant="subtle" onClick={() => onEdit(event)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="subtle" color="red" onClick={() => onDelete(event)}>
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
