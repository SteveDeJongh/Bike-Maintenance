import { Table } from '@mantine/core'

interface SortableHeaderCellProps {
  label: string
  active: boolean
  direction: 'asc' | 'desc'
  onClick: () => void
}

export default function SortableHeaderCell({ label, active, direction, onClick }: SortableHeaderCellProps) {
  return (
    <Table.Th onClick={onClick} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label}
      {active ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
    </Table.Th>
  )
}
