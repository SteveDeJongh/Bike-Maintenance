import { Badge, Group, Stack, Tooltip } from '@mantine/core'
import { splitChips } from './activityListModel'

// Service chips ("Chain S1 · Drip wax"), shared by the Activity rows and the
// bike page's Service card.
function Chip({ children }: { children: string }) {
  return (
    <Badge size="sm" variant="light" color="teal" tt="none" fw={500} style={{ flexShrink: 0 }}>
      {children}
    </Badge>
  )
}

// Phone: every chip, wrapping under the sub-line. Desktop (inline): one
// line of up to three chips, then a gray "+N" whose tooltip lists them all.
export default function ServiceChips({ chips, inline }: { chips: string[]; inline: boolean }) {
  if (!inline) {
    return (
      <Group gap={4} wrap="wrap">
        {chips.map((chip, index) => (
          <Chip key={`${chip}-${index}`}>{chip}</Chip>
        ))}
      </Group>
    )
  }

  const { visible, overflow } = splitChips(chips)
  return (
    <Group gap={4} wrap="nowrap" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
      {visible.map((chip, index) => (
        <Chip key={`${chip}-${index}`}>{chip}</Chip>
      ))}
      {overflow > 0 && (
        <Tooltip
          multiline
          withinPortal
          label={
            <Stack gap={2}>
              {chips.map((chip, index) => (
                <span key={`${chip}-${index}`}>{chip}</span>
              ))}
            </Stack>
          }
        >
          <Badge size="sm" variant="light" color="gray" tt="none" fw={500} style={{ flexShrink: 0 }}>
            +{overflow}
          </Badge>
        </Tooltip>
      )}
    </Group>
  )
}
