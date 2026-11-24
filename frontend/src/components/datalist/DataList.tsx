import type { ReactNode } from 'react'
import { Group, Paper } from '@mantine/core'

const BORDER = '1px solid var(--mantine-color-default-border)'

// The shared list (Activity; the Bikes table and the bike page's installed
// components in later parts): one CSS grid inside a Paper, scrolling
// sideways inside itself once the columns don't fit `minWidth`. The header
// (DataListHeader), every row (DataListRow) and bands (DataListBand) are
// its direct children; rows and the header are subgrids of `template`
// (dataListTemplate), so field columns size across all rows together and
// always line up. `stacked` (a phone layout) drops the grid: rows stack as
// plain blocks and there's no header.
export default function DataList({
  template,
  minWidth,
  stacked = false,
  children,
}: {
  template: string
  minWidth: number
  stacked?: boolean
  children: ReactNode
}) {
  return (
    <Paper withBorder radius="md" style={{ overflowX: stacked ? undefined : 'auto' }}>
      {stacked ? (
        <div>{children}</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            columnGap: 'var(--mantine-spacing-sm)',
            minWidth,
          }}
        >
          {children}
        </div>
      )}
    </Paper>
  )
}

// A full-width row between data rows (Activity's week bands): a title on
// the left, an optional aside on the right.
export function DataListBand({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <Group
      justify="space-between"
      wrap="wrap"
      gap="xs"
      px={12}
      py={6}
      style={{ gridColumn: '1 / -1', borderTop: BORDER, background: 'var(--mantine-color-default-hover)' }}
    >
      {title}
      {aside}
    </Group>
  )
}
