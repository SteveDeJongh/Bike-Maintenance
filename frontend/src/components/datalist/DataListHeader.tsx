import { Text, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'

export interface DataListColumn<K extends string> {
  key: K | string
  // Omitted: an empty cell (e.g. above an icon column).
  label?: string
  // Default true; false renders the label as plain text.
  sortable?: boolean
  align?: 'left' | 'right'
}

// The column header band: one cell per grid track, as a subgrid of the
// DataList so it lines up with the rows. Sortable columns are buttons that
// call onSort (the caller decides the first direction and the flip); the
// active one shows an arrow.
export default function DataListHeader<K extends string>({
  columns,
  sortColumn,
  order,
  onSort,
}: {
  columns: DataListColumn<K>[]
  sortColumn: K
  order: 'asc' | 'desc'
  onSort: (column: K) => void
}) {
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: 'subgrid',
        alignItems: 'center',
        padding: '6px 12px',
        background: 'var(--mantine-color-default-hover)',
      }}
    >
      {columns.map((column) => {
        if (!column.label) return <span key={column.key} />
        if (column.sortable === false) {
          return (
            <Text key={column.key} size="xs" c="dimmed" fw={500} ta={column.align}>
              {column.label}
            </Text>
          )
        }
        return (
          <SortButton
            key={column.key}
            label={column.label}
            active={column.key === sortColumn}
            order={order}
            alignRight={column.align === 'right'}
            onClick={() => onSort(column.key as K)}
          />
        )
      })}
    </div>
  )
}

function SortButton({
  label,
  active,
  order,
  alignRight,
  onClick,
}: {
  label: string
  active: boolean
  order: 'asc' | 'desc'
  alignRight: boolean
  onClick: () => void
}) {
  const Arrow = order === 'asc' ? IconArrowUp : IconArrowDown

  return (
    <UnstyledButton
      onClick={onClick}
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
