import { Box, Group, Stack, Text } from '@mantine/core'
import { formatDistance } from '../../utils/distance'
import type { DashboardStats } from '../../types/models'

const BAR_HEIGHT = 40
const STUB_HEIGHT = 2
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// Seven plain divs, Mon..Sun, scaled to the week's biggest day. Days that
// haven't happened yet (after `today`, the server's local date) are a flat
// neutral stub; a past day with no riding is a flat primary-light stub.
export default function WeekBars({ daily, today }: { daily: DashboardStats['week']['daily']; today: string }) {
  const max = Math.max(...daily.map((day) => day.distance_meters), 0)

  return (
    <Group gap={4} wrap="nowrap" align="flex-end" aria-hidden>
      {daily.map((day, index) => {
        const future = day.date > today
        const height =
          future || max === 0 || day.distance_meters === 0
            ? STUB_HEIGHT
            : Math.max(STUB_HEIGHT, (day.distance_meters / max) * BAR_HEIGHT)
        const background = future
          ? 'var(--mantine-color-default-border)'
          : day.distance_meters === 0
            ? 'var(--mantine-primary-color-light)'
            : 'var(--mantine-primary-color-filled)'

        return (
          <Stack key={day.date} gap={2} align="center" title={future ? undefined : `${day.date}: ${formatDistance(day.distance_meters)}`}>
            <Box h={BAR_HEIGHT} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Box w={8} h={height} style={{ borderRadius: 2, background }} />
            </Box>
            <Text fz={10} c="dimmed" fw={day.date === today ? 700 : 400} lh={1}>
              {DAY_LETTERS[index]}
            </Text>
          </Stack>
        )
      })}
    </Group>
  )
}
