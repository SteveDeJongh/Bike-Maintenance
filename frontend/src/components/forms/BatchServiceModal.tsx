import { useMemo, useRef, useState } from 'react'
import { Alert, Anchor, Button, Checkbox, Group, Loader, Select, Stack, Text, Textarea, Title } from '@mantine/core'
import AppModal from '../AppModal'
import { DateTimePicker } from '@mantine/dates'
import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useCreateServiceSession } from '../../api/mutations'
import { useServiceableComponents } from '../../api/queries'
import { formatApiError } from '../../api/errors'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import { SERVICE_STATUS_SEVERITY } from '../../constants'
import ServiceStatusBadge from '../ServiceStatusBadge'
import ServiceTypeSelect, { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypeSelect'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import type { ServiceableComponent, ServiceStatus } from '../../types/models'

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

// Unlike every other form modal, this one's form state includes a live
// per-bike/per-date query (useServiceableComponents below) -- keeping
// AppModal mounted through a close transition (the pattern
// MaintenanceEventFormModal uses, whose own form has no comparable
// per-instance query to keep alive) would mean that query stays active
// for as long as the fade/slide-out animation runs, for no benefit. So
// this modal only mounts AppModal -- and everything inside it -- while
// actually open: a real tradeoff (no close-transition animation, just an
// instant unmount; the open transition is unaffected), accepted because
// keeping an expensive query alive purely to animate a close isn't worth
// it. Same reasoning applies to CategoryServiceRequirementsModal.
export default function BatchServiceModal({ opened, onClose, bikeId, initialPerformedAt }: BatchServiceModalProps) {
  return (
    opened && <BatchServiceForm onClose={onClose} bikeId={bikeId} initialPerformedAt={initialPerformedAt} />
  )
}

// One row per (component, service type) that satisfies at least one of that
// component's enabled requirements -- not one row per requirement. A
// service type satisfying two requirements at once (e.g. a 200h service
// that also clears a 50h one) shows as a single checkbox that logs one
// MaintenanceEvent and clears both, same as ComponentDetail's own split
// "Log service" button.
interface ServiceTypeRow {
  key: string
  componentId: number
  serviceTypeId: number
  serviceTypeName: string
  requirements: { id: number; name: string; status: ServiceStatus }[]
}

function rowKey(componentId: number, serviceTypeId: number): string {
  return `${componentId}:${serviceTypeId}`
}

function rowsForComponent(component: ServiceableComponent): ServiceTypeRow[] {
  const byType = new Map<number, ServiceTypeRow>()

  for (const requirement of component.service_requirements) {
    for (const satisfier of requirement.satisfiers) {
      const existing = byType.get(satisfier.service_type_id)
      const row =
        existing ??
        ({
          key: rowKey(component.id, satisfier.service_type_id),
          componentId: component.id,
          serviceTypeId: satisfier.service_type_id,
          serviceTypeName: satisfier.service_type_name,
          requirements: [],
        } satisfies ServiceTypeRow)
      row.requirements.push({ id: requirement.id, name: requirement.requirement_name, status: requirement.status })
      byType.set(satisfier.service_type_id, row)
    }
  }

  return [...byType.values()]
}

function worstStatusOf(requirements: { status: ServiceStatus }[]): ServiceStatus {
  return requirements.reduce<ServiceStatus>(
    (worst, r) => (SERVICE_STATUS_SEVERITY[r.status] > SERVICE_STATUS_SEVERITY[worst] ? r.status : worst),
    'ok',
  )
}

function allRowKeys(data: { mounted: ServiceableComponent[]; off_bike: ServiceableComponent[] } | undefined): Set<string> {
  if (!data) return new Set()
  return new Set([...data.mounted, ...data.off_bike].flatMap((component) => rowsForComponent(component).map((row) => row.key)))
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
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({})
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
    const validKeys = allRowKeys(data)
    const stillChecked = new Set([...checkedKeys].filter((key) => validKeys.has(key)))
    setDroppedCount(checkedKeys.size - stillChecked.size)
    if (stillChecked.size !== checkedKeys.size) setCheckedKeys(stillChecked)
  }

  function handleDateChange(value: string | null) {
    const iso = mantineLocalStringToIsoUtc(value)
    if (iso) setPerformedAt(iso)
  }

  function toggleRow(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Per non-ok requirement, its position-1 satisfier -- deduped by key, so
  // two due/warning requirements on the same component that share a
  // satisfier (e.g. a 200h service clearing both a 50h and a 200h
  // requirement) only ever add one row.
  function selectAllDueAndWarning() {
    if (!data) return
    const keys: string[] = []
    for (const component of eligibleComponents) {
      for (const requirement of component.service_requirements) {
        if (requirement.status === 'ok') continue
        const primary = [...requirement.satisfiers].sort((a, b) => a.position - b.position)[0]
        if (primary) keys.push(rowKey(component.id, primary.service_type_id))
      }
    }
    setCheckedKeys((prev) => new Set([...prev, ...keys]))
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
  const selectedCount = checkedKeys.size + validAddOtherRows.length
  const empty = !isPending && !isError && eligibleComponents.length === 0

  const rowsByComponentId = useMemo(() => {
    const map = new Map<number, ServiceTypeRow[]>()
    for (const component of eligibleComponents) map.set(component.id, rowsForComponent(component))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eligibleComponents is derived fresh from `data` every render; keying off `data` avoids an always-new-array dependency.
  }, [data])

  async function handleSubmit() {
    setBaseError(null)
    setRowErrors({})

    type PendingEvent = { rowKey: string; component_id: number; service_type_id: number; notes: string | null }
    const pending: PendingEvent[] = []

    for (const component of eligibleComponents) {
      for (const row of rowsByComponentId.get(component.id) ?? []) {
        if (!checkedKeys.has(row.key)) continue
        pending.push({
          rowKey: row.key,
          component_id: component.id,
          service_type_id: row.serviceTypeId,
          notes: rowNotes[row.key]?.trim() || null,
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
    <AppModal
      opened
      onClose={onClose}
      title="Log service"
      size="xl"
      footer={
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
      }
    >
    <Stack>
      <DateTimePicker
        label="Performed at"
        required
        value={isoUtcToDate(performedAt)}
        onChange={handleDateChange}
      />
      <Text size="xs" c="dimmed">
        Status shown below is as of today — it's here to help you choose, not a record of what it was on this date.
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
                  rows={rowsByComponentId.get(component.id) ?? []}
                  checkedKeys={checkedKeys}
                  rowNotes={rowNotes}
                  rowErrors={rowErrors}
                  onToggle={toggleRow}
                  onNoteChange={(key, value) => setRowNotes((prev) => ({ ...prev, [key]: value }))}
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
                  rows={rowsByComponentId.get(component.id) ?? []}
                  checkedKeys={checkedKeys}
                  rowNotes={rowNotes}
                  rowErrors={rowErrors}
                  onToggle={toggleRow}
                  onNoteChange={(key, value) => setRowNotes((prev) => ({ ...prev, [key]: value }))}
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

    </Stack>
    </AppModal>
  )
}

function ComponentGroup({
  component,
  rows,
  checkedKeys,
  rowNotes,
  rowErrors,
  onToggle,
  onNoteChange,
}: {
  component: ServiceableComponent
  rows: ServiceTypeRow[]
  checkedKeys: Set<string>
  rowNotes: Record<string, string>
  rowErrors: Record<string, string>
  onToggle: (key: string) => void
  onNoteChange: (key: string, value: string) => void
}) {
  if (rows.length === 0) return null

  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {component.label}
      </Text>
      {rows.map((row) => (
        <ServiceTypeRowView
          key={row.key}
          row={row}
          checked={checkedKeys.has(row.key)}
          note={rowNotes[row.key] ?? ''}
          error={rowErrors[row.key]}
          onToggle={() => onToggle(row.key)}
          onNoteChange={(value) => onNoteChange(row.key, value)}
        />
      ))}
    </Stack>
  )
}

// "Drip wax · clears Chain lube (due)" -- a service type satisfying more
// than one requirement at once lists all of them, each with its own
// status; the row's own badge is the worst status across them, so a scan
// down the list still reads the same way the old one-badge-per-row table
// did.
function ServiceTypeRowView({
  row,
  checked,
  note,
  error,
  onToggle,
  onNoteChange,
}: {
  row: ServiceTypeRow
  checked: boolean
  note: string
  error: string | undefined
  onToggle: () => void
  onNoteChange: (value: string) => void
}) {
  const worstStatus = worstStatusOf(row.requirements)
  const clears = row.requirements.map((r) => `${r.name} (${r.status})`).join(', ')

  return (
    <Stack gap={2} pl="md">
      <Group gap="sm" wrap="nowrap">
        <Checkbox checked={checked} onChange={onToggle} label={row.serviceTypeName} />
        <ServiceStatusBadge status={worstStatus} />
        <Text size="sm" c="dimmed">
          clears {clears}
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
