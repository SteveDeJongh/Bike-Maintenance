import { useState } from 'react'
import { Combobox, Group, Input, InputBase, Text, TextInput, useCombobox } from '@mantine/core'
import { useServiceTypes } from '../api/queries'
import { categoryLabel } from '../constants'
import { partitionServiceTypes, type PickerRow } from '../utils/serviceTypePicker'

export const CREATE_NEW_SERVICE_TYPE = '__create_new__'
const TOGGLE_HIDDEN = '__toggle_hidden__'

interface ServiceTypePickerProps {
  value: string
  onChange: (value: string) => void
  newTypeName: string
  onNewTypeNameChange: (value: string) => void
  // The component category this pick is for. With one, types tagged for it
  // come first, then universal types, and the rest sit behind "Show all
  // types" -- filtered, never forbidden. Without one, everything shows.
  category?: string | null
  label?: string
  error?: string
  newTypeNameError?: string
}

// The one service-type picker, used everywhere a service type is chosen
// (event forms, the batch logger's "Add other…", satisfier editors).
// Purely controlled: the parent owns the selected value (a real id, or the
// CREATE_NEW_SERVICE_TYPE sentinel) and the pending new-type name, and
// creates the type as part of its own submit via useServiceTypeIdResolver
// -- passing the same category, so the new type is tagged with it.
export default function ServiceTypePicker({
  value,
  onChange,
  newTypeName,
  onNewTypeNameChange,
  category,
  label = 'Service type',
  error,
  newTypeNameError,
}: ServiceTypePickerProps) {
  const { data: serviceTypes } = useServiceTypes()
  const [showAll, setShowAll] = useState(false)
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() })

  const selectedId = value && value !== CREATE_NEW_SERVICE_TYPE ? Number(value) : null
  const { visible, hidden } = partitionServiceTypes(serviceTypes ?? [], category, selectedId)
  const selected = (serviceTypes ?? []).find((type) => type.id === selectedId)
  const createLabel = category ? `+ Create new type (tagged ${categoryLabel(category)})` : '+ Create new service type'

  function handleSubmit(optionValue: string) {
    if (optionValue === TOGGLE_HIDDEN) {
      setShowAll((current) => !current)
      return
    }
    onChange(optionValue)
    combobox.closeDropdown()
  }

  return (
    <>
      <Combobox store={combobox} onOptionSubmit={handleSubmit}>
        <Combobox.Target>
          <InputBase
            component="button"
            type="button"
            label={label}
            required
            error={error}
            pointer
            rightSection={<Combobox.Chevron />}
            rightSectionPointerEvents="none"
            onClick={() => combobox.toggleDropdown()}
          >
            {value === CREATE_NEW_SERVICE_TYPE
              ? createLabel
              : selected?.name ?? <Input.Placeholder>Pick a service type</Input.Placeholder>}
          </InputBase>
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options mah={300} style={{ overflowY: 'auto' }}>
            {visible.map((row) => (
              <PickerOption key={row.type.id} row={row} active={row.type.id === selectedId} />
            ))}

            {hidden.length > 0 && (
              <Combobox.Option value={TOGGLE_HIDDEN}>
                <Text size="sm" c="dimmed">
                  {showAll ? 'Hide other types' : `Show all types (${hidden.length} hidden)`}
                </Text>
              </Combobox.Option>
            )}

            {showAll && hidden.length > 0 && (
              <Combobox.Group label="Other types">
                {hidden.map((row) => (
                  <PickerOption key={row.type.id} row={row} active={false} />
                ))}
              </Combobox.Group>
            )}

            <Combobox.Option value={CREATE_NEW_SERVICE_TYPE} active={value === CREATE_NEW_SERVICE_TYPE}>
              {createLabel}
            </Combobox.Option>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

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

function PickerOption({ row, active }: { row: PickerRow; active: boolean }) {
  return (
    <Combobox.Option value={String(row.type.id)} active={active}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm">{row.type.name}</Text>
        {row.label && (
          <Text size="xs" c="dimmed">
            {row.label}
          </Text>
        )}
      </Group>
    </Combobox.Option>
  )
}
