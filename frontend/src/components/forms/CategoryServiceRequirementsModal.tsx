import { useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import {
  useApplyCategoryServiceRequirement,
  useCreateCategoryServiceRequirement,
  useCreateServiceRequirementSatisfier,
  useDeleteCategoryServiceRequirement,
  useDeleteServiceRequirementSatisfier,
  useReorderServiceRequirementSatisfiers,
  useUpdateCategoryServiceRequirement,
  useUpdateServiceRequirementSatisfier,
} from '../../api/mutations'
import type { SatisfierInput } from '../../api/mutations'
import { useAllComponentServiceRequirements, useCategoryServiceRequirements, useComponents } from '../../api/queries'
import { categoryLabel } from '../../constants'
import { formatApiError } from '../../api/errors'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { confirmDelete } from '../confirmDelete'
import ServiceTypeSelect, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypeSelect'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import type { CalendarUnit, CategoryServiceRequirement, RideFilter, ServiceRequirementSatisfier } from '../../types/models'

interface CategoryServiceRequirementsModalProps {
  opened: boolean
  onClose: () => void
  category: string
}

const RIDE_FILTER_OPTIONS = [
  { value: 'all', label: 'All rides' },
  { value: 'outdoor', label: 'Outdoor only' },
  { value: 'indoor', label: 'Indoor only' },
]

const RIDE_FILTER_LABELS: Record<RideFilter, string> = {
  all: 'All rides',
  outdoor: 'Outdoor only',
  indoor: 'Indoor only',
}

const CALENDAR_UNIT_OPTIONS = [
  { value: 'day', label: 'days' },
  { value: 'month', label: 'months' },
  { value: 'year', label: 'years' },
]

function metersToKm(meters: number | null): number | '' {
  return meters == null ? '' : meters / 1000
}
function kmToMeters(km: number | ''): number | null {
  return km === '' ? null : Math.round(km * 1000)
}
function secondsToHours(seconds: number | null): number | '' {
  return seconds == null ? '' : seconds / 3600
}
function hoursToSeconds(hours: number | ''): number | null {
  return hours === '' ? null : Math.round(hours * 3600)
}

// Whichever threshold is reached first drives the requirement due, so this
// joins every set dimension with " / " -- same convention as the old
// formatInterval (distance / days) in utils/serviceInterval.ts, extended to
// a third dimension.
function formatThresholdSummary(requirement: CategoryServiceRequirement): string {
  const parts: string[] = []
  if (requirement.distance_meters != null) parts.push(formatDistance(requirement.distance_meters))
  if (requirement.moving_time_seconds != null) parts.push(formatDuration(requirement.moving_time_seconds))
  if (requirement.calendar_amount != null && requirement.calendar_unit != null) {
    parts.push(`${requirement.calendar_amount} ${requirement.calendar_unit}${requirement.calendar_amount === 1 ? '' : 's'}`)
  }
  return parts.join(' / ') || 'No threshold set'
}

interface ActiveDimensions {
  distance: boolean
  movingTime: boolean
  calendar: boolean
}

function activeDimensionsOf(requirement: { distance_meters: number | null; moving_time_seconds: number | null; calendar_amount: number | null }): ActiveDimensions {
  return {
    distance: requirement.distance_meters != null,
    movingTime: requirement.moving_time_seconds != null,
    calendar: requirement.calendar_amount != null,
  }
}

export default function CategoryServiceRequirementsModal({ opened, onClose, category }: CategoryServiceRequirementsModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={`${categoryLabel(category)} service requirements`} size="xl">
      {opened && <CategoryServiceRequirementsEditor category={category} />}
    </Modal>
  )
}

function CategoryServiceRequirementsEditor({ category }: { category: string }) {
  const { data: allTemplates, isPending: templatesPending } = useCategoryServiceRequirements()
  const { data: components } = useComponents()
  const { data: allComponentRequirements } = useAllComponentServiceRequirements()

  const templates = useMemo(() => (allTemplates ?? []).filter((t) => t.category === category), [allTemplates, category])
  const categoryComponents = useMemo(
    () => (components ?? []).filter((c) => c.category === category && !c.retired_on),
    [components, category],
  )

  const [applyTemplateId, setApplyTemplateId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const applyTemplate = templates.find((t) => t.id === applyTemplateId)

  return (
    <Stack>
      {templatesPending && <Loader />}

      {templates.map((template) => (
        <TemplateCard key={template.id} template={template} onApplyReady={() => setApplyTemplateId(template.id)} />
      ))}

      {applyTemplate && (
        <ApplyToComponentsChecklist
          template={applyTemplate}
          components={categoryComponents}
          existingComponentIds={new Set(
            (allComponentRequirements ?? [])
              .filter((r) => r.category_service_requirement_id === applyTemplate.id)
              .map((r) => r.component_id),
          )}
          onDone={() => setApplyTemplateId(null)}
        />
      )}

      {creating ? (
        <NewTemplateForm
          category={category}
          onCreated={(created) => {
            setCreating(false)
            setApplyTemplateId(created.id)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <Button variant="default" onClick={() => setCreating(true)} style={{ alignSelf: 'flex-start' }}>
          + Add requirement
        </Button>
      )}
    </Stack>
  )
}

function TemplateCard({ template, onApplyReady }: { template: CategoryServiceRequirement; onApplyReady: () => void }) {
  const [editing, setEditing] = useState(false)
  const deleteTemplate = useDeleteCategoryServiceRequirement()

  function handleDelete() {
    confirmDelete({
      title: 'Delete service requirement',
      message: `Delete "${template.name}"? Every linked component loses this default. This cannot be undone.`,
      onConfirm: () => deleteTemplate.mutate(template.id),
    })
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text fw={500}>{template.name}</Text>
          <Text size="sm" c="dimmed">
            {formatThresholdSummary(template)} · {RIDE_FILTER_LABELS[template.ride_filter]} · Satisfied by{' '}
            {template.satisfiers.map((s) => s.service_type_name).join(' or ')}
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="default" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
          <Button size="xs" variant="default" onClick={onApplyReady}>
            Apply to components
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={handleDelete} loading={deleteTemplate.isPending}>
            Delete
          </Button>
        </Group>
      </Group>

      {editing && (
        <>
          <RequirementFieldsEditor template={template} />
          <SatisfiersEditor
            owner={{ type: 'category', id: template.id }}
            satisfiers={template.satisfiers}
            activeDimensions={activeDimensionsOf(template)}
          />
        </>
      )}
    </Stack>
  )
}

function RequirementFieldsEditor({ template }: { template: CategoryServiceRequirement }) {
  const updateTemplate = useUpdateCategoryServiceRequirement(template.id)

  const [name, setName] = useState(template.name)
  const [km, setKm] = useState<number | ''>(metersToKm(template.distance_meters))
  const [hours, setHours] = useState<number | ''>(secondsToHours(template.moving_time_seconds))
  const [calendarAmount, setCalendarAmount] = useState<number | ''>(template.calendar_amount ?? '')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(template.calendar_unit ?? 'month')
  const [rideFilter, setRideFilter] = useState<RideFilter>(template.ride_filter)

  function commitName() {
    const trimmed = name.trim()
    if (trimmed && trimmed !== template.name) updateTemplate.mutate({ name: trimmed })
  }

  return (
    <Stack gap="xs">
      <TextInput
        label="Name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={commitName}
        w={300}
      />
      <Group align="flex-end" wrap="wrap">
        <NumberInput
          label="Every (km)"
          placeholder="not used"
          value={km}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setKm(next)
            updateTemplate.mutate({ distance_meters: kmToMeters(next) })
          }}
          min={0}
          w={120}
        />
        <NumberInput
          label="Every (hours)"
          placeholder="not used"
          value={hours}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setHours(next)
            updateTemplate.mutate({ moving_time_seconds: hoursToSeconds(next) })
          }}
          min={0}
          w={120}
        />
        <Group gap={4} align="flex-end" wrap="nowrap">
          <NumberInput
            label="Every"
            placeholder="not used"
            value={calendarAmount}
            onChange={(v) => {
              const next = v === '' ? '' : Number(v)
              setCalendarAmount(next)
              updateTemplate.mutate({
                calendar_amount: next === '' ? null : next,
                calendar_unit: next === '' ? null : calendarUnit,
              })
            }}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={calendarUnit}
            onChange={(v) => {
              const next = (v as CalendarUnit | null) ?? 'month'
              setCalendarUnit(next)
              if (calendarAmount !== '') updateTemplate.mutate({ calendar_unit: next })
            }}
            w={100}
            allowDeselect={false}
          />
        </Group>
      </Group>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Counts
        </Text>
        <SegmentedControl
          data={RIDE_FILTER_OPTIONS}
          value={rideFilter}
          onChange={(v) => {
            const next = v as RideFilter
            setRideFilter(next)
            updateTemplate.mutate({ ride_filter: next })
          }}
        />
        {rideFilter !== 'all' && calendarAmount !== '' && (
          <Text size="xs" c="dimmed" mt={4}>
            Calendar time keeps counting on indoor rides.
          </Text>
        )}
      </div>

      {updateTemplate.isError && <Alert color="red">{formatApiError(updateTemplate.error)}</Alert>}
    </Stack>
  )
}

function SatisfiersEditor({
  owner,
  satisfiers,
  activeDimensions,
}: {
  owner: { type: 'category'; id: number }
  satisfiers: ServiceRequirementSatisfier[]
  activeDimensions: ActiveDimensions
}) {
  const reorder = useReorderServiceRequirementSatisfiers(owner)
  const createSatisfier = useCreateServiceRequirementSatisfier(owner)
  const { resolveServiceTypeId, isCreatingServiceType, createServiceTypeError } = useServiceTypeIdResolver()

  const ordered = useMemo(() => [...satisfiers].sort((a, b) => a.position - b.position), [satisfiers])

  const [addingTypeId, setAddingTypeId] = useState('')
  const [addingTypeName, setAddingTypeName] = useState('')

  function moveSatisfier(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    const next = [...ordered]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorder.mutate(next.map((s) => s.id))
  }

  async function handleAdd() {
    if (!addingTypeId) return
    const serviceTypeId = await resolveServiceTypeId(addingTypeId, addingTypeName).catch(() => null)
    if (serviceTypeId === null) return

    createSatisfier.mutate(
      { service_type_id: serviceTypeId },
      {
        onSuccess: () => {
          setAddingTypeId('')
          setAddingTypeName('')
        },
      },
    )
  }

  return (
    <Stack gap="xs">
      <Text fw={500} size="sm">
        Satisfied by
      </Text>
      {ordered.map((satisfier, index) => (
        <SatisfierRow
          key={satisfier.id}
          satisfier={satisfier}
          activeDimensions={activeDimensions}
          canRemove={ordered.length > 1}
          canMoveUp={index > 0}
          canMoveDown={index < ordered.length - 1}
          onMoveUp={() => moveSatisfier(index, -1)}
          onMoveDown={() => moveSatisfier(index, 1)}
        />
      ))}
      <Group align="flex-end" wrap="wrap" gap="xs">
        <div style={{ minWidth: 200 }}>
          <ServiceTypeSelect
            label="Add satisfier"
            value={addingTypeId}
            onChange={setAddingTypeId}
            newTypeName={addingTypeName}
            onNewTypeNameChange={setAddingTypeName}
          />
        </div>
        <Button size="xs" onClick={handleAdd} disabled={!addingTypeId} loading={createSatisfier.isPending || isCreatingServiceType}>
          Add
        </Button>
      </Group>
      {createServiceTypeError && <Alert color="red">{formatApiError(createServiceTypeError)}</Alert>}
      {createSatisfier.isError && <Alert color="red">{formatApiError(createSatisfier.error)}</Alert>}
      {reorder.isError && <Alert color="red">{formatApiError(reorder.error)}</Alert>}
    </Stack>
  )
}

function SatisfierRow({
  satisfier,
  activeDimensions,
  canRemove,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  satisfier: ServiceRequirementSatisfier
  activeDimensions: ActiveDimensions
  canRemove: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const updateSatisfier = useUpdateServiceRequirementSatisfier(satisfier.id)
  const deleteSatisfier = useDeleteServiceRequirementSatisfier()

  const [km, setKm] = useState<number | ''>(metersToKm(satisfier.allowance_distance_meters))
  const [hours, setHours] = useState<number | ''>(secondsToHours(satisfier.allowance_moving_time_seconds))
  const [calendarAmount, setCalendarAmount] = useState<number | ''>(satisfier.allowance_calendar_amount ?? '')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>(satisfier.allowance_calendar_unit ?? 'month')

  function handleRemove() {
    confirmDelete({
      title: 'Remove satisfier',
      message: `Remove ${satisfier.service_type_name} as a way to satisfy this requirement? This cannot be undone.`,
      onConfirm: () => deleteSatisfier.mutate(satisfier.id),
    })
  }

  return (
    <Group align="flex-end" wrap="wrap" gap="xs">
      <Text w={160}>{satisfier.service_type_name}</Text>
      {activeDimensions.distance && (
        <NumberInput
          label="km"
          placeholder="same as requirement"
          value={km}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setKm(next)
            updateSatisfier.mutate({ allowance_distance_meters: kmToMeters(next) })
          }}
          min={0}
          w={150}
        />
      )}
      {activeDimensions.movingTime && (
        <NumberInput
          label="hours"
          placeholder="same as requirement"
          value={hours}
          onChange={(v) => {
            const next = v === '' ? '' : Number(v)
            setHours(next)
            updateSatisfier.mutate({ allowance_moving_time_seconds: hoursToSeconds(next) })
          }}
          min={0}
          w={150}
        />
      )}
      {activeDimensions.calendar && (
        <Group gap={4} align="flex-end" wrap="nowrap">
          <NumberInput
            label="calendar"
            placeholder="same"
            value={calendarAmount}
            onChange={(v) => {
              const next = v === '' ? '' : Number(v)
              setCalendarAmount(next)
              updateSatisfier.mutate({
                allowance_calendar_amount: next === '' ? null : next,
                allowance_calendar_unit: next === '' ? null : calendarUnit,
              })
            }}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={calendarUnit}
            onChange={(v) => {
              const next = (v as CalendarUnit | null) ?? 'month'
              setCalendarUnit(next)
              if (calendarAmount !== '') updateSatisfier.mutate({ allowance_calendar_unit: next })
            }}
            w={100}
            allowDeselect={false}
          />
        </Group>
      )}
      <Group gap={4} wrap="nowrap">
        <ActionIcon variant="default" disabled={!canMoveUp} onClick={onMoveUp} aria-label={`Move ${satisfier.service_type_name} up`}>
          ↑
        </ActionIcon>
        <ActionIcon variant="default" disabled={!canMoveDown} onClick={onMoveDown} aria-label={`Move ${satisfier.service_type_name} down`}>
          ↓
        </ActionIcon>
        <Button size="xs" variant="subtle" color="red" disabled={!canRemove} onClick={handleRemove} loading={deleteSatisfier.isPending}>
          Remove
        </Button>
      </Group>
      {updateSatisfier.isError && (
        <Text c="red" size="xs">
          {formatApiError(updateSatisfier.error)}
        </Text>
      )}
    </Group>
  )
}

interface DraftSatisfier {
  key: string
  typeId: string
  typeName: string
  km: number | ''
  hours: number | ''
  calendarAmount: number | ''
  calendarUnit: CalendarUnit
}

function emptyDraftSatisfier(key: string): DraftSatisfier {
  return { key, typeId: '', typeName: '', km: '', hours: '', calendarAmount: '', calendarUnit: 'month' }
}

function NewTemplateForm({
  category,
  onCreated,
  onCancel,
}: {
  category: string
  onCreated: (created: CategoryServiceRequirement) => void
  onCancel: () => void
}) {
  const createTemplate = useCreateCategoryServiceRequirement()
  const { resolveServiceTypeId, isCreatingServiceType, createServiceTypeError } = useServiceTypeIdResolver()
  const nextDraftKey = useRef(1)

  const [name, setName] = useState('')
  const [km, setKm] = useState<number | ''>('')
  const [hours, setHours] = useState<number | ''>('')
  const [calendarAmount, setCalendarAmount] = useState<number | ''>('')
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>('month')
  const [rideFilter, setRideFilter] = useState<RideFilter>('all')
  const [draftSatisfiers, setDraftSatisfiers] = useState<DraftSatisfier[]>([emptyDraftSatisfier('0')])

  const activeDimensions: ActiveDimensions = { distance: km !== '', movingTime: hours !== '', calendar: calendarAmount !== '' }

  function updateDraft(key: string, changes: Partial<DraftSatisfier>) {
    setDraftSatisfiers((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)))
  }

  function addDraftRow() {
    const key = String(nextDraftKey.current++)
    setDraftSatisfiers((prev) => [...prev, emptyDraftSatisfier(key)])
  }

  function removeDraftRow(key: string) {
    setDraftSatisfiers((prev) => (prev.length > 1 ? prev.filter((d) => d.key !== key) : prev))
  }

  const thresholdSet = km !== '' || hours !== '' || calendarAmount !== ''
  const satisfiersReady = draftSatisfiers.every(
    (d) => d.typeId !== '' && (d.typeId !== CREATE_NEW_SERVICE_TYPE || d.typeName.trim() !== ''),
  )
  const canSubmit = name.trim() !== '' && thresholdSet && satisfiersReady

  async function handleCreate() {
    if (!canSubmit) return

    const resolvedSatisfiers: SatisfierInput[] = []
    for (const draft of draftSatisfiers) {
      const serviceTypeId = await resolveServiceTypeId(draft.typeId, draft.typeName).catch(() => null)
      if (serviceTypeId === null) return
      resolvedSatisfiers.push({
        service_type_id: serviceTypeId,
        allowance_distance_meters: kmToMeters(draft.km),
        allowance_moving_time_seconds: hoursToSeconds(draft.hours),
        allowance_calendar_amount: draft.calendarAmount === '' ? null : draft.calendarAmount,
        allowance_calendar_unit: draft.calendarAmount === '' ? null : draft.calendarUnit,
      })
    }

    createTemplate.mutate(
      {
        values: {
          category,
          name: name.trim(),
          distance_meters: kmToMeters(km),
          moving_time_seconds: hoursToSeconds(hours),
          calendar_amount: calendarAmount === '' ? null : calendarAmount,
          calendar_unit: calendarAmount === '' ? null : calendarUnit,
          ride_filter: rideFilter,
        },
        satisfiers: resolvedSatisfiers,
      },
      { onSuccess: onCreated },
    )
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Text fw={500} size="sm">
        New requirement
      </Text>
      <TextInput label="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} required w={300} />
      <Group align="flex-end" wrap="wrap">
        <NumberInput label="Every (km)" value={km} onChange={(v) => setKm(v === '' ? '' : Number(v))} min={0} w={120} />
        <NumberInput label="Every (hours)" value={hours} onChange={(v) => setHours(v === '' ? '' : Number(v))} min={0} w={120} />
        <Group gap={4} align="flex-end" wrap="nowrap">
          <NumberInput
            label="Every"
            value={calendarAmount}
            onChange={(v) => setCalendarAmount(v === '' ? '' : Number(v))}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={calendarUnit}
            onChange={(v) => setCalendarUnit((v as CalendarUnit | null) ?? 'month')}
            w={100}
            allowDeselect={false}
          />
        </Group>
      </Group>
      {!thresholdSet && (
        <Text size="xs" c="red">
          Set at least one of distance, hours, or calendar.
        </Text>
      )}

      <div>
        <Text size="sm" fw={500} mb={4}>
          Counts
        </Text>
        <SegmentedControl data={RIDE_FILTER_OPTIONS} value={rideFilter} onChange={(v) => setRideFilter(v as RideFilter)} />
        {rideFilter !== 'all' && calendarAmount !== '' && (
          <Text size="xs" c="dimmed" mt={4}>
            Calendar time keeps counting on indoor rides.
          </Text>
        )}
      </div>

      <Text fw={500} size="sm">
        Satisfied by
      </Text>
      {draftSatisfiers.map((draft) => (
        <Group key={draft.key} align="flex-end" wrap="wrap" gap="xs">
          <div style={{ minWidth: 200 }}>
            <ServiceTypeSelect
              value={draft.typeId}
              onChange={(v) => updateDraft(draft.key, { typeId: v })}
              newTypeName={draft.typeName}
              onNewTypeNameChange={(v) => updateDraft(draft.key, { typeName: v })}
            />
          </div>
          {activeDimensions.distance && (
            <NumberInput
              label="km"
              placeholder="same as requirement"
              value={draft.km}
              onChange={(v) => updateDraft(draft.key, { km: v === '' ? '' : Number(v) })}
              min={0}
              w={150}
            />
          )}
          {activeDimensions.movingTime && (
            <NumberInput
              label="hours"
              placeholder="same as requirement"
              value={draft.hours}
              onChange={(v) => updateDraft(draft.key, { hours: v === '' ? '' : Number(v) })}
              min={0}
              w={150}
            />
          )}
          {activeDimensions.calendar && (
            <Group gap={4} align="flex-end" wrap="nowrap">
              <NumberInput
                label="calendar"
                placeholder="same"
                value={draft.calendarAmount}
                onChange={(v) => updateDraft(draft.key, { calendarAmount: v === '' ? '' : Number(v) })}
                min={0}
                w={90}
              />
              <Select
                data={CALENDAR_UNIT_OPTIONS}
                value={draft.calendarUnit}
                onChange={(v) => updateDraft(draft.key, { calendarUnit: (v as CalendarUnit | null) ?? 'month' })}
                w={100}
                allowDeselect={false}
              />
            </Group>
          )}
          <Button size="xs" variant="subtle" color="red" disabled={draftSatisfiers.length <= 1} onClick={() => removeDraftRow(draft.key)}>
            Remove
          </Button>
        </Group>
      ))}
      <Button size="xs" variant="default" onClick={addDraftRow} style={{ alignSelf: 'flex-start' }}>
        + Add another satisfier
      </Button>

      {createServiceTypeError && <Alert color="red">{formatApiError(createServiceTypeError)}</Alert>}
      {createTemplate.isError && <Alert color="red">{formatApiError(createTemplate.error)}</Alert>}

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!canSubmit} loading={createTemplate.isPending || isCreatingServiceType}>
          Create
        </Button>
      </Group>
    </Stack>
  )
}

function ApplyToComponentsChecklist({
  template,
  components,
  existingComponentIds,
  onDone,
}: {
  template: CategoryServiceRequirement
  components: { id: number; label: string }[]
  existingComponentIds: Set<number>
  onDone: () => void
}) {
  const applyTemplate = useApplyCategoryServiceRequirement(template.id)
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
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Text fw={500} size="sm">
        Apply &quot;{template.name}&quot; to existing components
      </Text>
      {components.length === 0 && (
        <Text c="dimmed" size="sm">
          No existing components in this category.
        </Text>
      )}
      {components.map((component) => {
        const alreadyCovered = existingComponentIds.has(component.id)
        return (
          <Checkbox
            key={component.id}
            label={component.label + (alreadyCovered ? ' (already linked to this requirement)' : '')}
            checked={checked.has(component.id)}
            disabled={alreadyCovered}
            onChange={() => toggle(component.id)}
          />
        )
      })}
      {applyTemplate.isError && <Alert color="red">{formatApiError(applyTemplate.error)}</Alert>}
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
