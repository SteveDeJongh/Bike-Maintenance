import { Badge, Box, Checkbox, Group, Stack, Text, Textarea } from '@mantine/core'
import { categoryLabel } from '../../constants'
import { readyLine, rowStatus, type ServiceTypeRow } from './batchServiceModel'
import type { ComponentListItem, ServiceableComponent } from '../../types/models'

const ROW_BORDER = '1px solid var(--mantine-color-default-border)'
// The note input and errors line up under the type, past the checkbox.
const TYPE_INDENT = 34

// One component in the checklist: its label bold with the category dimmed
// (a ready rotating spare adds "· drip wax Nov 20"), then one row per
// service type -- checkbox | type | status chip | what's left, in the
// status colour. A checked row gets the faint primary tint and its note
// input underneath; nothing else moves.
export default function ComponentRows({
  component,
  listItem,
  rows,
  checkedKeys,
  rowNotes,
  rowErrors,
  onToggle,
  onNoteChange,
}: {
  component: ServiceableComponent
  listItem: ComponentListItem | undefined
  rows: ServiceTypeRow[]
  checkedKeys: ReadonlySet<string>
  rowNotes: Record<string, string>
  rowErrors: Record<string, string>
  onToggle: (key: string) => void
  onNoteChange: (key: string, value: string) => void
}) {
  if (rows.length === 0) return null
  const ready = readyLine(listItem)

  return (
    <Box style={{ borderTop: ROW_BORDER }}>
      <Text size="sm" px={12} pt={8} pb={2}>
        <Text span fw={600}>
          {component.label}
        </Text>{' '}
        <Text span size="xs" c="dimmed">
          {categoryLabel(component.category)}
          {ready && ` · ${ready}`}
        </Text>
      </Text>
      {rows.map((row) => {
        const checked = checkedKeys.has(row.key)
        const status = rowStatus(row)
        const error = rowErrors[row.key]
        return (
          <Stack
            key={row.key}
            gap={4}
            px={12}
            py={6}
            style={{ background: checked ? 'var(--mantine-primary-color-light)' : undefined }}
          >
            <Group gap="sm" wrap="wrap" align="center">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: '1 1 200px' }}>
                <Checkbox
                  checked={checked}
                  onChange={() => onToggle(row.key)}
                  label={row.serviceTypeName}
                  aria-label={`${row.serviceTypeName} on ${component.label}`}
                />
                <Badge size="xs" variant="light" color={status.chip.color} tt="none" style={{ flexShrink: 0 }}>
                  {status.chip.label}
                </Badge>
              </Group>
              <Text size="xs" c={status.metricColor} ml="auto" pl={TYPE_INDENT} style={{ whiteSpace: 'nowrap' }}>
                {status.metric}
              </Text>
            </Group>
            {checked && (
              <Textarea
                size="xs"
                autosize
                minRows={1}
                placeholder="Note (optional)"
                aria-label={`Note for ${row.serviceTypeName} on ${component.label}`}
                value={rowNotes[row.key] ?? ''}
                onChange={(event) => onNoteChange(row.key, event.currentTarget.value)}
                ml={TYPE_INDENT}
              />
            )}
            {error && (
              <Text size="xs" c="red" ml={TYPE_INDENT}>
                {error}
              </Text>
            )}
          </Stack>
        )
      })}
    </Box>
  )
}
