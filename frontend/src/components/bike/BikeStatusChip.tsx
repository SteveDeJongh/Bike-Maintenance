import { Badge, Group } from '@mantine/core'
import { SERVICE_STATUS_COLORS } from '../../constants'

// A bike's service chip: "1 due" red and/or "2 soon" orange, or "All OK"
// teal. The counts are its mounted components by worst status -- Home's
// card (bikeStatusCounts) and the Bikes list (status_counts) both pass them.
export default function BikeStatusChip({ due, warning }: { due: number; warning: number }) {
  if (due === 0 && warning === 0) {
    return (
      <Badge color={SERVICE_STATUS_COLORS.ok} variant="light">
        All OK
      </Badge>
    )
  }
  return (
    <Group gap={4} wrap="nowrap">
      {due > 0 && (
        <Badge color={SERVICE_STATUS_COLORS.due} variant="light">
          {due} due
        </Badge>
      )}
      {warning > 0 && (
        <Badge color={SERVICE_STATUS_COLORS.warning} variant="light">
          {warning} soon
        </Badge>
      )}
    </Group>
  )
}
