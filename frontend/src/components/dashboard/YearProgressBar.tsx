import { Box } from '@mantine/core'

interface YearProgressBarProps {
  current: number
  lastYearToDate: number
  lastYearTotal: number
}

// This year's distance against last year's full-year total (capped at
// full), with a tick at where last year stood on the same date. Nothing to
// draw without a last-year total.
export default function YearProgressBar({ current, lastYearToDate, lastYearTotal }: YearProgressBarProps) {
  if (lastYearTotal <= 0) return null

  const fill = Math.min(current / lastYearTotal, 1) * 100
  const tick = Math.min(lastYearToDate / lastYearTotal, 1) * 100

  return (
    <Box pos="relative" h={6} mt="sm" mb={4} style={{ borderRadius: 3, background: 'var(--mantine-color-default-border)' }}>
      <Box h="100%" w={`${fill}%`} style={{ borderRadius: 3, background: 'var(--mantine-primary-color-filled)' }} />
      <Box
        pos="absolute"
        top={-3}
        left={`calc(${tick}% - 1px)`}
        w={2}
        h={12}
        style={{ borderRadius: 1, background: 'var(--mantine-color-text)' }}
        title="Last year by today"
      />
    </Box>
  )
}
