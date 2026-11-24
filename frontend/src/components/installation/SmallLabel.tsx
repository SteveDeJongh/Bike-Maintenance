import type { ReactNode } from 'react'
import { Text } from '@mantine/core'

// The modal's small uppercase dimmed label (headings, stat names, "Swap").
export default function SmallLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
      {children}
    </Text>
  )
}
