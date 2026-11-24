import { useState, type ReactNode } from 'react'
import { Box, Button, Group, Menu, Paper, Popover, SegmentedControl, Text, TextInput } from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { IconAdjustmentsHorizontal, IconChevronDown, IconSearch } from '@tabler/icons-react'
import FieldsPicker from '../datalist/FieldsPicker'
import { ACTIVITY_KIND_LABELS, ACTIVITY_UI_KINDS } from '../../constants'
import { ACTIVITY_KIND_COLOR, FIELD_OPTIONS, MAX_ACTIVITY_FIELDS, type ActivityField } from './activityFields'
import type { GroupBy } from './activityListModel'
import type { DatePreset, useActivityFilters } from './useActivityFilters'
import type { ActivityUiKind, Bike, Component } from '../../types/models'

type Filters = ReturnType<typeof useActivityFilters>

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range…' },
]

// Row 1: kind pills, then (from sm up) Group by and Fields; on a phone,
// one "View" button opens ActivityViewSheet with those plus Sort.
// Row 2: search, then Bike/Component/Date filter pills and Clear filters.
export default function ActivityToolbar({
  filters,
  kindCounts,
  bikesList,
  componentsList,
  onOpenView,
}: {
  filters: Filters
  kindCounts: Record<ActivityUiKind, number> | undefined
  bikesList: Bike[] | undefined
  componentsList: Component[] | undefined
  onOpenView: () => void
}) {
  const bikeName = bikesList?.find((bike) => bike.id === filters.bikeId)?.name
  const componentLabel = componentsList?.find((component) => component.id === filters.componentId)?.label

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="wrap">
          {ACTIVITY_UI_KINDS.map((kind) => (
            <Pill
              key={kind}
              active={filters.kinds.includes(kind)}
              onClick={() => filters.toggleKind(kind)}
              leftSection={<Dot color={ACTIVITY_KIND_COLOR[kind]} />}
            >
              {ACTIVITY_KIND_LABELS[kind]} · {kindCounts?.[kind] ?? 0}
            </Pill>
          ))}
        </Group>

        <Group gap="sm" wrap="nowrap" visibleFrom="sm">
          <Text size="sm" c="dimmed">
            Group by
          </Text>
          <SegmentedControl
            size="xs"
            radius="xl"
            value={filters.groupBy}
            onChange={(value) => filters.setGroupBy(value as GroupBy)}
            data={[
              { label: 'Week', value: 'week' },
              { label: 'None', value: 'none' },
            ]}
          />
          <FieldsPicker
            all={FIELD_OPTIONS}
            visible={filters.fields}
            cap={MAX_ACTIVITY_FIELDS}
            onToggle={(key) => filters.toggleField(key as ActivityField)}
            onReorder={(activeKey, overKey) => filters.reorderColumn(activeKey as ActivityField, overKey as ActivityField)}
          />
        </Group>

        <Button
          size="xs"
          radius="xl"
          variant="default"
          leftSection={<IconAdjustmentsHorizontal size={14} />}
          onClick={onOpenView}
          hiddenFrom="sm"
        >
          View
        </Button>
      </Group>

      <Group gap="xs" wrap="wrap" mt="sm">
        <TextInput
          radius="xl"
          size="xs"
          leftSection={<IconSearch size={14} />}
          placeholder="Search ride name"
          aria-label="Search ride name"
          value={filters.qInput}
          onChange={(event) => filters.setQInput(event.currentTarget.value)}
          w={200}
        />

        <FilterMenu
          label={bikeName ?? 'Bike'}
          active={filters.bikeId != null}
          options={(bikesList ?? []).map((bike) => ({ value: bike.id, label: bike.name }))}
          allLabel="All bikes"
          onSelect={(value) => filters.setBikeId(value ?? undefined)}
        />
        <FilterMenu
          label={componentLabel ?? 'Component'}
          active={filters.componentId != null}
          options={(componentsList ?? []).map((component) => ({ value: component.id, label: component.label }))}
          allLabel="Any component"
          onSelect={(value) => filters.setComponentId(value ?? undefined)}
        />
        <DateFilter filters={filters} />

        {filters.hasActiveFilters && (
          <Button size="xs" variant="subtle" radius="xl" onClick={filters.clearFilters}>
            Clear filters
          </Button>
        )}
      </Group>
    </Paper>
  )
}

export function Dot({ color }: { color: string }) {
  return <Box w={8} h={8} style={{ borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function Pill({
  active,
  onClick,
  leftSection,
  rightSection,
  children,
}: {
  active: boolean
  onClick?: () => void
  leftSection?: ReactNode
  rightSection?: ReactNode
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
    >
      {children}
    </Button>
  )
}

function FilterMenu({
  label,
  active,
  options,
  allLabel,
  onSelect,
}: {
  label: string
  active: boolean
  options: { value: number; label: string }[]
  allLabel: string
  onSelect: (value: number | null) => void
}) {
  return (
    <Menu position="bottom-start" shadow="md" withinPortal>
      <Menu.Target>
        <Button size="xs" radius="xl" variant={active ? 'light' : 'default'} rightSection={<IconChevronDown size={12} />}>
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

// Date presets as a menu; "Custom range…" opens a range picker in a popover
// on the same pill.
function DateFilter({ filters }: { filters: Filters }) {
  const [pickerOpened, setPickerOpened] = useState(false)
  const preset = DATE_PRESETS.find((p) => p.value === filters.datePreset)
  const [start, end] = filters.customRange
  const label =
    filters.datePreset === 'custom' && start
      ? `${start}${end ? ` – ${end}` : ''}`
      : (preset?.label.replace('…', '') ?? 'Date')

  return (
    <Popover opened={pickerOpened} onChange={setPickerOpened} position="bottom-start" shadow="md">
      <Popover.Target>
        <div>
          <Menu position="bottom-start" shadow="md" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                radius="xl"
                variant={filters.datePreset ? 'light' : 'default'}
                rightSection={<IconChevronDown size={12} />}
              >
                {label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => filters.setDatePreset(null)}>All time</Menu.Item>
              <Menu.Divider />
              {DATE_PRESETS.map((option) => (
                <Menu.Item
                  key={option.value}
                  onClick={() => {
                    filters.setDatePreset(option.value)
                    if (option.value === 'custom') setPickerOpened(true)
                  }}
                >
                  {option.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          type="range"
          value={filters.customRange}
          onChange={(value) => {
            filters.setCustomRange(value)
            if (value[0] && value[1]) setPickerOpened(false)
          }}
        />
      </Popover.Dropdown>
    </Popover>
  )
}
