import type { CSSProperties, ReactNode } from 'react'
import { Group, Paper, Stack, Text } from '@mantine/core'

interface StatTileProps {
  label: string
  value: ReactNode
  secondary?: ReactNode
  // Right-hand content beside the label/value (e.g. the week's bars).
  aside?: ReactNode
  children?: ReactNode
  style?: CSSProperties
}

// The shared summary-tile shell: small uppercase label, large value, dimmed
// secondary line.
export default function StatTile({ label, value, secondary, aside, children, style }: StatTileProps) {
  return (
    <Paper withBorder p="md" radius="md" style={style}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text size="xs" tt="uppercase" fw={600} c="dimmed" style={{ letterSpacing: '0.04em' }}>
            {label}
          </Text>
          <Text fz={26} fw={700} lh={1.15}>
            {value}
          </Text>
          {secondary && (
            <Text size="sm" c="dimmed">
              {secondary}
            </Text>
          )}
        </Stack>
        {aside}
      </Group>
      {children}
    </Paper>
  )
}
