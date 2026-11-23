import { Divider, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import AppModal from '../AppModal'
import { ColumnPickerPanel } from '../datatable/ColumnPicker'
import { ACTIVITY_FIELD_LABELS, FIELD_OPTIONS, MAX_ACTIVITY_FIELDS, type ActivityField } from './activityFields'
import type { GroupBy } from './activityList'
import type { ActivitySort, useActivityFilters } from './useActivityFilters'

type Filters = ReturnType<typeof useActivityFilters>

// The phone's "View" sheet: Group by, Sort (there are no column headers to
// click on a phone) and Fields, in one AppModal (full-screen there).
export default function ActivityViewSheet({
  opened,
  onClose,
  filters,
}: {
  opened: boolean
  onClose: () => void
  filters: Filters
}) {
  const sortOptions = [
    { value: 'occurred_at', label: 'Date' },
    ...filters.fields.map((field) => ({ value: field, label: ACTIVITY_FIELD_LABELS[field] })),
  ]

  return (
    <AppModal opened={opened} onClose={onClose} title="View">
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Group by
          </Text>
          <SegmentedControl
            value={filters.groupBy}
            onChange={(value) => filters.setGroupBy(value as GroupBy)}
            data={[
              { label: 'Week', value: 'week' },
              { label: 'None', value: 'none' },
            ]}
          />
          {filters.sortColumn !== 'occurred_at' && (
            <Text size="xs" c="dimmed">
              Grouping is off while sorting by a field.
            </Text>
          )}
        </Stack>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Sort
          </Text>
          <Select
            data={sortOptions}
            value={filters.sortColumn}
            onChange={(value) => value && filters.setSort(value as ActivitySort, 'desc')}
            allowDeselect={false}
          />
          <SegmentedControl
            value={filters.order}
            onChange={(value) => filters.setSort(filters.sortColumn, value as 'asc' | 'desc')}
            data={
              filters.sortColumn === 'occurred_at'
                ? [
                    { label: 'Newest first', value: 'desc' },
                    { label: 'Oldest first', value: 'asc' },
                  ]
                : [
                    { label: 'Highest first', value: 'desc' },
                    { label: 'Lowest first', value: 'asc' },
                  ]
            }
          />
        </Stack>

        <Divider />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Fields
          </Text>
          <ColumnPickerPanel
            allColumns={FIELD_OPTIONS}
            orderedVisible={filters.fields}
            onToggle={(key) => filters.toggleField(key as ActivityField)}
            onReorder={(activeKey, overKey) => filters.reorderColumn(activeKey as ActivityField, overKey as ActivityField)}
            maxVisible={MAX_ACTIVITY_FIELDS}
          />
        </Stack>
      </Stack>
    </AppModal>
  )
}
