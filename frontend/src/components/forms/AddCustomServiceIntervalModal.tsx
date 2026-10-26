import { useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, Stack } from '@mantine/core'
import { useCreateComponentServiceInterval } from '../../api/mutations'
import { parseApiError } from '../../api/errors'
import ServiceTypeSelect from '../ServiceTypeSelect'

interface AddCustomServiceIntervalModalProps {
  opened: boolean
  onClose: () => void
  componentId: number
}

export default function AddCustomServiceIntervalModal({
  opened,
  onClose,
  componentId,
}: AddCustomServiceIntervalModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Add custom service interval">
      {opened && <AddCustomServiceIntervalForm onClose={onClose} componentId={componentId} />}
    </Modal>
  )
}

function AddCustomServiceIntervalForm({ onClose, componentId }: { onClose: () => void; componentId: number }) {
  const [serviceTypeId, setServiceTypeId] = useState('')
  const [km, setKm] = useState<number | ''>('')
  const [days, setDays] = useState<number | ''>('')
  const createInterval = useCreateComponentServiceInterval()

  const canSubmit = Boolean(serviceTypeId) && (km !== '' || days !== '')

  function handleSubmit() {
    if (!canSubmit) return
    createInterval.mutate(
      {
        component_id: componentId,
        service_type_id: Number(serviceTypeId),
        category_service_interval_id: null,
        distance_interval_meters: km === '' ? null : Math.round(km * 1000),
        time_interval_days: days === '' ? null : days,
        enabled: true,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Stack>
      <ServiceTypeSelect value={serviceTypeId} onChange={setServiceTypeId} />
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

      {createInterval.isError && <Alert color="red">{parseApiError(createInterval.error).baseErrors.join(', ')}</Alert>}

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} loading={createInterval.isPending}>
          Add
        </Button>
      </Group>
    </Stack>
  )
}
