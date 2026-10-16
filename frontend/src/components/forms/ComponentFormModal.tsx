import { useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core'
import { DateInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { applyApiErrors } from '../../api/errors'
import {
  useCreateComponent,
  useUpdateComponent,
  type ComponentPayload,
} from '../../api/mutations'
import { COMPONENT_CATEGORIES, categoryLabel } from '../../constants'
import type { Component } from '../../types/models'

interface ComponentFormValues {
  label: string
  category: string
  acquired_on: string | null
  retired_on: string | null
}

const emptyValues: ComponentFormValues = {
  label: '',
  category: '',
  acquired_on: null,
  retired_on: null,
}

function toFormValues(component: Component): ComponentFormValues {
  return {
    label: component.label,
    category: component.category,
    acquired_on: component.acquired_on,
    retired_on: component.retired_on,
  }
}

function toPayload(values: ComponentFormValues): ComponentPayload {
  return {
    label: values.label.trim(),
    category: values.category,
    acquired_on: values.acquired_on ?? '',
    retired_on: values.retired_on,
  }
}

interface ComponentFormModalProps {
  opened: boolean
  onClose: () => void
  component?: Component
  // Pre-fills a new component's fields (e.g. from a bike detail page's
  // per-slot "+ Create new" flow) — ignored when editing an existing component.
  createDefaults?: Partial<Pick<ComponentFormValues, 'category'>>
  // Fired right before onClose, only when a new component was just created
  // (never on edit) — lets a caller chain e.g. assigning it to a bike.
  onCreateSuccess?: (component: Component) => void
}

export default function ComponentFormModal({
  opened,
  onClose,
  component,
  createDefaults,
  onCreateSuccess,
}: ComponentFormModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={component ? 'Edit Component' : 'New Component'}>
      {opened && (
        <ComponentForm
          key={component?.id ?? 'new'}
          onClose={onClose}
          component={component}
          createDefaults={createDefaults}
          onCreateSuccess={onCreateSuccess}
        />
      )}
    </Modal>
  )
}

function ComponentForm({
  onClose,
  component,
  createDefaults,
  onCreateSuccess,
}: {
  onClose: () => void
  component?: Component
  createDefaults?: Partial<Pick<ComponentFormValues, 'category'>>
  onCreateSuccess?: (component: Component) => void
}) {
  const isEdit = Boolean(component)
  const [baseErrors, setBaseErrors] = useState<string[]>([])

  const form = useForm<ComponentFormValues>({
    initialValues: component ? toFormValues(component) : { ...emptyValues, ...createDefaults },
    validate: {
      label: (value) => (value.trim() ? null : 'Label is required'),
      category: (value) => (value ? null : 'Category is required'),
      acquired_on: (value) => (value ? null : 'Acquired date is required'),
    },
  })

  const createComponent = useCreateComponent()
  const updateComponent = useUpdateComponent(component?.id ?? -1)
  const mutation = isEdit ? updateComponent : createComponent

  function handleSubmit(values: ComponentFormValues) {
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

        <TextInput label="Label" required {...form.getInputProps('label')} />
        <Select
          label="Category"
          required
          disabled={!isEdit && Boolean(createDefaults?.category)}
          data={COMPONENT_CATEGORIES.map((category) => ({
            value: category,
            label: categoryLabel(category),
          }))}
          {...form.getInputProps('category')}
        />
        <DateInput label="Acquired on" required {...form.getInputProps('acquired_on')} />
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
