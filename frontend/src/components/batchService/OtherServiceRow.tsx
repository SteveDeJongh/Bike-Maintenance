import { ActionIcon, Checkbox, Group, Paper, Select, Stack, Text, Textarea } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import ServiceTypePicker, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypePicker'

export interface AddOtherRow {
  key: string
  componentId: string
  serviceTypeId: string
  serviceTypeNewName: string
  notes: string
}

// An "+ Add other service" row: a tinted block, "Other service", with a
// checkbox (ticked once the row has a component and a type -- that's what
// makes it count, as before), the component, the shared service-type
// picker and a remove ×.
export default function OtherServiceRow({
  row,
  componentOptions,
  category,
  error,
  onChange,
  onRemove,
}: {
  row: AddOtherRow
  componentOptions: { value: string; label: string }[]
  category: string | null
  error: string | undefined
  onChange: (changes: Partial<AddOtherRow>) => void
  onRemove: () => void
}) {
  const complete = Boolean(row.componentId && row.serviceTypeId)

  return (
    <Paper radius="md" p="sm" bg="var(--mantine-primary-color-light)">
      <Stack gap={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
          Other service
        </Text>
        <Group align="flex-end" wrap="wrap" gap="sm">
          <Checkbox checked={complete} readOnly aria-label="Included once a component and a type are picked" mb={8} />
          <Select
            label="Component"
            placeholder="Component"
            data={componentOptions}
            value={row.componentId || null}
            onChange={(value) => onChange({ componentId: value ?? '' })}
            style={{ flex: '1 1 180px' }}
          />
          <div style={{ flex: '1 1 180px' }}>
            <ServiceTypePicker
              value={row.serviceTypeId}
              category={category}
              onChange={(value) => onChange({ serviceTypeId: value })}
              newTypeName={row.serviceTypeNewName}
              onNewTypeNameChange={(value) => onChange({ serviceTypeNewName: value })}
            />
          </div>
          <ActionIcon variant="subtle" color="gray" onClick={onRemove} aria-label="Remove this service" size="lg" mb={2}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
        {(row.componentId || row.serviceTypeId === CREATE_NEW_SERVICE_TYPE) && (
          <Textarea
            size="xs"
            autosize
            minRows={1}
            placeholder="Note (optional)"
            value={row.notes}
            onChange={(event) => onChange({ notes: event.currentTarget.value })}
          />
        )}
        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}
