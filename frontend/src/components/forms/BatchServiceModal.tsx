import { useMemo, useRef, useState } from 'react'
import { Alert, Anchor, Box, Button, Group, Loader, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { DateTimePicker } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { Link } from 'react-router-dom'
import AppModal from '../AppModal'
import ServiceNotesField from './ServiceNotesField'
import { DataListBand } from '../datalist/DataList'
import BatchServiceTitle from '../batchService/BatchServiceTitle'
import ComponentRows from '../batchService/ComponentRows'
import OtherServiceRow, { type AddOtherRow } from '../batchService/OtherServiceRow'
import { ApiError } from '../../api/client'
import { useCreateServiceSession } from '../../api/mutations'
import { useBikes, useComponents, useServiceableComponents } from '../../api/queries'
import { formatApiError } from '../../api/errors'
import { useServiceTypeIdResolver } from '../../hooks/useServiceTypeIdResolver'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MOBILE_TAP_TARGET_STYLE } from '../../utils/touchTarget'
import { isoUtcToDate, mantineLocalStringToIsoUtc, nowIsoUtc } from '../../utils/datetime'
import {
  allRowKeys,
  batchFooterCounts,
  bikeSwitchConfirm,
  dueAndSoonCount,
  dueAndSoonKeys,
  rowsForComponent,
  type ServiceTypeRow,
} from '../batchService/batchServiceModel'
import type { ServiceableComponent } from '../../types/models'

interface BatchServiceModalProps {
  opened: boolean
  onClose: () => void
  // The bike to start on; the header's bike pill can switch it.
  bikeId: number
  // A ride's end time, from Activity's "Log service after this ride".
  initialPerformedAt?: string
}

// Unlike every other form modal, this one's form state includes a live
// per-bike/per-date query (useServiceableComponents below) -- keeping
// AppModal mounted through a close transition would keep that query alive
// for the animation, for no benefit. So this modal only mounts AppModal --
// and everything inside it -- while actually open: no close animation, an
// instant unmount (the open transition is unaffected). Same reasoning as
// CategoryServiceRequirementsModal.
export default function BatchServiceModal({ opened, onClose, bikeId, initialPerformedAt }: BatchServiceModalProps) {
  return opened && <BatchServiceForm onClose={onClose} initialBikeId={bikeId} initialPerformedAt={initialPerformedAt} />
}

function BatchServiceForm({
  onClose,
  initialBikeId,
  initialPerformedAt,
}: {
  onClose: () => void
  initialBikeId: number
  initialPerformedAt?: string
}) {
  const [bikeId, setBikeId] = useState(initialBikeId)
  const [performedAt, setPerformedAt] = useState(initialPerformedAt ?? nowIsoUtc())
  const [notes, setNotes] = useState('')
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({})
  const [addOtherRows, setAddOtherRows] = useState<AddOtherRow[]>([])
  const [droppedCount, setDroppedCount] = useState(0)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [baseError, setBaseError] = useState<string | null>(null)
  const nextRowKey = useRef(0)
  const isMobile = useIsMobile()
  const tap = isMobile ? MOBILE_TAP_TARGET_STYLE : undefined

  const { data: bikes } = useBikes()
  const { data: componentList } = useComponents()
  const { data, isPending, isError, error } = useServiceableComponents(bikeId, performedAt)
  const createSession = useCreateServiceSession()
  const { resolveServiceTypeId } = useServiceTypeIdResolver()

  // Whatever's still eligible after a date change stays checked; the rest
  // drop, with a one-line note of how many -- adjusted during render (not
  // an effect), React's "resetting state when a dependency changes"
  // pattern. A bike switch clears the selections first (switchBike), so
  // nothing is "dropped" by it.
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    const validKeys = allRowKeys(data)
    const stillChecked = new Set([...checkedKeys].filter((key) => validKeys.has(key)))
    setDroppedCount(checkedKeys.size - stillChecked.size)
    if (stillChecked.size !== checkedKeys.size) setCheckedKeys(stillChecked)
  }

  const eligibleComponents = data ? [...data.mounted, ...data.off_bike] : []
  const componentOptions = eligibleComponents.map((c) => ({ value: String(c.id), label: c.label }))
  const listItemsById = useMemo(() => new Map((componentList ?? []).map((item) => [item.id, item])), [componentList])
  const bikeName = bikes?.find((bike) => bike.id === bikeId)?.name ?? 'this bike'

  // An "Other service" row's picker filters by its own chosen component's
  // category (and a type created there is tagged with it).
  function categoryOfComponent(componentId: string): string | null {
    return eligibleComponents.find((c) => String(c.id) === componentId)?.category ?? null
  }
  const validAddOtherRows = addOtherRows.filter((row) => row.componentId && row.serviceTypeId)
  const footer = batchFooterCounts(
    checkedKeys,
    validAddOtherRows.map((row) => Number(row.componentId)),
  )
  const selectAllCount = dueAndSoonCount(eligibleComponents, checkedKeys)
  const empty = !isPending && !isError && eligibleComponents.length === 0

  const rowsByComponentId = useMemo(() => {
    const map = new Map<number, ServiceTypeRow[]>()
    for (const component of eligibleComponents) map.set(component.id, rowsForComponent(component))
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eligibleComponents is derived fresh from `data` every render; keying off `data` avoids an always-new-array dependency.
  }, [data])

  function handleDateChange(value: string | null) {
    const iso = mantineLocalStringToIsoUtc(value)
    if (iso) setPerformedAt(iso)
  }

  // Another bike lists other components, so selections can't carry over:
  // with any, confirm ("Clear 3 selections?") and clear them; the query
  // refetches for the new bike.
  function switchBike(nextBikeId: number) {
    if (nextBikeId === bikeId) return
    const apply = () => {
      setCheckedKeys(new Set())
      setRowNotes({})
      setAddOtherRows([])
      setRowErrors({})
      setDroppedCount(0)
      setBaseError(null)
      setBikeId(nextBikeId)
    }
    const question = bikeSwitchConfirm(footer.count)
    if (!question) return apply()
    modals.openConfirmModal({
      title: question,
      children: <Text size="sm">Switching bikes shows that bike's components, so what you've picked here is cleared.</Text>,
      labels: { confirm: 'Switch bike', cancel: 'Keep this bike' },
      onConfirm: apply,
    })
  }

  function toggleRow(key: string) {
    setCheckedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAllDueAndSoon() {
    setCheckedKeys((prev) => new Set([...prev, ...dueAndSoonKeys(eligibleComponents)]))
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
        serviceTypeId = await resolveServiceTypeId(row.serviceTypeId, row.serviceTypeNewName, categoryOfComponent(row.componentId))
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

  const group = (title: string, components: ServiceableComponent[], dimmed: boolean) =>
    components.length > 0 && (
      <>
        <DataListBand
          title={
            <Text size="sm" fw={600}>
              {title}
            </Text>
          }
        />
        <Box style={{ opacity: dimmed ? 0.6 : 1 }}>
          {components.map((component) => (
            <ComponentRows
              key={component.id}
              component={component}
              listItem={listItemsById.get(component.id)}
              rows={rowsByComponentId.get(component.id) ?? []}
              checkedKeys={checkedKeys}
              rowNotes={rowNotes}
              rowErrors={rowErrors}
              onToggle={toggleRow}
              onNoteChange={(key, value) => setRowNotes((prev) => ({ ...prev, [key]: value }))}
            />
          ))}
        </Box>
      </>
    )

  return (
    <AppModal
      opened
      onClose={onClose}
      title={<BatchServiceTitle bikeId={bikeId} bikes={bikes} onSwitch={switchBike} tapStyle={tap} />}
      size="xl"
      footer={
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Text size="sm" c="dimmed">
            {footer.text}
          </Text>
          <Group gap="sm">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Tooltip label="Select at least one service" disabled={footer.count > 0}>
              <span>
                <Button onClick={handleSubmit} loading={createSession.isPending} disabled={footer.count === 0}>
                  Log {footer.count} {footer.count === 1 ? 'service' : 'services'}
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Group>
      }
    >
      <Stack>
        <Stack gap={4}>
          <Group gap="sm" align="flex-start" wrap="wrap">
            <DateTimePicker
              label="Done on"
              required
              value={isoUtcToDate(performedAt)}
              onChange={handleDateChange}
              style={{ flex: isMobile ? '1 1 100%' : '0 0 260px' }}
            />
            <ServiceNotesField
              label="Session note · optional"
              value={notes}
              onChange={setNotes}
              minRows={1}
              style={{ flex: '1 1 240px' }}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Showing what was on the bike at this time · status is as of today.
            {droppedCount > 0 &&
              ` ${droppedCount} ${droppedCount === 1 ? 'selection' : 'selections'} dropped after the date changed.`}
          </Text>
        </Stack>

        {baseError && <Alert color="red">{baseError}</Alert>}

        {isPending && <Loader />}

        {isError && (
          <Alert color="red" title="Failed to load this bike's components">
            {error.message}
          </Alert>
        )}

        {empty && (
          <Paper withBorder radius="md" p="md">
            <Text c="dimmed" size="sm">
              No components were on this bike at that time.{' '}
              <Anchor component={Link} to={`/bikes/${bikeId}`} size="sm" onClick={onClose}>
                View {bikeName}'s components
              </Anchor>
              .
            </Text>
          </Paper>
        )}

        {!isPending && !isError && !empty && data && (
          <Stack gap="xs">
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Text fw={600}>What did you do?</Text>
              {selectAllCount > 0 && (
                <Button size="xs" radius="xl" variant="light" color="orange" onClick={selectAllDueAndSoon} style={tap}>
                  Select all due and soon · {selectAllCount}
                </Button>
              )}
            </Group>

            <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
              {group('On the bike', data.mounted, false)}
              {group('Off the bike', data.off_bike, true)}
            </Paper>

            {addOtherRows.map((row) => (
              <OtherServiceRow
                key={row.key}
                row={row}
                componentOptions={componentOptions}
                category={categoryOfComponent(row.componentId)}
                error={rowErrors[row.key]}
                onChange={(changes) => updateAddOtherRow(row.key, changes)}
                onRemove={() => removeAddOtherRow(row.key)}
              />
            ))}
            <Button
              size="xs"
              radius="xl"
              variant="default"
              onClick={addOtherRow}
              style={{ alignSelf: 'flex-start', borderStyle: 'dashed', ...tap }}
            >
              + Add other service
            </Button>
          </Stack>
        )}
      </Stack>
    </AppModal>
  )
}
