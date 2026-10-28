import { Select, TextInput } from '@mantine/core'
import { useServiceTypes } from '../api/queries'

export const CREATE_NEW_SERVICE_TYPE = '__create_new__'

interface ServiceTypeSelectProps {
  value: string
  onChange: (value: string) => void
  newTypeName: string
  onNewTypeNameChange: (value: string) => void
  label?: string
  error?: string
  newTypeNameError?: string
}

// Shared by every place a service type is picked (maintenance event
// logging, category/component service intervals) -- includes an inline
// "+ Create new service type" option so the user never has to leave the
// current form to add one. Purely controlled: the parent owns both the
// selected value (a real id, or the CREATE_NEW_SERVICE_TYPE sentinel) and
// the pending new-type name, and is responsible for actually creating the
// ServiceType as part of its own single submit action (see
// useServiceTypeIdResolver) -- a brand-new type is never created until the
// parent's one "Add"/"Create" button is clicked, so there's no separate
// create-the-type step for the user.
export default function ServiceTypeSelect({
  value,
  onChange,
  newTypeName,
  onNewTypeNameChange,
  label = 'Service type',
  error,
  newTypeNameError,
}: ServiceTypeSelectProps) {
  const { data: serviceTypes } = useServiceTypes()

  const options = [
    ...(serviceTypes ?? []).map((type) => ({ value: String(type.id), label: type.name })),
    { value: CREATE_NEW_SERVICE_TYPE, label: '+ Create new service type' },
  ]

  return (
    <>
      <Select label={label} required data={options} value={value} onChange={(v) => onChange(v ?? '')} error={error} />
      {value === CREATE_NEW_SERVICE_TYPE && (
        <TextInput
          label="New service type name"
          value={newTypeName}
          onChange={(e) => onNewTypeNameChange(e.currentTarget.value)}
          error={newTypeNameError}
        />
      )}
    </>
  )
}
