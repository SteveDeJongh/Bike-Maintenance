import { Badge } from '@mantine/core'
import { SERVICE_STATUS_COLORS } from '../constants'
import type { ServiceStatus } from '../types/models'

// null (no enabled service interval at all) renders as a dash, not a badge
// -- distinct from 'ok', which means intervals exist and none are close.
export default function ServiceStatusBadge({ status }: { status: ServiceStatus | null }) {
  if (!status) return <>—</>
  return <Badge color={SERVICE_STATUS_COLORS[status]}>{status}</Badge>
}
