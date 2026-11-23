import type { ReactNode } from 'react'
import { ActionIcon, Anchor, Badge, Group, Table, Text, Tooltip } from '@mantine/core'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Link } from 'react-router-dom'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import ColumnPicker from '../datatable/ColumnPicker'
import DraggableHeaderCell from '../datatable/DraggableHeaderCell'
import { useColumnDragSensors } from '../datatable/useColumnDragSensors'
import { SHARED_RIDE_COLUMN_RENDERERS } from '../ride/rideColumnRenderers'
import RideNameButton from '../ride/RideNameButton'
import { activityItemIconMeta, nonRideNote } from './activityItemMeta'
import { ACTIVITY_LOG_COLUMNS, ACTIVITY_LOG_COLUMN_LABELS, type ActivityLogColumn } from '../../constants'
import { formatDateTime } from '../../utils/datetime'
import type {
  ActivityItem,
  ActivityMaintenanceEventItem,
  ActivityRideItem,
  ActivityServiceSessionItem,
  ActivitySetupChangeItem,
} from '../../types/models'

const ACTIVITY_LOG_COLUMN_OPTIONS = ACTIVITY_LOG_COLUMNS.map((column) => ({
  key: column,
  label: ACTIVITY_LOG_COLUMN_LABELS[column],
}))

// Spreads in every shared ride column renderer wholesale, plus this page's
// own Bike column -- the one column no other ride table needs, since every
// other adopter is already scoped to one bike or shows bike as a pinned
// column of its own (the Rides tab).
const ACTIVITY_COLUMN_RENDERER: Record<ActivityLogColumn, (ride: ActivityRideItem) => ReactNode> = {
  bike: (ride) => {
    if (ride.bike) {
      return (
        <Anchor component={Link} to={`/bikes/${ride.bike.id}`} size="sm">
          {ride.bike.name}
        </Anchor>
      )
    }
    // An ignored ride has nothing to click toward -- that's the Rides tab's
    // job, not this one -- so it gets a plain badge instead of the "No
    // bike" link an ordinary unattributed ride shows.
    if (ride.attribution === 'ignored') {
      return (
        <Badge variant="light" color="gray">
          Ignored
        </Badge>
      )
    }
    return (
      <Anchor component={Link} to="/strava?tab=rides" size="sm" c="dimmed">
        No bike
      </Anchor>
    )
  },
  ...SHARED_RIDE_COLUMN_RENDERERS,
}

// The desktop table: header (drag/column-picker, no click-to-sort -- see
// "Ride history" in CLAUDE.md for why this table's columns are drag-only)
// plus ActivityRow/NonRideCellContent, moved out of
// ActivityInner as one unit.
export default function ActivityTable({
  orderedColumns,
  toggleColumn,
  reorderColumn,
  onHeaderDragEnd,
  items,
  expandedSessionIds,
  onToggleSessionExpanded,
  onViewSession,
  onOpenRide,
}: {
  orderedColumns: ActivityLogColumn[]
  toggleColumn: (column: ActivityLogColumn) => void
  reorderColumn: (activeKey: ActivityLogColumn, overKey: ActivityLogColumn) => void
  onHeaderDragEnd: (event: DragEndEvent) => void
  items: ActivityItem[]
  expandedSessionIds: Set<number>
  onToggleSessionExpanded: (sessionId: number) => void
  onViewSession: (sessionId: number) => void
  onOpenRide: (rideId: number) => void
}) {
  const headerDragSensors = useColumnDragSensors()
  const mergedColSpan = 1 + orderedColumns.length

  return (
    <Table.ScrollContainer minWidth={700}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <DndContext sensors={headerDragSensors} collisionDetection={closestCenter} onDragEnd={onHeaderDragEnd}>
            <SortableContext items={orderedColumns} strategy={horizontalListSortingStrategy}>
              <Table.Tr>
                <Table.Th style={{ width: 28 }} />
                <Table.Th>Date</Table.Th>
                <Table.Th>Name</Table.Th>
                {orderedColumns.map((column) => (
                  <DraggableHeaderCell
                    key={column}
                    columnKey={column}
                    label={ACTIVITY_LOG_COLUMN_LABELS[column]}
                    active={false}
                    direction="asc"
                    onSort={() => {}}
                    sortable={false}
                  />
                ))}
                <Table.Th>
                  <Tooltip label="Change the bike on Strava, then Re-sync.">
                    <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>
                      Actions
                    </Text>
                  </Tooltip>
                </Table.Th>
                <Table.Th>
                  <ColumnPicker
                    allColumns={ACTIVITY_LOG_COLUMN_OPTIONS}
                    orderedVisible={orderedColumns}
                    onToggle={(key) => toggleColumn(key as ActivityLogColumn)}
                    onReorder={(activeKey, overKey) =>
                      reorderColumn(activeKey as ActivityLogColumn, overKey as ActivityLogColumn)
                    }
                  />
                </Table.Th>
              </Table.Tr>
            </SortableContext>
          </DndContext>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item, index) => (
            <ActivityRow
              key={`${item.kind}-${item.id}-${index}`}
              item={item}
              orderedColumns={orderedColumns}
              mergedColSpan={mergedColSpan}
              expanded={item.kind === 'service_session' && expandedSessionIds.has(item.id)}
              onToggleExpand={() => item.kind === 'service_session' && onToggleSessionExpanded(item.id)}
              onViewSession={onViewSession}
              onOpenRide={onOpenRide}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

interface ActivityRowProps {
  item: ActivityItem
  orderedColumns: ActivityLogColumn[]
  mergedColSpan: number
  expanded: boolean
  onToggleExpand: () => void
  onViewSession: (sessionId: number) => void
  onOpenRide: (rideId: number) => void
}

function ActivityRow({ item, orderedColumns, mergedColSpan, expanded, onToggleExpand, onViewSession, onOpenRide }: ActivityRowProps) {
  const { Icon, label } = activityItemIconMeta(item)

  if (item.kind === 'ride') {
    return (
      <Table.Tr>
        <Table.Td>
          <Tooltip label={label}>
            <Icon size={16} />
          </Tooltip>
        </Table.Td>
        <Table.Td>{formatDateTime(item.occurred_at)}</Table.Td>
        <Table.Td>
          <RideNameButton name={item.name} onOpen={() => onOpenRide(item.id)} />
        </Table.Td>
        {orderedColumns.map((column) => (
          <Table.Td key={column}>{ACTIVITY_COLUMN_RENDERER[column](item)}</Table.Td>
        ))}
        <Table.Td />
        <Table.Td />
      </Table.Tr>
    )
  }

  return (
    <>
      <Table.Tr style={{ backgroundColor: 'var(--mantine-color-gray-light)' }}>
        <Table.Td>
          <Tooltip label={label}>
            <Icon size={16} />
          </Tooltip>
        </Table.Td>
        <Table.Td>{formatDateTime(item.occurred_at)}</Table.Td>
        <Table.Td colSpan={mergedColSpan}>
          <NonRideCellContent item={item} expanded={expanded} onToggleExpand={onToggleExpand} onViewSession={onViewSession} />
        </Table.Td>
        <Table.Td />
        <Table.Td />
      </Table.Tr>
      {item.kind === 'service_session' &&
        expanded &&
        item.items.map((sessionItem, itemIndex) => (
          <Table.Tr key={itemIndex} style={{ backgroundColor: 'var(--mantine-color-gray-light)' }}>
            <Table.Td />
            <Table.Td />
            <Table.Td colSpan={mergedColSpan}>
              <Group gap="xs" wrap="nowrap" pl="lg">
                <Anchor component={Link} to={`/components/${sessionItem.component_id}`} size="sm" c="dimmed">
                  {sessionItem.label}
                </Anchor>
                <Text size="sm" c="dimmed">
                  · {sessionItem.service_type_name}
                </Text>
                {sessionItem.note && (
                  <Tooltip label={sessionItem.note}>
                    <Text size="xs" c="dimmed" truncate maw={200}>
                      {sessionItem.note}
                    </Text>
                  </Tooltip>
                )}
              </Group>
            </Table.Td>
            <Table.Td />
            <Table.Td />
          </Table.Tr>
        ))}
    </>
  )
}

// Each kind's click target: maintenance_event navigates to its component
// with ?event=<id> (ComponentServiceAndHistory scrolls to and highlights
// that row); service_session opens ServiceSessionViewModal directly rather
// than navigating anywhere; setup_change navigates to the installed
// component, with a secondary link to the replaced one when the row is a
// merged "replaced" entry -- two separate link affordances, since the
// summary string itself is server-built and never parsed/recomposed here.
function NonRideCellContent({
  item,
  expanded,
  onToggleExpand,
  onViewSession,
}: {
  item: ActivityServiceSessionItem | ActivityMaintenanceEventItem | ActivitySetupChangeItem
  expanded: boolean
  onToggleExpand: () => void
  onViewSession: (sessionId: number) => void
}) {
  const note = nonRideNote(item)

  const summaryNode = (() => {
    if (item.kind === 'maintenance_event') {
      return (
        <Anchor component={Link} to={`/components/${item.component_id}?event=${item.id}`} size="sm" c="dimmed">
          {item.summary}
        </Anchor>
      )
    }
    if (item.kind === 'service_session') {
      return (
        <Group gap={4} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" color="gray" onClick={onToggleExpand} aria-label={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </ActionIcon>
          <Anchor component="button" type="button" onClick={() => onViewSession(item.id)} size="sm" c="dimmed">
            {item.summary}
          </Anchor>
        </Group>
      )
    }
    return (
      <Group gap={6} wrap="nowrap">
        <Anchor component={Link} to={`/components/${item.component.id}`} size="sm" c="dimmed">
          {item.summary}
        </Anchor>
        {item.replaced_component && (
          <Anchor component={Link} to={`/components/${item.replaced_component.id}`} size="xs" c="dimmed">
            (view {item.replaced_component.label})
          </Anchor>
        )}
      </Group>
    )
  })()

  return (
    <Group gap="xs" wrap="nowrap">
      {summaryNode}
      {note && (
        <Tooltip label={note}>
          <Text size="xs" c="dimmed" truncate maw={240}>
            {note}
          </Text>
        </Tooltip>
      )}
    </Group>
  )
}
