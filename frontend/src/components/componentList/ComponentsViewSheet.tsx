import { SegmentedControl, Select, Stack, Text } from '@mantine/core'
import AppModal from '../AppModal'
import { COMPONENT_LIST_FIELD_LABELS, COMPONENT_LIST_SORTS, type ComponentListSort } from '../../constants'
import { GROUP_BY_OPTIONS, sortDirectionOptions, type ComponentGroupBy } from './componentListModel'
import type { ComponentsView } from './useComponentsView'

const SORT_LABELS: Record<ComponentListSort, string> = {
  component: 'Component',
  bike: 'Bike',
  service: 'Service',
  ...COMPONENT_LIST_FIELD_LABELS,
}

// The phone's "View" sheet: Group by and Sort (there are no column headers
// to click on a phone), in one AppModal (full-screen there). Fields aren't
// offered: phone rows don't show field columns.
export default function ComponentsViewSheet({
  opened,
  onClose,
  view,
}: {
  opened: boolean
  onClose: () => void
  view: ComponentsView
}) {
  const { sortColumn, sortDirection, setSort } = view.table

  return (
    <AppModal opened={opened} onClose={onClose} title="View">
      <Stack gap="md">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Group by
          </Text>
          <SegmentedControl
            value={view.groupBy}
            onChange={(value) => view.setGroupBy(value as ComponentGroupBy)}
            data={GROUP_BY_OPTIONS}
          />
        </Stack>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Sort
          </Text>
          <Select
            data={COMPONENT_LIST_SORTS.map((column) => ({ value: column, label: SORT_LABELS[column] }))}
            value={sortColumn}
            onChange={(value) => {
              if (!value) return
              const column = value as ComponentListSort
              setSort(column, sortDirectionOptions(column)[0].value)
            }}
            allowDeselect={false}
          />
          <SegmentedControl
            value={sortDirection}
            onChange={(value) => setSort(sortColumn, value as 'asc' | 'desc')}
            data={sortDirectionOptions(sortColumn)}
          />
        </Stack>
      </Stack>
    </AppModal>
  )
}
