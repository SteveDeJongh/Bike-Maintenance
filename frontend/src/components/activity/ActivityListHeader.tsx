import { Box, Text, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'
import { ACTIVITY_FIELD_LABELS, type ActivityField } from './activityFields'
import { activityGridTemplate } from './activityListModel'
import type { ActivitySort, Order } from './useActivityFilters'

// The column header band, on the same grid template as the rows. Date and
// each field sort on click (again to flip); the active one shows an arrow.
export default function ActivityListHeader({
  fields,
  sortColumn,
  order,
  onSort,
}: {
  fields: ActivityField[]
  sortColumn: ActivitySort
  order: Order
  onSort: (column: ActivitySort) => void
}) {
  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: activityGridTemplate(fields.length),
        columnGap: 'var(--mantine-spacing-sm)',
        alignItems: 'center',
        padding: '6px 12px',
        background: 'var(--mantine-color-default-hover)',
      }}
    >
      <SortButton label="Date" column="occurred_at" sortColumn={sortColumn} order={order} onSort={onSort} />
      <span />
      <Text size="xs" c="dimmed" fw={500}>
        Activity
      </Text>
      {fields.map((field) => (
        <SortButton
          key={field}
          label={ACTIVITY_FIELD_LABELS[field]}
          column={field}
          sortColumn={sortColumn}
          order={order}
          onSort={onSort}
          alignRight
        />
      ))}
    </Box>
  )
}

function SortButton({
  label,
  column,
  sortColumn,
  order,
  onSort,
  alignRight = false,
}: {
  label: string
  column: ActivitySort
  sortColumn: ActivitySort
  order: Order
  onSort: (column: ActivitySort) => void
  alignRight?: boolean
}) {
  const active = column === sortColumn
  const Arrow = order === 'asc' ? IconArrowUp : IconArrowDown

  return (
    <UnstyledButton
      onClick={() => onSort(column)}
      aria-label={`Sort by ${label}`}
      style={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: alignRight ? 'flex-end' : 'flex-start' }}
    >
      <Text size="xs" c={active ? undefined : 'dimmed'} fw={active ? 600 : 500} style={{ whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      {active && <Arrow size={12} />}
    </UnstyledButton>
  )
}
