import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Shared by the picker's popover rows and the live table's draggable headers:
// a drag handle is kept separate from the column's own click target (a
// checkbox label in the popover, a sort-click label in the header) so
// dragging and clicking never contend over the same gesture.
export function useColumnDragHandle(columnKey: string) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: columnKey })

  return {
    setNodeRef,
    containerStyle: {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    },
    handleProps: {
      ...attributes,
      ...listeners,
      style: { cursor: 'grab', touchAction: 'none' },
    },
  }
}
