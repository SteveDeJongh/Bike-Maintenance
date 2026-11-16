import { IconArrowBarUp, IconArrowsExchange, IconBike, IconTool, type Icon } from '@tabler/icons-react'
import type { ActivityItem, ActivityRideItem } from '../../types/models'

export function activityItemIconMeta(item: ActivityItem): { Icon: Icon; label: string } {
  switch (item.kind) {
    case 'ride':
      return { Icon: IconBike, label: 'Ride' }
    case 'service_session':
    case 'maintenance_event':
      return { Icon: IconTool, label: 'Service' }
    case 'setup_change':
      return { Icon: item.action === 'removed' ? IconArrowBarUp : IconArrowsExchange, label: 'Setup change' }
  }
}

export function nonRideNote(item: ActivityItem): string | null {
  if (item.kind === 'maintenance_event') return item.note
  if (item.kind === 'service_session') return item.notes
  return null
}

// "Log service after this ride" prefills the session's performed_at at the
// ride's end, not its start -- the maintenance happened after riding it.
export function initialPerformedAtForRide(ride: ActivityRideItem): string {
  const movedAtMs = new Date(ride.moved_at).getTime()
  const elapsedMs = (ride.elapsed_time ?? 0) * 1000
  return new Date(movedAtMs + elapsedMs).toISOString()
}
