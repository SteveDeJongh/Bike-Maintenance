import { Badge, ThemeIcon } from '@mantine/core'
import { IconTool } from '@tabler/icons-react'

// The marks every service view shares (the Maintenance page's rows, the
// session modal): the teal wrench circle and the "↺ Wax" reset chips.

// 40 in a modal header, 32 in a list row, 28 in a compact list.
export function WrenchIcon({ size = 32 }: { size?: 28 | 32 | 40 }) {
  return (
    <ThemeIcon radius="xl" size={size} variant="light" color="teal" style={{ flexShrink: 0 }}>
      <IconTool size={Math.round(size * 0.56)} />
    </ThemeIcon>
  )
}

// "↺ Wax": each enabled requirement on the component a service resets.
export function ResetChips({ names }: { names: string[] }) {
  return names.map((name) => (
    <Badge key={name} size="xs" variant="outline" color="teal" tt="none" style={{ flexShrink: 0 }}>
      ↺ {name}
    </Badge>
  ))
}
