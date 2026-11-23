import { Box } from '@mantine/core'
import type { CSSProperties } from 'react'
import { SERVICE_STATUS_COLORS } from '../../constants'
import type { ServiceStatus } from '../../types/models'

// A thin wear bar: fraction_used (clamped to 0..1) in the status colour on
// the default border track; an empty track when there's no requirement.
// Shared by the Home bike card's wear rows and RideDetailModal's
// Components section.
export default function WearBar({
  fraction,
  status,
  style,
}: {
  fraction: number | null
  status: ServiceStatus | null
  style?: CSSProperties
}) {
  const color = status ? SERVICE_STATUS_COLORS[status] : 'gray'
  return (
    <Box h={6} style={{ borderRadius: 3, background: 'var(--mantine-color-default-border)', overflow: 'hidden', ...style }}>
      {fraction != null && status != null && (
        <Box
          h="100%"
          w={`${Math.min(Math.max(fraction, 0), 1) * 100}%`}
          style={{ background: `var(--mantine-color-${color}-6)` }}
        />
      )}
    </Box>
  )
}
