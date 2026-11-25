import { Button, Group, Paper, Stack, Text } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { IconCalendar } from '@tabler/icons-react'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { useIsMobile } from '../../hooks/useIsMobile'

// The toolbar card (the Components/Activity Paper): "Installed since" as a
// pill date field with its hint on the left; "8 of 14 ticked" and Check
// all / Clear all on the right. Wraps on narrow screens; a phone stacks it.
export default function BikeSetupToolbar({
  installedOn,
  onInstalledOnChange,
  ticked,
  total,
  onCheckAll,
  onClearAll,
}: {
  installedOn: string
  onInstalledOnChange: (value: string | null) => void
  ticked: number
  total: number
  onCheckAll: () => void
  onClearAll: () => void
}) {
  const isMobile = useIsMobile()
  const tap = isMobile ? MOBILE_TAP_TARGET_STYLE : undefined

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Stack gap={4} w={{ base: '100%', sm: 'auto' }}>
          <Group gap="sm" wrap="wrap" align="center">
            <Text size="sm" fw={500}>
              Installed since
            </Text>
            <DateInput
              aria-label="Installed since"
              size={isMobile ? 'md' : 'xs'}
              radius="xl"
              leftSection={<IconCalendar size={14} />}
              value={installedOn}
              onChange={onInstalledOnChange}
              w={{ base: '100%', sm: 160 }}
            />
            <Text size="xs" c="dimmed" visibleFrom="sm">
              Rides before this date won't count toward these parts.
            </Text>
          </Group>
          <Text size="xs" c="dimmed" hiddenFrom="sm">
            Rides before this date won't count toward these parts.
          </Text>
        </Stack>

        <Group gap="xs" wrap="nowrap" justify="space-between" w={{ base: '100%', sm: 'auto' }}>
          <Text size="sm" c="dimmed" mr="xs">
            {ticked} of {total} ticked
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Button size="xs" radius="xl" variant="outline" onClick={onCheckAll} style={tap}>
              Check all
            </Button>
            <Button size="xs" radius="xl" variant="outline" onClick={onClearAll} style={tap}>
              Clear all
            </Button>
          </Group>
        </Group>
      </Group>
    </Paper>
  )
}
