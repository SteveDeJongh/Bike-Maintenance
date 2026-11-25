import { useState } from 'react'
import { Anchor, Badge, Combobox, Group, Input, InputBase, Stack, Text, useCombobox } from '@mantine/core'
import { useBikes, useComponents } from '../../api/queries'
import { useAllCategories } from '../../hooks/useAllCategories'
import { componentPickerGroups, pickerLine, statusChip, type PickerChip } from './logServiceModel'
import type { ComponentListItem } from '../../types/models'

function Chip({ chip }: { chip: PickerChip | null }) {
  if (!chip) return null
  return (
    <Badge size="xs" variant="light" color={chip.color} tt="none" style={{ flexShrink: 0 }}>
      {chip.label}
    </Badge>
  )
}

function ComponentSummary({ component, chip }: { component: ComponentListItem; chip: PickerChip | null }) {
  return (
    <Group gap="xs" wrap="nowrap" justify="space-between" style={{ minWidth: 0 }}>
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text size="sm" fw={500} truncate>
          {component.label}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {pickerLine(component)}
        </Text>
      </Stack>
      <Chip chip={chip} />
    </Group>
  )
}

// The Log service modal's Component field when it opens without one (the
// Maintenance page): a Combobox with a search at the top of its dropdown
// and the componentPickerGroups groups (Needs attention, each bike,
// Spares, and Retired behind "Show retired"). Combobox gives typing to
// filter, ↑/↓, Enter and Escape.
export default function ComponentPicker({
  value,
  onChange,
  error,
}: {
  value: number | undefined
  onChange: (componentId: number) => void
  error?: string
}) {
  const { data: components } = useComponents()
  const { data: bikes } = useBikes()
  const categoryOrder = useAllCategories()
  const [q, setQ] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setQ('')
    },
    onDropdownOpen: () => combobox.focusSearchInput(),
  })

  const groups = componentPickerGroups(components ?? [], { bikes: bikes ?? [], categoryOrder, q, showRetired })
  const selected = components?.find((component) => component.id === value)

  return (
    <Stack gap={4}>
      <Combobox
        store={combobox}
        onOptionSubmit={(optionValue) => {
          onChange(Number(optionValue))
          combobox.closeDropdown()
        }}
      >
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            label="Component"
            required
            pointer
            multiline
            error={error}
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents="none"
            onClick={() => combobox.toggleDropdown()}
            styles={{ input: { paddingTop: 6, paddingBottom: 6, height: 'auto' } }}
          >
            {selected ? (
              <ComponentSummary component={selected} chip={statusChip(selected)} />
            ) : (
              <Input.Placeholder>Pick a component</Input.Placeholder>
            )}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Search
            value={q}
            onChange={(event) => setQ(event.currentTarget.value)}
            placeholder="Search name, brand or model"
            aria-label="Search name, brand or model"
          />
          <Combobox.Options mah={340} style={{ overflowY: 'auto' }}>
            {groups.length === 0 && <Combobox.Empty>No components match</Combobox.Empty>}
            {groups.map((group) => (
              <Combobox.Group key={group.key} label={group.label}>
                {group.options.map((option) => (
                  <Combobox.Option key={option.key} value={String(option.component.id)} active={option.component.id === value}>
                    <ComponentSummary component={option.component} chip={option.chip} />
                  </Combobox.Option>
                ))}
              </Combobox.Group>
            ))}
          </Combobox.Options>
          <Combobox.Footer>
            <Anchor
              component="button"
              type="button"
              size="xs"
              c="dimmed"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowRetired((current) => !current)}
            >
              {showRetired ? 'Hide retired' : 'Show retired'}
            </Anchor>
          </Combobox.Footer>
        </Combobox.Dropdown>
      </Combobox>
      <Text size="xs" c="dimmed">
        The service types and intervals below follow the component you pick.
      </Text>
    </Stack>
  )
}
