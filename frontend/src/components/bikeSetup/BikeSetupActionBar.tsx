import type { ReactNode } from 'react'
import { Group, Paper, Stack, Text } from '@mantine/core'
import type { ActionBarSummary } from './bikeSetupModel'

// Sticky at the bottom of the page: what will be created, and the same two
// buttons as the header. `bottom` is AppShell's footer offset -- 0 from sm
// up, the tab bar plus the home-indicator safe area on a phone -- so the
// bar sits above the tab bar. Sticky keeps its place in the flow, so the
// last row is never hidden behind it. A phone gets one dimmed line over
// Skip and a full-width primary.
export default function BikeSetupActionBar({
  summary,
  actions,
  phoneActions,
}: {
  summary: ActionBarSummary
  actions: ReactNode
  phoneActions: ReactNode
}) {
  return (
    <Paper
      withBorder
      radius="md"
      shadow="md"
      p="sm"
      style={{ position: 'sticky', bottom: 'calc(var(--app-shell-footer-offset, 0rem) + var(--mantine-spacing-xs))', zIndex: 2 }}
    >
      <Group justify="space-between" wrap="nowrap" gap="md" visibleFrom="sm">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm" fw={600}>
            {summary.headline}
          </Text>
          {summary.detail && (
            <Text size="xs" c="dimmed">
              {summary.detail}
            </Text>
          )}
        </Stack>
        {actions}
      </Group>

      <Stack gap="xs" hiddenFrom="sm">
        <Text size="sm" c="dimmed">
          {summary.phoneLine}
        </Text>
        {phoneActions}
      </Stack>
    </Paper>
  )
}
