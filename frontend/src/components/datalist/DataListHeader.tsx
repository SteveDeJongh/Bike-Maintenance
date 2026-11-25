import { useState, type MouseEvent } from 'react'
import { Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'

export interface DataListColumn<K extends string> {
  key: K | string
  // Omitted: an empty cell (e.g. above an icon column).
  label?: string
  // Default true; false renders the label as plain text.
  sortable?: boolean
  align?: 'left' | 'right'
  // Always shown in the header's tooltip ("Total time · Over the
  // component's whole life"); the Fields picker shows it too.
  description?: string
  // A dimmer second part after " · ", e.g. Bike setup's "Label · blank
  // uses brand + model".
  hint?: string
}

// The column header band: one cell per grid track, as a subgrid of the
// DataList so it lines up with the rows. Sortable columns are buttons that
// call onSort (the caller decides the first direction and the flip); the
// active one shows an arrow. Labels stay on one line: a column narrower
// than its label (fieldMinWidth should prevent it) truncates the text --
// never the arrow -- and the full label shows in a tooltip. A list that
// doesn't sort (Bike setup) omits sortColumn/order/onSort and marks every
// column sortable: false.
export default function DataListHeader<K extends string>({
  columns,
  sortColumn,
  order,
  onSort,
}: {
  columns: DataListColumn<K>[]
  sortColumn?: K
  order?: 'asc' | 'desc'
  onSort?: (column: K) => void
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
        const alignRight = column.align === 'right'
        if (column.sortable === false) {
          return (
            <HeaderLabel
              key={column.key}
              label={column.label}
              hint={column.hint}
              description={column.description}
              active={false}
              alignRight={alignRight}
            />
          )
        }
        return (
          <SortButton
            key={column.key}
            label={column.label}
            description={column.description}
            active={column.key === sortColumn}
            order={order ?? 'asc'}
            alignRight={alignRight}
            onClick={() => onSort?.(column.key as K)}
          />
        )
      })}
    </div>
  )
}

// One line of label text that may truncate. The tooltip shows when the
// column has a description, or when the label is cut off (checked as the
// pointer arrives, so a resize is always picked up).
function HeaderLabel({
  label,
  hint,
  description,
  active,
  alignRight,
}: {
  label: string
  hint?: string
  description?: string
  active: boolean
  alignRight: boolean
}) {
  const [truncated, setTruncated] = useState(false)
  const full = hint ? `${label} · ${hint}` : label
  const tooltip = description ? `${full} · ${description}` : full

  function measure(event: MouseEvent<HTMLElement>) {
    const el = event.currentTarget
    setTruncated(el.scrollWidth > el.clientWidth)
  }

  return (
    <Tooltip label={tooltip} disabled={!description && !truncated} withinPortal openDelay={300}>
      <Text
        size="xs"
        c={active ? undefined : 'dimmed'}
        fw={active ? 600 : 500}
        ta={alignRight ? 'right' : undefined}
        truncate="end"
        onMouseEnter={measure}
        style={{ minWidth: 0 }}
      >
        {label}
        {hint && <span style={{ opacity: 0.7, fontWeight: 400 }}> · {hint}</span>}
      </Text>
    </Tooltip>
  )
}

function SortButton({
  label,
  description,
  active,
  order,
  alignRight,
  onClick,
}: {
  label: string
  description?: string
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minWidth: 0,
        justifyContent: alignRight ? 'flex-end' : 'flex-start',
      }}
    >
      <HeaderLabel label={label} description={description} active={active} alignRight={alignRight} />
      {active && <Arrow size={12} style={{ flexShrink: 0 }} />}
    </UnstyledButton>
  )
}
