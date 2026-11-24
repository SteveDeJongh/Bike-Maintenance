import { Paper, Stack, Text, Title } from '@mantine/core'
import RotationSplitBar from '../dashboard/RotationSplitBar'
import { categoryLabel } from '../../constants'
import { rotationSummaryLine } from '../../utils/rotation'
import type { RotationGroup } from '../../utils/bikeCard'

// One rotating category on the bike page (a mounted part with an off-bike
// partner, rotationGroups): the split bar of lifetime distances, who's on
// and off, and where to swap.
export default function RotationCard({ group }: { group: RotationGroup }) {
  const label = categoryLabel(group.category)

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Title order={4}>{label} rotation</Title>
        <RotationSplitBar group={group} height={8} />
        <Text size="sm" c="dimmed">
          {rotationSummaryLine(group)}
        </Text>
        <Text size="xs" c="dimmed">
          Swap with the pill on the {label.toLowerCase()} row below.
        </Text>
      </Stack>
    </Paper>
  )
}
