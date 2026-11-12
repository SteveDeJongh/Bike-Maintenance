import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Anchor, Button, Group, Stack, UnstyledButton } from '@mantine/core'
import { useMaintenanceAlerts } from '../api/queries'
import { useDismissAllServiceAlerts, useDismissServiceAlert } from '../api/mutations'
import type { MaintenanceAlert, MaintenanceAlertScope } from '../types/models'

function itemLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

interface MaintenanceAlertBannersProps {
  scope: MaintenanceAlertScope
}

// Scoped to exactly one bike or one component -- its only two renderers are
// BikeDetail (alerts for components currently mounted on that bike) and
// ComponentDetail (alerts for that component only). Removed from Layout.tsx:
// the Dashboard's "Needs attention" panel is the app-wide overview now.
export default function MaintenanceAlertBanners({ scope }: MaintenanceAlertBannersProps) {
  const { data: alerts } = useMaintenanceAlerts(scope)
  if (!alerts || alerts.length === 0) return null

  const due = alerts.filter((a) => a.status === 'due')
  const warning = alerts.filter((a) => a.status === 'warning')
  // On a component page every item is already this one component -- the
  // component_label would just repeat the page title, so items read just
  // the service type, and the title counts services rather than components
  // (otherwise "2 components due" would be wrong when it's actually one
  // component with two overdue service types).
  const compact = 'componentId' in scope

  return (
    <Stack gap="xs" mb="md">
      {due.length > 0 && <DueBanner items={due} scope={scope} compact={compact} />}
      {warning.length > 0 && <WarningBanner items={warning} scope={scope} compact={compact} />}
    </Stack>
  )
}

function AlertItemRow({
  item,
  compact,
  onDismiss,
  dismissing,
}: {
  item: MaintenanceAlert
  compact: boolean
  onDismiss: () => void
  dismissing: boolean
}) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Anchor component={Link} to={`/components/${item.component_id}`}>
        {compact ? `${item.service_type_name} — ${item.status}` : `${item.component_label} — ${item.service_type_name}`}
      </Anchor>
      <Button size="xs" variant="subtle" loading={dismissing} onClick={onDismiss}>
        Dismiss until next sync
      </Button>
    </Group>
  )
}

function DueBanner({
  items,
  scope,
  compact,
}: {
  items: MaintenanceAlert[]
  scope: MaintenanceAlertScope
  compact: boolean
}) {
  const dismissOne = useDismissServiceAlert()
  const dismissAll = useDismissAllServiceAlerts(scope)
  const title = compact ? `${itemLabel(items.length, 'service')} due` : `${itemLabel(items.length, 'component')} due for service`

  return (
    <Alert color="red" title={title}>
      <Stack gap="xs">
        {items.map((item) => (
          <AlertItemRow
            key={item.component_service_interval_id}
            item={item}
            compact={compact}
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
function WarningBanner({
  items,
  scope,
  compact,
}: {
  items: MaintenanceAlert[]
  scope: MaintenanceAlertScope
  compact: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const dismissOne = useDismissServiceAlert()
  const dismissAll = useDismissAllServiceAlerts(scope)
  const title = compact
    ? `${itemLabel(items.length, 'service')} approaching`
    : `${itemLabel(items.length, 'component')} approaching service`

  return (
    <Alert
      color="yellow"
      title={
        <UnstyledButton onClick={() => setExpanded((v) => !v)}>
          {title} {expanded ? '▲' : '▼'}
        </UnstyledButton>
      }
    >
      {expanded && (
        <Stack gap="xs">
          {items.map((item) => (
            <AlertItemRow
              key={item.component_service_interval_id}
              item={item}
              compact={compact}
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
