import { useMemo } from 'react'
import { Alert, Loader, Stack, Table } from '@mantine/core'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useTableViewPreference } from '../../api/queries'
import SlotRow from './SlotRow'
import InstalledComponentsCardList from './InstalledComponentsCardList'
import ColumnPicker from '../datatable/ColumnPicker'
import DraggableHeaderCell from '../datatable/DraggableHeaderCell'
import MobileSortControl from '../datatable/MobileSortControl'
import SortableHeaderCell from '../datatable/SortableHeaderCell'
import { useColumnDragSensors } from '../datatable/useColumnDragSensors'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useTableViewPreferences } from '../../hooks/useTableViewPreferences'
import {
  DEFAULT_INSTALLED_COMPONENT_COLUMNS,
  INSTALLED_COMPONENT_COLUMN_LABELS,
  INSTALLED_COMPONENT_COLUMNS,
  INSTALLED_COMPONENT_SORT_COLUMNS,
  type InstalledComponentColumn,
  type InstalledComponentSortColumn,
} from '../../constants'
import {
  INSTALLED_COMPONENT_COLUMN_OPTIONS,
  INSTALLED_COMPONENT_SORT_COLUMN_LABELS,
  installedComponentRenderer,
  installedComponentValue,
  type InstalledComponentRowEntry,
} from './installedComponentColumns'
import type {
  BikeComponentSlot,
  BikeDetail as BikeDetailData,
  Component,
  ComponentAssignmentWithStats,
  TableViewPreferenceData,
} from '../../types/models'

export default function InstalledComponentsTable({
  bike,
  orderedSlots,
  components,
  activeAssignmentsElsewhereByComponentId,
  onEndAssignment,
  onRowClick,
}: {
  bike: BikeDetailData
  orderedSlots: BikeComponentSlot[]
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
  onRowClick: (assignment: ComponentAssignmentWithStats) => void
}) {
  const { data: preferenceData, isPending } = useTableViewPreference('bike_installed_components')

  if (isPending || !preferenceData) return <Loader />

  return (
    <InstalledComponentsTableInner
      bike={bike}
      orderedSlots={orderedSlots}
      components={components}
      activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
      onEndAssignment={onEndAssignment}
      onRowClick={onRowClick}
      initialData={preferenceData.data}
    />
  )
}

function InstalledComponentsTableInner({
  bike,
  orderedSlots,
  components,
  activeAssignmentsElsewhereByComponentId,
  onEndAssignment,
  onRowClick,
  initialData,
}: {
  bike: BikeDetailData
  orderedSlots: BikeComponentSlot[]
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  onEndAssignment: (assignment: ComponentAssignmentWithStats) => void
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
  } = useTableViewPreferences<InstalledComponentColumn, InstalledComponentSortColumn>({
    tableKey: 'bike_installed_components',
    initialData,
    allColumns: INSTALLED_COMPONENT_COLUMNS,
    defaultColumns: DEFAULT_INSTALLED_COMPONENT_COLUMNS,
    sortColumns: INSTALLED_COMPONENT_SORT_COLUMNS,
    defaultSort: { column: 'category', direction: 'asc' },
  })
  const headerDragSensors = useColumnDragSensors()
  const isMobile = useIsMobile()

  // One entry per real slot -- a "both" slot matches any active assignment
  // of its category; a split slot only matches one whose own ride_context
  // agrees with the slot's.
  const rowEntries = useMemo(() => {
    return orderedSlots.map((slot): InstalledComponentRowEntry => {
      const assignment = bike.component_assignments.find(
        (a) =>
          a.ended_at === null &&
          a.component.category === slot.category &&
          (slot.ride_context === 'both' || a.ride_context === slot.ride_context),
      )
      return { slot, assignment }
    })
  }, [bike, orderedSlots])

  const sortedEntries = useMemo(() => {
    const accessor = installedComponentValue[sortColumn]
    return rowEntries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const av = accessor(a.entry)
        const bv = accessor(b.entry)
        if (av === null && bv === null) return a.index - b.index
        if (av === null) return 1
        if (bv === null) return -1
        const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
        return sortDirection === 'asc' ? cmp : -cmp
      })
      .map(({ entry }) => entry)
  }, [rowEntries, sortColumn, sortDirection])

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
            sortColumns={INSTALLED_COMPONENT_SORT_COLUMNS}
            columnLabels={INSTALLED_COMPONENT_SORT_COLUMN_LABELS}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onChange={setSort}
          />
          <InstalledComponentsCardList
            bike={bike}
            rows={sortedEntries}
            components={components}
            activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
            onEndAssignment={onEndAssignment}
            onRowClick={onRowClick}
            orderedColumns={orderedColumns}
            columnLabels={INSTALLED_COMPONENT_COLUMN_LABELS}
            columnRenderer={installedComponentRenderer}
          />
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={700}>
          <Table striped highlightOnHover>
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
                      label="Ride Context"
                      active={sortColumn === 'ride_context'}
                      direction={sortDirection}
                      onClick={() => setSort('ride_context')}
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
                        label={INSTALLED_COMPONENT_COLUMN_LABELS[column]}
                        active={sortColumn === column}
                        direction={sortDirection}
                        onSort={() => setSort(column)}
                      />
                    ))}
                    <Table.Th>Action</Table.Th>
                    <Table.Th>
                      <ColumnPicker
                        allColumns={INSTALLED_COMPONENT_COLUMN_OPTIONS}
                        orderedVisible={orderedColumns}
                        onToggle={(key) => toggleColumn(key as InstalledComponentColumn)}
                        onReorder={(activeKey, overKey) =>
                          reorderColumn(
                            activeKey as InstalledComponentColumn,
                            overKey as InstalledComponentColumn,
                          )
                        }
                      />
                    </Table.Th>
                  </Table.Tr>
                </SortableContext>
              </DndContext>
            </Table.Thead>
            <Table.Tbody>
              {sortedEntries.map(({ slot, assignment }) => {
                const categoryAssignments = bike.component_assignments.filter(
                  (a) => a.component.category === slot.category,
                )
                const endedCount = categoryAssignments.filter((a) => a.ended_at !== null).length
                const key = assignment ? `assignment-${assignment.id}` : `slot-${slot.id}`

                return (
                  <SlotRow
                    key={key}
                    bike={bike}
                    slot={slot}
                    assignment={assignment}
                    hasHistory={categoryAssignments.length > 0}
                    endedCount={endedCount}
                    components={components}
                    activeAssignmentsElsewhereByComponentId={activeAssignmentsElsewhereByComponentId}
                    onEndAssignment={onEndAssignment}
                    onRowClick={onRowClick}
                    orderedColumns={orderedColumns}
                  />
                )
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </>
  )
}
