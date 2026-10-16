import { useState } from 'react'
import { ActionIcon, Checkbox, Divider, Group, Popover, Stack, Text, Tooltip } from '@mantine/core'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface ColumnOption {
  key: string
  label: string
}

interface ColumnPickerProps {
  allColumns: ColumnOption[]
  orderedVisible: string[]
  onToggle: (key: string) => void
  onReorder: (activeKey: string, overKey: string) => void
}

// The "+" column picker, reused by any sortable/configurable table: a popover
// with a draggable "Visible" section (current order) and a static
// "Available" section. Drag-and-drop lives only here, never on the live
// table headers, so there's no gesture conflict with click-to-sort.
export default function ColumnPicker({ allColumns, orderedVisible, onToggle, onReorder }: ColumnPickerProps) {
  const [opened, setOpened] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const labelByKey = new Map(allColumns.map((column) => [column.key, column.label]))
  const visible = orderedVisible.map((key) => ({ key, label: labelByKey.get(key) ?? key }))
  const available = allColumns.filter((column) => !orderedVisible.includes(column.key))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id))
    }
  }

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Tooltip label="Choose columns">
          <ActionIcon variant="default" aria-label="Choose columns" onClick={() => setOpened((o) => !o)}>
            +
          </ActionIcon>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="xs" w={220}>
          <Text size="xs" fw={600} c="dimmed">
            Visible
          </Text>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visible.map((column) => column.key)} strategy={verticalListSortingStrategy}>
              <Stack gap={4}>
                {visible.map((column) => (
                  <DraggableColumnRow
                    key={column.key}
                    columnKey={column.key}
                    label={column.label}
                    onToggle={onToggle}
                  />
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
              <Stack gap={4}>
                {available.map((column) => (
                  <Checkbox
                    key={column.key}
                    label={column.label}
                    checked={false}
                    onChange={() => onToggle(column.key)}
                  />
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: columnKey })

  return (
    <Group
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      gap="xs"
      wrap="nowrap"
    >
      <Text span style={{ cursor: 'grab', touchAction: 'none' }} {...attributes} {...listeners}>
        {'⠿'}
      </Text>
      <Checkbox label={label} checked onChange={() => onToggle(columnKey)} style={{ flex: 1 }} />
    </Group>
  )
}
