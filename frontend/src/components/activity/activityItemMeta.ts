import { IconArrowBarUp, IconArrowsExchange, IconBike, IconTool, type Icon } from '@tabler/icons-react'
import type { ActivityItem } from '../../types/models'

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

