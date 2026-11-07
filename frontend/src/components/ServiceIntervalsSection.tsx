import { useState } from 'react'
import { ActionIcon, Alert, Button, Checkbox, Group, Menu, Progress, Stack, Switch, Table, Text, Title } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { useCategoryServiceIntervals, useServiceTypes } from '../api/queries'
import { SERVICE_STATUS_COLORS } from '../constants'
import { useApplyDefaultComponentServiceIntervals, useDeleteComponentServiceInterval, useUpdateComponentServiceInterval } from '../api/mutations'
import { formatApiError } from '../api/errors'
import { confirmDelete } from './confirmDelete'
import ServiceStatusBadge from './ServiceStatusBadge'
import AddCustomServiceIntervalModal from './forms/AddCustomServiceIntervalModal'
import EditServiceIntervalModal from './forms/EditServiceIntervalModal'
import MaintenanceEventFormModal from './forms/MaintenanceEventFormModal'
import { formatInterval, formatRemaining } from '../utils/serviceInterval'
import type { CategoryServiceInterval, ComponentDetail, ComponentServiceIntervalWithStatus } from '../types/models'

interface ServiceIntervalsSectionProps {
  component: ComponentDetail
}

// Below this width (the section's own measured width, not the viewport --
// this section renders inside AssignmentDetailModal, which is narrower than
// the window), Edit/Remove collapse into a single "..." menu so the row
// doesn't force the table wider than it needs to be.
const NARROW_ACTIONS_THRESHOLD = 700

export default function ServiceIntervalsSection({ component }: ServiceIntervalsSectionProps) {
  const { ref, width } = useElementSize()
  const narrow = width > 0 && width < NARROW_ACTIONS_THRESHOLD
  const { data: categoryTemplates } = useCategoryServiceIntervals()
  const [customModalOpened, setCustomModalOpened] = useState(false)
  const [addDefaultsOpened, setAddDefaultsOpened] = useState(false)
  const [logServiceInterval, setLogServiceInterval] = useState<ComponentServiceIntervalWithStatus | null>(null)

  const availableTemplates = (categoryTemplates ?? []).filter(
    (template) =>
      template.category === component.category &&
      !component.service_intervals.some((interval) => interval.service_type_id === template.service_type_id),
  )

  return (
    <Stack ref={ref}>
      <Group justify="space-between">
        <Title order={3}>Service intervals</Title>
        <Group>
          <Button variant="default" onClick={() => setCustomModalOpened(true)}>
            + Add custom interval
          </Button>
          <Button
            variant="default"
            onClick={() => setAddDefaultsOpened((v) => !v)}
            disabled={availableTemplates.length === 0}
          >
            + Add from category defaults
          </Button>
        </Group>
      </Group>

      {component.service_intervals.length === 0 && <Text c="dimmed">No service intervals set up yet.</Text>}

      {component.service_intervals.length > 0 && (
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Service type</Table.Th>
                <Table.Th>Interval</Table.Th>
                <Table.Th>Progress</Table.Th>
                <Table.Th>Remaining</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Enabled</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {component.service_intervals.map((interval) => (
                <ServiceIntervalRow
                  key={interval.id}
                  interval={interval}
                  category={component.category}
                  template={categoryTemplates?.find((t) => t.id === interval.category_service_interval_id)}
                  narrow={narrow}
                  onLogService={() => setLogServiceInterval(interval)}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {addDefaultsOpened && (
        <AddFromCategoryDefaults
          componentId={component.id}
          templates={availableTemplates}
          onDone={() => setAddDefaultsOpened(false)}
        />
      )}

      <AddCustomServiceIntervalModal
        opened={customModalOpened}
        onClose={() => setCustomModalOpened(false)}
        componentId={component.id}
      />

      <MaintenanceEventFormModal
        opened={logServiceInterval !== null}
        onClose={() => setLogServiceInterval(null)}
        defaultComponentId={component.id}
        defaultServiceTypeId={logServiceInterval?.service_type_id}
      />
    </Stack>
  )
}

function ServiceIntervalRow({
  interval,
  category,
  template,
  narrow,
  onLogService,
}: {
  interval: ComponentServiceIntervalWithStatus
  category: string
  template: CategoryServiceInterval | undefined
  narrow: boolean
  onLogService: () => void
}) {
  const updateInterval = useUpdateComponentServiceInterval(interval.id)
  const deleteInterval = useDeleteComponentServiceInterval()
  const [editOpened, setEditOpened] = useState(false)

  const isLinked = interval.category_service_interval_id !== null
  const isOverridden = isLinked && (interval.distance_interval_meters != null || interval.time_interval_days != null)

  function handleToggleEnabled(checked: boolean) {
    updateInterval.mutate({ enabled: checked })
  }

  function handleRemove() {
    confirmDelete({
      title: 'Remove service interval',
      message: `Remove the ${interval.service_type_name} interval from this component? This cannot be undone. You can add it back later from category defaults.`,
      onConfirm: () => deleteInterval.mutate(interval.id),
    })
  }

  const total =
    interval.driving_dimension === 'distance' ? interval.effective_distance_interval_meters : interval.effective_time_interval_days
  const remaining = interval.driving_dimension === 'distance' ? interval.distance_remaining_meters : interval.days_remaining
  const fraction = total && remaining != null ? Math.min(Math.max(1 - remaining / total, 0), 1) : 0

  return (
    <Table.Tr>
      <Table.Td>{interval.service_type_name}</Table.Td>
      <Table.Td>
        {formatInterval(interval.effective_distance_interval_meters, interval.effective_time_interval_days)}
        {isOverridden && (
          <Text span c="dimmed" size="sm">
            {' '}
            (overridden)
          </Text>
        )}
      </Table.Td>
      <Table.Td miw={120}>
        <Progress value={fraction * 100} color={SERVICE_STATUS_COLORS[interval.status]} />
      </Table.Td>
      <Table.Td>{formatRemaining(interval.distance_remaining_meters, interval.days_remaining)}</Table.Td>
      <Table.Td miw={90} style={{ whiteSpace: 'nowrap' }}>
        <ServiceStatusBadge status={interval.status} />
      </Table.Td>
      <Table.Td>
        <Switch checked={interval.enabled} onChange={(event) => handleToggleEnabled(event.currentTarget.checked)} />
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" onClick={onLogService}>
            Log service
          </Button>
          {narrow ? (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="default" aria-label={`More actions for ${interval.service_type_name}`}>
                  ⋯
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setEditOpened(true)}>Edit</Menu.Item>
                <Menu.Item color="red" onClick={handleRemove}>
                  Remove
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <>
              <Button size="xs" variant="default" onClick={() => setEditOpened(true)}>
                Edit
              </Button>
              <Button size="xs" variant="subtle" color="red" loading={deleteInterval.isPending} onClick={handleRemove}>
                Remove
              </Button>
            </>
          )}
        </Group>
        {updateInterval.isError && (
          <Text c="red" size="xs" mt={4}>
            {formatApiError(updateInterval.error)}
          </Text>
        )}
      </Table.Td>

      <EditServiceIntervalModal
        opened={editOpened}
        onClose={() => setEditOpened(false)}
        interval={interval}
        template={template}
        category={category}
      />
    </Table.Tr>
  )
}

function AddFromCategoryDefaults({
  componentId,
  templates,
  onDone,
}: {
  componentId: number
  templates: CategoryServiceInterval[]
  onDone: () => void
}) {
  const { data: serviceTypes } = useServiceTypes()
  const applyDefaults = useApplyDefaultComponentServiceIntervals()
  const [checked, setChecked] = useState<Set<number>>(new Set(templates.map((t) => t.id)))

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleApply() {
    applyDefaults.mutate({ componentId, categoryServiceIntervalIds: Array.from(checked) }, { onSuccess: onDone })
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Text fw={500} size="sm">
        Add from category defaults
      </Text>
      {templates.map((template) => (
        <Checkbox
          key={template.id}
          label={serviceTypes?.find((t) => t.id === template.service_type_id)?.name ?? '—'}
          checked={checked.has(template.id)}
          onChange={() => toggle(template.id)}
        />
      ))}
      {applyDefaults.isError && <Alert color="red">{formatApiError(applyDefaults.error)}</Alert>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={handleApply} disabled={checked.size === 0} loading={applyDefaults.isPending}>
          Add selected
        </Button>
      </Group>
    </Stack>
  )
}
