import { Divider, Group, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import AppModal from '../AppModal'
import { ColumnPickerPanel } from '../datatable/ColumnPicker'
import { Pill } from '../toolbar/ToolbarPills'
import {
  FIELD_OPTIONS,
  MAINTENANCE_FIELD_LABELS,
  MAX_MAINTENANCE_FIELDS,
  SORTABLE_MAINTENANCE_FIELDS,
  type MaintenanceField,
  type MaintenanceSort,
} from './maintenanceLogFields'
import { GROUP_BY_OPTIONS, MAINTENANCE_KIND_LABELS, MAINTENANCE_KINDS, type MaintenanceGroupBy } from './maintenanceLogModel'
import type { MaintenanceLogView } from './useMaintenanceLogView'
import type { MaintenanceLogMeta } from '../../types/models'

const SORT_OPTIONS = [
  { value: 'performed_at', label: 'Date' },
  ...SORTABLE_MAINTENANCE_FIELDS.map((field) => ({ value: field, label: MAINTENANCE_FIELD_LABELS[field] })),
]

// The phone's "View" sheet: the kind pills, Group by, Sort (a phone has
// no column headers to click) and Fields, in one AppModal (full-screen
// there).
export default function MaintenanceLogViewSheet({
  opened,
  onClose,
  view,
  kindCounts,
}: {
  opened: boolean
  onClose: () => void
  view: MaintenanceLogView
  kindCounts: MaintenanceLogMeta['kind_counts'] | undefined
}) {
  return (
    <AppModal opened={opened} onClose={onClose} title="View">
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Show
          </Text>
          <Group gap="xs">
            {MAINTENANCE_KINDS.map((kind) => (
              <Pill key={kind} active={view.kinds.includes(kind)} onClick={() => view.toggleKind(kind)}>
                {MAINTENANCE_KIND_LABELS[kind]} · {kindCounts?.[kind] ?? 0}
              </Pill>
            ))}
          </Group>
        </Stack>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Group by
          </Text>
          <SegmentedControl
            value={view.groupBy}
            onChange={(value) => view.setGroupBy(value as MaintenanceGroupBy)}
            data={GROUP_BY_OPTIONS}
          />
          {view.sortColumn !== 'performed_at' && (
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
            data={SORT_OPTIONS}
            value={view.sortColumn}
            onChange={(value) => value && view.setSort(value as MaintenanceSort, 'desc')}
            allowDeselect={false}
          />
          <SegmentedControl
            value={view.order}
            onChange={(value) => view.setSort(view.sortColumn, value as 'asc' | 'desc')}
            data={
              view.sortColumn === 'performed_at'
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
            orderedVisible={view.fields}
            onToggle={(key) => view.toggleField(key as MaintenanceField)}
            onReorder={(activeKey, overKey) => view.reorderColumn(activeKey as MaintenanceField, overKey as MaintenanceField)}
            maxVisible={MAX_MAINTENANCE_FIELDS}
          />
        </Stack>
      </Stack>
    </AppModal>
  )
}
