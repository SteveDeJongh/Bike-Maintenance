import type { CSSProperties, ReactNode } from 'react'
import { Box, Button, Menu } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'

// The toolbar pieces Activity and Components share: the coloured dot, the
// toggle pill (aria-pressed) and the single-select dropdown pill.

export function Dot({ color }: { color: string }) {
  return <Box w={8} h={8} style={{ borderRadius: '50%', background: color, flexShrink: 0 }} />
}

export function Pill({
  active,
  onClick,
  leftSection,
  rightSection,
  style,
  children,
}: {
  active: boolean
  onClick?: () => void
  leftSection?: ReactNode
  rightSection?: ReactNode
  // e.g. MOBILE_TAP_TARGET_STYLE on a phone toolbar.
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <Button
      size="xs"
      radius="xl"
      variant={active ? 'light' : 'default'}
      onClick={onClick}
      leftSection={leftSection}
      rightSection={rightSection}
      aria-pressed={active}
      style={style}
    >
      {children}
    </Button>
  )
}

// A filter pill: shows the chosen option's label (or the filter's name),
// highlighted while set; the menu's first item clears it.
export function FilterMenu<V extends string | number>({
  label,
  active,
  options,
  allLabel,
  onSelect,
  style,
}: {
  label: string
  active: boolean
  options: { value: V; label: string }[]
  allLabel: string
  onSelect: (value: V | null) => void
  style?: CSSProperties
}) {
  return (
    <Menu position="bottom-start" shadow="md" withinPortal>
      <Menu.Target>
        <Button size="xs" radius="xl" variant={active ? 'light' : 'default'} rightSection={<IconChevronDown size={12} />} style={style}>
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
        <Menu.Item onClick={() => onSelect(null)}>{allLabel}</Menu.Item>
        <Menu.Divider />
        {options.map((option) => (
          <Menu.Item key={option.value} onClick={() => onSelect(option.value)}>
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
