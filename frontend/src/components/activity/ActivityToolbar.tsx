import { Button, Group, Paper, SegmentedControl, Text, TextInput } from '@mantine/core'
import { IconAdjustmentsHorizontal, IconSearch } from '@tabler/icons-react'
import FieldsPicker from '../datalist/FieldsPicker'
import { Dot, FilterMenu, Pill } from '../toolbar/ToolbarPills'
import DateRangePill from '../toolbar/DateRangePill'
import { ACTIVITY_KIND_LABELS, ACTIVITY_UI_KINDS } from '../../constants'
import { ACTIVITY_KIND_COLOR, FIELD_OPTIONS, MAX_ACTIVITY_FIELDS, type ActivityField } from './activityFields'
import type { GroupBy } from './activityListModel'
import type { useActivityFilters } from './useActivityFilters'
import type { ActivityUiKind, Bike, Component } from '../../types/models'

type Filters = ReturnType<typeof useActivityFilters>


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
        <DateRangePill
          preset={filters.datePreset}
          onPresetChange={filters.setDatePreset}
          customRange={filters.customRange}
          onCustomRangeChange={filters.setCustomRange}
        />

        {filters.hasActiveFilters && (
          <Button size="xs" variant="subtle" radius="xl" onClick={filters.clearFilters}>
            Clear filters
          </Button>
        )}
      </Group>
    </Paper>
  )
}
