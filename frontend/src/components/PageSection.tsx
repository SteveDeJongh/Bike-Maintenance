import type { ReactNode } from 'react'
import { Group, Stack, Text, Title } from '@mantine/core'

// A page section's heading on the page background, shared by the bike
// page's sections (docs/frontend-ui.md, "Shared building blocks"): the
// title (order 3) with a dimmed summary line under it on the left, the
// section's actions on the right (wrapping under the title on a phone),
// and the body below -- usually its own Paper panel (a DataList, cards).
export default function PageSection({
  id,
  title,
  summary,
  actions,
  children,
}: {
  // The body's DOM id.
  id: string
  title: string
  summary?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <Stack gap="sm" component="section" aria-labelledby={`${id}-title`}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="xs">
        <div style={{ minWidth: 0 }}>
          <Title order={3} id={`${id}-title`}>
            {title}
          </Title>
          {summary && (
            <Text size="sm" c="dimmed">
              {summary}
            </Text>
          )}
        </div>
        {actions && (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
      <div id={`${id}-body`}>{children}</div>
    </Stack>
  )
}
