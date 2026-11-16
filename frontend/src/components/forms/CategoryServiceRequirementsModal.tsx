import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Checkbox, Group, Loader, NumberInput, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core'
import AppModal from '../AppModal'
import { useApplyCategoryServiceRequirement, useCreateCategoryServiceRequirement, useDeleteCategoryServiceRequirement, useUpdateCategoryServiceRequirement } from '../../api/mutations'
import { useAllComponentServiceRequirements, useCategoryServiceRequirements, useComponents } from '../../api/queries'
import { categoryLabel } from '../../constants'
import { formatApiError } from '../../api/errors'
import { confirmDelete } from '../confirmDelete'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import {
  CALENDAR_UNIT_OPTIONS,
  RIDE_FILTER_LABELS,
  RIDE_FILTER_OPTIONS,
  activeDimensionsOf,
  draftSatisfiersReady,
  emptyDraftSatisfier,
  formatThresholdSummary,
  hoursToSeconds,
  kmToMeters,
  metersToKm,
  resolveDraftSatisfiers,
  secondsToHours,
} from './serviceRequirementHelpers'
import type { ActiveDimensions, DraftSatisfier } from './serviceRequirementHelpers'
import { DraftSatisfierRow, SatisfiersEditor } from './serviceRequirementShared'
import type { CalendarUnit, CategoryServiceRequirement, RideFilter } from '../../types/models'

interface CategoryServiceRequirementsModalProps {
  opened: boolean
  onClose: () => void
  category: string
}

// This modal has no single submit/cancel row of its own to give AppModal's
// `footer` prop -- it's a management surface (a scrolling list of
// templates, each independently editable/deletable) rather than one form,
// so there's nothing to hoist. Its two inline sub-forms (NewTemplateForm,
// ApplyToComponentsChecklist below) each sticky their *own* action row on
// mobile instead -- see StickyMobileActions.
export default function CategoryServiceRequirementsModal({ opened, onClose, category }: CategoryServiceRequirementsModalProps) {
  return (
    <AppModal opened={opened} onClose={onClose} title={`${categoryLabel(category)} service requirements`} size="xl">
      {opened && <CategoryServiceRequirementsEditor category={category} />}
    </AppModal>
  )
}

// Shared by this file's two sub-forms (NewTemplateForm,
// ApplyToComponentsChecklist) -- each can sit below a long scroll (the
// template list, the component checklist), so its own action row sticks
// to the bottom of the screen on mobile, same mechanism AppModal's own
// `footer` prop uses internally, just applied directly here since there's
// no single modal-level footer for this editor (see the module comment
// above).
function StickyMobileActions({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()
  if (!isMobile) return <Group justify="flex-end">{children}</Group>

  return (
    <Group
      justify="flex-end"
      style={{
        position: 'sticky',
        bottom: 0,
        marginInline: 'calc(var(--mantine-spacing-sm) * -1)',
        marginBottom: 'calc(var(--mantine-spacing-sm) * -1)',
        padding: 'var(--mantine-spacing-sm)',
        paddingBottom: 'calc(var(--mantine-spacing-sm) + env(safe-area-inset-bottom))',
        background: 'var(--mantine-color-body)',
        borderTop: '1px solid var(--mantine-color-default-border)',
      }}
    >
      {children}
    </Group>
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
  const canSubmit = name.trim() !== '' && thresholdSet && draftSatisfiersReady(draftSatisfiers)

  async function handleCreate() {
    if (!canSubmit) return

    const resolvedSatisfiers = await resolveDraftSatisfiers(draftSatisfiers, resolveServiceTypeId)
    if (resolvedSatisfiers === null) return

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
        <DraftSatisfierRow
          key={draft.key}
          draft={draft}
          activeDimensions={activeDimensions}
          canRemove={draftSatisfiers.length > 1}
          onChange={(changes) => updateDraft(draft.key, changes)}
          onRemove={() => removeDraftRow(draft.key)}
        />
      ))}
      <Button size="xs" variant="default" onClick={addDraftRow} style={{ alignSelf: 'flex-start' }}>
        + Add another satisfier
      </Button>

      {createServiceTypeError && <Alert color="red">{formatApiError(createServiceTypeError)}</Alert>}
      {createTemplate.isError && <Alert color="red">{formatApiError(createTemplate.error)}</Alert>}

      <StickyMobileActions>
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!canSubmit} loading={createTemplate.isPending || isCreatingServiceType}>
          Create
        </Button>
      </StickyMobileActions>
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
      <StickyMobileActions>
        <Button variant="default" onClick={onDone}>
          Skip
        </Button>
        <Button onClick={handleApply} loading={applyTemplate.isPending} disabled={checked.size === 0}>
          Apply
        </Button>
      </StickyMobileActions>
    </Stack>
  )
}
