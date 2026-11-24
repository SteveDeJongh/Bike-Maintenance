import type { ReactNode } from 'react'
import { Button, Group, Paper, SegmentedControl, Text, TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import FieldsPicker from '../datalist/FieldsPicker'
import { Dot, FilterMenu, Pill } from '../toolbar/ToolbarPills'
import {
  COMPONENT_STATE_COLORS,
  COMPONENT_STATE_LABELS,
  COMPONENT_STATES,
  GROUP_BY_OPTIONS,
  SERVICE_FILTER_LABELS,
  SERVICE_FILTERS,
  type ComponentGroupBy,
  type ComponentTileCounts,
} from './componentListModel'
import type { ColumnOption } from '../datatable/ColumnPicker'
import type { ComponentsView } from './useComponentsView'
import type { ComponentListField } from '../../constants'

// Activity's toolbar shape. Row 1: the Installed / Spare / Retired toggles
// with counts; from sm up, Group by and Fields on the right. Row 2:
// search, then Category, Bike and Service status pills, then Clear filters.
// `category` and `bikeId` are the view's values already checked against
// what exists (a deleted bike's saved filter reads as unset).
export default function ComponentsToolbar({
  view,
  counts,
  category,
  bikeId,
  categoryOptions,
  bikeOptions,
  fieldOptions,
  phoneViewButton,
}: {
  view: ComponentsView
  counts: ComponentTileCounts
  category: string | null
  bikeId: number | null
  categoryOptions: { value: string; label: string }[]
  bikeOptions: { value: number; label: string }[]
  fieldOptions: ColumnOption[]
  phoneViewButton?: ReactNode
}) {
  const categoryName = categoryOptions.find((option) => option.value === category)?.label
  const bikeName = bikeOptions.find((option) => option.value === bikeId)?.label

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="xs" wrap="wrap">
          {COMPONENT_STATES.map((state) => (
            <Pill
              key={state}
              active={view.states.includes(state)}
              onClick={() => view.toggleState(state)}
              leftSection={<Dot color={COMPONENT_STATE_COLORS[state]} />}
            >
              {COMPONENT_STATE_LABELS[state]} · {counts[state]}
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
            value={view.groupBy}
            onChange={(value) => view.setGroupBy(value as ComponentGroupBy)}
            data={GROUP_BY_OPTIONS}
          />
          <FieldsPicker
            all={fieldOptions}
            visible={view.table.orderedColumns}
            onToggle={(key) => view.table.toggleColumn(key as ComponentListField)}
            onReorder={(activeKey, overKey) =>
              view.table.reorderColumn(activeKey as ComponentListField, overKey as ComponentListField)
            }
          />
        </Group>

        {phoneViewButton}
      </Group>

      <Group gap="xs" wrap="wrap" mt="sm">
        <TextInput
          radius="xl"
          size="xs"
          leftSection={<IconSearch size={14} />}
          placeholder="Search name, brand or model"
          aria-label="Search name, brand or model"
          value={view.qInput}
          onChange={(event) => view.setQInput(event.currentTarget.value)}
          w={230}
        />
        <FilterMenu
          label={categoryName ?? 'Category'}
          active={category != null}
          options={categoryOptions}
          allLabel="All categories"
          onSelect={view.setCategory}
        />
        <FilterMenu
          label={bikeName ?? 'Bike'}
          active={bikeId != null}
          options={bikeOptions}
          allLabel="All bikes"
          onSelect={view.setBikeId}
        />
        <FilterMenu
          label={view.service ? SERVICE_FILTER_LABELS[view.service] : 'Service status'}
          active={view.service != null}
          options={SERVICE_FILTERS.map((value) => ({ value, label: SERVICE_FILTER_LABELS[value] }))}
          allLabel="Any status"
          onSelect={view.setService}
        />
        {view.hasActiveFilters && (
          <Button size="xs" variant="subtle" radius="xl" onClick={view.clearFilters}>
            Clear filters
          </Button>
        )}
      </Group>
    </Paper>
  )
}
