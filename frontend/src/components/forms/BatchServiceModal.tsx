import { useRef, useState } from 'react'
import { Alert, Anchor, Button, Checkbox, Group, Loader, Modal, Select, Stack, Text, Textarea, Title } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useCreateServiceSession } from '../../api/mutations'
import { useServiceableComponents } from '../../api/queries'
import { formatApiError } from '../../api/errors'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import ServiceStatusBadge from '../ServiceStatusBadge'
import ServiceTypeSelect, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypeSelect'
import { formatRemaining } from '../../utils/serviceInterval'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import type { ServiceableComponent, ServiceableComponentInterval } from '../../types/models'

interface AddOtherRow {
  key: string
  componentId: string
  serviceTypeId: string
  serviceTypeNewName: string
  notes: string
}

interface BatchServiceModalProps {
  opened: boolean
  onClose: () => void
  bikeId: number
  // The activity log will pass a ride's end time here -- kept in from the
  // start even though today's two entry points (Bike detail, Dashboard)
  // both omit it.
  initialPerformedAt?: string
}

export default function BatchServiceModal({ opened, onClose, bikeId, initialPerformedAt }: BatchServiceModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Log service" size="xl">
      {opened && <BatchServiceForm onClose={onClose} bikeId={bikeId} initialPerformedAt={initialPerformedAt} />}
    </Modal>
  )
}

function allIntervalIds(data: { mounted: ServiceableComponent[]; off_bike: ServiceableComponent[] } | undefined) {
  if (!data) return new Set<number>()
  return new Set(
    [...data.mounted, ...data.off_bike].flatMap((component) => component.service_intervals.map((interval) => interval.id)),
  )
}

function BatchServiceForm({
  onClose,
  bikeId,
  initialPerformedAt,
}: {
  onClose: () => void
  bikeId: number
  initialPerformedAt?: string
}) {
  const [performedAt, setPerformedAt] = useState(initialPerformedAt ?? nowIsoUtc())
  const [notes, setNotes] = useState('')
  const [checkedIntervalIds, setCheckedIntervalIds] = useState<Set<number>>(new Set())
  const [intervalNotes, setIntervalNotes] = useState<Record<number, string>>({})
  const [addOtherRows, setAddOtherRows] = useState<AddOtherRow[]>([])
  const [droppedCount, setDroppedCount] = useState(0)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [baseError, setBaseError] = useState<string | null>(null)
  const nextRowKey = useRef(0)

  const { data, isPending, isError, error } = useServiceableComponents(bikeId, performedAt)
  const createSession = useCreateServiceSession()
  const { resolveServiceTypeId } = useServiceTypeIdResolver()

  // Whatever's still eligible after a date change stays checked; the rest
  // silently drop, with a one-line note of how many -- adjusted during
  // render (not an effect), the same "resetting state when a dependency
  // changes" pattern used elsewhere in this app (e.g. RidesTab's own
  // prevFilters), since calling setState synchronously inside an effect is
  // a lint error here.
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    const validIds = allIntervalIds(data)
    const stillChecked = new Set([...checkedIntervalIds].filter((id) => validIds.has(id)))
    setDroppedCount(checkedIntervalIds.size - stillChecked.size)
    if (stillChecked.size !== checkedIntervalIds.size) setCheckedIntervalIds(stillChecked)
  }

  function handleDateChange(value: string | null) {
    const iso = mantineLocalStringToIsoUtc(value)
    if (iso) setPerformedAt(iso)
  }

  function toggleInterval(id: number) {
    setCheckedIntervalIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllDueAndWarning() {
    if (!data) return
    const ids = [...data.mounted, ...data.off_bike]
      .flatMap((component) => component.service_intervals)
      .filter((interval) => interval.status === 'due' || interval.status === 'warning')
      .map((interval) => interval.id)
    setCheckedIntervalIds((prev) => new Set([...prev, ...ids]))
  }

  function addOtherRow() {
    const key = `other-${nextRowKey.current++}`
    setAddOtherRows((prev) => [...prev, { key, componentId: '', serviceTypeId: '', serviceTypeNewName: '', notes: '' }])
  }

  function updateAddOtherRow(key: string, changes: Partial<AddOtherRow>) {
    setAddOtherRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  }

  function removeAddOtherRow(key: string) {
    setAddOtherRows((prev) => prev.filter((row) => row.key !== key))
  }

  const eligibleComponents = data ? [...data.mounted, ...data.off_bike] : []
  const componentOptions = eligibleComponents.map((c) => ({ value: String(c.id), label: c.label }))
  const validAddOtherRows = addOtherRows.filter((row) => row.componentId && row.serviceTypeId)
  const selectedCount = checkedIntervalIds.size + validAddOtherRows.length
  const empty = !isPending && !isError && eligibleComponents.length === 0

  async function handleSubmit() {
    setBaseError(null)
    setRowErrors({})

    type PendingEvent = { rowKey: string; component_id: number; service_type_id: number; notes: string | null }
    const pending: PendingEvent[] = []

    for (const component of eligibleComponents) {
      for (const interval of component.service_intervals) {
        if (!checkedIntervalIds.has(interval.id)) continue
        pending.push({
          rowKey: `interval-${interval.id}`,
          component_id: component.id,
          service_type_id: interval.service_type_id,
          notes: intervalNotes[interval.id]?.trim() || null,
        })
      }
    }

    for (const row of validAddOtherRows) {
      let serviceTypeId: number
      try {
        serviceTypeId = await resolveServiceTypeId(row.serviceTypeId, row.serviceTypeNewName)
      } catch (err) {
        setBaseError(formatApiError(err) || 'Could not create the new service type.')
        return
      }
      pending.push({
        rowKey: row.key,
        component_id: Number(row.componentId),
        service_type_id: serviceTypeId,
        notes: row.notes.trim() || null,
      })
    }

    createSession.mutate(
      {
        bikeId,
        performed_at: performedAt,
        notes: notes.trim() || null,
        events: pending.map(({ rowKey, ...event }) => {
          void rowKey
          return event
        }),
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          const body = err instanceof ApiError && err.body && typeof err.body === 'object' ? err.body : null
          const rowErrorsBody = body && 'row_errors' in body ? (body as { row_errors: Record<string, Record<string, string[]>> }).row_errors : null

          if (rowErrorsBody) {
            const nextRowErrors: Record<string, string> = {}
            Object.entries(rowErrorsBody).forEach(([index, fieldErrors]) => {
              const event = pending[Number(index)]
              if (event) nextRowErrors[event.rowKey] = Object.values(fieldErrors).flat().join(', ')
            })
            setRowErrors(nextRowErrors)
          } else {
            setBaseError(formatApiError(err) || 'Could not log these services.')
          }
        },
      },
    )
  }

  return (
    <Stack>
      <DateTimePicker
        label="Performed at"
        required
        value={isoUtcToDate(performedAt)}
        onChange={handleDateChange}
      />
      <Text size="xs" c="dimmed">
        Status and remaining/overdue shown below is as of today — it's here to help you choose, not a record of
        what it was on this date.
      </Text>
      {droppedCount > 0 && (
        <Text size="xs" c="dimmed">
          {droppedCount} {droppedCount === 1 ? 'service was' : 'services were'} no longer eligible at that time and
          {droppedCount === 1 ? ' was' : ' were'} unchecked.
        </Text>
      )}
      <Textarea label="Note (optional)" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />

      {baseError && <Alert color="red">{baseError}</Alert>}

      {isPending && <Loader />}

      {isError && (
        <Alert color="red" title="Failed to load this bike's components">
          {error.message}
        </Alert>
      )}

      {empty && (
        <Text c="dimmed">
          No components were on this bike at that time.{' '}
          <Anchor component={Link} to={`/bikes/${bikeId}`}>
            View this bike's components
          </Anchor>
          .
        </Text>
      )}

      {!isPending && !isError && !empty && (
        <>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {selectedCount} selected
            </Text>
            <Button size="xs" variant="default" onClick={selectAllDueAndWarning}>
              Select all due and warning
            </Button>
          </Group>

          {data!.mounted.length > 0 && (
            <Stack gap="xs">
              <Title order={5}>Mounted</Title>
              {data!.mounted.map((component) => (
                <ComponentGroup
                  key={component.id}
                  component={component}
                  checkedIntervalIds={checkedIntervalIds}
                  intervalNotes={intervalNotes}
                  rowErrors={rowErrors}
                  onToggle={toggleInterval}
                  onNoteChange={(id, value) => setIntervalNotes((prev) => ({ ...prev, [id]: value }))}
                />
              ))}
            </Stack>
          )}

          {data!.off_bike.length > 0 && (
            <Stack gap="xs" c="dimmed">
              <Title order={5} c="dimmed">
                Off the bike
              </Title>
              {data!.off_bike.map((component) => (
                <ComponentGroup
                  key={component.id}
                  component={component}
                  checkedIntervalIds={checkedIntervalIds}
                  intervalNotes={intervalNotes}
                  rowErrors={rowErrors}
                  onToggle={toggleInterval}
                  onNoteChange={(id, value) => setIntervalNotes((prev) => ({ ...prev, [id]: value }))}
                />
              ))}
            </Stack>
          )}

          <Stack gap="xs">
            {addOtherRows.map((row) => (
              <AddOtherRowInput
                key={row.key}
                row={row}
                componentOptions={componentOptions}
                error={rowErrors[row.key]}
                onChange={(changes) => updateAddOtherRow(row.key, changes)}
                onRemove={() => removeAddOtherRow(row.key)}
              />
            ))}
            <Button size="xs" variant="subtle" onClick={addOtherRow} style={{ alignSelf: 'flex-start' }}>
              + Add other…
            </Button>
          </Stack>
        </>
      )}

      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={createSession.isPending}
          disabled={selectedCount === 0}
          title={selectedCount === 0 ? 'Select at least one service' : undefined}
        >
          Log {selectedCount} {selectedCount === 1 ? 'service' : 'services'}
        </Button>
      </Group>
    </Stack>
  )
}

function ComponentGroup({
  component,
  checkedIntervalIds,
  intervalNotes,
  rowErrors,
  onToggle,
  onNoteChange,
}: {
  component: ServiceableComponent
  checkedIntervalIds: Set<number>
  intervalNotes: Record<number, string>
  rowErrors: Record<string, string>
  onToggle: (id: number) => void
  onNoteChange: (id: number, value: string) => void
}) {
  if (component.service_intervals.length === 0) return null

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {component.label}
      </Text>
      {component.service_intervals.map((interval) => (
        <IntervalRow
          key={interval.id}
          interval={interval}
          checked={checkedIntervalIds.has(interval.id)}
          note={intervalNotes[interval.id] ?? ''}
          error={rowErrors[`interval-${interval.id}`]}
          onToggle={() => onToggle(interval.id)}
          onNoteChange={(value) => onNoteChange(interval.id, value)}
        />
      ))}
    </Stack>
  )
}

function IntervalRow({
  interval,
  checked,
  note,
  error,
  onToggle,
  onNoteChange,
}: {
  interval: ServiceableComponentInterval
  checked: boolean
  note: string
  error: string | undefined
  onToggle: () => void
  onNoteChange: (value: string) => void
}) {
  return (
    <Stack gap={2} pl="md">
      <Group gap="sm" wrap="nowrap">
        <Checkbox checked={checked} onChange={onToggle} label={interval.service_type_name} />
        <ServiceStatusBadge status={interval.status} />
        <Text size="sm" c={interval.status === 'due' ? 'red' : 'dimmed'}>
          {formatRemaining(interval.distance_remaining_meters, interval.days_remaining)}
        </Text>
      </Group>
      {checked && (
        <Textarea
          size="xs"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => onNoteChange(e.currentTarget.value)}
          ml="xl"
        />
      )}
      {error && (
        <Text size="xs" c="red" ml="xl">
          {error}
        </Text>
      )}
    </Stack>
  )
}

function AddOtherRowInput({
  row,
  componentOptions,
  error,
  onChange,
  onRemove,
}: {
  row: AddOtherRow
  componentOptions: { value: string; label: string }[]
  error: string | undefined
  onChange: (changes: Partial<AddOtherRow>) => void
  onRemove: () => void
}) {
  return (
    <Stack gap={4} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
      <Group align="flex-start" wrap="wrap">
        <Select
          placeholder="Component"
          data={componentOptions}
          value={row.componentId || null}
          onChange={(value) => onChange({ componentId: value ?? '' })}
          style={{ flex: '1 1 200px' }}
        />
        <div style={{ flex: '1 1 200px' }}>
          <ServiceTypeSelect
            value={row.serviceTypeId}
            onChange={(value) => onChange({ serviceTypeId: value })}
            newTypeName={row.serviceTypeNewName}
            onNewTypeNameChange={(value) => onChange({ serviceTypeNewName: value })}
          />
        </div>
        <Button size="xs" variant="subtle" color="red" onClick={onRemove}>
          Remove
        </Button>
      </Group>
      {(row.componentId || row.serviceTypeId === CREATE_NEW_SERVICE_TYPE) && (
        <Textarea
          size="xs"
          placeholder="Note (optional)"
          value={row.notes}
          onChange={(e) => onChange({ notes: e.currentTarget.value })}
        />
      )}
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Stack>
  )
}
