import { Alert, Badge, Button, Group, Select, Table, Text } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import ComponentFormModal from '../forms/ComponentFormModal'
import RideContextCheckboxes from '../RideContextCheckboxes'
import { useInstallComponentForm } from './useInstallComponentForm'
import { categoryLabel, RIDE_CONTEXT_LABELS } from '../../constants'
import { isoUtcToDate, mantineLocalStringToIsoUtc } from '../../utils/datetime'
import type { BikeComponentSlot, BikeDetail as BikeDetailData, Component } from '../../types/models'

export default function EmptySlotRow({
  bike,
  slot,
  hasHistory,
  components,
  activeAssignmentsElsewhereByComponentId,
  columnSpan,
}: {
  bike: BikeDetailData
  slot: BikeComponentSlot
  hasHistory: boolean
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
  columnSpan: number
}) {
  const {
    componentId,
    setComponentId,
    startedAt,
    setStartedAt,
    rideContext,
    setRideContext,
    createOpened,
    setCreateOpened,
    baseErrors,
    options,
    handleChange,
    assign,
    isAssigning,
    stopTracking,
    isStoppingTracking,
  } = useInstallComponentForm({ bike, slot, hasHistory, components, activeAssignmentsElsewhereByComponentId })

  return (
    <Table.Tr>
      <Table.Td>{categoryLabel(slot.category)}</Table.Td>
      <Table.Td>
        {slot.ride_context !== 'both' && (
          <Badge size="sm" color={slot.ride_context === 'indoor_only' ? 'grape' : 'blue'}>
            {RIDE_CONTEXT_LABELS[slot.ride_context]}
          </Badge>
        )}
      </Table.Td>
      <Table.Td colSpan={columnSpan}>
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <Select
            data={options}
            value={componentId}
            onChange={handleChange}
            placeholder="Pick a component"
            disabled={isAssigning}
          />
          <DateTimePicker
            label="Started"
            size="sm"
            value={isoUtcToDate(startedAt)}
            onChange={(value) => setStartedAt(mantineLocalStringToIsoUtc(value))}
          />
          {slot.ride_context === 'both' ? (
            <RideContextCheckboxes value={rideContext} onChange={setRideContext} />
          ) : (
            <Text size="sm" c="dimmed">
              {RIDE_CONTEXT_LABELS[slot.ride_context]}
            </Text>
          )}
          <Button
            size="sm"
            disabled={!componentId}
            loading={isAssigning}
            onClick={() => componentId && assign(Number(componentId))}
          >
            Install
          </Button>
        </Group>

        {baseErrors.length > 0 && (
          <Alert color="red" mt="xs">
            {baseErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}

        <ComponentFormModal
          opened={createOpened}
          onClose={() => setCreateOpened(false)}
          createDefaults={{ category: slot.category }}
          onCreateSuccess={(component) => setComponentId(String(component.id))}
        />
      </Table.Td>
      <Table.Td>
        <Group justify="flex-end">
          <Button size="xs" variant="subtle" loading={isStoppingTracking} onClick={stopTracking}>
            Stop tracking
          </Button>
        </Group>
      </Table.Td>
      <Table.Td />
    </Table.Tr>
  )
}
