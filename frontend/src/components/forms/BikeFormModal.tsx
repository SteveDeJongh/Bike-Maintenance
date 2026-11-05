import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import { useCreateBike, useUpdateBike, type BikePayload } from '../../api/mutations'
import { useBikeTypes } from '../../api/queries'
import type { Bike } from '../../types/models'

interface BikeFormValues {
  name: string
  make: string
  model: string
  strava_gear_id: string
  bike_type_id: string | null
  acquired_on: string | null
  retired_on: string | null
}

const emptyValues: BikeFormValues = {
  name: '',
  make: '',
  model: '',
  strava_gear_id: '',
  bike_type_id: null,
  acquired_on: null,
  retired_on: null,
}

function toFormValues(bike: Bike): BikeFormValues {
  return {
    name: bike.name,
    make: bike.make ?? '',
    model: bike.model ?? '',
    strava_gear_id: bike.strava_gear_id ?? '',
    bike_type_id: bike.bike_type_id === null ? null : String(bike.bike_type_id),
    acquired_on: bike.acquired_on,
    retired_on: bike.retired_on,
  }
}

function toPayload(values: BikeFormValues): BikePayload {
  return {
    name: values.name.trim(),
    make: values.make.trim() || null,
    model: values.model.trim() || null,
    strava_gear_id: values.strava_gear_id.trim() || null,
    bike_type_id: values.bike_type_id === null ? null : Number(values.bike_type_id),
    acquired_on: values.acquired_on,
    retired_on: values.retired_on,
  }
}

interface BikeFormModalProps {
  opened: boolean
  onClose: () => void
  bike?: Bike
  // Pre-fills a new bike's fields (e.g. from the gear-mapping screen's
  // "create new bike" action, or the "track as retired bike" one-click
  // create's fallback on failure) — ignored when editing an existing bike.
  createDefaults?: Partial<BikeFormValues>
  // Fired right before onClose, only when a new bike was just created
  // (never on edit) -- same pattern as ComponentFormModal's own prop. Only
  // the Bikes page's main "+ New Bike" flow uses this, to jump straight
  // into the component setup step; the gear-mapping/track-as-retired
  // creation shortcuts don't pass it, so they keep their current behavior.
  onCreateSuccess?: (bike: Bike) => void
}

export default function BikeFormModal({
  opened,
  onClose,
  bike,
  createDefaults,
  onCreateSuccess,
}: BikeFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={bike ? 'Edit Bike' : 'New Bike'}>
      {opened && (
        <BikeForm
          key={bike?.id ?? 'new'}
          onClose={onClose}
          bike={bike}
          createDefaults={createDefaults}
          onCreateSuccess={onCreateSuccess}
        />
      )}
    </Modal>
  )
}

function BikeForm({
  onClose,
  bike,
  createDefaults,
  onCreateSuccess,
}: {
  onClose: () => void
  bike?: Bike
  createDefaults?: Partial<BikeFormValues>
  onCreateSuccess?: (bike: Bike) => void
}) {
  const isEdit = Boolean(bike)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<BikeFormValues>({
    initialValues: bike ? toFormValues(bike) : { ...emptyValues, ...createDefaults },
    validate: {
      name: (value) => (value.trim() ? null : 'Name is required'),
    },
  })

  const { data: bikeTypes } = useBikeTypes()
  const bikeTypeOptions = (bikeTypes ?? []).map((bikeType) => ({ value: String(bikeType.id), label: bikeType.name }))

  const createBike = useCreateBike()
  const updateBike = useUpdateBike(bike?.id ?? -1)
  const mutation = isEdit ? updateBike : createBike

  function handleSubmit(values: BikeFormValues) {
    setBaseErrors([])
    mutation.mutate(toPayload(values), {
      onSuccess: (result) => {
        if (!isEdit) onCreateSuccess?.(result)
        onClose()
      },
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
        <Select label="Type" clearable data={bikeTypeOptions} {...form.getInputProps('bike_type_id')} />
        <DateInput label="Purchased on" clearable {...form.getInputProps('acquired_on')} />
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
