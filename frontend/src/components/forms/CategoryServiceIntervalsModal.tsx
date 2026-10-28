import { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, Group, Loader, Modal, NumberInput, Stack, Table, Text } from '@mantine/core'
import {
  useApplyCategoryServiceInterval,
  useCreateCategoryServiceInterval,
  useDeleteCategoryServiceInterval,
  useUpdateCategoryServiceInterval,
} from '../../api/mutations'
import { useAllComponentServiceIntervals, useCategoryServiceIntervals, useComponents, useServiceTypes } from '../../api/queries'
import { categoryLabel } from '../../constants'
import { confirmDelete } from '../confirmDelete'
import ServiceTypeSelect, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypeSelect'
import type { CategoryServiceInterval } from '../../types/models'

interface CategoryServiceIntervalsModalProps {
  opened: boolean
  onClose: () => void
  category: string
}

export default function CategoryServiceIntervalsModal({ opened, onClose, category }: CategoryServiceIntervalsModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={`${categoryLabel(category)} service intervals`} size="lg">
      {opened && <CategoryServiceIntervalsEditor category={category} />}
    </Modal>
  )
}

function CategoryServiceIntervalsEditor({ category }: { category: string }) {
  const { data: allTemplates, isPending: templatesPending } = useCategoryServiceIntervals()
  const { data: serviceTypes } = useServiceTypes()
  const { data: components } = useComponents()
  const { data: allComponentIntervals } = useAllComponentServiceIntervals()

  const templates = useMemo(() => (allTemplates ?? []).filter((t) => t.category === category), [allTemplates, category])
  const categoryComponents = useMemo(
    () => (components ?? []).filter((c) => c.category === category && !c.retired_on),
    [components, category],
  )

  const [newTypeId, setNewTypeId] = useState('')
  const [newKm, setNewKm] = useState<number | ''>('')
  const [newDays, setNewDays] = useState<number | ''>('')
  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null)

  const createTemplate = useCreateCategoryServiceInterval()

  function serviceTypeName(id: number) {
    return serviceTypes?.find((t) => t.id === id)?.name ?? '—'
  }

  function handleCreate() {
    if (!newTypeId || newTypeId === CREATE_NEW_SERVICE_TYPE || (newKm === '' && newDays === '')) return

    createTemplate.mutate(
      {
        category,
        service_type_id: Number(newTypeId),
        distance_interval_meters: newKm === '' ? null : Math.round(newKm * 1000),
        time_interval_days: newDays === '' ? null : newDays,
      },
      {
        onSuccess: (created) => {
          setNewTypeId('')
          setNewKm('')
          setNewDays('')
          setApplyTemplateId(created.id)
        },
      },
    )
  }

  const applyTemplate = templates.find((t) => t.id === applyTemplateId)

  return (
    <Stack>
      {templatesPending && <Loader />}

      {templates.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Service type</Table.Th>
              <Table.Th>Every (km)</Table.Th>
              <Table.Th>Every (days)</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {templates.map((template) => (
              <TemplateRow key={template.id} template={template} serviceTypeName={serviceTypeName(template.service_type_id)} />
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Text fw={500} size="sm">
        Add interval
      </Text>
      <Group align="flex-end" wrap="wrap">
        <div style={{ minWidth: 200 }}>
          <ServiceTypeSelect value={newTypeId} onChange={setNewTypeId} />
        </div>
        <NumberInput
          label="Every (km)"
          value={newKm}
          onChange={(v) => setNewKm(v === '' ? '' : Number(v))}
          min={0}
          w={120}
        />
        <NumberInput
          label="Every (days)"
          value={newDays}
          onChange={(v) => setNewDays(v === '' ? '' : Number(v))}
          min={0}
          w={120}
        />
        <Button
          onClick={handleCreate}
          disabled={!newTypeId || newTypeId === CREATE_NEW_SERVICE_TYPE || (newKm === '' && newDays === '')}
          loading={createTemplate.isPending}
        >
          Add
        </Button>
      </Group>
      {createTemplate.isError && <Alert color="red">{createTemplate.error.message}</Alert>}

      {applyTemplate && (
        <ApplyToComponentsChecklist
          template={applyTemplate}
          components={categoryComponents}
          existingComponentIds={new Set(
            (allComponentIntervals ?? [])
              .filter((i) => i.service_type_id === applyTemplate.service_type_id)
              .map((i) => i.component_id),
          )}
          onDone={() => setApplyTemplateId(null)}
        />
      )}
    </Stack>
  )
}

function TemplateRow({
  template,
  serviceTypeName,
}: {
  template: CategoryServiceInterval
  serviceTypeName: string
}) {
  const updateTemplate = useUpdateCategoryServiceInterval(template.id)
  const deleteTemplate = useDeleteCategoryServiceInterval()

  const [km, setKm] = useState<number | ''>(
    template.distance_interval_meters == null ? '' : template.distance_interval_meters / 1000,
  )
  const [days, setDays] = useState<number | ''>(template.time_interval_days ?? '')

  function commit(changes: { distance_interval_meters?: number | null; time_interval_days?: number | null }) {
    updateTemplate.mutate(changes)
  }

  function handleDelete() {
    confirmDelete({
      title: 'Delete service interval',
      message: `Delete the ${serviceTypeName} interval? Every linked component loses this default. This cannot be undone.`,
      onConfirm: () => deleteTemplate.mutate(template.id),
    })
  }

  return (
    <Table.Tr>
      <Table.Td>{serviceTypeName}</Table.Td>
      <Table.Td>
        <NumberInput
          value={km}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setKm(next)
            commit({ distance_interval_meters: next === '' ? null : Math.round(next * 1000) })
          }}
          min={0}
          w={100}
        />
      </Table.Td>
      <Table.Td>
        <NumberInput
          value={days}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setDays(next)
            commit({ time_interval_days: next === '' ? null : next })
          }}
          min={0}
          w={100}
        />
      </Table.Td>
      <Table.Td>
        <Button size="xs" variant="subtle" color="red" onClick={handleDelete} loading={deleteTemplate.isPending}>
          Delete
        </Button>
      </Table.Td>
    </Table.Tr>
  )
}

function ApplyToComponentsChecklist({
  template,
  components,
  existingComponentIds,
  onDone,
}: {
  template: CategoryServiceInterval
  components: { id: number; label: string }[]
  existingComponentIds: Set<number>
  onDone: () => void
}) {
  const applyTemplate = useApplyCategoryServiceInterval(template.id)
  const [checked, setChecked] = useState<Set<number>>(
    new Set(components.filter((c) => !existingComponentIds.has(c.id)).map((c) => c.id)),
  )

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleApply() {
    applyTemplate.mutate(Array.from(checked), { onSuccess: onDone })
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-gray-4)', borderRadius: 4 }}>
      <Text fw={500} size="sm">
        Apply to existing components
      </Text>
      {components.length === 0 && <Text c="dimmed" size="sm">No existing components in this category.</Text>}
      {components.map((component) => {
        const alreadyCovered = existingComponentIds.has(component.id)
        return (
          <Checkbox
            key={component.id}
            label={component.label + (alreadyCovered ? ' (already has this service type)' : '')}
            checked={checked.has(component.id)}
            disabled={alreadyCovered}
            onChange={() => toggle(component.id)}
          />
        )
      })}
      <Group justify="flex-end">
        <Button variant="default" onClick={onDone}>
          Skip
        </Button>
        <Button onClick={handleApply} loading={applyTemplate.isPending} disabled={checked.size === 0}>
          Apply
        </Button>
      </Group>
    </Stack>
  )
}
