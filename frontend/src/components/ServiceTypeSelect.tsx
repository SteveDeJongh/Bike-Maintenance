import { useState } from 'react'
import { Button, Group, Select, TextInput } from '@mantine/core'
import { useCreateServiceType } from '../api/mutations'
import { useServiceTypes } from '../api/queries'

export const CREATE_NEW_SERVICE_TYPE = '__create_new__'

interface ServiceTypeSelectProps {
  value: string
  onChange: (value: string) => void
  label?: string
  error?: string
}

// Shared by every place a service type is picked (maintenance event
// logging, category/component service intervals) -- includes an inline
// "+ Create new service type" option so the user never has to leave the
// current form to add one.
export default function ServiceTypeSelect({ value, onChange, label = 'Service type', error }: ServiceTypeSelectProps) {
  const { data: serviceTypes } = useServiceTypes()
  const createServiceType = useCreateServiceType()
  const [newTypeName, setNewTypeName] = useState('')

  const options = [
    ...(serviceTypes ?? []).map((type) => ({ value: String(type.id), label: type.name })),
    { value: CREATE_NEW_SERVICE_TYPE, label: '+ Create new service type' },
  ]

  function handleCreate() {
    const name = newTypeName.trim()
    if (!name) return

    createServiceType.mutate(
      { name },
      {
        onSuccess: (created) => {
          onChange(String(created.id))
          setNewTypeName('')
        },
      },
    )
  }

  return (
    <>
      <Select label={label} required data={options} value={value} onChange={(v) => onChange(v ?? '')} error={error} />
      {value === CREATE_NEW_SERVICE_TYPE && (
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <TextInput
            label="New service type name"
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button size="sm" disabled={!newTypeName.trim()} loading={createServiceType.isPending} onClick={handleCreate}>
            Add
          </Button>
        </Group>
      )}
    </>
  )
}
