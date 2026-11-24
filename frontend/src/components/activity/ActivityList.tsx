import { useMemo } from 'react'
import { Text } from '@mantine/core'
import { useIsMobile } from '../../hooks/useIsMobile'
import DataList, { DataListBand } from '../datalist/DataList'
import DataListHeader, { type DataListColumn } from '../datalist/DataListHeader'
import ActivityRow from './ActivityRow'
import { ACTIVITY_FIELD_LABELS, type ActivityField } from './activityFields'
import { activityListLayout, buildActivityRenderList, dayLabel, type ActivityPage, type GroupBy } from './activityListModel'
import type { ActivitySort, Order } from './useActivityFilters'
import type { ActivityItem } from '../../types/models'

// The Activity page's one list, on the shared DataList: the column header,
// the week bands and every row on one grid (scrolling sideways inside its
// Paper when the columns don't fit). Week grouping, the kind-specific rows
// and the phone layout are Activity's own.
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
  const { template, minWidth } = activityListLayout(fields.map((field) => ACTIVITY_FIELD_LABELS[field]))
  const columns: DataListColumn<ActivitySort>[] = [
    { key: 'occurred_at', label: 'Date' },
    { key: 'icon' },
    { key: 'activity', label: 'Activity', sortable: false },
    ...fields.map((field) => ({ key: field, label: ACTIVITY_FIELD_LABELS[field], align: 'right' as const })),
  ]

  return (
    <DataList template={template} minWidth={minWidth} stacked={phone}>
      {!phone && <DataListHeader columns={columns} sortColumn={sortColumn} order={order} onSort={onSort} />}
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
    </DataList>
  )
}

function WeekBand({ title, totals }: { title: string; totals: string }) {
  return (
    <DataListBand
      title={
        <Text size="sm" fw={600}>
          {title}
        </Text>
      }
      aside={
        totals && (
          <Text size="xs" c="dimmed">
            {totals}
          </Text>
        )
      }
    />
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
