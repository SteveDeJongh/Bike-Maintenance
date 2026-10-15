import { useState } from 'react'
import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useCreateBike, useUpdateBike, type BikePayload } from '../../api/mutations'
import type { Bike } from '../../types/models'

interface BikeFormValues {
  name: string
  make: string
  model: string
  strava_gear_id: string
  retired_on: string | null
}

const emptyValues: BikeFormValues = {
  name: '',
  make: '',
  model: '',
  strava_gear_id: '',
  retired_on: null,
}

function toFormValues(bike: Bike): BikeFormValues {
  return {
    name: bike.name,
    make: bike.make ?? '',
    model: bike.model ?? '',
    strava_gear_id: bike.strava_gear_id ?? '',
    retired_on: bike.retired_on,
  }
}

function toPayload(values: BikeFormValues): BikePayload {
  return {
    name: values.name.trim(),
    make: values.make.trim() || null,
    model: values.model.trim() || null,
    strava_gear_id: values.strava_gear_id.trim() || null,
    retired_on: values.retired_on,
  }
}

interface BikeFormModalProps {
  opened: boolean
  onClose: () => void
  bike?: Bike
  // Pre-fills a new bike's fields (e.g. from the gear-mapping screen's
  // "create new bike" action) — ignored when editing an existing bike.
  createDefaults?: Partial<Pick<BikeFormValues, 'name' | 'strava_gear_id'>>
}

export default function BikeFormModal({
  opened,
  onClose,
  bike,
  createDefaults,
}: BikeFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={bike ? 'Edit Bike' : 'New Bike'}>
      {opened && (
        <BikeForm key={bike?.id ?? 'new'} onClose={onClose} bike={bike} createDefaults={createDefaults} />
      )}
    </Modal>
  )
}

function BikeForm({
  onClose,
  bike,
  createDefaults,
}: {
  onClose: () => void
  bike?: Bike
  createDefaults?: Partial<Pick<BikeFormValues, 'name' | 'strava_gear_id'>>
}) {
  const isEdit = Boolean(bike)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<BikeFormValues>({
    initialValues: bike ? toFormValues(bike) : { ...emptyValues, ...createDefaults },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  })

  const createBike = useCreateBike()
  const updateBike = useUpdateBike(bike?.id ?? -1)
  const mutation = isEdit ? updateBike : createBike

  function handleSubmit(values: BikeFormValues) {
    setBaseErrors([])
    mutation.mutate(toPayload(values), {
      onSuccess: () => onClose(),
      onError: (error) => setBaseErrors(applyApiErrors(form, error)),
    })
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack>
        {baseErrors.length > 0 && (
          <Alert color="red">
            {baseErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </Alert>
        )}

        <TextInput label="Name" required {...form.getInputProps('name')} />
        <TextInput label="Make" {...form.getInputProps('make')} />
        <TextInput label="Model" {...form.getInputProps('model')} />
        <TextInput label="Strava gear ID" {...form.getInputProps('strava_gear_id')} />
        <DateInput label="Retired on" clearable {...form.getInputProps('retired_on')} />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
