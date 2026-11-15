import { useMemo, useState } from 'react'
import { ActionIcon, Alert, Button, Group, NumberInput, Select, Stack, Text } from '@mantine/core'
import {
  useCreateServiceRequirementSatisfier,
  useDeleteServiceRequirementSatisfier,
  useReorderServiceRequirementSatisfiers,
  useUpdateServiceRequirementSatisfier,
} from '../../api/mutations'
import type { SatisfierOwner } from '../../api/mutations'
import { formatApiError } from '../../api/errors'
import { confirmDelete } from '../confirmDelete'
import ServiceTypeSelect from '../ServiceTypeSelect'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import { CALENDAR_UNIT_OPTIONS, kmToMeters, hoursToSeconds, metersToKm, secondsToHours } from './serviceRequirementHelpers'
import type { ActiveDimensions, DraftSatisfier } from './serviceRequirementHelpers'
import type { CalendarUnit, ServiceRequirementSatisfier } from '../../types/models'

// The JSX half of the shared requirement editor -- see
// serviceRequirementShared.ts for the constants/conversions/pure helpers
// this imports. Split into its own file so this one can export components
// only (react-refresh/only-export-components).

// --- Persisted satisfiers (an already-created template or custom
// requirement) ---

export function SatisfiersEditor({
  owner,
  satisfiers,
  activeDimensions,
}: {
  owner: SatisfierOwner
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

// --- A draft satisfier row (before the owning requirement exists yet) ---

export function DraftSatisfierRow({
  draft,
  activeDimensions,
  canRemove,
  onChange,
  onRemove,
}: {
  draft: DraftSatisfier
  activeDimensions: ActiveDimensions
  canRemove: boolean
  onChange: (changes: Partial<DraftSatisfier>) => void
  onRemove: () => void
}) {
  return (
    <Group align="flex-end" wrap="wrap" gap="xs">
      <div style={{ minWidth: 200 }}>
        <ServiceTypeSelect
          value={draft.typeId}
          onChange={(v) => onChange({ typeId: v })}
          newTypeName={draft.typeName}
          onNewTypeNameChange={(v) => onChange({ typeName: v })}
        />
      </div>
      {activeDimensions.distance && (
        <NumberInput
          label="km"
          placeholder="same as requirement"
          value={draft.km}
          onChange={(v) => onChange({ km: v === '' ? '' : Number(v) })}
          min={0}
          w={150}
        />
      )}
      {activeDimensions.movingTime && (
        <NumberInput
          label="hours"
          placeholder="same as requirement"
          value={draft.hours}
          onChange={(v) => onChange({ hours: v === '' ? '' : Number(v) })}
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
            onChange={(v) => onChange({ calendarAmount: v === '' ? '' : Number(v) })}
            min={0}
            w={90}
          />
          <Select
            data={CALENDAR_UNIT_OPTIONS}
            value={draft.calendarUnit}
            onChange={(v) => onChange({ calendarUnit: (v as CalendarUnit | null) ?? 'month' })}
            w={100}
            allowDeselect={false}
          />
        </Group>
      )}
      <Button size="xs" variant="subtle" color="red" disabled={!canRemove} onClick={onRemove}>
        Remove
      </Button>
    </Group>
  )
}
