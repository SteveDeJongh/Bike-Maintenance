import { Button, Group, SegmentedControl, Select, Text, TextInput } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconArrowsExchange, IconBike, IconTool, type Icon } from '@tabler/icons-react'
import { ACTIVITY_KIND_LABELS, ACTIVITY_UI_KINDS } from '../../constants'
import type { DatePreset, Order, SortMetric } from './useActivityFilters'
import type { ActivityUiKind, Bike, Component } from '../../types/models'

const ACTIVITY_UI_KIND_ICON: Record<ActivityUiKind, Icon> = {
  ride: IconBike,
  service: IconTool,
  setup: IconArrowsExchange,
}

// The whole filter bar: the kind-toggle chips, the bike/component/date/
// search row, and the sort controls -- moved as-is out of ActivityInner's
// own JSX. Props are flat (no context) per this step's own rule.
export default function ActivityFilters({
  kinds,
  toggleKind,
  kindCounts,
  bikesList,
  componentsList,
  bikeId,
  setBikeId,
  componentId,
  setComponentId,
  datePreset,
  setDatePreset,
  customRange,
  setCustomRange,
  qInput,
  setQInput,
  hasActiveFilters,
  clearFilters,
  order,
  handleOrderChange,
  rideOnly,
  sortMetric,
  setSortMetric,
}: {
  kinds: ActivityUiKind[]
  toggleKind: (kind: ActivityUiKind) => void
  kindCounts: Record<ActivityUiKind, number> | undefined
  bikesList: Bike[] | undefined
  componentsList: Component[] | undefined
  bikeId: number | undefined
  setBikeId: (value: number | undefined) => void
  componentId: number | undefined
  setComponentId: (value: number | undefined) => void
  datePreset: DatePreset | null
  setDatePreset: (value: DatePreset | null) => void
  customRange: [string | null, string | null]
  setCustomRange: (value: [string | null, string | null]) => void
  qInput: string
  setQInput: (value: string) => void
  hasActiveFilters: boolean
  clearFilters: () => void
  order: Order
  handleOrderChange: (value: string) => void
  rideOnly: boolean
  sortMetric: SortMetric
  setSortMetric: (value: SortMetric) => void
}) {
  return (
    <>
      <Group gap="xs">
        {ACTIVITY_UI_KINDS.map((kind) => {
          const Icon = ACTIVITY_UI_KIND_ICON[kind]
          return (
            <Button
              key={kind}
              size="xs"
              variant={kinds.includes(kind) ? 'filled' : 'default'}
              leftSection={<Icon size={14} />}
              onClick={() => toggleKind(kind)}
            >
              {ACTIVITY_KIND_LABELS[kind]} · {kindCounts?.[kind] ?? 0}
            </Button>
          )
        })}
      </Group>

      <Group justify="space-between" wrap="wrap">
        <Group wrap="wrap">
          <Select
            placeholder="All bikes"
            clearable
            data={(bikesList ?? []).map((bike) => ({ value: String(bike.id), label: bike.name }))}
            value={bikeId ? String(bikeId) : null}
            onChange={(value) => setBikeId(value ? Number(value) : undefined)}
            w={160}
          />
          <Select
            placeholder="Any component"
            clearable
            data={(componentsList ?? []).map((component) => ({ value: String(component.id), label: component.label }))}
            value={componentId ? String(componentId) : null}
            onChange={(value) => setComponentId(value ? Number(value) : undefined)}
            w={180}
          />
          <Select
            placeholder="All time"
            clearable
            data={[
              { value: 'this_week', label: 'This week' },
              { value: 'this_month', label: 'This month' },
              { value: 'this_year', label: 'This year' },
              { value: 'last_30_days', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom' },
            ]}
            value={datePreset}
            onChange={(value) => setDatePreset(value as DatePreset | null)}
            w={150}
          />
          {datePreset === 'custom' && (
            <DatePickerInput
              type="range"
              placeholder="Pick a date range"
              value={customRange}
              onChange={setCustomRange}
              clearable
              w={240}
            />
          )}
          <TextInput
            placeholder="Search ride name"
            value={qInput}
            onChange={(event) => setQInput(event.currentTarget.value)}
            w={200}
          />
          {hasActiveFilters && (
            <Button variant="subtle" size="xs" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </Group>

        <Group>
          <SegmentedControl
            value={order === 'desc' ? 'newest' : 'oldest'}
            onChange={handleOrderChange}
            data={[
              { label: 'Newest first', value: 'newest' },
              { label: 'Oldest first', value: 'oldest' },
            ]}
          />
          {rideOnly ? (
            <SegmentedControl
              value={sortMetric}
              onChange={(value) => setSortMetric(value as SortMetric)}
              data={[
                { label: 'Date', value: 'date' },
                { label: 'Distance', value: 'distance' },
              ]}
            />
          ) : (
            <Text size="xs" c="dimmed">
              Sort by distance is available with only Rides shown.
            </Text>
          )}
        </Group>
      </Group>
    </>
  )
}
