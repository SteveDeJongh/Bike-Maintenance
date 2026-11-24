import { Badge, Text } from '@mantine/core'
import { RIDE_CONTEXT_LABELS } from '../constants'
import type { ComponentAssignment } from '../types/models'

// An installation's ride context. Indoor-only and outdoor-only get a
// coloured chip; a both context is plain dimmed "All rides" (`showBoth`),
// or nothing where it would only repeat the default (beside a swap pill).
// Shared by the bike page's installed components and the installation modal.
export default function RideContextChip({
  rideContext,
  showBoth = false,
}: {
  rideContext: ComponentAssignment['ride_context']
  showBoth?: boolean
}) {
  if (rideContext === 'both') {
    return showBoth ? (
      <Text span size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {RIDE_CONTEXT_LABELS.both}
      </Text>
    ) : null
  }
  return (
    <Badge size="sm" color={rideContext === 'indoor_only' ? 'grape' : 'blue'}>
      {RIDE_CONTEXT_LABELS[rideContext]}
    </Badge>
  )
}
