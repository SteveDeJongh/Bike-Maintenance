import { useMemo } from 'react'
import { Group, Paper, Text } from '@mantine/core'
import ActivityListHeader from './ActivityListHeader'
import ActivityRow from './ActivityRow'
import type { ActivityField } from './activityFields'
import { activityListMinWidth, buildActivityRenderList, type ActivityPage, type GroupBy } from './activityListModel'
import type { ActivitySort, Order } from './useActivityFilters'
import type { ActivityItem } from '../../types/models'

// The Activity page's one list: a Paper that scrolls sideways inside
// itself when the columns don't fit, with the column header, the week
// bands and every row on one shared grid template.
export default function ActivityList({
  pages,
  groupBy,
  fields,
  sortColumn,
  order,
  onSort,
  onOpen,
}: {
  pages: ActivityPage[]
  groupBy: GroupBy
  fields: ActivityField[]
  sortColumn: ActivitySort
  order: Order
  onSort: (column: ActivitySort) => void
  onOpen: (item: ActivityItem) => void
}) {
  const entries = useMemo(() => buildActivityRenderList(pages, { groupBy, phone: false }), [pages, groupBy])

  return (
    <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
      {/* Wide enough for the fixed columns plus each field, so narrower
          screens scroll sideways rather than squeezing the columns. */}
      <div style={{ minWidth: activityListMinWidth(fields.length) }}>
        <ActivityListHeader fields={fields} sortColumn={sortColumn} order={order} onSort={onSort} />
        {entries.map((entry) => {
          if (entry.type === 'week') return <WeekBand key={entry.key} title={entry.title} totals={entry.totals} />
          if (entry.type === 'row') {
            return (
              <ActivityRow
                key={entry.key}
                item={entry.item}
                fields={fields}
                showDate={entry.showDate}
                onOpen={() => onOpen(entry.item)}
              />
            )
          }
          return null
        })}
      </div>
    </Paper>
  )
}

function WeekBand({ title, totals }: { title: string; totals: string }) {
  return (
    <Group
      justify="space-between"
      wrap="wrap"
      gap="xs"
      px={12}
      py={6}
      style={{
        borderTop: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-color-default-hover)',
      }}
    >
      <Text size="sm" fw={600}>
        {title}
      </Text>
      {totals && (
        <Text size="xs" c="dimmed">
          {totals}
        </Text>
      )}
    </Group>
  )
}
