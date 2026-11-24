import { useState } from 'react'
import { Anchor, Group, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconArrowsExchange } from '@tabler/icons-react'
import DataListRow from '../datalist/DataListRow'
import { historyRows } from './historyRows'
import type { ComponentAssignmentWithStats } from '../../types/models'

const SHOWN = 5

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// The bike's ended installations, latest first: end date | swap icon |
// "Chain S2 → Chain S1" or "Removed …", with the category and distance ran
// under it | the component's lifetime distance. Five show; "All N →"
// expands in place (it's the bike's own assignments, already loaded). A row
// opens that installation's modal.
export default function ComponentHistoryCard({
  assignments,
  onOpen,
}: {
  assignments: ComponentAssignmentWithStats[]
  onOpen: (assignment: ComponentAssignmentWithStats) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rows = historyRows(assignments)
  const shown = expanded ? rows : rows.slice(0, SHOWN)

  return (
    <Paper withBorder radius="md" p="md" style={{ flex: '1 1 460px', minWidth: 0 }}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Title order={4}>Component history</Title>
          {rows.length > SHOWN && (
            <Anchor component="button" type="button" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : `All ${rows.length} →`}
            </Anchor>
          )}
        </Group>

        {rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            No past components.
          </Text>
        ) : (
          <div>
            {shown.map((row) => (
              <DataListRow key={row.assignment.id} stacked ariaLabel={`${row.title}, open installation`} onOpen={() => onOpen(row.assignment)}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Text size="sm" c="dimmed" w={92} style={{ flexShrink: 0 }}>
                    {shortDate(row.endedAt)}
                  </Text>
                  <ThemeIcon radius="xl" size={24} variant="light" color="blue" style={{ flexShrink: 0 }}>
                    <IconArrowsExchange size={14} />
                  </ThemeIcon>
                  <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={500} truncate>
                      {row.title}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {row.subLine}
                    </Text>
                  </Stack>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {row.lifetime}
                  </Text>
                </Group>
              </DataListRow>
            ))}
          </div>
        )}
      </Stack>
    </Paper>
  )
}
