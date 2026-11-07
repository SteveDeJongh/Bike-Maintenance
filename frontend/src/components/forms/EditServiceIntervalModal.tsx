import { useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, Stack, Text } from '@mantine/core'
import { useUpdateComponentServiceInterval } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import { categoryLabel } from '../../constants'
import { formatInterval } from '../../utils/serviceInterval'
import type { CategoryServiceInterval, ComponentServiceIntervalWithStatus } from '../../types/models'

interface EditServiceIntervalModalProps {
  opened: boolean
  onClose: () => void
  interval: ComponentServiceIntervalWithStatus
  // Looked up by the caller (already has the templates list fetched for
  // "Add from category defaults") -- undefined for a custom interval, or
  // for a linked one if its template has since been deleted.
  template: CategoryServiceInterval | undefined
  category: string
}

export default function EditServiceIntervalModal({
  opened,
  onClose,
  interval,
  template,
  category,
}: EditServiceIntervalModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Edit ${interval.service_type_name} interval`}>
      {opened && (
        <EditServiceIntervalForm
          key={interval.id}
          onClose={onClose}
          interval={interval}
          template={template}
          category={category}
        />
      )}
    </Modal>
  )
}

function EditServiceIntervalForm({
  onClose,
  interval,
  template,
  category,
}: Omit<EditServiceIntervalModalProps, 'opened'>) {
  const isLinked = interval.category_service_interval_id !== null
  const [km, setKm] = useState<number | ''>(
    interval.effective_distance_interval_meters == null ? '' : interval.effective_distance_interval_meters / 1000,
  )
  const [days, setDays] = useState<number | ''>(interval.effective_time_interval_days ?? '')
  const updateInterval = useUpdateComponentServiceInterval(interval.id)

  const canSave = isLinked || km !== '' || days !== ''

  function handleSave() {
    if (!canSave) return
    updateInterval.mutate(
      {
        distance_interval_meters: km === '' ? null : Math.round(km * 1000),
        time_interval_days: days === '' ? null : days,
      },
      { onSuccess: onClose },
    )
  }

  function handleResetToDefault() {
    // null on both override columns means "inherit the template" -- no
    // backend change needed, this is already how a linked row's effective
    // values are resolved.
    updateInterval.mutate(
      { distance_interval_meters: null, time_interval_days: null },
      { onSuccess: onClose },
    )
  }

  return (
    <Stack>
      {isLinked && template && (
        <Text size="sm" c="dimmed">
          From {categoryLabel(category)} default: {formatInterval(template.distance_interval_meters, template.time_interval_days)}
        </Text>
      )}

      <Group>
        <NumberInput label="Every (km)" value={km} onChange={(v) => setKm(v === '' ? '' : Number(v))} min={0} w={120} />
        <NumberInput
          label="Every (days)"
          value={days}
          onChange={(v) => setDays(v === '' ? '' : Number(v))}
          min={0}
          w={120}
        />
      </Group>

      {updateInterval.isError && <Alert color="red">{formatApiError(updateInterval.error)}</Alert>}

      <Group justify="space-between">
        {isLinked ? (
          <Button variant="subtle" onClick={handleResetToDefault} loading={updateInterval.isPending}>
            Reset to default
          </Button>
        ) : (
          <span />
        )}
        <Group>
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave} loading={updateInterval.isPending}>
            Save
          </Button>
        </Group>
      </Group>
    </Stack>
  )
}
