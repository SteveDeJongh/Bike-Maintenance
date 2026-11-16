import type { ReactNode } from 'react'
import { ActionIcon, Card, Group, Menu, Stack, Text } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'

// Hides a label/value pair whose value has nothing worth showing -- the
// table's own "—" placeholder convention (e.g. Bikes' bike_type/acquired_on
// renderers) is exactly what a card shouldn't repeat several times over; a
// more informative empty-state string (e.g. "No rides yet") isn't filler
// and stays. Only plain-string renders can be checked this way -- anything
// that renders a real element (an Anchor, a Badge) is assumed non-empty,
// since introspecting an arbitrary ReactNode's rendered text isn't
// reliable, and wrongly hiding a real value is worse than occasionally
// showing one that happens to render as "—".
function isEmptyCardValue(node: ReactNode): boolean {
  if (node === null || node === undefined) return true
  if (typeof node === 'string') {
    const trimmed = node.trim()
    return trimmed === '' || trimmed === '—'
  }
  return false
}

interface DataCardListProps<Row, Column extends string> {
  rows: Row[]
  getKey: (row: Row) => string | number
  // The table's pinned column(s) -- the same link target(s) the table
  // itself uses, rendered as the card's tappable heading. A multi-pinned
  // table (e.g. Component + Bike) builds whatever multi-line node it needs
  // here; this component has no opinion beyond "it goes in the title slot."
  renderTitle: (row: Row) => ReactNode
  orderedColumns: Column[]
  columnLabels: Record<Column, string>
  columnRenderer: Record<Column, (row: Row) => ReactNode>
  // Status-ish badges shown next to the title (e.g. Bikes' "Retired").
  renderBadges?: (row: Row) => ReactNode
  // Menu.Item elements for the row's actions (e.g. Edit/Delete) -- rendered
  // behind a "⋯" ActionIcon in the card's top-right corner, not inline, so
  // a destructive action is never one accidental tap away.
  renderActions?: (row: Row) => ReactNode
  // Makes the whole card clickable (e.g. BikeDetail's History table, whose
  // desktop row opens an AssignmentDetailModal on click, not just via its
  // pinned link) -- same convention as the desktop row: the caller's own
  // renderTitle link must stopPropagation on its own click so it navigates
  // instead of also triggering this; the "⋯" menu's own ActionIcon already
  // does so here, since that trigger is this component's own.
  onRowClick?: (row: Row) => void
}

export default function DataCardList<Row, Column extends string>({
  rows,
  getKey,
  renderTitle,
  orderedColumns,
  columnLabels,
  columnRenderer,
  renderBadges,
  renderActions,
  onRowClick,
}: DataCardListProps<Row, Column>) {
  return (
    <Stack gap="xs">
      {rows.map((row) => {
        const pairs = orderedColumns
          .map((column) => ({ column, label: columnLabels[column], value: columnRenderer[column](row) }))
          .filter((pair) => !isEmptyCardValue(pair.value))

        return (
          <Card
            key={getKey(row)}
            withBorder
            padding="sm"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            <Group justify="space-between" wrap="wrap" align="flex-start" gap="xs">
              <Group gap="xs" wrap="wrap" align="center">
                {renderTitle(row)}
                {renderBadges?.(row)}
              </Group>
              {renderActions && (
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Row actions"
                      size={44}
                      onClick={onRowClick ? (event) => event.stopPropagation() : undefined}
                    >
                      <IconDots size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>{renderActions(row)}</Menu.Dropdown>
                </Menu>
              )}
            </Group>

            {pairs.length > 0 && (
              <Group gap="md" wrap="wrap" mt={6}>
                {pairs.map(({ column, label, value }) => (
                  <Stack key={column} gap={0} miw={90}>
                    <Text size="xs" c="dimmed">
                      {label}
                    </Text>
                    <Text size="sm">{value}</Text>
                  </Stack>
                ))}
              </Group>
            )}
          </Card>
        )
      })}
    </Stack>
  )
}
