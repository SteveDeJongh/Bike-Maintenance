import type { CSSProperties } from 'react'
import { Button } from '@mantine/core'
import { notesPillLabel, type SetupRow } from './bikeSetupModel'

// The Notes cell: "+ Notes", "1 note" (typed but hidden) or "Hide notes".
export default function NotesPill({
  row,
  ariaLabel,
  onToggle,
  style,
}: {
  row: Pick<SetupRow, 'notes' | 'notesExpanded'>
  ariaLabel: string
  onToggle: () => void
  style?: CSSProperties
}) {
  return (
    <Button
      size="compact-xs"
      radius="xl"
      variant="outline"
      color="gray"
      aria-label={ariaLabel}
      aria-expanded={row.notesExpanded}
      onClick={onToggle}
      style={style}
    >
      {notesPillLabel(row)}
    </Button>
  )
}
