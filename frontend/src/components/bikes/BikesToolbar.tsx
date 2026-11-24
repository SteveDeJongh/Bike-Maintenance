import { Checkbox, Group, Paper, SegmentedControl } from '@mantine/core'
import FieldsPicker from '../datalist/FieldsPicker'
import { BIKE_CARD_SORTS, BIKE_CARD_SORT_LABELS, type BikeCardSort, type BikesView } from './bikesList'
import type { BikesViewState } from './useBikesView'
import type { ColumnOption } from '../datatable/ColumnPicker'
import type { BikeListColumn } from '../../constants'

// Left: Cards | Table, then (cards) the card sort. Right: Show retired
// bikes, then (table) Fields. A phone always gets cards, so the switch and
// Fields are hidden there.
export default function BikesToolbar({ state, fieldOptions }: { state: BikesViewState; fieldOptions: ColumnOption[] }) {
  const cards = state.view === 'cards'

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            size="xs"
            radius="xl"
            visibleFrom="sm"
            value={state.view}
            onChange={(value) => state.setView(value as BikesView)}
            data={[
              { label: 'Cards', value: 'cards' },
              { label: 'Table', value: 'table' },
            ]}
          />
          {/* On a phone cards always show, so the sort does too. */}
          <SegmentedControl
            size="xs"
            radius="xl"
            hiddenFrom={cards ? undefined : 'sm'}
            value={state.cardSort}
            onChange={(value) => state.setCardSort(value as BikeCardSort)}
            data={BIKE_CARD_SORTS.map((sort) => ({ label: BIKE_CARD_SORT_LABELS[sort], value: sort }))}
            aria-label="Sort bikes"
          />
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Checkbox
            size="sm"
            label="Show retired bikes"
            checked={state.showRetired}
            onChange={(event) => state.setShowRetired(event.currentTarget.checked)}
          />
          {!cards && (
            <Group visibleFrom="sm">
              <FieldsPicker
                all={fieldOptions}
                visible={state.table.orderedColumns}
                onToggle={(key) => state.table.toggleColumn(key as BikeListColumn)}
                onReorder={(activeKey, overKey) => state.table.reorderColumn(activeKey as BikeListColumn, overKey as BikeListColumn)}
              />
            </Group>
          )}
        </Group>
      </Group>
    </Paper>
  )
}
