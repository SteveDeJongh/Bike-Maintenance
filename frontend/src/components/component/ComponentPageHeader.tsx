import { Fragment, useState } from 'react'
import { ActionIcon, Anchor, Badge, Button, Group, Menu, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconChevronLeft, IconDots } from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router-dom'
import { useDeleteComponent, useUnretireComponent } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import { confirmDelete } from '../confirmDelete'
import ComponentFormModal from '../forms/ComponentFormModal'
import MaintenanceEventFormModal from '../forms/MaintenanceEventFormModal'
import RetireComponentModal from '../forms/RetireComponentModal'
import { categoryLabel, SERVICE_STATUS_COLORS } from '../../constants'
import { formatShortDate } from '../../utils/datetime'
import { componentPlacement, identityParts, placementText, worstRequirementStatus } from './componentPageModel'
import type { ComponentDetail, ServiceStatus } from '../../types/models'

const STATUS_LABELS: Record<ServiceStatus, string> = { due: 'Due', warning: 'Soon', ok: 'OK' }

function BikeLinks({ bikes }: { bikes: { id: number; name: string }[] }) {
  return (
    <>
      {bikes.map((bike, index) => (
        <Fragment key={bike.id}>
          {index > 0 && ', '}
          <Anchor component={Link} to={`/bikes/${bike.id}`} inherit>
            {bike.name}
          </Anchor>
        </Fragment>
      ))}
    </>
  )
}

// The placement, with its bikes linked: "On Soloist since Oct 15 · All
// rides", "Spare · last on Soloist", "Never installed".
function Placement({ component }: { component: ComponentDetail }) {
  const placement = componentPlacement(component)
  if (placement.kind === 'installed') {
    return (
      <>
        On <BikeLinks bikes={placement.bikes} />
        {placement.since && ` since ${formatShortDate(placement.since)}`} · {placement.rideContext}
      </>
    )
  }
  if (!placement.lastBike) return <>{placementText(placement)}</>
  return (
    <>
      {placement.kind === 'spare' ? 'Spare · last on ' : 'Last on '}
      <BikeLinks bikes={[placement.lastBike]} />
    </>
  )
}

// The component page's top: a "← Components" link, the label with its
// category and status chips ("Retired <date>" once retired), a dimmed line
// (brand/model · acquired · where it is), the notes, and the actions -- Log
// service, Edit, Retire / Un-retire, and a ⋯ menu with Install on bike… (not
// for a retired component: no onInstallOnBike) and Delete, enabled only for
// a component with no history.
export default function ComponentPageHeader({
  component,
  onInstallOnBike,
}: {
  component: ComponentDetail
  onInstallOnBike?: () => void
}) {
  const navigate = useNavigate()
  const deleteComponent = useDeleteComponent()
  const unretire = useUnretireComponent(component.id)
  const [logOpened, setLogOpened] = useState(false)
  const [editOpened, setEditOpened] = useState(false)
  const [retireOpened, setRetireOpened] = useState(false)
  const status = worstRequirementStatus(component.service_requirements)

  function confirmUnretire() {
    modals.openConfirmModal({
      title: 'Un-retire component',
      children: (
        <Text size="sm">
          Un-retire this component? It won't be put back on a bike — install it again from the bike page if needed.
        </Text>
      ),
      labels: { confirm: 'Un-retire', cancel: 'Cancel' },
      onConfirm: () => unretire.mutate(),
    })
  }

  function handleDelete() {
    confirmDelete({
      title: 'Delete component',
      message: `Delete "${component.label}"? It has no installations or maintenance, so nothing else is lost.`,
      onConfirm: () =>
        deleteComponent.mutate(component.id, {
          onSuccess: () => navigate('/components'),
          onError: (error) => notifications.show({ color: 'red', title: 'Could not delete', message: formatApiError(error) }),
        }),
    })
  }

  return (
    <Stack gap="xs">
      <Anchor component={Link} to="/components" size="sm" c="dimmed" w="fit-content">
        <Group gap={2} wrap="nowrap">
          <IconChevronLeft size={14} />
          Components
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Title order={2} style={{ overflowWrap: 'anywhere' }}>
              {component.label}
            </Title>
            <Badge variant="default" tt="none" fw={500}>
              {categoryLabel(component.category)}
            </Badge>
            {component.retired_on ? (
              <Badge color="gray" variant="light" tt="none" fw={500}>
                Retired {formatShortDate(component.retired_on)}
              </Badge>
            ) : (
              status && (
                <Badge color={SERVICE_STATUS_COLORS[status]} variant="light" tt="none" fw={500}>
                  {STATUS_LABELS[status]}
                </Badge>
              )
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {identityParts(component).map((part) => (
              <Fragment key={part}>{part} · </Fragment>
            ))}
            <Placement component={component} />
          </Text>
          {component.notes && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
              {component.notes}
            </Text>
          )}
        </Stack>

        <Group gap="xs" wrap="wrap">
          <Button onClick={() => setLogOpened(true)}>Log service</Button>
          <Button variant="default" onClick={() => setEditOpened(true)}>
            Edit
          </Button>
          {component.retired_on ? (
            <Button variant="default" onClick={confirmUnretire} loading={unretire.isPending}>
              Un-retire
            </Button>
          ) : (
            <Button variant="default" onClick={() => setRetireOpened(true)}>
              Retire
            </Button>
          )}
          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Component actions">
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {onInstallOnBike && (
                <>
                  <Menu.Item onClick={onInstallOnBike}>Install on bike…</Menu.Item>
                  <Menu.Divider />
                </>
              )}
              <Menu.Item color="red" disabled={!component.deletable} onClick={handleDelete}>
                Delete component
              </Menu.Item>
              {!component.deletable && (
                <Text size="xs" c="dimmed" px="sm" pb={6}>
                  Has history. Retire it instead.
                </Text>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <MaintenanceEventFormModal opened={logOpened} onClose={() => setLogOpened(false)} defaultComponentId={component.id} />
      <ComponentFormModal opened={editOpened} onClose={() => setEditOpened(false)} component={component} />
      <RetireComponentModal opened={retireOpened} onClose={() => setRetireOpened(false)} componentId={component.id} />
    </Stack>
  )
}
