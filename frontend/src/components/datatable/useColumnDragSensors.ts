import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core'

// A small activation distance so a plain click doesn't register as a drag
// attempt — shared by the picker's popover and the live table's header row.
export function useColumnDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
}
