import { Paper } from '@mantine/core'
import ActivityListHeader from './ActivityListHeader'
import ActivityRow from './ActivityRow'
import type { ActivityField } from './activityFields'
import { activityListMinWidth } from './activityListModel'
import type { ActivitySort, Order } from './useActivityFilters'
import type { ActivityItem } from '../../types/models'

// The Activity page's one list: a Paper that scrolls sideways inside
// itself when the columns don't fit, with the column header and every row
// on one shared grid template.
export default function ActivityList({
  items,
  fields,
  sortColumn,
  order,
  onSort,
  onOpen,
}: {
  items: ActivityItem[]
  fields: ActivityField[]
  sortColumn: ActivitySort
  order: Order
  onSort: (column: ActivitySort) => void
  onOpen: (item: ActivityItem) => void
}) {
  return (
    <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
      {/* Wide enough for the fixed columns plus each field, so narrower
          screens scroll sideways rather than squeezing the columns. */}
      <div style={{ minWidth: activityListMinWidth(fields.length) }}>
        <ActivityListHeader fields={fields} sortColumn={sortColumn} order={order} onSort={onSort} />
        {items.map((item, index) => (
          <ActivityRow key={`${item.kind}-${item.id}-${index}`} item={item} fields={fields} showDate onOpen={() => onOpen(item)} />
        ))}
      </div>
    </Paper>
  )
}
