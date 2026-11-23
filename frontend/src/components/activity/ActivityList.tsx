import { useMemo } from 'react'
import { Group, Paper, Text } from '@mantine/core'
import { useIsMobile } from '../../hooks/useIsMobile'
import ActivityListHeader from './ActivityListHeader'
import ActivityRow from './ActivityRow'
import type { ActivityField } from './activityFields'
import { activityListMinWidth, buildActivityRenderList, dayLabel, type ActivityPage, type GroupBy } from './activityListModel'
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
  // A phone gets the same list stacked: no column header, day headers
  // above their rows, and each row's fields as one line under its title.
  const phone = useIsMobile()
  const entries = useMemo(() => buildActivityRenderList(pages, { groupBy, phone }), [pages, groupBy, phone])

  return (
    <Paper withBorder radius="md" style={{ overflowX: phone ? undefined : 'auto' }}>
      {/* Wide enough for the fixed columns plus each field, so narrower
          screens scroll sideways rather than squeezing the columns. */}
      <div style={{ minWidth: phone ? undefined : activityListMinWidth(fields.length) }}>
        {!phone && <ActivityListHeader fields={fields} sortColumn={sortColumn} order={order} onSort={onSort} />}
        {entries.map((entry) => {
          if (entry.type === 'week') return <WeekBand key={entry.key} title={entry.title} totals={entry.totals} />
          if (entry.type === 'row') {
            return (
              <ActivityRow
                key={entry.key}
                item={entry.item}
                fields={fields}
                showDate={entry.showDate}
                phone={phone}
                onOpen={() => onOpen(entry.item)}
              />
            )
          }
          return <DayHeader key={entry.key} value={entry.value} />
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

function DayHeader({ value }: { value: string }) {
  const { primary, secondary } = dayLabel(value)
  return (
    <Text size="xs" fw={600} c="dimmed" px={12} pt={8} pb={2} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
      {primary} · {secondary}
    </Text>
  )
}
