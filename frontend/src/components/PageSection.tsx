import { useEffect, type ReactNode } from 'react'
import { ActionIcon, Collapse, Group, Stack, Text, Title } from '@mantine/core'
import { useReducedMotion } from '@mantine/hooks'
import { IconChevronDown } from '@tabler/icons-react'
import { useCollapsed } from '../hooks/useCollapsed'

// A page section's heading on the page background, shared by the bike
// page's sections (docs/frontend-ui.md, "Shared building blocks"): a
// collapse chevron, the title (order 3) with a dimmed summary line under
// it, the section's actions on the right (wrapping under the title on a
// phone), and the body below -- usually its own Paper panel.
//
// The chevron or the title folds the body. Folded, the body isn't
// rendered at all (so its queries don't run) and the summary switches to
// `foldedSummary`, which says what's hidden. The state is remembered per
// device under `storageKey` (bikePage.collapsed.<section>); without one it
// starts open and isn't remembered. `openOnMount` unfolds a folded section
// once, on mount (and remembers that) -- for a deep link into its body,
// e.g. the component page's ?event=<id>.
export default function PageSection({
  id,
  title,
  summary,
  foldedSummary,
  actions,
  storageKey,
  openOnMount = false,
  children,
}: {
  // The body's DOM id is `${id}-body` (aria-controls).
  id: string
  title: string
  summary?: ReactNode
  foldedSummary?: ReactNode
  actions?: ReactNode
  storageKey?: string
  openOnMount?: boolean
  children: ReactNode
}) {
  const [folded, toggle] = useCollapsed(storageKey)
  useEffect(() => {
    if (openOnMount && folded) toggle()
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const reduceMotion = useReducedMotion()
  const bodyId = `${id}-body`
  const line = folded ? (foldedSummary ?? summary) : summary

  return (
    <Stack gap="sm" component="section" aria-labelledby={`${id}-title`}>
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="xs">
        <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={toggle}
            aria-expanded={!folded}
            aria-controls={bodyId}
            aria-label={`${folded ? 'Expand' : 'Collapse'} ${title}`}
            mt={2}
          >
            <IconChevronDown
              size={18}
              style={{
                transform: folded ? 'rotate(-90deg)' : undefined,
                transition: reduceMotion ? undefined : 'transform 150ms ease',
              }}
            />
          </ActionIcon>
          <div style={{ minWidth: 0 }}>
            {/* A click on the title folds too -- a mouse shortcut; the
                chevron is the keyboard and screen-reader control, and the
                heading stays a plain heading. */}
            <Title order={3} id={`${id}-title`} onClick={toggle} style={{ cursor: 'pointer', userSelect: 'none' }}>
              {title}
            </Title>
            {line && (
              <Text size="sm" c="dimmed">
                {line}
              </Text>
            )}
          </div>
        </Group>
        {actions && (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
      {/* Reduced motion gets 1ms, not 0: a 0ms transition fires no
          transitionend, so Collapse would never finish -- the body would
          keep a fixed height when open and never unmount when folded. */}
      <Collapse expanded={!folded} keepMounted={false} transitionDuration={reduceMotion ? 1 : 200} id={bodyId}>
        {children}
      </Collapse>
    </Stack>
  )
}
