import { Button, Group, Stack, Text } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import ServiceTypePicker, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypePicker'
import { categoryLabel } from '../../constants'
import { pillRequirementText, type ServicePill } from './logServiceModel'

const SELECTED = {
  variant: 'light',
  style: { borderColor: 'var(--mantine-primary-color-filled)' },
} as const

// The Service row: one pill per satisfier of the component's enabled
// requirements ("Drip wax · Wax"), then recent other types, then a dashed
// "Other type ▾" that opens the shared, category-scoped ServiceTypePicker
// (inline create included). A type picked through it shows as its own
// selected pill.
export default function ServicePills({
  pills,
  value,
  onChange,
  category,
  newTypeName,
  onNewTypeNameChange,
  error,
  newTypeNameError,
  disabled,
}: {
  pills: ServicePill[]
  value: string
  onChange: (value: string) => void
  category: string | null
  newTypeName: string
  onNewTypeNameChange: (value: string) => void
  error?: string
  newTypeNameError?: string
  disabled: boolean
}) {
  const inPills = pills.some((pill) => String(pill.serviceTypeId) === value)
  const otherSelected = Boolean(value) && !inPills

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Service
      </Text>
      <Group gap="xs">
        {pills.map((pill) => {
          const selected = String(pill.serviceTypeId) === value
          const requirements = pillRequirementText(pill)
          return (
            <Button
              key={pill.serviceTypeId}
              size="xs"
              radius="xl"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(String(pill.serviceTypeId))}
              {...(selected ? SELECTED : { variant: 'default' })}
            >
              {pill.name}
              {requirements && (
                <Text span size="xs" c="dimmed" ml={6} fw={400}>
                  · {requirements}
                </Text>
              )}
            </Button>
          )
        })}
        <ServiceTypePicker
          value={value}
          onChange={onChange}
          category={category}
          newTypeName={newTypeName}
          onNewTypeNameChange={onNewTypeNameChange}
          newTypeNameError={newTypeNameError}
          renderTarget={(toggle, selectedName) => (
            <Button
              size="xs"
              radius="xl"
              disabled={disabled}
              onClick={toggle}
              rightSection={<IconChevronDown size={12} />}
              aria-pressed={otherSelected}
              {...(otherSelected ? SELECTED : { variant: 'default' })}
              style={{ ...(otherSelected ? SELECTED.style : {}), borderStyle: 'dashed' }}
            >
              {otherSelected ? (value === CREATE_NEW_SERVICE_TYPE ? 'New type' : (selectedName ?? 'Other type')) : 'Other type'}
            </Button>
          )}
        />
      </Group>
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
      {disabled ? (
        <Text size="xs" c="dimmed">
          Pick a component first
        </Text>
      ) : (
        <Text size="xs" c="dimmed">
          Types that satisfy this component's intervals come first. Other type lists{' '}
          {category ? `${categoryLabel(category)} types` : 'tagged types'}, then any.
        </Text>
      )}
    </Stack>
  )
}
