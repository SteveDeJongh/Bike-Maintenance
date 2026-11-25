import { Badge, Group, Text } from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import DataListRow from '../datalist/DataListRow'
import { categoryLabel } from '../../constants'

// A category whose every ride context already has a slot: a muted row
// with no inputs -- a dimmed check, the name, the chip and the part's label.
export default function AlreadyTrackedRow({
  category,
  label,
  stacked,
}: {
  category: string
  label: string | null
  stacked: boolean
}) {
  const content = (
    <Group gap="xs" wrap="wrap">
      <Text size="sm">{categoryLabel(category)}</Text>
      <Badge size="xs" color="gray" variant="light" tt="none">
        Already tracked
      </Badge>
      {label && (
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      )}
    </Group>
  )

  return (
    <DataListRow tone="muted" stacked={stacked}>
      {stacked ? (
        <Group gap="sm" wrap="nowrap">
          <IconCheck size={16} aria-hidden />
          {content}
        </Group>
      ) : (
        <>
          <IconCheck size={16} aria-hidden />
          <div style={{ gridColumn: '2 / -1' }}>{content}</div>
        </>
      )}
    </DataListRow>
  )
}
