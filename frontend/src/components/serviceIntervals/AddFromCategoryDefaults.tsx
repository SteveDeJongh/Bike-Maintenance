import { useState } from 'react'
import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import { useApplyDefaultComponentServiceRequirements } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import type { CategoryServiceRequirement } from '../../types/models'

// The inline "Add from category defaults" checklist: every template of the
// component's category it doesn't already have, all checked to start.
export default function AddFromCategoryDefaults({
  componentId,
  templates,
  onDone,
}: {
  componentId: number
  templates: CategoryServiceRequirement[]
  onDone: () => void
}) {
  const applyDefaults = useApplyDefaultComponentServiceRequirements()
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
    applyDefaults.mutate({ componentId, categoryServiceRequirementIds: Array.from(checked) }, { onSuccess: onDone })
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Text fw={500} size="sm">
        Add from category defaults
      </Text>
      {templates.map((template) => (
        <Checkbox key={template.id} label={template.name} checked={checked.has(template.id)} onChange={() => toggle(template.id)} />
      ))}
      {applyDefaults.isError && <Alert color="red">{formatApiError(applyDefaults.error)}</Alert>}
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
