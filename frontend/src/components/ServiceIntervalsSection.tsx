import { useState } from 'react'
import { Alert, Badge, Button, Checkbox, Group, NumberInput, Progress, Stack, Switch, Table, Text, Title } from '@mantine/core'
import { useCategoryServiceIntervals, useServiceTypes } from '../api/queries'
import {
  useApplyDefaultComponentServiceIntervals,
  useDeleteComponentServiceInterval,
  useUpdateComponentServiceInterval,
} from '../api/mutations'
import { parseApiError } from '../api/errors'
import { confirmDelete } from './confirmDelete'
import AddCustomServiceIntervalModal from './forms/AddCustomServiceIntervalModal'
import MaintenanceEventFormModal from './forms/MaintenanceEventFormModal'
import { formatDistance } from '../utils/distance'
import type { CategoryServiceInterval, ComponentDetail, ComponentServiceIntervalWithStatus } from '../types/models'

const STATUS_COLORS: Record<ComponentServiceIntervalWithStatus['status'], string> = {
  ok: 'green',
  warning: 'yellow',
  due: 'red',
}

function formatRemaining(distanceRemainingMeters: number | null, daysRemaining: number | null): string {
  const parts: string[] = []
  if (distanceRemainingMeters != null) {
    parts.push(
      distanceRemainingMeters >= 0
        ? `${formatDistance(distanceRemainingMeters)} left`
        : `${formatDistance(-distanceRemainingMeters)} overdue`,
    )
  }
  if (daysRemaining != null) {
    parts.push(daysRemaining >= 0 ? `${daysRemaining}d left` : `${-daysRemaining}d overdue`)
  }
  return parts.join(' · ') || '—'
}

interface ServiceIntervalsSectionProps {
  component: ComponentDetail
}

export default function ServiceIntervalsSection({ component }: ServiceIntervalsSectionProps) {
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
    <Stack>
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
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Service type</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Progress</Table.Th>
              <Table.Th>Remaining</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Every (km)</Table.Th>
              <Table.Th>Every (days)</Table.Th>
              <Table.Th>Enabled</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {component.service_intervals.map((interval) => (
              <ServiceIntervalRow
                key={interval.id}
                interval={interval}
                onLogService={() => setLogServiceInterval(interval)}
              />
            ))}
          </Table.Tbody>
        </Table>
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
  onLogService,
}: {
  interval: ComponentServiceIntervalWithStatus
  onLogService: () => void
}) {
  const updateInterval = useUpdateComponentServiceInterval(interval.id)
  const deleteInterval = useDeleteComponentServiceInterval()

  const [km, setKm] = useState<number | ''>(
    interval.distance_interval_meters == null ? '' : interval.distance_interval_meters / 1000,
  )
  const [days, setDays] = useState<number | ''>(interval.time_interval_days ?? '')

  const isLinked = interval.category_service_interval_id !== null

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
        <Badge variant="light" color="gray">
          {isLinked ? 'Category default' : 'Custom'}
        </Badge>
      </Table.Td>
      <Table.Td miw={120}>
        <Progress value={fraction * 100} color={STATUS_COLORS[interval.status]} />
      </Table.Td>
      <Table.Td>{formatRemaining(interval.distance_remaining_meters, interval.days_remaining)}</Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLORS[interval.status]}>{interval.status}</Badge>
      </Table.Td>
      <Table.Td>
        <NumberInput
          placeholder={isLinked ? 'template' : undefined}
          value={km}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setKm(next)
            updateInterval.mutate({ distance_interval_meters: next === '' ? null : Math.round(next * 1000) })
          }}
          min={0}
          w={100}
        />
      </Table.Td>
      <Table.Td>
        <NumberInput
          placeholder={isLinked ? 'template' : undefined}
          value={days}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setDays(next)
            updateInterval.mutate({ time_interval_days: next === '' ? null : next })
          }}
          min={0}
          w={100}
        />
      </Table.Td>
      <Table.Td>
        <Switch checked={interval.enabled} onChange={(event) => handleToggleEnabled(event.currentTarget.checked)} />
      </Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" onClick={onLogService}>
            Log service
          </Button>
          <Button size="xs" variant="subtle" color="red" loading={deleteInterval.isPending} onClick={handleRemove}>
            Remove
          </Button>
        </Group>
        {updateInterval.isError && (
          <Text c="red" size="xs" mt={4}>
            {parseApiError(updateInterval.error).baseErrors.join(', ')}
          </Text>
        )}
      </Table.Td>
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
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-gray-4)', borderRadius: 4 }}>
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
      {applyDefaults.isError && <Alert color="red">{parseApiError(applyDefaults.error).baseErrors.join(', ')}</Alert>}
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
