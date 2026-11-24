import { useState, type CSSProperties } from 'react'
import { Button, type ButtonProps } from '@mantine/core'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import { primarySatisfier } from '../../utils/serviceInterval'
import type { DashboardRequirementItem } from '../../types/models'

// An Up next row's "Log service": MaintenanceEventFormModal for the item's
// component with its position-1 satisfier preselected. Shared by Home's
// UpNextRow and the bike page's BikeUpNextRow, so both log the same way.
export default function LogServiceForItemButton({
  item,
  size,
  variant,
  style,
}: {
  item: Pick<DashboardRequirementItem, 'component_id' | 'satisfiers'>
  size: ButtonProps['size']
  variant: ButtonProps['variant']
  style?: CSSProperties
}) {
  const [opened, setOpened] = useState(false)

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpened(true)} style={style}>
        Log service
      </Button>
      <MaintenanceEventFormModal
        opened={opened}
        onClose={() => setOpened(false)}
        defaultComponentId={item.component_id}
        defaultServiceTypeId={primarySatisfier(item.satisfiers)?.service_type_id}
      />
    </>
  )
}
