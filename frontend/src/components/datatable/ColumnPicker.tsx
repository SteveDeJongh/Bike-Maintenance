import { useState, type ReactNode } from 'react'
import { ActionIcon, Checkbox, Divider, Group, Popover, Stack, Text, Tooltip } from '@mantine/core'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { IconLock } from '@tabler/icons-react'
import { fieldPickerState } from '../datalist/dataListModel'
import { useColumnDragHandle } from './useColumnDragHandle'
import { useColumnDragSensors } from './useColumnDragSensors'

export interface ColumnOption {
  key: string
  label: string
}

interface ColumnPickerPanelProps {
  allColumns: ColumnOption[]
  orderedVisible: string[]
  onToggle: (key: string) => void
  onReorder: (activeKey: string, overKey: string) => void
  // At most this many visible; further "Available" checkboxes disable,
  // with a hint. Omitted: no cap (every configurable table today).
  maxVisible?: number
  // Always-shown fields (a DataList's), listed first as checked, disabled
  // rows with a lock -- never dragged, never counted toward maxVisible.
  // Omitted: none (every configurable table today).
  lockedColumns?: ColumnOption[]
}

interface ColumnPickerProps extends ColumnPickerPanelProps {
  // Replaces the default "+" trigger (e.g. the Activity page's "Fields"
  // button); receives the toggle to call on click.
  renderTarget?: (toggle: () => void) => ReactNode
}

// The "+" column picker, reused by any sortable/configurable table: a popover
// with a draggable "Visible" section (current order) and a static
// "Available" section. Drag-and-drop lives only here, never on the live
// table headers, so there's no gesture conflict with click-to-sort.
export default function ColumnPicker({ renderTarget, ...panelProps }: ColumnPickerProps) {
  const [opened, setOpened] = useState(false)
  const toggle = () => setOpened((o) => !o)

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        {renderTarget ? (
          renderTarget(toggle)
        ) : (
          <Tooltip label="Choose columns">
            <ActionIcon variant="default" aria-label="Choose columns" onClick={toggle}>
              +
            </ActionIcon>
          </Tooltip>
        )}
      </Popover.Target>

      <Popover.Dropdown>
        <ColumnPickerPanel {...panelProps} />
      </Popover.Dropdown>
    </Popover>
  )
}

// The checklist itself -- a draggable "Visible" section (current order) and
// a static "Available" section -- usable outside the popover too (the
// Activity page's phone "View" sheet).
export function ColumnPickerPanel({
  allColumns,
  orderedVisible,
  onToggle,
  onReorder,
  maxVisible,
  lockedColumns,
}: ColumnPickerPanelProps) {
  const sensors = useColumnDragSensors()

  const { locked, visible, available, atCap } = fieldPickerState({
    all: allColumns,
    visible: orderedVisible,
    locked: lockedColumns,
    cap: maxVisible,
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id))
    }
  }

  return (
    <Stack gap="xs" w={220}>
      <Text size="xs" fw={600} c="dimmed">
        Visible
      </Text>

      {locked.length > 0 && (
        <Stack gap={4}>
          {locked.map((column) => (
            <Group key={column.key} gap="xs" wrap="nowrap">
              <IconLock size={14} aria-label="Always shown" style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }} />
              <Checkbox label={column.label} checked disabled readOnly style={{ flex: 1 }} />
            </Group>
          ))}
        </Stack>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((column) => column.key)} strategy={verticalListSortingStrategy}>
          <Stack gap={4}>
            {visible.map((column) => (
              <DraggableColumnRow key={column.key} columnKey={column.key} label={column.label} onToggle={onToggle} />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      {available.length > 0 && (
        <>
          <Divider />
          <Text size="xs" fw={600} c="dimmed">
            Available
          </Text>
          {atCap && (
            <Text size="xs" c="dimmed">
              Up to {maxVisible} shown. Uncheck one to add another.
            </Text>
          )}
          <Stack gap={4}>
            {available.map((column) => (
              <Checkbox
                key={column.key}
                label={column.label}
                checked={false}
                disabled={atCap}
                onChange={() => onToggle(column.key)}
              />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  )
}

function DraggableColumnRow({
  columnKey,
  label,
  onToggle,
}: {
  columnKey: string
  label: string
  onToggle: (key: string) => void
}) {
  const { setNodeRef, containerStyle, handleProps } = useColumnDragHandle(columnKey)

  return (
    <Group ref={setNodeRef} style={containerStyle} gap="xs" wrap="nowrap">
      <Text span {...handleProps}>
        {'⠿'}
      </Text>
      <Checkbox label={label} checked onChange={() => onToggle(columnKey)} style={{ flex: 1 }} />
    </Group>
  )
}
