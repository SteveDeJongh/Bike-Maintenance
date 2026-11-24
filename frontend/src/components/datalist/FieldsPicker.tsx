import { Button } from '@mantine/core'
import { IconColumns } from '@tabler/icons-react'
import ColumnPicker, { type ColumnOption } from '../datatable/ColumnPicker'

// A DataList's "Fields" pill: the shared ColumnPicker popover (drag to
// reorder, a cap, and optional always-shown fields listed as locked).
// Saving stays with the caller's preference hook (onToggle/onReorder).
export default function FieldsPicker({
  all,
  visible,
  locked,
  cap,
  onToggle,
  onReorder,
  buttonLabel = 'Fields',
}: {
  all: ColumnOption[]
  visible: string[]
  locked?: ColumnOption[]
  cap?: number
  onToggle: (key: string) => void
  onReorder: (activeKey: string, overKey: string) => void
  buttonLabel?: string
}) {
  return (
    <ColumnPicker
      allColumns={all}
      orderedVisible={visible}
      lockedColumns={locked}
      onToggle={onToggle}
      onReorder={onReorder}
      maxVisible={cap}
      renderTarget={(toggle) => (
        <Button size="xs" radius="xl" variant="default" leftSection={<IconColumns size={14} />} onClick={toggle}>
          {buttonLabel}
        </Button>
      )}
    />
  )
}
