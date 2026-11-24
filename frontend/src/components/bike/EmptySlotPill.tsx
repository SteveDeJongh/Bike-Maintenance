import { Button, Menu } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import ComponentFormModal from '../forms/ComponentFormModal'
import { useInstallComponentForm } from './useInstallComponentForm'
import type { BikeComponentSlot, BikeDetail, Component } from '../../types/models'

// An empty slot's control on the installed-components list: a dashed pill
// whose menu installs a component straight away (like the swap pill), makes
// a new one (then installs it), or stops tracking the slot.
export default function EmptySlotPill({
  bike,
  slot,
  hasHistory,
  components,
  activeAssignmentsElsewhereByComponentId,
}: {
  bike: BikeDetail
  slot: BikeComponentSlot
  hasHistory: boolean
  components: Component[]
  activeAssignmentsElsewhereByComponentId: Map<number, ('both' | 'outdoor_only' | 'indoor_only')[]>
}) {
  const { options, createLabel, install, isInstalling, createOpened, setCreateOpened, stopTracking, isStoppingTracking } =
    useInstallComponentForm({ bike, slot, hasHistory, components, activeAssignmentsElsewhereByComponentId })

  return (
    <>
      <Menu position="bottom-start" shadow="md" withinPortal>
        <Menu.Target>
          <Button
            size="xs"
            radius="xl"
            variant="default"
            loading={isInstalling || isStoppingTracking}
            rightSection={<IconChevronDown size={12} />}
            styles={{ root: { borderStyle: 'dashed', fontWeight: 400 } }}
            c="dimmed"
          >
            Empty · choose a component
          </Button>
        </Menu.Target>
        <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
          {options.length === 0 && <Menu.Label>No spare components</Menu.Label>}
          {options.map((option) => (
            <Menu.Item key={option.value} onClick={() => install(Number(option.value))}>
              {option.label}
            </Menu.Item>
          ))}
          <Menu.Item onClick={() => setCreateOpened(true)}>{createLabel}</Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" onClick={stopTracking}>
            Stop tracking this slot
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ComponentFormModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
        createDefaults={{ category: slot.category }}
        onCreateSuccess={(component) => install(component.id)}
      />
    </>
  )
}
