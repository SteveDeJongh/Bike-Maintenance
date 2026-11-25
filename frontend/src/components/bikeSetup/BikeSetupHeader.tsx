import type { ReactNode } from 'react'
import { Anchor, Badge, Group, Stack, Text, Title } from '@mantine/core'
import { IconChevronLeft } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import type { BikeDetail } from '../../types/models'

// The setup page's top: "‹ {bike}" back to the bike page, then "Set up
// components" with the bike type's chip and the dimmed how-to line; the
// actions on the right from sm up (a phone has them in the bottom bar).
export default function BikeSetupHeader({
  bike,
  typeName,
  actions,
}: {
  bike: BikeDetail
  typeName: string | null
  actions: ReactNode
}) {
  return (
    <Stack gap="xs">
      <Anchor component={Link} to={`/bikes/${bike.id}`} size="sm" c="dimmed" w="fit-content">
        <Group gap={2} wrap="nowrap">
          <IconChevronLeft size={14} />
          {bike.name}
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Title order={2}>Set up components</Title>
            {typeName && (
              <Badge variant="default" tt="none" fw={500}>
                {typeName}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {bike.name} · Fill in a part to track it, or tick it to track it without details.
            {typeName && ` The ${typeName} preset ticks its usual parts.`}
          </Text>
        </Stack>
        <Group visibleFrom="sm">{actions}</Group>
      </Group>
    </Stack>
  )
}
