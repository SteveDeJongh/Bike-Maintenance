import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Anchor, Button, Group, Stack, UnstyledButton } from '@mantine/core'
import { useMaintenanceAlerts } from '../api/queries'
import { useDismissAllServiceAlerts, useDismissServiceAlert } from '../api/mutations'
import type { MaintenanceAlert } from '../types/models'

function itemLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export default function MaintenanceAlertBanners() {
  const { data: alerts } = useMaintenanceAlerts()
  if (!alerts || alerts.length === 0) return null

  const due = alerts.filter((a) => a.status === 'due')
  const warning = alerts.filter((a) => a.status === 'warning')

  return (
    <Stack gap="xs" mb="md">
      {due.length > 0 && <DueBanner items={due} />}
      {warning.length > 0 && <WarningBanner items={warning} />}
    </Stack>
  )
}

function AlertItemRow({ item, onDismiss, dismissing }: { item: MaintenanceAlert; onDismiss: () => void; dismissing: boolean }) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor component={Link} to={`/components/${item.component_id}`}>
        {item.component_label} — {item.service_type_name}
      </Anchor>
      <Button size="xs" variant="subtle" loading={dismissing} onClick={onDismiss}>
        Dismiss until next sync
      </Button>
    </Group>
  )
}

function DueBanner({ items }: { items: MaintenanceAlert[] }) {
  const dismissOne = useDismissServiceAlert()
  const dismissAll = useDismissAllServiceAlerts()

  return (
    <Alert color="red" title={`${itemLabel(items.length, 'component')} due for service`}>
      <Stack gap="xs">
        {items.map((item) => (
          <AlertItemRow
            key={item.component_service_interval_id}
            item={item}
            dismissing={dismissOne.isPending && dismissOne.variables === item.component_service_interval_id}
            onDismiss={() => dismissOne.mutate(item.component_service_interval_id)}
          />
        ))}
        <Group justify="flex-end">
          <Button size="xs" variant="subtle" color="red" loading={dismissAll.isPending} onClick={() => dismissAll.mutate('due')}>
            Dismiss all
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}

// Collapsed to just a count by default -- click the title to expand the
// full list, same per-item/"dismiss all" controls as the due banner.
function WarningBanner({ items }: { items: MaintenanceAlert[] }) {
  const [expanded, setExpanded] = useState(false)
  const dismissOne = useDismissServiceAlert()
  const dismissAll = useDismissAllServiceAlerts()

  return (
    <Alert
      color="yellow"
      title={
        <UnstyledButton onClick={() => setExpanded((v) => !v)}>
          {itemLabel(items.length, 'component')} approaching service {expanded ? '▲' : '▼'}
        </UnstyledButton>
      }
    >
      {expanded && (
        <Stack gap="xs">
          {items.map((item) => (
            <AlertItemRow
              key={item.component_service_interval_id}
              item={item}
              dismissing={dismissOne.isPending && dismissOne.variables === item.component_service_interval_id}
              onDismiss={() => dismissOne.mutate(item.component_service_interval_id)}
            />
          ))}
          <Group justify="flex-end">
            <Button size="xs" variant="subtle" loading={dismissAll.isPending} onClick={() => dismissAll.mutate('warning')}>
              Dismiss all
            </Button>
          </Group>
        </Stack>
      )}
    </Alert>
  )
}
